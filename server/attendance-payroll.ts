import type { Express, Request, RequestHandler } from "express";
import { and, asc, desc, eq, gte, gt, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { getCompanyTimezone } from "./attendance";
import { calculateAttendanceDayPay } from "./attendance-pay-calculation";
import { dateOnlyInTimeZone } from "@shared/timezone";
import { calculateNextPayrollPeriod } from "@shared/payroll-schedule";
import { storage } from "./storage";
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
type AnyPermissionMiddleware = (requirements: Array<{ module: string; action: string }>) => RequestHandler;

class PayrollRequestError extends Error {
  status: number;
  payload?: Record<string, unknown>;
  constructor(status: number, message: string, payload?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.payload = payload;
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

function resolvePayslipHourlyRate(slip: any, lines: any[], fallbackRate: unknown = 0): string {
  const snapshotRate = Number(slip.hourly_rate_snapshot ?? 0);
  const regularLineRate = Number(lines.find((line) =>
    line.line_type === "regular" && Number(line.rate) > 0,
  )?.rate ?? 0);
  const currentProfileRate = Number(fallbackRate ?? 0);
  const rate = [snapshotRate, regularLineRate, currentProfileRate]
    .find((candidate) => Number.isFinite(candidate) && candidate > 0) ?? 0;
  return rate.toFixed(4);
}

export async function getAttendancePayBreakdowns(sessions: any[], now = new Date()) {
  if (!sessions.length) return new Map();
  const userIds = [...new Set(sessions.map(session => Number(session.user_id)).filter(Number.isInteger))];
  const [timeZone, breaksByAttendance, groupSettings] = await Promise.all([
    getCompanyTimezone(storage),
    storage.getAttendanceBreakIntervals(sessions.map(session => session.id)),
    userIds.length
      ? db.select({
        user_id: users.id,
        count_from_clock_in: attendancePayrollGroupSchedules.count_from_clock_in,
        deduct_fixed_break_hour: attendancePayrollGroupSchedules.deduct_fixed_break_hour,
      }).from(users)
        .leftJoin(attendancePayrollGroupSchedules, eq(attendancePayrollGroupSchedules.role_id, users.role_id))
        .where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);
  const settingsByUser = new Map(groupSettings.map(settings => [settings.user_id, settings]));
  return calculateAttendanceDayPay(
    sessions.map(session => ({
      ...session,
      count_from_clock_in: settingsByUser.get(Number(session.user_id))?.count_from_clock_in ?? false,
      deduct_fixed_break_hour: settingsByUser.get(Number(session.user_id))?.deduct_fixed_break_hour ?? false,
      breaks: breaksByAttendance[session.id] ?? [],
    })),
    timeZone,
    now,
  );
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

async function buildDraftPayslips(
  tx: any,
  run: any,
  preservedEarningsByUser = new Map<number, { commission: number; incentives: number; paypalFee: number }>(),
) {
  const groupMembers = await tx.select({
    id: users.id,
    name: users.name,
    username: users.username,
    company_role: users.company_role,
  }).from(users)
    .where(and(eq(users.role_id, run.role_id), eq(users.attendance_tracking_enabled, true)))
    .orderBy(asc(users.name));

  if (!groupMembers.length) throw new PayrollRequestError(400, "This user group has no employees with attendance and payroll tracking enabled.");
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
  const sessionsNeedingReview = completedSessionCandidates.filter((session: any) =>
    session.review_status === "needs_review",
  );
  if (sessionsNeedingReview.length) {
    const employeeById = new Map<number, any>(groupMembers.map((employee: any) => [employee.id, employee]));
    const attendanceReviewSessions = sessionsNeedingReview.map((session: any) => {
      const employee = employeeById.get(session.user_id);
      return {
        id: session.id,
        user_id: session.user_id,
        employee_name: employee?.name ?? null,
        employee_username: employee?.username ?? null,
        work_date: session.work_date,
        session_number: session.session_number,
        status: session.status,
      };
    }).sort((a: any, b: any) =>
      String(a.work_date).localeCompare(String(b.work_date))
      || String(a.employee_name ?? a.employee_username ?? "").localeCompare(String(b.employee_name ?? b.employee_username ?? ""))
      || Number(a.session_number ?? 1) - Number(b.session_number ?? 1),
    );
    throw new PayrollRequestError(
      409,
      `${sessionsNeedingReview.length} completed attendance session${sessionsNeedingReview.length === 1 ? " needs" : "s need"} review before building payroll.`,
      { code: "attendance_needs_review", attendanceReviewSessions },
    );
  }
  const completedSessions = completedSessionCandidates;
  const payBreakdownByAttendance = await getAttendancePayBreakdowns(completedSessions);
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
      const payBreakdown = payBreakdownByAttendance.get(session.id) ?? {
        paidSeconds: 0,
        overtimeSeconds: 0,
      };
      const regularSeconds = payBreakdown.paidSeconds;
      if (regularSeconds > 0) {
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
      }

      const request = overtimeByAttendance.get(session.id);
      if (request) {
        const eligibleOvertimeHours = hours(payBreakdown.overtimeSeconds);
        const approvedHours = Number(request.approved_hours ?? 0);
        if (approvedHours > eligibleOvertimeHours + 0.01) {
          throw new PayrollRequestError(409, `Approved overtime for ${employee.name} on ${session.work_date} exceeds the schedule-eligible overtime. Review the claim before building payroll.`);
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

    const manualEarnings = preservedEarningsByUser.get(employee.id) ?? { commission: 0, incentives: 0, paypalFee: 0 };
    const commission = roundMoney(Number(manualEarnings.commission) || 0);
    const incentives = roundMoney(Number(manualEarnings.incentives) || 0);
    const paypalFee = roundMoney(Number(manualEarnings.paypalFee) || 0);
    if (!Number.isFinite(commission) || commission < 0 || !Number.isFinite(incentives) || incentives < 0 || !Number.isFinite(paypalFee) || paypalFee < 0) {
      throw new PayrollRequestError(400, `Manual payroll amounts for ${employee.name} have an invalid amount.`);
    }
    gross += commission + incentives;
    if (commission > 0) lines.push({
      line_type: "commission",
      description: "Commission",
      units: "1.00",
      rate: asMoney(commission),
      amount: asMoney(commission),
      source_type: "commission",
      source_id: employee.id,
      source_date: run.period_start,
    });
    if (incentives > 0) lines.push({
      line_type: "incentive",
      description: "Incentives",
      units: "1.00",
      rate: asMoney(incentives),
      amount: asMoney(incentives),
      source_type: "incentive",
      source_id: employee.id,
      source_date: run.period_start,
    });
    if (paypalFee > 0) {
      deductions += paypalFee;
      lines.push({
        line_type: "deduction",
        description: "PayPal Transfer Fee",
        units: "1.00",
        rate: asMoney(paypalFee),
        amount: asMoney(-paypalFee),
        source_type: "paypal_transfer_fee",
        source_id: employee.id,
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
      position_snapshot: employee.company_role || "",
      hourly_rate_snapshot: hourlyRate.toFixed(4),
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
  const slipRows = await db.select({ slip: payslips, employee_email: users.username }).from(payslips)
    .leftJoin(users, eq(users.id, payslips.user_id))
    .where(eq(payslips.payroll_run_id, runId))
    .orderBy(asc(payslips.employee_name_snapshot));
  const slips = slipRows.map(({ slip, employee_email }) => ({ ...slip, employee_email }));
  const avatars = slips.length
    ? await storage.getUserAvatarThumbnails(slips.map((slip) => slip.user_id))
    : [];
  const avatarByUserId = new Map(avatars.map((avatar) => [avatar.user_id, avatar.avatar_thumbnail]));
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
  const profiles = slips.length
    ? await db.select({
      user_id: employeePayProfiles.user_id,
      hourly_rate: employeePayProfiles.hourly_rate,
    }).from(employeePayProfiles)
      .where(inArray(employeePayProfiles.user_id, slips.map((slip) => slip.user_id)))
    : [];
  const profileRateByUser = new Map(profiles.map((profile) => [profile.user_id, profile.hourly_rate]));
  return {
    run,
    payslips: slips.map((slip) => {
      const slipLines = linesBySlip.get(slip.id) ?? [];
      return {
        ...slip,
        avatar_thumbnail: avatarByUserId.get(slip.user_id) ?? null,
        hourly_rate: resolvePayslipHourlyRate(slip, slipLines, profileRateByUser.get(slip.user_id)),
        lines: slipLines,
      };
    }),
  };
}

export function registerAttendancePayrollRoutes(
  app: Express,
  requirePermission: PermissionMiddleware,
  requireAnyPermission: AnyPermissionMiddleware,
) {
  const canUseAttendance = requirePermission("attendance", "view");
  const canViewPayroll = requireAnyPermission([
    { module: "payroll", action: "view" },
    { module: "payroll", action: "manage" },
  ]);
  const canManagePayroll = requirePermission("payroll", "manage");
  const canApproveOvertime = requirePermission("payroll", "approve_overtime");
  const canDeletePayrollRuns = requirePermission("payroll", "delete_runs");
  const canManageOrDeletePayrollRun = requireAnyPermission([
    { module: "payroll", action: "manage" },
    { module: "payroll", action: "delete_runs" },
  ]);
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
        db.select({ slip: payslips, run: payrollRuns, employee_email: users.username }).from(payslips)
          .innerJoin(users, eq(users.id, payslips.user_id))
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
        payslips: slipRows.map(({ slip, run, employee_email }) => {
          const slipLines = linesBySlip.get(slip.id) ?? [];
          return {
            ...slip,
            employee_email,
            hourly_rate: resolvePayslipHourlyRate(slip, slipLines, profile?.hourly_rate),
            run,
            lines: slipLines,
          };
        }),
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
        isNotNull(attendanceSessions.time_out),
      )).orderBy(desc(attendanceSessions.work_date), desc(attendanceSessions.time_in));
      if (!completed.length) return res.json({ rows: [] });
      const payByAttendance = await getAttendancePayBreakdowns(completed);
      const claims = await db.select().from(attendanceOvertimeRequests)
        .where(inArray(attendanceOvertimeRequests.attendance_id, completed.map((row) => row.id)));
      const claimedIds = new Set(claims.map((claim) => claim.attendance_id));
      res.json({
        rows: completed.filter((session) =>
          !claimedIds.has(session.id)
          && (payByAttendance.get(session.id)?.overtimeSeconds ?? 0) > 0,
        ).map((session) => ({
          id: session.id,
          work_date: session.work_date,
          time_in: session.time_in,
          time_out: session.time_out,
          worked_seconds: payByAttendance.get(session.id)?.workedSeconds ?? 0,
          paid_seconds: payByAttendance.get(session.id)?.paidSeconds ?? 0,
          eligible_overtime_hours: hours(payByAttendance.get(session.id)?.overtimeSeconds ?? 0),
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
      const daySessions = await db.select().from(attendanceSessions).where(and(
        eq(attendanceSessions.user_id, userId),
        eq(attendanceSessions.work_date, session.work_date),
        eq(attendanceSessions.status, "completed"),
        isNotNull(attendanceSessions.time_out),
      ));
      const eligibleHours = hours((await getAttendancePayBreakdowns(daySessions)).get(session.id)?.overtimeSeconds ?? 0);
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

  app.get("/api/attendance/payroll/overtime/pending", canApproveOvertime, async (req, res) => {
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
          eq(users.attendance_tracking_enabled, true),
        ))
        .orderBy(asc(attendanceOvertimeRequests.created_at));
      if (!rows.length) return res.json({ rows: [] });
      const usersForClaims = [...new Set(rows.map(row => row.request.user_id))];
      const datesForClaims = [...new Set(rows.map(row => row.work_date))];
      const daySessions = await db.select().from(attendanceSessions).where(and(
        inArray(attendanceSessions.user_id, usersForClaims),
        inArray(attendanceSessions.work_date, datesForClaims),
        eq(attendanceSessions.status, "completed"),
        isNotNull(attendanceSessions.time_out),
      ));
      const payByAttendance = await getAttendancePayBreakdowns(daySessions);
      res.json({
        rows: rows.map(row => ({
          ...row,
          eligible_overtime_hours: hours(payByAttendance.get(row.request.attendance_id)?.overtimeSeconds ?? 0),
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load pending overtime claims." });
    }
  });

  app.patch("/api/attendance/payroll/overtime/:id", canApproveOvertime, async (req, res) => {
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
        const daySessions = await db.select().from(attendanceSessions).where(and(
          eq(attendanceSessions.user_id, session.user_id),
          eq(attendanceSessions.work_date, session.work_date),
          eq(attendanceSessions.status, "completed"),
          isNotNull(attendanceSessions.time_out),
        ));
        const eligible = hours((await getAttendancePayBreakdowns(daySessions)).get(session.id)?.overtimeSeconds ?? 0);
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

  app.get("/api/attendance/payroll/admin/config", canViewPayroll, async (_req, res) => {
    try {
      const [groups, existingRuns] = await Promise.all([
        db.select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        schedule: attendancePayrollGroupSchedules,
      }).from(roles)
        .leftJoin(attendancePayrollGroupSchedules, eq(attendancePayrollGroupSchedules.role_id, roles.id))
          .orderBy(asc(roles.name)),
        db.select({ role_id: payrollRuns.role_id, payday: payrollRuns.payday })
          .from(payrollRuns)
          .orderBy(desc(payrollRuns.payday)),
      ]);
      const latestPaydayByRole = new Map<number, string>();
      for (const run of existingRuns) {
        if (!latestPaydayByRole.has(run.role_id)) latestPaydayByRole.set(run.role_id, run.payday);
      }
      const groupsWithNextPeriod = groups.map((group) => ({
        ...group,
        next_period: group.schedule
          ? calculateNextPayrollPeriod(
            group.schedule,
            latestPaydayByRole.get(group.id),
            dateOnlyInTimeZone(new Date(), group.schedule.timezone || "UTC"),
          )
          : null,
      }));
      res.json({ groups: groupsWithNextPeriod });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load payroll groups." });
    }
  });

  app.put("/api/attendance/payroll/admin/groups/:roleId/schedule", canManagePayroll, async (req, res) => {
    const schema = z.object({
      cadence: z.enum(["biweekly", "semimonthly", "biweekly_friday", "semimonthly_15_30"]),
      biweekly_anchor_date: z.string().refine((value) => value === "" || isDateOnly(value), "Enter a valid anchor date."),
      semimonthly_first_payday: z.coerce.number().int().min(1).max(31),
      semimonthly_second_payday: z.coerce.number().int().min(1).max(31),
      timezone: z.string().refine(validTimezone, "Enter a valid timezone."),
      count_from_clock_in: z.boolean().default(false),
      deduct_fixed_break_hour: z.boolean().default(false),
      paypal_php_conversion_enabled: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the payroll schedule." });
    if (["biweekly", "biweekly_friday"].includes(parsed.data.cadence) && !parsed.data.biweekly_anchor_date) {
      return res.status(400).json({ error: "Set an anchor payday for this 14-day schedule." });
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
        count_from_clock_in: parsed.data.count_from_clock_in,
        deduct_fixed_break_hour: parsed.data.deduct_fixed_break_hour,
        paypal_php_conversion_enabled: parsed.data.paypal_php_conversion_enabled,
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

  app.get("/api/attendance/payroll/admin/employees", canViewPayroll, async (req, res) => {
    const roleIdParam = req.query.roleId;
    const roleId = roleIdParam === undefined ? null : Number(roleIdParam);
    if (roleId !== null && (!Number.isInteger(roleId) || roleId <= 0)) {
      return res.status(400).json({ error: "Choose a valid user group." });
    }
    try {
      const employees = await db.select({
        id: users.id,
        name: users.name,
        username: users.username,
        is_enabled: users.is_enabled,
        attendance_tracking_enabled: users.attendance_tracking_enabled,
      }).from(users).where(and(roleId ? eq(users.role_id, roleId) : undefined)).orderBy(asc(users.name));
      const ids = employees.map((employee) => employee.id);
      if (!ids.length) return res.json({ employees: [] });
      const [profiles, items] = await Promise.all([
        db.select().from(employeePayProfiles).where(inArray(employeePayProfiles.user_id, ids)),
        db.select().from(employeePayItems).where(inArray(employeePayItems.user_id, ids)).orderBy(asc(employeePayItems.id)),
      ]);
      const avatars = await storage.getUserAvatarThumbnails(ids);
      const avatarByUserId = new Map(avatars.map((avatar) => [avatar.user_id, avatar.avatar_thumbnail]));
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
          avatar_thumbnail: avatarByUserId.get(employee.id) ?? null,
          profile: profilesByUser.get(employee.id) ?? null,
          payItems: itemsByUser.get(employee.id) ?? [],
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load pay profiles." });
    }
  });

  app.patch("/api/attendance/payroll/admin/employees/:userId/tracking", canManagePayroll, async (req, res) => {
    const userId = Number(req.params.userId);
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid employee." });
    if (!parsed.success) return res.status(400).json({ error: "Choose whether tracking is enabled or disabled." });
    try {
      const [employee] = await db.select({
        id: users.id,
        attendance_tracking_enabled: users.attendance_tracking_enabled,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (!employee) return res.status(404).json({ error: "Employee not found." });
      const [updated] = await db.update(users)
        .set({ attendance_tracking_enabled: parsed.data.enabled })
        .where(eq(users.id, userId))
        .returning({ id: users.id, attendance_tracking_enabled: users.attendance_tracking_enabled });
      if (employee.attendance_tracking_enabled !== parsed.data.enabled) {
        await writePayrollAudit(
          db,
          requestUser(req).id,
          "employee_tracking",
          userId,
          parsed.data.enabled ? "tracking_enabled" : "tracking_disabled",
          { attendance_tracking_enabled: employee.attendance_tracking_enabled },
          { attendance_tracking_enabled: parsed.data.enabled },
        );
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not update employee tracking." });
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

  app.get("/api/attendance/payroll/admin/runs", canViewPayroll, async (req, res) => {
    try {
      const actor = requestUser(req);
      const [runs, summaries, permissions] = await Promise.all([
        db.select().from(payrollRuns).orderBy(desc(payrollRuns.period_start), desc(payrollRuns.created_at)),
        db.select({
          payroll_run_id: payslips.payroll_run_id,
          employee_count: sql<number>`count(*)::int`,
          total_hours: sql<string>`COALESCE(SUM(${payslips.regular_hours} + ${payslips.overtime_hours}), 0)::text`,
          net_wages: sql<string>`COALESCE(SUM(${payslips.net_amount}), 0)::text`,
          gross_wages: sql<string>`COALESCE(SUM(${payslips.gross_amount}), 0)::text`,
          currency_count: sql<number>`count(DISTINCT ${payslips.currency})::int`,
          currency: sql<string>`MIN(${payslips.currency})`,
        }).from(payslips).groupBy(payslips.payroll_run_id),
        actor.role === "admin" ? Promise.resolve([]) : storage.getUserPermissionStrings(actor.id),
      ]);
      const summaryByRunId = new Map(summaries.map((summary) => [summary.payroll_run_id, summary]));
      const rows = runs.map((run) => ({
        ...run,
        ...(summaryByRunId.get(run.id) ?? {
          employee_count: 0,
          total_hours: "0",
          net_wages: "0",
          gross_wages: "0",
          currency_count: 0,
          currency: null,
        }),
      }));
      res.json({ rows, canDelete: actor.role === "admin" || permissions.includes("payroll:delete_runs") });
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Could not load payroll runs." });
    }
  });

  app.post("/api/attendance/payroll/admin/runs", canManagePayroll, async (req, res) => {
    const schema = z.object({
      role_id: z.coerce.number().int().positive(),
      usd_to_php_rate: z.coerce.number().finite().min(0).max(99999999.9999).default(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Choose a user group and enter a valid USD to PHP rate." });
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
      if (payrollSchedule.paypal_php_conversion_enabled && parsed.data.usd_to_php_rate <= 0) {
        return res.status(400).json({ error: "Enter a positive USD to PHP conversion rate for this group." });
      }
      const [latestRun] = await db.select({ payday: payrollRuns.payday }).from(payrollRuns)
        .where(eq(payrollRuns.role_id, group.id))
        .orderBy(desc(payrollRuns.payday))
        .limit(1);
      const nextPeriod = calculateNextPayrollPeriod(
        payrollSchedule,
        latestRun?.payday,
        dateOnlyInTimeZone(new Date(), payrollSchedule.timezone || "UTC"),
      );
      if (!nextPeriod) return res.status(400).json({ error: "Complete this group's pay schedule before creating a payroll run." });
      const overlapping = await db.select({ id: payrollRuns.id }).from(payrollRuns).where(and(
        eq(payrollRuns.role_id, parsed.data.role_id),
        lte(payrollRuns.period_start, nextPeriod.period_end),
        gte(payrollRuns.period_end, nextPeriod.period_start),
      )).limit(1);
      if (overlapping.length) return res.status(409).json({ error: "A draft or finalized payroll run already overlaps these dates for this user group." });
      const actor = requestUser(req);
      const created = await db.transaction(async (tx) => {
        const [run] = await tx.insert(payrollRuns).values({
          role_id: group.id,
          group_name_snapshot: group.name,
          cadence_snapshot: payrollSchedule.cadence,
          timezone_snapshot: payrollSchedule.timezone,
          period_start: nextPeriod.period_start,
          period_end: nextPeriod.period_end,
          payday: nextPeriod.payday,
          paypal_php_conversion_enabled: payrollSchedule.paypal_php_conversion_enabled,
          usd_to_php_rate: payrollSchedule.paypal_php_conversion_enabled ? parsed.data.usd_to_php_rate.toFixed(4) : "0.0000",
          created_by: actor.id,
        }).returning();
        await buildDraftPayslips(tx, run);
        await writePayrollAudit(tx, actor.id, "payroll_run", run.id, "created", null, run);
        return run;
      });
      res.status(201).json({ run: created, details: await fetchRunDetails(created.id) });
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message, ...(error.payload ?? {}) });
      if (error?.code === "23505") return res.status(409).json({ error: "A payroll run already exists for this period." });
      res.status(500).json({ error: error?.message ?? "Could not create the payroll run." });
    }
  });

  app.get("/api/attendance/payroll/admin/runs/:id", canViewPayroll, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payroll run." });
    try {
      const details = await fetchRunDetails(id);
      if (!details) return res.status(404).json({ error: "Payroll run not found." });
      const requester = requestUser(req);
      const canManage = requester.role === "admin"
        || (await storage.getUserPermissionStrings(requester.id)).includes("payroll:manage");
      const response = canManage
        ? details
        : { ...details, payslips: details.payslips.map(({ employee_email: _email, ...slip }) => slip) };
      res.json(response);
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
        const oldSlips = await tx.select({ id: payslips.id, user_id: payslips.user_id }).from(payslips)
          .where(eq(payslips.payroll_run_id, id));
        const oldSlipUserById = new Map(oldSlips.map((slip: any) => [slip.id, slip.user_id]));
        const enabledEmployees = oldSlips.length
          ? await tx.select({ id: users.id }).from(users).where(and(
            inArray(users.id, oldSlips.map((slip: any) => slip.user_id)),
            eq(users.attendance_tracking_enabled, true),
          ))
          : [];
        const enabledEmployeeIds = new Set(enabledEmployees.map((employee: any) => employee.id));
        const slipsToRebuild = oldSlips.filter((slip: any) => enabledEmployeeIds.has(slip.user_id));
        const preservedEarningsByUser = new Map<number, { commission: number; incentives: number; paypalFee: number }>();
        if (oldSlips.length) {
          const oldManualLines = await tx.select().from(payslipLineItems).where(and(
            inArray(payslipLineItems.payslip_id, oldSlips.map((slip: any) => slip.id)),
            inArray(payslipLineItems.line_type, ["commission", "incentive", "deduction"]),
          ));
          for (const line of oldManualLines) {
            const userId = oldSlipUserById.get(line.payslip_id);
            if (!userId) continue;
            const earnings = preservedEarningsByUser.get(userId) ?? { commission: 0, incentives: 0, paypalFee: 0 };
            if (line.line_type === "commission") earnings.commission += Number(line.amount);
            if (line.line_type === "incentive") earnings.incentives += Number(line.amount);
            if (line.line_type === "deduction" && line.source_type === "paypal_transfer_fee") {
              earnings.paypalFee += Math.abs(Number(line.amount));
            }
            preservedEarningsByUser.set(userId, earnings);
          }
          if (slipsToRebuild.length) {
            await tx.delete(payslips).where(inArray(payslips.id, slipsToRebuild.map((slip: any) => slip.id)));
          }
        }
        const [refreshedRun] = await tx.update(payrollRuns).set({ snapshot_updated_at: new Date() })
          .where(eq(payrollRuns.id, id)).returning();
        await buildDraftPayslips(tx, refreshedRun, preservedEarningsByUser);
        await writePayrollAudit(tx, requestUser(req).id, "payroll_run", id, "rebuilt", { previous_slips: oldSlips.length }, { rebuilt: true });
        return refreshedRun;
      });
      res.json({ run: result, details: await fetchRunDetails(id) });
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message, ...(error.payload ?? {}) });
      if (error?.code === "23505") return res.status(409).json({ error: "Some attendance, leave, or pay items are already included in another run." });
      res.status(500).json({ error: error?.message ?? "Could not rebuild the draft payroll run." });
    }
  });

  app.patch("/api/attendance/payroll/admin/payslips/:id/earnings", canManagePayroll, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payslip." });
    const parsed = z.object({
      commission: z.coerce.number().finite().min(0).max(999999999999.99),
      incentives: z.coerce.number().finite().min(0).max(999999999999.99),
      paypalFee: z.coerce.number().finite().min(0).max(999999999999.99).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter valid non-negative amounts for commission, incentives, and the PayPal fee." });
    try {
      const result = await db.transaction(async (tx) => {
        const [record] = await tx.select({
          slip: payslips,
          run_status: payrollRuns.status,
          period_start: payrollRuns.period_start,
          paypal_php_conversion_enabled: payrollRuns.paypal_php_conversion_enabled,
        }).from(payslips)
          .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.payroll_run_id))
          .where(eq(payslips.id, id))
          .limit(1);
        if (!record) throw new PayrollRequestError(404, "Payslip not found.");
        if (record.run_status !== "draft") throw new PayrollRequestError(409, "Earnings can only be changed on a draft payroll run.");
        if (!record.paypal_php_conversion_enabled && Number(parsed.data.paypalFee ?? 0) > 0) {
          throw new PayrollRequestError(400, "PayPal fees are not enabled for this payroll group.");
        }

        const oldLines = await tx.select().from(payslipLineItems).where(eq(payslipLineItems.payslip_id, id));
        const oldCommission = roundMoney(oldLines
          .filter((line: any) => line.line_type === "commission")
          .reduce((sum: number, line: any) => sum + Number(line.amount), 0));
        const oldIncentives = roundMoney(oldLines
          .filter((line: any) => line.line_type === "incentive")
          .reduce((sum: number, line: any) => sum + Number(line.amount), 0));
        const oldPaypalFee = roundMoney(oldLines
          .filter((line: any) => line.line_type === "deduction" && line.source_type === "paypal_transfer_fee")
          .reduce((sum: number, line: any) => sum + Math.abs(Number(line.amount)), 0));
        const commission = roundMoney(parsed.data.commission);
        const incentives = roundMoney(parsed.data.incentives);
        const paypalFee = record.paypal_php_conversion_enabled
          ? parsed.data.paypalFee === undefined ? oldPaypalFee : roundMoney(parsed.data.paypalFee)
          : 0;
        const gross = roundMoney(Number(record.slip.gross_amount) - oldCommission - oldIncentives + commission + incentives);
        const deductions = roundMoney(Number(record.slip.deductions_amount) - oldPaypalFee + paypalFee);
        const net = roundMoney(gross - deductions);
        if (net < 0) throw new PayrollRequestError(400, "These amounts would leave the payslip with negative net pay.");

        const [updated] = await tx.update(payslips).set({
          gross_amount: asMoney(gross),
          deductions_amount: asMoney(deductions),
          net_amount: asMoney(net),
        }).where(eq(payslips.id, id)).returning();
        const oldManualLineIds = oldLines
          .filter((line: any) => line.line_type === "commission"
            || line.line_type === "incentive"
            || (line.line_type === "deduction" && line.source_type === "paypal_transfer_fee"))
          .map((line: any) => line.id);
        if (oldManualLineIds.length) {
          await tx.delete(payslipLineItems).where(inArray(payslipLineItems.id, oldManualLineIds));
        }
        const manualLines: any[] = [];
        if (commission > 0) manualLines.push({
          payslip_id: id,
          line_type: "commission",
          description: "Commission",
          units: "1.00",
          rate: asMoney(commission),
          amount: asMoney(commission),
          source_type: "commission",
          source_id: record.slip.user_id,
          source_date: record.period_start,
        });
        if (incentives > 0) manualLines.push({
          payslip_id: id,
          line_type: "incentive",
          description: "Incentives",
          units: "1.00",
          rate: asMoney(incentives),
          amount: asMoney(incentives),
          source_type: "incentive",
          source_id: record.slip.user_id,
          source_date: record.period_start,
        });
        if (paypalFee > 0) manualLines.push({
          payslip_id: id,
          line_type: "deduction",
          description: "PayPal Transfer Fee",
          units: "1.00",
          rate: asMoney(paypalFee),
          amount: asMoney(-paypalFee),
          source_type: "paypal_transfer_fee",
          source_id: record.slip.user_id,
          source_date: record.period_start,
        });
        if (manualLines.length) await tx.insert(payslipLineItems).values(manualLines);
        await writePayrollAudit(
          tx,
          requestUser(req).id,
          "payslip",
          id,
          "manual_earnings_updated",
          { commission: asMoney(oldCommission), incentives: asMoney(oldIncentives), paypal_fee: asMoney(oldPaypalFee) },
          { commission: asMoney(commission), incentives: asMoney(incentives), paypal_fee: asMoney(paypalFee) },
        );
        return updated;
      });
      res.json({ payslip: result });
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: error?.message ?? "Could not update the employee's draft earnings." });
    }
  });

  app.delete("/api/attendance/payroll/admin/runs/:id", canViewPayroll, canDeletePayrollRuns, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payroll run." });
    try {
      const result = await db.transaction(async (tx) => {
        const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
        if (!run) throw new PayrollRequestError(404, "Payroll run not found.");
        if (run.status !== "draft") {
          throw new PayrollRequestError(409, "Only draft payroll runs can be deleted. Revert a finalized run to draft first.");
        }
        const linkedOvertime = await tx.select({ id: attendanceOvertimeRequests.id })
          .from(attendanceOvertimeRequests)
          .where(eq(attendanceOvertimeRequests.paid_in_run_id, id));
        if (linkedOvertime.length) {
          await tx.update(attendanceOvertimeRequests)
            .set({ paid_in_run_id: null, updated_at: new Date() })
            .where(eq(attendanceOvertimeRequests.paid_in_run_id, id));
        }
        await tx.delete(payslips).where(eq(payslips.payroll_run_id, id));
        await tx.delete(payrollRuns).where(eq(payrollRuns.id, id));
        await writePayrollAudit(
          tx,
          requestUser(req).id,
          "payroll_run",
          id,
          "deleted",
          { status: run.status, group: run.group_name_snapshot, period_start: run.period_start, period_end: run.period_end },
          { deleted: true, released_overtime_requests: linkedOvertime.length },
        );
        return { deleted: true, released_overtime_requests: linkedOvertime.length };
      });
      res.json(result);
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: error?.message ?? "Could not delete the payroll run." });
    }
  });

  app.post("/api/attendance/payroll/admin/runs/:id/revert", canViewPayroll, canManageOrDeletePayrollRun, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid payroll run." });
    try {
      const updatedRun = await db.transaction(async (tx) => {
        const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
        if (!run) throw new PayrollRequestError(404, "Payroll run not found.");
        if (run.status !== "finalized") {
          throw new PayrollRequestError(409, "Only finalized payroll runs can be reverted to draft.");
        }

        const [updated] = await tx.update(payrollRuns).set({
          status: "draft",
          finalized_by: null,
          finalized_at: null,
        }).where(and(eq(payrollRuns.id, id), eq(payrollRuns.status, "finalized"))).returning();
        if (!updated) throw new PayrollRequestError(409, "The run was changed by another manager. Refresh and try again.");

        const linkedOvertime = await tx.select({ id: attendanceOvertimeRequests.id })
          .from(attendanceOvertimeRequests)
          .where(eq(attendanceOvertimeRequests.paid_in_run_id, id));
        if (linkedOvertime.length) {
          await tx.update(attendanceOvertimeRequests)
            .set({ paid_in_run_id: null, updated_at: new Date() })
            .where(eq(attendanceOvertimeRequests.paid_in_run_id, id));
        }
        await writePayrollAudit(tx, requestUser(req).id, "payroll_run", id, "reverted_to_draft", run, updated);
        return updated;
      });
      res.json({ run: updatedRun, details: await fetchRunDetails(id) });
    } catch (error: any) {
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message });
      res.status(500).json({ error: error?.message ?? "Could not revert the payroll run to draft." });
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
        const openSessions = groupUserIds.length
          ? await tx.select({
            id: attendanceSessions.id,
            employee_name: users.name,
            employee_username: users.username,
            work_date: attendanceSessions.work_date,
            session_number: attendanceSessions.session_number,
            status: attendanceSessions.status,
          }).from(attendanceSessions)
            .innerJoin(users, eq(users.id, attendanceSessions.user_id))
            .where(and(
            inArray(attendanceSessions.user_id, groupUserIds),
            gte(attendanceSessions.work_date, run.period_start),
            lte(attendanceSessions.work_date, run.period_end),
            inArray(attendanceSessions.status, ["active", "on_break"]),
          ))
            .orderBy(asc(attendanceSessions.work_date), asc(users.name), asc(attendanceSessions.session_number))
          : [];
        if (openSessions.length) {
          throw new PayrollRequestError(
            409,
            "Complete or resolve active attendance sessions in this period before finalizing.",
            { code: "active_attendance_sessions", openAttendanceSessions: openSessions },
          );
        }
        const runLines = await tx.select({
          source_id: payslipLineItems.source_id,
          source_type: payslipLineItems.source_type,
        }).from(payslipLineItems)
          .innerJoin(payslips, eq(payslips.id, payslipLineItems.payslip_id))
          .where(eq(payslips.payroll_run_id, id));
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
        if (changedSession || changedProfile || changedPayItem || changedLeave || changedOvertime) {
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
      if (error instanceof PayrollRequestError) return res.status(error.status).json({ error: error.message, ...(error.payload ?? {}) });
      res.status(500).json({ error: error?.message ?? "Could not finalize the payroll run." });
    }
  });
}