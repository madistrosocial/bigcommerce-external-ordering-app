import assert from "node:assert/strict";
import { calculateNextPayrollPeriod } from "../shared/payroll-schedule";

const mondayBiweekly = {
  cadence: "biweekly",
  biweekly_anchor_date: "2026-09-28",
};

assert.deepEqual(
  calculateNextPayrollPeriod(mondayBiweekly, null, "2026-10-26"),
  { period_start: "2026-09-28", period_end: "2026-10-09", payday: "2026-10-12" },
);
assert.deepEqual(
  calculateNextPayrollPeriod(mondayBiweekly, "2026-10-12", "2026-10-26"),
  { period_start: "2026-10-12", period_end: "2026-10-23", payday: "2026-10-26" },
);
assert.deepEqual(
  calculateNextPayrollPeriod(mondayBiweekly, "2026-10-26", "2026-10-26"),
  { period_start: "2026-10-26", period_end: "2026-11-06", payday: "2026-11-09" },
);
assert.deepEqual(
  calculateNextPayrollPeriod(
    { cadence: "biweekly", biweekly_anchor_date: "2026-10-02" },
    null,
    "2026-10-16",
  ),
  { period_start: "2026-10-02", period_end: "2026-10-15", payday: "2026-10-16" },
);
assert.deepEqual(
  calculateNextPayrollPeriod(
    { cadence: "semimonthly", semimonthly_first_payday: 15, semimonthly_second_payday: 30 },
    null,
    "2026-10-26",
  ),
  { period_start: "2026-10-15", period_end: "2026-10-29", payday: "2026-10-30" },
);
assert.equal(
  calculateNextPayrollPeriod({ cadence: "biweekly" }, null, "2026-10-26"),
  null,
);

console.log("Payroll schedule calculations verified.");
