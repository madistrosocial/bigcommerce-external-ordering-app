import type { IStorage } from "./storage";

export const ATTENDANCE_PERMISSION_DEFINITIONS = [
  { module: "attendance", action: "clock", description: "Attendance: start and end your own day" },
  { module: "attendance", action: "view_own", description: "Attendance: view your own history" },
  { module: "attendance", action: "view_dashboard", description: "Attendance: view the management overview" },
  { module: "attendance", action: "view_all", description: "Attendance: view all employee attendance records" },
  { module: "attendance", action: "view_logs", description: "Attendance: view detailed attendance logs" },
  { module: "attendance", action: "view_exceptions", description: "Attendance: view attendance exceptions" },
  { module: "attendance", action: "view_reports", description: "Attendance: view attendance reports" },
  { module: "attendance", action: "review_exceptions", description: "Attendance: resolve attendance exceptions" },
  { module: "attendance", action: "manage_settings", description: "Attendance: manage warehouse and payroll settings" },
  { module: "attendance", action: "manage", description: "Attendance: manage attendance records" },
  { module: "attendance", action: "approve", description: "Attendance: approve and lock attendance records" },
] as const;

export type AttendanceSettings = {
  warehouseName: string;
  warehouseLatitude: number | null;
  warehouseLongitude: number | null;
  allowedRadiusMeters: number;
  warehouseVerificationEnabled: boolean;
  drivingStartEnabled: boolean;
  routeStartEnabled: boolean;
  homeExclusionRadiusMeters: number;
  hourlyCheckpointEnabled: boolean;
  checkpointIntervalMinutes: number;
  firstFourHourValidationEnabled: boolean;
  firstFourHourWindowHours: number;
  warehousePresenceThresholdMinutes: number;
  locationAccuracyRequired: boolean;
  payPeriodLengthDays: number;
  paydayWeekday: number;
  payPeriodAnchorDate: string;
  timezone: string;
};

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  warehouseName: "Main Warehouse",
  warehouseLatitude: null,
  warehouseLongitude: null,
  allowedRadiusMeters: 250,
  warehouseVerificationEnabled: true,
  drivingStartEnabled: true,
  routeStartEnabled: true,
  homeExclusionRadiusMeters: 250,
  hourlyCheckpointEnabled: true,
  checkpointIntervalMinutes: 60,
  firstFourHourValidationEnabled: true,
  firstFourHourWindowHours: 4,
  warehousePresenceThresholdMinutes: 60,
  locationAccuracyRequired: false,
  payPeriodLengthDays: 14,
  paydayWeekday: 5,
  payPeriodAnchorDate: "2025-08-28",
  timezone: "America/New_York",
};

export async function getAttendanceSettings(storage: Pick<IStorage, "getSetting">): Promise<AttendanceSettings> {
  const row = await storage.getSetting("attendance_settings").catch(() => null);
  const value = row?.value && typeof row.value === "object" ? row.value : {};
  return { ...DEFAULT_ATTENDANCE_SETTINGS, ...value };
}

export function haversineDistanceMeters(
  latitude: number,
  longitude: number,
  targetLatitude: number,
  targetLongitude: number,
): number {
  const radius = 6371000;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(targetLatitude - latitude);
  const dLon = radians(targetLongitude - longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(targetLatitude)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideWarehouse(
  settings: AttendanceSettings,
  latitude: number,
  longitude: number,
): boolean {
  if (!settings.warehouseVerificationEnabled) return true;
  if (settings.warehouseLatitude == null || settings.warehouseLongitude == null) return false;
  return haversineDistanceMeters(
    latitude,
    longitude,
    settings.warehouseLatitude,
    settings.warehouseLongitude,
  ) <= settings.allowedRadiusMeters;
}

export function isOutsideHome(
  homeLatitude: number | null | undefined,
  homeLongitude: number | null | undefined,
  currentLatitude: number,
  currentLongitude: number,
  exclusionRadiusMeters: number,
): boolean {
  if (homeLatitude == null || homeLongitude == null) return false;
  return haversineDistanceMeters(
    currentLatitude,
    currentLongitude,
    homeLatitude,
    homeLongitude,
  ) > Math.max(1, Number(exclusionRadiusMeters) || 1);
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getPayPeriod(
  date = new Date(),
  settings: Pick<AttendanceSettings, "payPeriodLengthDays" | "payPeriodAnchorDate" | "paydayWeekday"> = DEFAULT_ATTENDANCE_SETTINGS,
): { start: string; end: string; payday: string } {
  const periodLength = Math.max(1, Number(settings.payPeriodLengthDays) || 14);
  const current = startOfDate(date);
  const anchor = startOfDate(new Date(`${settings.payPeriodAnchorDate}T00:00:00Z`));
  const diffDays = Math.floor((current.getTime() - anchor.getTime()) / 86_400_000);
  const periodNumber = Math.floor(diffDays / periodLength);
  const start = new Date(anchor);
  start.setUTCDate(start.getUTCDate() + periodNumber * periodLength);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + periodLength - 1);
  const payday = new Date(end);
  const desiredWeekday = Number(settings.paydayWeekday);
  const daysUntilPayday = (desiredWeekday - payday.getUTCDay() + 7) % 7;
  payday.setUTCDate(payday.getUTCDate() + daysUntilPayday);
  return { start: dateOnly(start), end: dateOnly(end), payday: dateOnly(payday) };
}

export function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 180 ? parsed : null;
}

export function parseAccuracy(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function formatHours(totalSeconds: number | null | undefined): string {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}