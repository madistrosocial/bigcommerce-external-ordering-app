import type { Express, Request, RequestHandler } from "express";
import { and, asc, desc, eq, gte, gt, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  attendanceLeaveRequests,
  attendanceOvertimeRequests,
  attendancePayrollAuditLog,
  attendancePayrollGroupSchedules,
  attendanceSessions,
  employeePayItems,
  employeePayProfiles,
  payslipLineItems,
  payslips,
  payrollRuns,
  roles,
  users,
} from "@shared/schema";

type PermissionMiddleware = (module: string, action: string) => RequestHandler;
const SHIFT_CAP_SECONDS = 8 * 60 * 60;

class PayrollRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requestUser(req: Request): { id: number; role?: string } {
  return (req as any).authUser;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

function hours(value: number): number {
  return Math.round((value / 3600) * 100) / 100;
}

function weekdaysInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const endTime = new Date(`${to}T00:00:00.000Z`).getTime();
  for (let currentTime = new Date(`${from}T00:00:00.000Z`).getTime(); currentTime <= endTime; currentTime += 24 * 60 * 60 * 1000) {
    const current = new Date(currentTime).toISOString().slice(0, 10);
    const day = new Date(currentTime).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(current);
  }
  return dates;
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function writePayrollAudit(
  tx: any,
  actorUserId: number,
  entityType: string,
  entityId: number,
  action: string,
  oldValue: unknown,
  newValue: unknown,
  reason?: string,
) {
  await tx.insert(attendancePayrollAuditLog).values({
    actor_user_id: actorUserId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    reason: reason ?? null,
  });
}

async function buildDraftPayslips(tx: any, run: any) {
  const groupMembers = await tx.select({
    id: users.id,
    name: users.name,
    username: users.username,
  }).from(users)
    .where(eq(users.role_id, run.role_id))
    .orderBy(asc(users.name));

  if (!groupMembers.length) throw new PayrollRequestError(400, "This user group has no employees assigned.");
  const employeeIds = groupMembers.map((employee: any) => employee.id);
  const [profiles, payItems, sessions, leaveRequests] = await Promise.all([
    tx.select().from(employeePayProfiles).where(inArray(employeePayProfiles.user_id, employeeIds)),
    tx.select().from(employeePayItems).where(and(
      inArray(employeePayItems.user_id, employeeIds),
      eq(employeePayItems.is_active, true),
    )),
    tx.select().from(attendanceSessions).where(and(
      inArray(attendanceSessions.user_id, employeeIds),
      gte(attendanceSessions.work_date, run.period_start),
      lte(attendanceSessions.work_date, run.period_end),
    )),
    tx.select().from(attendanceLeaveRequests).where(and(
      inArray(attendanceLeaveRequests.user_id, employeeIds),
      eq(attendanceLeaveRequests.status, "approved"),
      lte(attendanceLeaveRequests.start_date, run.period_end),
      gte(attendanceLeaveRequests.end_date, run.period_start),
    )),
  ]);

  const completedSessionCandidates = sessions.filter((session: any) =>
    session.status === "completed" && session.time_out && Number(session.total_seconds) > 0,
  );
  const unapprovedSessions = completedSessionCandidates.filter((session: any) =>
    session.review_status !== "approved" && session.review_status !== "locked",
  );
  if (unapprovedSessions.length) {
    throw new PayrollRequestError(
      409,
      `Review and approve all completed attendance sessions before building payroll. ${unapprovedSessions.length} session${unapprovedSessions.length === 1 ? " is" : "s are"} not approved.`,
    );
  }
  const completedSessions = completedSessionCandidates.filter((session: any) =>
    session.review_status === "approved" || session.review_status === "locked",
  );
  const sessionIds = completedSessions.map((session: any) => session.id);
  const overtimeRequests = sessionIds.length
    ? await tx.select().from(attendanceOvertimeRequests).where(and(
      inArray(attendanceOvertimeRequests.attendance_id, sessionIds),
      eq(attendanceOvertimeRequests.status, "approved"),
      isNull(attendanceOvertimeRequests.paid_in_run_id),
    ))
    : [];

  const profileByUser = new Map<number, any>(profiles.map((profile: any) => [profile.user_id, profile]));
  const sessionsByUser = new Map<number, any[]>();
  const overtimeByAttendance = new Map<number, any>();
  const leaveByUser = new Map<number, any[]>();
  const itemsByUser = new Map<number, any[]>();
  for (const session of completedSessions) {
    const list = sessionsByUser.get(session.user_id) ?? [];
    list.push(session);
    sessionsByUser.set(session.user_id, list);
  }
  for (const request of overtimeRequests) overtimeByAttendance.set(request.attendance_id, request);
  for (const request of leaveRequests) {
    const list = leaveByUser.get(request.user_id) ?? [];
    list.push(request);
    leaveByUser.set(request.user_id, list);
  }
  for (const item of payItems) {
    const list = itemsByUser.get(item.user_id) ?? [];
    list.push(item);
    itemsByUser.set(item.user_id, list);
  }

  const needsProfile = new Set<number>();
  for (const session of completedSessions) {
    if (Number(session.total_seconds) > 0) needsProfile.add(session.user_id);
  }
  for (const request of leaveRequests) {
    if (weekdaysInRange(
      request.start_date > run.period_start ? request.start_date : run.period_start,
      request.end_date < run.period_end ? request.end_date : run.period_end,
    ).length) needsProfile.add(request.user_id);
  }
  for (const item of payItems) needsProfile.add(item.user_id);
  const missingProfiles = groupMembers
    .filter((employee: any) => needsProfile.has(employee.id) && !profileByUser.has(employee.id))
    .map((employee: any) => employee.name || employee.username);
  if (missingProfiles.length) {
    throw new PayrollRequestError(400, `Add an hourly pay profile for: ${missingProfiles.join(", ")}.`);
  }

  const eligibleMembers = groupMembers.filter((employee: any) => profileByUser.has(employee.id));
  const insertedSlips: any[] = [];
  for (const employee of eligibleMembers) {
    const profile = profileByUser.get(employee.id);
    const hourlyRate = Number(profile.hourly_rate);
    const currency = String(profile.currency || "").toUpperCase();
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      throw new PayrollRequestError(400, `The pay profile for ${employee.name} has an invalid hourly rate or currency.`);
    }

    const lines: any[] = [];
    let regularHours = 0;
    let overtimeHours = 0;
    let paidLeaveHours = 0;
    let unpaidLeaveHours = 0;
    let gross = 0;
    let deductions = 0;

    for (const session of sessionsByUser.get(employee.id) ?? []) {
      const workedSeconds = Math.max(0, Number(session.total_seconds) || 0);
      const regularSeconds = Math.min(workedSeconds, SHIFT_CAP_SECONDS);
      if (regularSeconds <= 0) continue;
      const regular = hours(regularSeconds);
      const amount = roundMoney(regular * hourlyRate);
      regularHours += regular;
      gross += amount;
      lines.push({
        line_type: "regular",
        description: `Regular hours · ${session.work_date}`,
        units: regular.toFixed(2),
        rate: Number(hourlyRate).toFixed(4),
        amount: asMoney(amount),
        source_type: "attendance_regular",
        source_id: session.id,
        source_date: session.work_date,
      });

      const request = overtimeByAttendance.get(session.id);
      if (request) {
        const eligibleOvertimeHours = hours(Math.max(0, workedSeconds - SHIFT_CAP_SECONDS));
        const approvedHours = Number(request.approved_hours ?? 0);
        if (approvedHours > eligibleOvertimeHours + 0.01) {
          throw new PayrollRequestError(409, `Approved overtime for ${employee.name} on ${session.work_date} exceeds the session's recorded overtime. Review the claim before building payroll.`);
        }
        if (approvedHours > 0) {
          const multiplier = Number(
            request.overtime_type === "holiday_rest"
              ? profile.holiday_overtime_multiplier
              : profile.overtime_multiplier,
          );
          const rate = hourlyRate * multiplier;
          const overtimeAmount = roundMoney(approvedHours * rate);
          overtimeHours += approvedHours;
          gross += overtimeAmount;
          lines.push({
            line_type: "overtime",
            description: `${request.overtime_type === "holiday_rest" ? "Holiday/rest-day" : "Regular"} overtime · ${session.work_date}`,
            units: approvedHours.toFixed(2),
            rate: rate.toFixed(4),
            amount: asMoney(overtimeAmount),
            source_type: "overtime",
            source_id: request.id,
            source_date: session.work_date,
          });
        }
      }
    }

    for (const request of leaveByUser.get(employee.id) ?? []) {
      const from = request.start_date > run.period_start ? request.start_date : run.period_start;
      const to = request.end_date < run.period_end ? request.end_date : run.period_end;
      if (from > to) continue;
      for (const date of weekdaysInRange(from, to)) {
        const requestedHours = Number(request.daily_hours);
        const isUnpaid = request.leave_type === "unpaid";
        const amount = isUnpaid ? 0 : roundMoney(requestedHours * hourlyRate);
        if (isUnpaid) unpaidLeaveHours += requestedHours;
        else {
          paidLeaveHours += requestedHours;
          gross += amount;
        }
        lines.push({
          line_type: isUnpaid ? "unpaid_leave" : "paid_leave",
          description: `${request.leave_type.toUpperCase()} leave · ${date}`,
          units: requestedHours.toFixed(2),
          rate: Number(hourlyRate).toFixed(4),
          amount: asMoney(amount),
          source_type: "leave",
          source_id: request.id,
          source_date: date,
        });
      }
    }

    for (const item of itemsByUser.get(employee.id) ?? []) {
      const amount = roundMoney(Number(item.amount));
      if (!Number.isFinite(amount) || amount < 0) {
        throw new PayrollRequestError(400, `A recurring pay item for ${employee.name} has an invalid amount.`);
      }
      if (item.item_type === "allowance") gross += amount;
      else if (item.item_type === "deduction") deductions += amount;
      lines.push({
        line_type: item.item_type,
        description: item.label,
        units: "1.00",
        rate: asMoney(amount),
        amount: asMoney(item.item_type === "deduction" ? -amount : amount),
        source_type: "pay_item",
        source_id: item.id,
        source_date: run.period_start,
      });
    }

    gross = roundMoney(gross);
    deductions = roundMoney(deductions);
    const net = roundMoney(gross - deductions);
    if (net < 0) {
      throw new PayrollRequestError(400, `Deductions exceed gross earnings for ${employee.name}. Adjust recurring pay items before creating the run.`);
    }
    if (!lines.length) continue;

    const [slip] = await tx.insert(payslips).values({
      payroll_run_id: run.id,
      user_id: employee.id,
      employee_name_snapshot: employee.name,
      employee_username_snapshot: employee.username,
      currency,
      regular_hours: regularHours.toFixed(2),
      overtime_hours: overtimeHours.toFixed(2),
      paid_leave_hours: paidLeaveHours.toFixed(2),
      unpaid_leave_hours: unpaidLeaveHours.toFixed(2),
      gross_amount: asMoney(gross),
      deductions_amount: asMoney(deductions),
      net_amount: asMoney(net),
    }).returning();
    await tx.insert(payslipLineItems).values(lines.map((line: any) => ({ ...line, payslip_id: slip.id })));
    insertedSlips.push(slip);
  }

  if (!insertedSlips.length) {
    throw new PayrollRequestError(400, "No payable attendance, approved leave, overtime, or recurring pay items were found for this group and period.");
  }
  return insertedSlips;
}

async function fetchRunDetails(runId: number) {
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1);
  if (!run) return null;
  const slips = await db.select().from(payslips)
    .where(eq(payslips.payroll_run_id, runId))
    .orderBy(asc(payslips.employee_name_snapshot));
  const slipIds = slips.map((slip) => slip.id);
  const lines = slipIds.length
    ? await db.select().from(payslipLineItems)
      .where(inArray(payslipLineItems.payslip_id, slipIds))
      .orderBy(asc(payslipLineItems.id))
    : [];
  const linesBySlip = new Map<number, any[]>();
  for (const line of lines) {
    const list = linesBySlip.get(line.payslip_id) ?? [];
    list.push(line);
    linesBySlip.set(line.payslip_id, list);
  }
  return { run, payslips: slips.map((slip) => ({ ...slip, lines: linesBySlip.get(slip.id) ?? [] })) };
}

export function registerAttendancePayrollRoutes(app: Express, requirePermission: PermissionMiddleware) {
  const canUseAttendance = requirePermission("attendance", "view");
  const canManagePayroll = requirePermission("attendance", "manage_payroll");
  const canApproveOvertime = requirePermission("attendance", "approve_overtime");
  const canApproveLeave = requirePermission("attendance", "approve_leave");
  const canViewAll = requirePermission("attendance", "view_all");

  app.get("/api/attendance/payroll/me", canUseAttendance, async (req, res) => {
    try {
      const userId = requestUser(req).id;
      const [profile] = await db.select().from(employeePayProfiles)
        .where(eq(employeePayProfiles.user_id, userId)).limit(1);
      const [items, slipRows] = await Promise.all([
        db.select().from(employeePayItems).where(and(
          eq(employeePayItems.user_id, userId),
          eq(employeePayItems.is_active, true),
        )),
        db.select({ slip: payslips, run: payrollRuns }).from(payslips)
          .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.payroll_run_id))
          .where(and(eq(payslips.user_id, userId), eq(payrollRuns.status, "finalized")))
          .orderBy(desc(payrollRuns.period_start)),
      ]);
      const slipIds = slipRows.map((row) => row.slip.id);
      const lines = slipIds.length
        ? await db.select().from(payslipLineItems).where(inArray(payslipLineItems.payslip_id, slipIds))
        : [];
      const linesBySlip = new Map<number, any[]>();
      for (const line of lines) {
        const list = linesBySlip.get(line.payslip_id) ?? [];
        list.push(line);
        linesBySlip.set(line.payslip_id, list);
      }
      res.json({
        profile: profile ?? null,
        payItems: items,
        payslips: slipRows.map(({ slip, run }) => ({
          ...slip,
          run,
          lines: linesBySlip.get(slip.id) ?? [],
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load your payroll information." });
    }
  });

  app.get("/api/attendance/payroll/overtime/eligible", canUseAttendance, async (req, res) => {
    try {
      const userId = requestUser(req).id;
      const completed = await db.select().from(attendanceSessions).where(and(
        eq(attendanceSessions.user_id, userId),
        eq(attendanceSessions.status, "completed"),
        gt(attendanceSessions.total_seconds, SHIFT_CAP_SECONDS),
        isNotNull(attendanceSessions.time_out),
      )).orderBy(desc(attendanceSessions.work_date), desc(attendanceSessions.time_in));
      if (!completed.length) return res.json({ rows: [] });
      const claims = await db.select().from(attendanceOvertimeRequests)
        .where(inArray(attendanceOvertimeRequests.attendance_id, completed.map((row) => row.id)));
      const claimedIds = new Set(claims.map((claim) => claim.attendance_id));
      res.json({
        rows: completed.filter((session) => !claimedIds.has(session.id)).map((session) => ({
          id: session.id,
          work_date: session.work_date,
          time_in: session.time_in,
          time_out: session.time_out,
          worked_seconds: session.total_seconds,
          eligible_overtime_hours: hours(Math.max(0, session.total_seconds - SHIFT_CAP_SECONDS)),
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load eligible shifts." });
    }
  });

  app.get("/api/attendance/payroll/overtime/mine", canUseAttendance, async (req, res) => {
    try {
      const userId = requestUser(req).id;
      const rows = await db.select({
        request: attendanceOvertimeRequests,
        work_date: attendanceSessions.work_date,
        time_in: attendanceSessions.time_in,
        time_out: attendanceSessions.time_out,
        total_seconds: attendanceSessions.total_seconds,
      }).from(attendanceOvertimeRequests)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceOvertimeRequests.attendance_id))
        .where(eq(attendanceOvertimeRequests.user_id, userId))
        .orderBy(desc(attendanceOvertimeRequests.created_at));
      res.json({ rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load overtime claims." });
    }
  });

  app.post("/api/attendance/payroll/overtime", canUseAttendance, async (req, res) => {
    const schema = z.object({
      attendance_id: z.coerce.number().int().positive(),
      overtime_type: z.enum(["regular", "holiday_rest"]),
      requested_hours: z.coerce.number().min(0.01).max(24),
      employee_note: z.string().trim().max(1000).default(""),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the overtime claim." });
    try {
      const userId = requestUser(req).id;
      const [session] = await db.select().from(attendanceSessions).where(and(
        eq(attendanceSessions.id, parsed.data.attendance_id),
        eq(attendanceSessions.user_id, userId),
        eq(attendanceSessions.status, "completed"),
      )).limit(1);
      if (!session || !session.time_out) return res.status(404).json({ error: "Completed attendance shift not found." });
      const eligibleHours = hours(Math.max(0, session.total_seconds - SHIFT_CAP_SECONDS));
      if (eligibleHours <= 0 || parsed.data.requested_hours > eligibleHours + 0.01) {
        return res.status(400).json({ error: `This shift has ${eligibleHours.toFixed(2)} eligible overtime hours.` });
      }
      const [user] = await db.select({ role_id: users.role_id }).from(users).where(eq(users.id, userId)).limit(1);
      if (user?.role_id) {
        const finalized = await db.select({ id: payrollRuns.id }).from(payrollRuns).where(and(
          eq(payrollRuns.role_id, user.role_id),
          eq(payrollRuns.status, "finalized"),
          lte(payrollRuns.period_start, session.work_date),
          gte(payrollRuns.period_end, session.work_date),
        )).limit(1);
        if (finalized.length) return res.status(409).json({ error: "This payroll period is finalized. Contact a payroll manager about a correction." });
      }
      const [claim] = await db.insert(attendanceOvertimeRequests).values({
        attendance_id: session.id,
        user_id: userId,
        overtime_type: parsed.data.overtime_type,
        requested_hours: parsed.data.requested_hours.toFixed(2),
        employee_note: parsed.data.employee_note,
      }).returning();
      await writePayrollAudit(db, userId, "overtime_request", claim.id, "submitted", null, claim);
      res.status(201).json(claim);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ error: "An overtime claim already exists for this shift." });
      res.status(500).json({ error: error?.message ?? "Could not submit the overtime claim." });
    }
  });

  app.get("/api/attendance/payroll/overtime/pending", canApproveOvertime, canViewAll, async (req, res) => {
    try {
      const rows = await db.select({
        request: attendanceOvertimeRequests,
        employee_name: users.name,
        employee_username: users.username,
        work_date: attendanceSessions.work_date,
        time_in: attendanceSessions.time_in,
        time_out: attendanceSessions.time_out,
        total_seconds: attendanceSessions.total_seconds,
      }).from(attendanceOvertimeRequests)
        .innerJoin(users, eq(users.id, attendanceOvertimeRequests.user_id))
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceOvertimeRequests.attendance_id))
        .where(and(
          eq(attendanceOvertimeRequests.status, "pending"),
          ne(attendanceOvertimeRequests.user_id, requestUser(req).id),
        ))
        .orderBy(asc(attendanceOvertimeRequests.created_at));
      res.json({ rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load pending overtime claims." });
    }
  });

  app.patch("/api/attendance/payroll/overtime/:id", canApproveOvertime, canViewAll, async (req, res) => {
    const schema = z.object({
      status: z.enum(["approved", "rejected"]),
      approved_hours: z.coerce.number().min(0.01).max(24).optional(),
      manager_note: z.string().trim().max(1000).default(""),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the overtime decision." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid overtime request." });
    try {
      const [claim] = await db.select().from(attendanceOvertimeRequests).where(eq(attendanceOvertimeRequests.id, id)).limit(1);
      if (!claim) return res.status(404).json({ error: "Overtime request not found." });
      if (claim.status !== "pending" || claim.paid_in_run_id) return res.status(409).json({ error: "This overtime request has already been decided or paid." });
      const actor = requestUser(req);
      if (claim.user_id === actor.id) return res.status(403).json({ error: "You cannot review your own overtime claim." });
      let approvedHours: number | null = null;
      if (parsed.data.status === "approved") {
        const [session] = await db.select().from(attendanceSessions).where(eq(attendanceSessions.id, claim.attendance_id)).limit(1);
        if (!session) return res.status(404).json({ error: "The linked attendance shift no longer exists." });
        const eligible = hours(Math.max(0, session.total_seconds - SHIFT_CAP_SECONDS));
        approvedHours = parsed.data.approved_hours ?? Number(claim.requested_hours);
        if (approvedHours > eligible + 0.01 || approvedHours > Number(claim.requested_hours) + 0.01) {
          return res.status(400).json({ error: `Approved hours cannot exceed the request or ${eligible.toFixed(2)} recorded overtime hours.` });
        }
      }
      const [updated] = await db.update(attendanceOvertimeRequests).set({
        status: parsed.data.status,
        approved_hours: approvedHours == null ? null : approvedHours.toFixed(2),
        reviewed_by: actor.id,
        reviewed_at: new Date(),
        manager_note: parsed.data.manager_note,
        updated_at: new Date(),
      }).where(and(
        eq(attendanceOvertimeRequests.id, id),
        eq(attendanceOvertimeRequests.status, "pending"),
        isNull(attendanceOvertimeRequests.paid_in_run_id),
      )).returning();
      if (!updated) return res.status(409).json({ error: "The request was changed by another manager. Refresh and try again." });
      await writePayrollAudit(db, actor.id, "overtime_request", id, parsed.data.status, claim, updated, parsed.data.manager_note);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not save the overtime decision." });
    }
  });

  app.get("/api/attendance/leave/mine", canUseAttendance, async (req, res) => {
    try {
      const rows = await db.select().from(attendanceLeaveRequests)
        .where(eq(attendanceLeaveRequests.user_id, requestUser(req).id))
        .orderBy(desc(attendanceLeaveRequests.start_date), desc(attendanceLeaveRequests.created_at));
      res.json({ rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load leave requests." });
    }
  });

  app.post("/api/attendance/leave", canUseAttendance, async (req, res) => {
    const schema = z.object({
      leave_type: z.enum(["pto", "sick", "vacation", "unpaid"]),
      start_date: z.string().refine(isDateOnly, "Enter a valid start date."),
      end_date: z.string().refine(isDateOnly, "Enter a valid end date."),
      daily_hours: z.coerce.number().min(0.25).max(8),
      employee_note: z.string().trim().max(1000).default(""),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the leave request." });
    if (parsed.data.start_date > parsed.data.end_date) return res.status(400).json({ error: "The end date must be on or after the start date." });
    if (Date.parse(`${parsed.data.end_date}T00:00:00Z`) - Date.parse(`${parsed.data.start_date}T00:00:00Z`) > 366 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "A single leave request cannot span more than one year." });
    }
    try {
      const userId = requestUser(req).id;
      const conflicts = await db.select({ id: attendanceLeaveRequests.id }).from(attendanceLeaveRequests).where(and(
        eq(attendanceLeaveRequests.user_id, userId),
        inArray(attendanceLeaveRequests.status, ["pending", "approved"]),
        lte(attendanceLeaveRequests.start_date, parsed.data.end_date),
        gte(attendanceLeaveRequests.end_date, parsed.data.start_date),
      )).limit(1);
      if (conflicts.length) return res.status(409).json({ error: "These dates overlap an existing pending or approved leave request." });
      const [created] = await db.insert(attendanceLeaveRequests).values({
        user_id: userId,
        leave_type: parsed.data.leave_type,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        daily_hours: parsed.data.daily_hours.toFixed(2),
        employee_note: parsed.data.employee_note,
      }).returning();
      await writePayrollAudit(db, userId, "leave_request", created.id, "submitted", null, created);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not submit the leave request." });
    }
  });

  app.get("/api/attendance/leave/pending", canApproveLeave, canViewAll, async (req, res) => {
    try {
      const rows = await db.select({
        request: attendanceLeaveRequests,
        employee_name: users.name,
        employee_username: users.username,
      }).from(attendanceLeaveRequests)
        .innerJoin(users, eq(users.id, attendanceLeaveRequests.user_id))
        .where(and(
          eq(attendanceLeaveRequests.status, "pending"),
          ne(attendanceLeaveRequests.user_id, requestUser(req).id),
        ))
        .orderBy(asc(attendanceLeaveRequests.created_at));
      res.json({ rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load pending leave requests." });
    }
  });

  app.patch("/api/attendance/leave/:id", canApproveLeave, canViewAll, async (req, res) => {
    const schema = z.object({
      status: z.enum(["approved", "rejected"]),
      manager_note: z.string().trim().max(1000).default(""),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the leave decision." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid leave request." });
    try {
      const [request] = await db.select().from(attendanceLeaveRequests).where(eq(attendanceLeaveRequests.id, id)).limit(1);
      if (!request) return res.status(404).json({ error: "Leave request not found." });
      if (request.status !== "pending") return res.status(409).json({ error: "This leave request has already been decided." });
      const actor = requestUser(req);
      if (request.user_id === actor.id) return res.status(403).json({ error: "You cannot review your own leave request." });
      const [updated] = await db.update(attendanceLeaveRequests).set({
        status: parsed.data.status,
        reviewed_by: actor.id,
        reviewed_at: new Date(),
        manager_note: parsed.data.manager_note,
        updated_at: new Date(),
      }).where(and(
        eq(attendanceLeaveRequests.id, id),
        eq(attendanceLeaveRequests.status, "pending"),
      )).returning();
      if (!updated) return res.status(409).json({ error: "The request was changed by another manager. Refresh and try again." });
      await writePayrollAudit(db, actor.id, "leave_request", id, parsed.data.status, request, updated, parsed.data.manager_note);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not save the leave decision." });
    }
  });

  app.get("/api/attendance/payroll/admin/config", canManagePayroll, async (_req, res) => {
    try {
      const groups = await db.select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        schedule: attendancePayrollGroupSchedules,
      }).from(roles)
        .leftJoin(attendancePayrollGroupSchedules, eq(attendancePayrollGroupSchedules.role_id, roles.id))
        .orderBy(asc(roles.name));
      res.json({ groups });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load payroll groups." });
    }
  });

  app.put("/api/attendance/payroll/admin/groups/:roleId/schedule", canManagePayroll, async (req, res) => {
    const schema = z.object({
      cadence: z.enum(["biweekly_friday", "semimonthly_15_30"]),
      biweekly_anchor_date: z.string().refine((value) => value === "" || isDateOnly(value), "Enter a valid anchor date."),
      semimonthly_first_payday: z.coerce.number().int().min(1).max(31),
      semimonthly_second_payday: z.coerce.number().int().min(1).max(31),
      timezone: z.string().refine(validTimezone, "Enter a valid timezone."),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the payroll schedule." });
    if (parsed.data.cadence === "biweekly_friday" && !parsed.data.biweekly_anchor_date) {
      return res.status(400).json({ error: "A payroll-specific anchor date is required for a 14-day schedule." });
    }
    if (parsed.data.semimonthly_first_payday === parsed.data.semimonthly_second_payday) {
      return res.status(400).json({ error: "The two semimonthly payday dates must be different." });
    }
    const roleId = Number(req.params.roleId);
    if (!Number.isInteger(roleId) || roleId <= 0) return res.status(400).json({ error: "Invalid user group." });
    try {
      const [group] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!group) return res.status(404).json({ error: "User group not found." });
      const actor = requestUser(req);
      const values = {
        role_id: roleId,
        cadence: parsed.data.cadence,
        biweekly_anchor_date: parsed.data.biweekly_anchor_date || null,
        semimonthly_first_payday: parsed.data.semimonthly_first_payday,
        semimonthly_second_payday: parsed.data.semimonthly_second_payday,
        timezone: parsed.data.timezone,
        updated_by: actor.id,
        updated_at: new Date(),
      };
      const [existing] = await db.select().from(attendancePayrollGroupSchedules)
        .where(eq(attendancePayrollGroupSchedules.role_id, roleId)).limit(1);
      const [saved] = await db.insert(attendancePayrollGroupSchedules).values(values)
        .onConflictDoUpdate({
          target: attendancePayrollGroupSchedules.role_id,
          set: values,
        }).returning();
      await writePayrollAudit(db, actor.id, "group_schedule", saved.id, "updated", existing ?? null, saved);
      res.json(saved);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not save the payroll schedule." });
    }
  });

  app.get("/api/attendance/payroll/admin/employees", canManagePayroll, async (req, res) => {
    const roleId = Number(req.query.roleId);
    if (!Number.isInteger(roleId) || roleId <= 0) return res.status(400).json({ error: "Choose a valid user group." });
    try {
      const employees = await db.select({
        id: users.id,
        name: users.name,
        username: users.username,
        is_enabled: users.is_enabled,
      }).from(users).where(eq(users.role_id, roleId)).orderBy(asc(users.name));
      const ids = employees.map((employee) => employee.id);
      if (!ids.length) return res.json({ employees: [] });
      const [profiles, items] = await Promise.all([
        db.select().from(employeePayProfiles).where(inArray(employeePayProfiles.user_id, ids)),
        db.select().from(employeePayItems).where(inArray(employeePayItems.user_id, ids)).orderBy(asc(employeePayItems.id)),
      ]);
      const profilesByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
      const itemsByUser = new Map<number, any[]>();
      for (const item of items) {
        const list = itemsByUser.get(item.user_id) ?? [];
        list.push(item);
        itemsByUser.set(item.user_id, list);
      }
      res.json({
        employees: employees.map((employee) => ({
          ...employee,
          profile: profilesByUser.get(employee.id) ?? null,
          payItems: itemsByUser.get(employee.id) ?? [],
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load pay profiles." });
    }
  });

  app.put("/api/attendance/payroll/admin/profiles/:userId", canManagePayroll, async (req, res) => {
    const schema = z.object({
      hourly_rate: z.coerce.number().positive().max(1_000_000),
      currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
      overtime_multiplier: z.coerce.number().min(0.1).max(10),
      holiday_overtime_multiplier: z.coerce.number().min(0.1).max(10),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the pay profile." });
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid employee." });
    try {
      const [employee] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      if (!employee) return res.status(404).json({ error: "Employee not found." });
      const [oldProfile] = await db.select().from(employeePayProfiles).where(eq(employeePayProfiles.user_id, userId)).limit(1);
      const actor = requestUser(req);
      const values = {
        user_id: userId,
        hourly_rate: parsed.data.hourly_rate.toFixed(4),
        currency: parsed.data.currency,
        overtime_multiplier: parsed.data.overtime_multiplier.toFixed(4),
        holiday_overtime_multiplier: parsed.data.holiday_overtime_multiplier.toFixed(4),
        updated_by: actor.id,
        updated_at: new Date(),
      };
      const [profile] = await db.insert(employeePayProfiles).values(values)
        .onConflictDoUpdate({
          target: employeePayProfiles.user_id,
          set: values,
        }).returning();
      await writePayrollAudit(db, actor.id, "pay_profile", userId, "updated", oldProfile ?? null, profile);
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not save the pay profile." });
    }
  });

  app.post("/api/attendance/payroll/admin/pay-items", canManagePayroll, async (req, res) => {
    const schema = z.object({
      user_id: z.coerce.number().int().positive(),
      item_type: z.enum(["allowance", "deduction"]),
      label: z.string().trim().min(1).max(100),
      amount: z.coerce.number().positive().max(1_000_000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the recurring pay item." });
    try {
      const [profile] = await db.select({ id: employeePayProfiles.id }).from(employeePayProfiles)
        .where(eq(employeePayProfiles.user_id, parsed.data.user_id)).limit(1);
      if (!profile) return res.status(400).json({ error: "Create an hourly pay profile for this employee first." });
      const actor = requestUser(req);
      const [item] = await db.insert(employeePayItems).values({
        user_id: parsed.data.user_id,
        item_type: parsed.data.item_type,
        label: parsed.data.label,
        amount: parsed.data.amount.toFixed(2),
        created_by: actor.id,
      }).returning();
      await writePayrollAudit(db, actor.id, "pay_item", item.id, "created", null, item);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not add the recurring pay item." });
    }
  });

  app.patch("/api/attendance/payroll/admin/pay-items/:id", canManagePayroll, async (req, res) => {
    const schema = z.object({
      is_active: z.boolean().optional(),
      label: z.string().trim().min(1).max(100).optional(),
      amount: z.coerce.number().positive().max(1_000_000).optional(),
    }).refine((value) => Object.keys(value).length > 0, "Change at least one field.");
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the recurring pay item." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid pay item." });
    try {
      const [existing] = await db.select().from(employeePayItems).where(eq(employeePayItems.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: "Recurring pay item not found." });
      const updates: { is_active?: boolean; label?: string; amount?: string; updated_at: Date } = {
        updated_at: new Date(),
      };
      if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
      if (parsed.data.label !== undefined) updates.label = parsed.data.label;
      if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount.toFixed(2);
      const [updated] = await db.update(employeePayItems).set({
        ...updates,
      }).where(eq(employeePayItems.id, id)).returning();
      await writePayrollAudit(db, requestUser(req).id, "pay_item", id, "updated", existing, updated);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not update the recurring pay item." });
    }
  });

  app.get("/api/attendance/payroll/admin/runs", canManagePayroll, async (_req, res) => {
    try {
      const rows = await db.select().from(payrollRuns).orderBy(desc(payrollRuns.period_start), desc(payrollRuns.created_at));
      res.json({ rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load payroll runs." });
    }
  });

  app.post("/api/attendance/payroll/admin/runs", canManagePayroll, async (req, res) => {
    const schema = z.object({
      role_id: z.coerce.number().int().positive(),
      period_start: z.string().refine(isDateOnly, "Enter a valid period start."),
      period_end: z.string().refine(isDateOnly, "Enter a valid period end."),
      payday: z.string().refine(isDateOnly, "Enter a valid payday."),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the payroll period." });
    if (parsed.data.period_start > parsed.data.period_end) return res.status(400).json({ error: "The period end must be on or after the start date." });
    if (Date.parse(`${parsed.data.period_end}T00:00:00Z`) - Date.parse(`${parsed.data.period_start}T00:00:00Z`) > 62 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "A payroll period cannot span more than 63 calendar days." });
    }
    try {
      const [group] = await db.select({
        id: roles.id,
        name: roles.name,
        schedule: attendancePayrollGroupSchedules,
      }).from(roles)
        .leftJoin(attendancePayrollGroupSchedules, eq(attendancePayrollGroupSchedules.role_id, roles.id))
        .where(eq(roles.id, parsed.data.role_id))
        .limit(1);
      const payrollSchedule = group?.schedule;
      if (!group || !payrollSchedule) return res.status(400).json({ error: "Configure a payroll schedule for this existing user group first." });
      if (payrollSchedule.cadence === "biweekly_friday" && !payrollSchedule.biweekly_anchor_date) {
        return res.status(400).json({ error: "Set a payroll-specific 14-day anchor date for this group first." });
      }
      const overlapping = await db.select({ id: payrollRuns.id }).from(payrollRuns).where(and(
        eq(payrollRuns.role_id, parsed.data.role_id),
        lte(payrollRuns.period_start, parsed.data.period_end),
        gte(payrollRuns.period_end, parsed.data.period_start),
      )).limit(1);
      if (overlapping.length) return res.status(409).json({ error: "A draft or finalized payroll run already overlaps these dates for this user group." });
      const actor = requestUser(req);
      const created = await db.transaction(async (tx) => {
        const [run] = await tx.insert(payrollRuns).values({
          role_id: group.id,
          group_name_snapshot: group.name,
          cadence_snapshot: payrollSchedule.cadence,
          timezone_snapshot: payrollSchedule.timezone,
          period_start: parsed.data.period_start,
          period_end: parsed.data.period_end,
          payday: parsed.data.payday,
          created_by: actor.id,
        }).returning();
        await buildDraftPayslips(tx, run);
        await writePayrollAudit(tx, actor.id, "payroll_run", run.id, "created", null, run);
        return run;
      });
      res.status(201).json({ run: created, details: await fetchRunDetails(created.id) });
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message });
      if (error?.code === "23505") return res.status(409).json({ error: "A payroll run already exists for this period." });
      res.status(500).json({ error: error?.message ?? "Could not create the payroll run." });
    }
  });

  app.get("/api/attendance/payroll/admin/runs/:id", canManagePayroll, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payroll run." });
    try {
      const details = await fetchRunDetails(id);
      if (!details) return res.status(404).json({ error: "Payroll run not found." });
      res.json(details);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load the payroll run." });
    }
  });

  app.post("/api/attendance/payroll/admin/runs/:id/rebuild", canManagePayroll, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payroll run." });
    try {
      const result = await db.transaction(async (tx) => {
        const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
        if (!run) throw new PayrollRequestError(404, "Payroll run not found.");
        if (run.status !== "draft") throw new PayrollRequestError(409, "Finalized payroll runs cannot be rebuilt.");
        const oldSlips = await tx.select({ id: payslips.id }).from(payslips).where(eq(payslips.payroll_run_id, id));
        if (oldSlips.length) await tx.delete(payslips).where(eq(payslips.payroll_run_id, id));
        const [refreshedRun] = await tx.update(payrollRuns).set({ snapshot_updated_at: new Date() })
          .where(eq(payrollRuns.id, id)).returning();
        await buildDraftPayslips(tx, refreshedRun);
        await writePayrollAudit(tx, requestUser(req).id, "payroll_run", id, "rebuilt", { previous_slips: oldSlips.length }, { rebuilt: true });
        return refreshedRun;
      });
      res.json({ run: result, details: await fetchRunDetails(id) });
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message });
      if (error?.code === "23505") return res.status(409).json({ error: "Some attendance, leave, or pay items are already included in another run." });
      res.status(500).json({ error: error?.message ?? "Could not rebuild the draft payroll run." });
    }
  });

  app.post("/api/attendance/payroll/admin/runs/:id/finalize", canManagePayroll, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payroll run." });
    try {
      const result = await db.transaction(async (tx) => {
        const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
        if (!run) throw new PayrollRequestError(404, "Payroll run not found.");
        if (run.status !== "draft") throw new PayrollRequestError(409, "This payroll run is already finalized.");
        const [groupMembers, runOwners] = await Promise.all([
          tx.select({ user_id: users.id }).from(users).where(eq(users.role_id, run.role_id)),
          tx.select({ user_id: payslips.user_id }).from(payslips).where(eq(payslips.payroll_run_id, id)),
        ]);
        const groupUserIds = [...new Set([
          ...groupMembers.map((row: any) => row.user_id),
          ...runOwners.map((row: any) => row.user_id),
        ])];
        const pendingRows = groupUserIds.length
          ? await tx.select({ count: attendanceOvertimeRequests.id }).from(attendanceOvertimeRequests)
            .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceOvertimeRequests.attendance_id))
            .where(and(
              eq(attendanceOvertimeRequests.status, "pending"),
              inArray(attendanceOvertimeRequests.user_id, groupUserIds),
              gte(attendanceSessions.work_date, run.period_start),
              lte(attendanceSessions.work_date, run.period_end),
            ))
            .limit(1)
          : [];
        const pending = pendingRows[0];
        if (pending) throw new PayrollRequestError(409, "Resolve or reject pending overtime claims in this period before finalizing.");
        const openSession = groupUserIds.length
          ? await tx.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(
            inArray(attendanceSessions.user_id, groupUserIds),
            gte(attendanceSessions.work_date, run.period_start),
            lte(attendanceSessions.work_date, run.period_end),
            inArray(attendanceSessions.status, ["active", "on_break"]),
          )).limit(1)
          : [];
        if (openSession.length) {
          throw new PayrollRequestError(409, "Complete or resolve active attendance sessions in this period before finalizing.");
        }
        const runLines = await tx.select({
          source_id: payslipLineItems.source_id,
          source_type: payslipLineItems.source_type,
        }).from(payslipLineItems)
          .innerJoin(payslips, eq(payslips.id, payslipLineItems.payslip_id))
          .where(eq(payslips.payroll_run_id, id));
        const regularSessionIds = new Set(
          runLines.filter((line: any) => line.source_type === "attendance_regular").map((line: any) => line.source_id),
        );
        const currentCompletedSessions = groupUserIds.length
          ? await tx.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(
            inArray(attendanceSessions.user_id, groupUserIds),
            gte(attendanceSessions.work_date, run.period_start),
            lte(attendanceSessions.work_date, run.period_end),
            eq(attendanceSessions.status, "completed"),
            isNotNull(attendanceSessions.time_out),
            gt(attendanceSessions.total_seconds, 0),
          ))
          : [];
        const hasUnincludedSession = currentCompletedSessions.some((session: any) => !regularSessionIds.has(session.id));
        const [changedSession] = groupUserIds.length
          ? await tx.select({ id: attendanceSessions.id }).from(attendanceSessions).where(and(
            inArray(attendanceSessions.user_id, groupUserIds),
            gte(attendanceSessions.work_date, run.period_start),
            lte(attendanceSessions.work_date, run.period_end),
            gt(attendanceSessions.updated_at, run.snapshot_updated_at),
          )).limit(1)
          : [];
        const [changedProfile] = groupUserIds.length
          ? await tx.select({ id: employeePayProfiles.id }).from(employeePayProfiles)
            .where(and(inArray(employeePayProfiles.user_id, groupUserIds), gt(employeePayProfiles.updated_at, run.snapshot_updated_at)))
            .limit(1)
          : [];
        const [changedPayItem] = groupUserIds.length
          ? await tx.select({ id: employeePayItems.id }).from(employeePayItems)
            .where(and(inArray(employeePayItems.user_id, groupUserIds), gt(employeePayItems.updated_at, run.snapshot_updated_at)))
            .limit(1)
          : [];
        const [changedLeave] = groupUserIds.length
          ? await tx.select({ id: attendanceLeaveRequests.id }).from(attendanceLeaveRequests)
            .where(and(
              inArray(attendanceLeaveRequests.user_id, groupUserIds),
              eq(attendanceLeaveRequests.status, "approved"),
              lte(attendanceLeaveRequests.start_date, run.period_end),
              gte(attendanceLeaveRequests.end_date, run.period_start),
              gt(attendanceLeaveRequests.updated_at, run.snapshot_updated_at),
            ))
            .limit(1)
          : [];
        const [changedOvertime] = groupUserIds.length
          ? await tx.select({ id: attendanceOvertimeRequests.id }).from(attendanceOvertimeRequests)
            .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceOvertimeRequests.attendance_id))
            .where(and(
              inArray(attendanceOvertimeRequests.user_id, groupUserIds),
              eq(attendanceOvertimeRequests.status, "approved"),
              isNull(attendanceOvertimeRequests.paid_in_run_id),
              gte(attendanceSessions.work_date, run.period_start),
              lte(attendanceSessions.work_date, run.period_end),
              gt(attendanceOvertimeRequests.updated_at, run.snapshot_updated_at),
            ))
            .limit(1)
          : [];
        if (changedSession || hasUnincludedSession || changedProfile || changedPayItem || changedLeave || changedOvertime) {
          throw new PayrollRequestError(409, "Payroll inputs changed after this draft was built. Rebuild the draft before finalizing.");
        }
        const overtimeIds = runLines
          .filter((line: any) => line.source_type === "overtime")
          .map((line: any) => line.source_id);
        if (overtimeIds.length) {
          await tx.update(attendanceOvertimeRequests).set({ paid_in_run_id: id, updated_at: new Date() })
            .where(and(inArray(attendanceOvertimeRequests.id, overtimeIds), isNull(attendanceOvertimeRequests.paid_in_run_id)));
        }
        const actor = requestUser(req);
        const [updated] = await tx.update(payrollRuns).set({
          status: "finalized",
          finalized_by: actor.id,
          finalized_at: new Date(),
        }).where(and(eq(payrollRuns.id, id), eq(payrollRuns.status, "draft"))).returning();
        if (!updated) throw new PayrollRequestError(409, "The run was changed by another manager. Refresh and try again.");
        await writePayrollAudit(tx, actor.id, "payroll_run", id, "finalized", run, updated);
        return updated;
      });
      res.json({ run: result, details: await fetchRunDetails(id) });
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: error?.message ?? "Could not finalize the payroll run." });
    }
  });
}