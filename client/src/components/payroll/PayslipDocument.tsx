import "./PayslipDocument.css";

export type PayslipAmount = number | string | null | undefined;

export interface PayslipLine {
  id?: number | string;
  line_type: string;
  description: string;
  units: PayslipAmount;
  rate: PayslipAmount;
  amount: PayslipAmount;
  source_type?: string | null;
  source_date?: string | null;
}

export interface PayslipRunSnapshot {
  group_name_snapshot: string;
  period_start: string;
  period_end: string;
  payday: string;
  status: string;
}

export interface PayslipDocumentData {
  employee_name_snapshot: string;
  currency: string;
  hourly_rate?: PayslipAmount;
  hourly_rate_snapshot?: PayslipAmount;
  regular_hours: PayslipAmount;
  overtime_hours: PayslipAmount;
  paid_leave_hours: PayslipAmount;
  unpaid_leave_hours: PayslipAmount;
  gross_amount: PayslipAmount;
  deductions_amount: PayslipAmount;
  net_amount: PayslipAmount;
  lines: PayslipLine[];
  run: PayslipRunSnapshot;
}

export interface PayslipBranding {
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
}

export interface PayslipDocumentProps {
  payslip: PayslipDocumentData;
  branding: PayslipBranding;
}

function numberValue(value: PayslipAmount): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: PayslipAmount, currency: string): string {
  const amount = numberValue(value);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "symbol",
    }).format(amount);
  } catch {
    return `${currency || "USD"} ${amount.toFixed(2)}`;
  }
}

function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatHours(value: PayslipAmount): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numberValue(value));
}

function formatDate(value?: string | null): string {
  if (!value) return "0";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${Number(dateOnly[2])}/${Number(dateOnly[3])}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function sumLineAmounts(lines: PayslipLine[], type: string): number {
  return roundMoney(lines
    .filter((line) => line.line_type === type)
    .reduce((sum, line) => sum + numberValue(line.amount), 0));
}

function PayslipRow({
  label,
  value,
  strong = false,
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div className={`payslip-row${strong ? " payslip-row--strong" : ""}`}>
      <span>{label}</span>
      <span data-testid={testId}>{value}</span>
    </div>
  );
}

export default function PayslipDocument({ payslip, branding }: PayslipDocumentProps) {
  const lines = Array.isArray(payslip.lines) ? payslip.lines : [];
  const currency = payslip.currency || "USD";
  const regularHours = numberValue(payslip.regular_hours);
  const overtimeHours = numberValue(payslip.overtime_hours);
  const hourlyRate = numberValue(payslip.hourly_rate ?? payslip.hourly_rate_snapshot)
    || numberValue(lines.find((line) => line.line_type === "regular" && numberValue(line.rate) > 0)?.rate);
  const regularLines = lines.filter((line) => line.line_type === "regular");
  const regularPay = regularLines.length > 0
    ? sumLineAmounts(lines, "regular")
    : roundMoney(regularHours * hourlyRate);
  const overtimePay = sumLineAmounts(lines, "overtime");
  const commission = 0;
  const incentives = 0;
  const grossPay = numberValue(payslip.gross_amount);
  const otherEarnings = Math.max(0, roundMoney(grossPay - regularPay - overtimePay - commission - incentives));

  const deductions = Math.max(0, numberValue(payslip.deductions_amount));
  const paypalFee = roundMoney(lines
    .filter((line) => line.line_type === "deduction" && /paypal.*transfer fee/i.test(line.description))
    .reduce((sum, line) => sum + Math.abs(numberValue(line.amount)), 0));
  const otherDeductions = Math.max(0, roundMoney(deductions - paypalFee));

  const daysWorked = new Set(lines
    .filter((line) => line.line_type === "regular" || line.line_type === "overtime")
    .map((line) => line.source_date)
    .filter((date): date is string => Boolean(date))).size;
  const totalPaidHours = roundMoney(regularHours + overtimeHours);
  const conversionRate = 0;
  const netPay = numberValue(payslip.net_amount);
  const netTakeHomePhp = roundMoney(netPay * conversionRate);
  const contactDetails = [
    branding.company_address,
    branding.company_phone,
    branding.company_email,
  ].filter((value): value is string => Boolean(value?.trim()));
  const isDraft = (payslip.run?.status ?? "").toLowerCase() === "draft";

  return (
    <article className="payslip-document" data-testid="payslip-document" aria-label="Employee payslip">
      <header className="payslip-contact" aria-label="Company contact information">
        {contactDetails.join(" | ")}
      </header>

      <main className="payslip-body">
        <div className="payslip-title-wrap">
          {isDraft && <span className="payslip-draft" data-testid="payslip-draft">DRAFT</span>}
          <h1 className="payslip-title">EMPLOYEE PAYSLIP</h1>
        </div>

        <section className="payslip-employee-details" aria-label="Employee and pay period">
          <div className="payslip-detail">
            <span>Employee :</span>
            <strong data-testid="payslip-employee">{payslip.employee_name_snapshot || "0"}</strong>
          </div>
          <div className="payslip-detail">
            <span>Pay Period :</span>
            <strong data-testid="payslip-period">
              {formatDate(payslip.run?.period_start)} - {formatDate(payslip.run?.period_end)}
            </strong>
          </div>
          <div className="payslip-detail">
            <span>Position :</span>
            <strong data-testid="payslip-position">{payslip.run?.group_name_snapshot || "0"}</strong>
          </div>
          <div className="payslip-detail">
            <span>Pay Date :</span>
            <strong data-testid="payslip-payday">{formatDate(payslip.run?.payday)}</strong>
          </div>
        </section>

        <section className="payslip-section" aria-labelledby="payslip-earnings-heading">
          <h2 id="payslip-earnings-heading">EARNINGS</h2>
          <div className="payslip-rows" data-testid="payslip-earnings">
            <PayslipRow label="Regular Hours" value={formatHours(regularHours)} />
            <PayslipRow label="Approved OT" value={formatHours(overtimeHours)} />
            <PayslipRow label="Total Paid Hours" value={formatHours(totalPaidHours)} />
            <PayslipRow label="Hourly Rate" value={formatMoney(hourlyRate, currency)} testId="payslip-hourly-rate" />
            <PayslipRow label="Regular Pay" value={formatMoney(regularPay, currency)} testId="payslip-base-pay" />
            <PayslipRow label="Overtime Pay" value={formatMoney(overtimePay, currency)} />
            <PayslipRow label="Commission" value={formatMoney(commission, currency)} />
            <PayslipRow label="Incentives" value={formatMoney(incentives, currency)} />
            {otherEarnings > 0 && <PayslipRow label="Other Earnings" value={formatMoney(otherEarnings, currency)} />}
            <PayslipRow label="GROSS PAY" value={formatMoney(grossPay, currency)} strong testId="payslip-gross" />
          </div>
        </section>

        <section className="payslip-section" aria-labelledby="payslip-attendance-heading">
          <h2 id="payslip-attendance-heading">ATTENDANCE</h2>
          <div className="payslip-rows" data-testid="payslip-attendance">
            <PayslipRow label="Days Worked" value={String(daysWorked)} />
            <PayslipRow label="Absences/VL" value="0" />
            <PayslipRow label="Late" value="0:00" />
            <PayslipRow label="Undertime" value="0:00" />
          </div>
        </section>

        <section className="payslip-section" aria-labelledby="payslip-deductions-heading">
          <h2 id="payslip-deductions-heading">DEDUCTIONS ({currency})</h2>
          <div className="payslip-rows" data-testid="payslip-deductions">
            <PayslipRow label="PayPal Transfer Fee" value={formatMoney(paypalFee, currency)} />
            {otherDeductions > 0 && <PayslipRow label="Other Deductions" value={formatMoney(otherDeductions, currency)} />}
            <PayslipRow label="TOTAL DEDUCTIONS" value={formatMoney(deductions, currency)} strong testId="payslip-deductions-total" />
          </div>
        </section>

        <section className="payslip-net" aria-label="Net pay and conversion">
          <div className="payslip-rows">
            <PayslipRow label={`NET PAY (${currency})`} value={formatMoney(netPay, currency)} strong testId="payslip-net" />
            <PayslipRow label="Current Conversion Rate" value={formatPeso(conversionRate)} />
          </div>
          <div className="payslip-take-home">
            <span>NET TAKE-HOME (PHP)</span>
            <strong data-testid="payslip-net-php">{formatPeso(netTakeHomePhp)}</strong>
          </div>
        </section>
      </main>

      <footer className="payslip-footer">
        CONFIDENTIALITY NOTICE: This document contains confidential financial information intended solely for the employee named above.
      </footer>
    </article>
  );
}
