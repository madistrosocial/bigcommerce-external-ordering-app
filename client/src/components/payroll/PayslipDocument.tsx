import type { ReactNode } from "react";

export type PayslipAmount = number | string | null | undefined;

export interface PayslipLine {
  id?: number | string;
  line_type: string;
  description: string;
  units: PayslipAmount;
  rate: PayslipAmount;
  amount: PayslipAmount;
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
  businessLogo: ReactNode;
  company_name?: string | null;
  company_address?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
}

export interface PayslipDocumentProps {
  payslip: PayslipDocumentData;
  branding: PayslipBranding;
}

const moneyValue = (value: PayslipAmount): number => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function formatMoney(value: PayslipAmount, currency: string): string {
  const amount = moneyValue(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "symbol",
    }).format(amount);
  } catch {
    return `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
  }
}

function formatHours(value: PayslipAmount): string {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
  }).format(parsed);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

const categoryLabels: Record<string, string> = {
  regular: "Regular pay",
  overtime: "Overtime",
  paid_leave: "Paid leave",
  unpaid_leave: "Unpaid leave",
  allowance: "Allowance",
};

function lineCategory(lineType: string): string {
  return categoryLabels[lineType] ?? lineType.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sumLines(lines: PayslipLine[]): number {
  return lines.reduce((sum, line) => sum + moneyValue(line.amount), 0);
}

function amountOrDash(value: PayslipAmount, currency: string): string {
  return value === null || value === undefined || value === "" ? "—" : formatMoney(value, currency);
}

export default function PayslipDocument({ payslip, branding }: PayslipDocumentProps) {
  const allLines = Array.isArray(payslip.lines) ? payslip.lines : [];
  const earningLines = allLines.filter((line) => line.line_type !== "deduction");
  const deductionLines = allLines.filter((line) => line.line_type === "deduction");
  const earningGroups = new Map<string, PayslipLine[]>();

  earningLines.forEach((line) => {
    const group = earningGroups.get(line.line_type) ?? [];
    group.push(line);
    earningGroups.set(line.line_type, group);
  });

  const isDraft = (payslip.run?.status ?? "").toLowerCase() === "draft";
  const period = `${formatDate(payslip.run?.period_start)} – ${formatDate(payslip.run?.period_end)}`;
  const hours = [
    { label: "Regular", value: payslip.regular_hours },
    { label: "Overtime", value: payslip.overtime_hours },
    { label: "Paid leave", value: payslip.paid_leave_hours },
    { label: "Unpaid leave", value: payslip.unpaid_leave_hours },
  ];
  const companyDetails = [
    branding.company_address,
    branding.company_phone,
    branding.company_email,
  ].filter((value): value is string => Boolean(value?.trim()));

  return (
    <article className="payslip-document" data-testid="payslip-document" aria-label="Employee payslip">
      <style>{`
        .payslip-document {
          --slip-ink: #18211f;
          --slip-muted: #66716e;
          --slip-rule: #dce1dc;
          --slip-paper: #fbfaf7;
          --slip-tint: #f1f2ed;
          width: min(100%, 920px);
          margin: 0 auto;
          overflow: hidden;
          color: var(--slip-ink);
          background: var(--slip-paper);
          border: 1px solid #d9ddd7;
          border-radius: 12px;
          box-shadow: 0 14px 42px rgba(31, 42, 38, .09);
          font-family: "DM Sans", "Aptos", sans-serif;
          font-size: 14px;
          line-height: 1.45;
          font-variant-numeric: tabular-nums;
        }
        .payslip-document *, .payslip-document *::before, .payslip-document *::after { box-sizing: border-box; }
        .payslip-document__letterhead {
          display: grid;
          grid-template-columns: minmax(90px, 138px) minmax(0, 1fr) minmax(90px, 138px);
          gap: 18px;
          align-items: center;
          min-height: 146px;
          padding: 27px 38px;
          color: #f8f8f4;
          background: #111513;
        }
        .payslip-document__logo {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          min-width: 0;
          max-height: 84px;
          overflow: hidden;
        }
        .payslip-document__logo img, .payslip-document__logo svg { display: block; max-width: 100%; max-height: 80px; object-fit: contain; }
        .payslip-document__company { min-width: 0; text-align: center; }
        .payslip-document__company-name {
          margin: 0;
          color: #fff;
          font-family: "DM Sans", "Aptos", sans-serif;
          font-size: clamp(18px, 2.5vw, 25px);
          font-weight: 750;
          letter-spacing: .055em;
          line-height: 1.15;
          text-transform: uppercase;
        }
        .payslip-document__company-details {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 14px;
          margin: 10px 0 0;
          color: #bec5c0;
          font-size: 11px;
          font-style: italic;
          overflow-wrap: anywhere;
          justify-content: center;
        }
        .payslip-document__company-details span + span::before { content: "·"; padding-right: 14px; color: #78817b; }
        .payslip-document__body { padding: 31px 38px 0; }
        .payslip-document__titleband {
          padding: 25px 0 18px;
          text-align: center;
        }
        .payslip-document__titleband .payslip-document__eyebrow { margin-bottom: 5px; }
        .payslip-document__title {
          margin: 0;
          font-family: "DM Sans", "Aptos", sans-serif;
          font-size: clamp(23px, 4vw, 31px);
          font-weight: 750;
          letter-spacing: .025em;
          line-height: 1.1;
          text-transform: uppercase;
        }
        .payslip-document__mast {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          padding-bottom: 23px;
          border-bottom: 1px solid var(--slip-rule);
        }
        .payslip-document__eyebrow {
          margin: 0 0 6px;
          color: #68746f;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .payslip-document__employee { margin: 3px 0 0; color: #4c5854; font-size: 14px; font-weight: 600; }
        .payslip-document__draft {
          flex: 0 0 auto;
          padding: 7px 11px;
          color: #771f1d;
          background: #f8e4df;
          border: 1px solid #e6b6ad;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .13em;
        }
        .payslip-document__period {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          min-width: min(100%, 360px);
          padding: 14px 0 0;
        }
        .payslip-document__date-cell { padding: 0 12px 0 0; }
        .payslip-document__date-cell + .payslip-document__date-cell { padding-left: 17px; border-left: 1px solid var(--slip-rule); }
        .payslip-document__label {
          display: block;
          margin-bottom: 4px;
          color: var(--slip-muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .payslip-document__date-value { display: block; font-size: 13px; font-weight: 650; }
        .payslip-document__group { margin: 15px 0 0; color: #65706c; font-size: 11px; }
        .payslip-document__section { padding: 23px 0 21px; border-bottom: 1px solid var(--slip-rule); }
        .payslip-document__section-heading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin: 0 0 13px;
          color: #25312d;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        .payslip-document__section-note { color: #78827e; font-size: 10px; font-weight: 500; letter-spacing: 0; text-transform: none; }
        .payslip-document__table { width: 100%; border-collapse: collapse; text-align: left; }
        .payslip-document__table th {
          padding: 0 10px 8px;
          color: #77817d;
          border-bottom: 1px solid var(--slip-rule);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .09em;
          text-align: right;
          text-transform: uppercase;
        }
        .payslip-document__table th:first-child, .payslip-document__table td:first-child { padding-left: 0; text-align: left; }
        .payslip-document__table th:last-child, .payslip-document__table td:last-child { padding-right: 0; }
        .payslip-document__table td {
          padding: 9px 10px;
          border-bottom: 1px solid #e8ebe6;
          color: #43504b;
          font-size: 12px;
          text-align: right;
        }
        .payslip-document__table tbody tr:last-child td { border-bottom: 0; }
        .payslip-document__table .payslip-document__description { color: #25312d; font-weight: 600; }
        .payslip-document__type-row td {
          padding-top: 12px;
          padding-bottom: 6px;
          color: #34413c;
          border-bottom: 0;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .payslip-document__type-row:first-child td { padding-top: 2px; }
        .payslip-document__subtotal td { background: #f2f3ef; font-weight: 700; }
        .payslip-document__subtotal td:first-child { color: #53605b; }
        .payslip-document__hours {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 9px;
        }
        .payslip-document__hour {
          min-width: 0;
          padding: 12px 13px;
          background: var(--slip-tint);
          border-left: 2px solid #aab7ae;
        }
        .payslip-document__hour-label { display: block; color: var(--slip-muted); font-size: 10px; font-weight: 650; }
        .payslip-document__hour-value { display: block; margin-top: 4px; color: #202c27; font-size: 18px; font-weight: 700; letter-spacing: -.03em; }
        .payslip-document__hour-unit { margin-left: 4px; color: #69736f; font-size: 10px; font-weight: 500; letter-spacing: 0; }
        .payslip-document__totals { padding: 19px 0 24px; }
        .payslip-document__total-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 6px 0;
          color: #52605a;
          font-size: 12px;
        }
        .payslip-document__total-row strong { color: #26332e; font-weight: 700; }
        .payslip-document__net {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-top: 10px;
          padding: 17px 18px;
          color: #f7f8f2;
          background: #263832;
        }
        .payslip-document__net-label { font-size: 11px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
        .payslip-document__net-amount { font-size: clamp(22px, 4vw, 30px); font-weight: 750; letter-spacing: -.04em; white-space: nowrap; }
        .payslip-document__footer {
          padding: 17px 38px 19px;
          color: #78817d;
          background: #f1f2ed;
          border-top: 1px solid #dce1dc;
          font-size: 10px;
          line-height: 1.5;
          text-align: center;
        }
        .payslip-document__footer p { margin: 0; }
        .payslip-document__footer p + p { margin-top: 5px; }
        @media (max-width: 600px) {
          .payslip-document { border-radius: 8px; }
          .payslip-document__letterhead { grid-template-columns: 54px minmax(0, 1fr) 54px; gap: 10px; min-height: 110px; padding: 18px 14px; }
          .payslip-document__logo { max-height: 65px; }
          .payslip-document__logo img, .payslip-document__logo svg { max-height: 62px; }
          .payslip-document__company-name { font-size: 14px; }
          .payslip-document__company-details { gap: 3px 8px; margin-top: 6px; font-size: 10px; }
          .payslip-document__company-details span + span::before { padding-right: 8px; }
          .payslip-document__body { padding: 23px 20px 0; }
          .payslip-document__mast { display: block; padding-bottom: 17px; }
          .payslip-document__titleband { padding: 20px 0 15px; }
          .payslip-document__title { font-size: 22px; }
          .payslip-document__draft { display: inline-block; margin-top: 12px; }
          .payslip-document__period { min-width: 0; }
          .payslip-document__date-cell { padding-right: 8px; }
          .payslip-document__date-cell + .payslip-document__date-cell { padding-left: 12px; }
          .payslip-document__hours { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
          .payslip-document__hour { padding: 10px 11px; }
          .payslip-document__table th { font-size: 9px; letter-spacing: .04em; }
          .payslip-document__table td { padding: 8px 5px; font-size: 11px; }
          .payslip-document__table th { padding-right: 5px; padding-left: 5px; }
          .payslip-document__table td:nth-child(2), .payslip-document__table th:nth-child(2) { display: none; }
          .payslip-document__footer { padding: 15px 20px; }
        }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .payslip-document {
            width: 100%;
            max-width: none;
            margin: 0;
            overflow: visible;
            border: 0;
            border-radius: 0;
            box-shadow: none;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .payslip-document__letterhead { min-height: 33mm; padding: 7mm 8mm; }
          .payslip-document__body { padding: 7mm 8mm 0; }
          .payslip-document__footer { padding: 5mm 8mm; }
          .payslip-document__section, .payslip-document__totals, .payslip-document__letterhead { break-inside: avoid; }
          .payslip-document__table { break-inside: auto; }
          .payslip-document__table tr { break-inside: avoid; }
        }
      `}</style>

      <header className="payslip-document__letterhead">
        <div className="payslip-document__logo" data-testid="payslip-business-logo">
          {branding.businessLogo}
        </div>
        <div className="payslip-document__company">
          {branding.company_name?.trim() ? (
            <h1 className="payslip-document__company-name">{branding.company_name}</h1>
          ) : null}
          {companyDetails.length > 0 ? (
            <p className="payslip-document__company-details">
              {companyDetails.map((detail, index) => (
                <span key={`${index}-${detail}`}>{detail}</span>
              ))}
            </p>
          ) : null}
        </div>
        <div aria-hidden="true" />
      </header>

      <div className="payslip-document__body">
        <div className="payslip-document__titleband">
          <p className="payslip-document__eyebrow">Payroll statement</p>
          <h2 className="payslip-document__title" id="payslip-heading">Employee payslip</h2>
        </div>
        <section className="payslip-document__mast" aria-labelledby="payslip-heading">
          <div>
            <span className="payslip-document__label">Employee</span>
            <p className="payslip-document__employee" data-testid="payslip-employee">
              {payslip.employee_name_snapshot}
            </p>
            {payslip.run?.group_name_snapshot ? (
              <p className="payslip-document__group">{payslip.run.group_name_snapshot}</p>
            ) : null}
          </div>
          <div>
            <div className="payslip-document__period">
              <div className="payslip-document__date-cell">
                <span className="payslip-document__label">Pay period</span>
                <span className="payslip-document__date-value" data-testid="payslip-period">{period}</span>
              </div>
              <div className="payslip-document__date-cell">
                <span className="payslip-document__label">Payday</span>
                <span className="payslip-document__date-value" data-testid="payslip-payday">
                  {formatDate(payslip.run?.payday)}
                </span>
              </div>
            </div>
            {isDraft ? <div className="payslip-document__draft" role="status" data-testid="payslip-draft">DRAFT</div> : null}
          </div>
        </section>

        <section className="payslip-document__section" aria-labelledby="payslip-earnings-heading">
          <h3 className="payslip-document__section-heading" id="payslip-earnings-heading">
            <span>Earnings</span>
            <span className="payslip-document__section-note">{payslip.currency}</span>
          </h3>
          {earningLines.length > 0 ? (
            <table className="payslip-document__table" data-testid="payslip-earnings">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Units</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(earningGroups.entries()).map(([type, lines]) => (
                  <FragmentGroup
                    key={type}
                    type={type}
                    lines={lines}
                    currency={payslip.currency}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="payslip-document__section-note" data-testid="payslip-no-earnings">No earnings line items for this period.</p>
          )}
        </section>

        <section className="payslip-document__section" aria-labelledby="payslip-hours-heading">
          <h3 className="payslip-document__section-heading" id="payslip-hours-heading">
            <span>Attendance hours</span>
            <span className="payslip-document__section-note">Hours recorded for this pay</span>
          </h3>
          <div className="payslip-document__hours" data-testid="payslip-hours">
            {hours.map((item) => (
              <div className="payslip-document__hour" key={item.label}>
                <span className="payslip-document__hour-label">{item.label}</span>
                <span className="payslip-document__hour-value">
                  {formatHours(item.value)}<span className="payslip-document__hour-unit">hrs</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="payslip-document__section" aria-labelledby="payslip-deductions-heading">
          <h3 className="payslip-document__section-heading" id="payslip-deductions-heading">
            <span>Deductions</span>
            <span className="payslip-document__section-note">{payslip.currency}</span>
          </h3>
          {deductionLines.length > 0 ? (
            <table className="payslip-document__table" data-testid="payslip-deductions">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Units</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {deductionLines.map((line, index) => (
                  <tr key={line.id ?? `${line.description}-${index}`}>
                    <td className="payslip-document__description">{line.description}</td>
                    <td>{formatHours(line.units)}</td>
                    <td>{line.rate === null || line.rate === undefined || line.rate === "" ? "—" : formatMoney(line.rate, payslip.currency)}</td>
                    <td>{amountOrDash(line.amount, payslip.currency)}</td>
                  </tr>
                ))}
                <tr className="payslip-document__subtotal">
                  <td colSpan={3}>Deduction line total</td>
                  <td>{formatMoney(sumLines(deductionLines), payslip.currency)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="payslip-document__section-note" data-testid="payslip-no-deductions">No deduction line items for this period.</p>
          )}
        </section>

        <section className="payslip-document__totals" aria-label="Pay totals">
          <div className="payslip-document__total-row">
            <span>Gross pay</span>
            <strong data-testid="payslip-gross">{formatMoney(payslip.gross_amount, payslip.currency)}</strong>
          </div>
          <div className="payslip-document__total-row">
            <span>Deductions</span>
            <strong data-testid="payslip-deductions-total">{formatMoney(payslip.deductions_amount, payslip.currency)}</strong>
          </div>
          <div className="payslip-document__net">
            <span className="payslip-document__net-label">Net pay</span>
            <strong className="payslip-document__net-amount" data-testid="payslip-net">{formatMoney(payslip.net_amount, payslip.currency)}</strong>
          </div>
        </section>
      </div>

      <footer className="payslip-document__footer">
        <p>CONFIDENTIALITY NOTICE</p>
        <p>This document contains confidential financial information intended solely for the employee named above.</p>
      </footer>
    </article>
  );
}

function FragmentGroup({
  type,
  lines,
  currency,
}: {
  type: string;
  lines: PayslipLine[];
  currency: string;
}) {
  return (
    <>
      <tr className="payslip-document__type-row">
        <td colSpan={4}>{lineCategory(type)}</td>
      </tr>
      {lines.map((line, index) => (
        <tr key={line.id ?? `${type}-${line.description}-${index}`}>
          <td className="payslip-document__description">{line.description}</td>
          <td>{formatHours(line.units)}</td>
          <td>{line.rate === null || line.rate === undefined || line.rate === "" ? "—" : formatMoney(line.rate, currency)}</td>
          <td>{amountOrDash(line.amount, currency)}</td>
        </tr>
      ))}
      <tr className="payslip-document__subtotal">
        <td colSpan={3}>{lineCategory(type)} subtotal</td>
        <td>{formatMoney(sumLines(lines), currency)}</td>
      </tr>
    </>
  );
}
