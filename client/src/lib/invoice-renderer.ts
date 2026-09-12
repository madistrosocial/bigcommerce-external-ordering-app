import JsBarcode from "jsbarcode";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { InvoiceRenderSettings, Order } from "@/lib/api";

type InvoiceTimeFormatter = {
  dateLong: (value: string | Date) => string;
  timestamp: (value: string | Date) => string;
};

export interface InvoiceDocumentOptions {
  referenceNumber: string;
  documentTitle?: string;
  referenceLabel?: string;
  servedByFallback?: string;
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? "0"));
  return `$${isNaN(n) ? "0.00" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateBarcodeSvg(text: string): string {
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    (JsBarcode as any)(svg, text, {
      format: "CODE128",
      displayValue: false,
      height: 55,
      width: 2,
      margin: 0,
    });
    return svg.outerHTML;
  } catch {
    return `<svg width="200" height="55"><text x="10" y="30" font-size="12" fill="#aaa">Barcode N/A</text></svg>`;
  }
}

function buildItemsRows(products: any[]): string {
  if (!products || products.length === 0) {
    return `<tr><td colspan="4" style="text-align:center;color:#aaa;padding:20px">No items</td></tr>`;
  }
  return products
    .map((p) => {
      const qty = Number(p.quantity) || 1;
      const name = escHtml(p.name || "");
      const sku = escHtml(p.sku || "");
      const upc = p.upc || "";
      const salePrice = parseFloat(p.price_ex_tax ?? p.base_price ?? "0");
      const origPrice = p.catalogue_price != null
        ? parseFloat(p.catalogue_price)
        : parseFloat(p.base_price ?? "0");
      const lineTotal = salePrice * qty;
      const hasDiscount = origPrice > salePrice + 0.005;
      const origLineTotal = origPrice * qty;
      const barcodeText = upc ? ` , Barcode: ${escHtml(upc)}` : "";
      const lineTotalHtml = hasDiscount
        ? `<span class="price-original">${fmt(origLineTotal)}</span><span class="price-sale">${fmt(lineTotal)}</span>`
        : fmt(lineTotal);
      const optionValues = Array.isArray(p.product_options)
        ? (p.product_options as any[]).map((o) => o.display_value).filter(Boolean)
        : [];
      const displayName = optionValues.length > 0
        ? `${name} | ${optionValues.map(escHtml).join(", ")}`
        : name;

      return `<tr>
  <td>
    <div class="item-name"><strong>${displayName}</strong></div>
    <div class="item-meta">SKU: ${sku}${barcodeText}</div>
  </td>
  <td>${qty}</td>
  <td>${fmt(salePrice)}</td>
  <td>${lineTotalHtml}</td>
</tr>`;
    })
    .join("\n");
}

function substituteVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

function prepareTemplate(template: string, options: InvoiceDocumentOptions): string {
  const isDraft = options.documentTitle === "DRAFT INVOICE";
  if (!isDraft) return template;

  return template
    .replace(/TAX INVOICE\/RECEIPT/gi, "{{document_title}}")
    .replace(/Invoice#\s*\{\{invoice_number\}\}/gi, "{{document_reference_label}}{{invoice_number}}")
    .replace(
      /<title>Invoice\s+\{\{invoice_number\}\}<\/title>/i,
      "<title>{{document_title}} {{document_reference_label}}{{invoice_number}}</title>",
    )
    .replace(/\{\{discount\}\}/g, '<span data-draft-unknown-financial="discount">{{discount}}</span>')
    .replace(/\{\{tax\}\}/g, '<span data-draft-unknown-financial="tax">{{tax}}</span>');
}

function finalizeDraftHtml(html: string, options: InvoiceDocumentOptions): string {
  // Drafts retain only a single stored total, not a tax/discount/store-credit
  // breakdown. Remove rows that would otherwise present invented $0.00 values.
  // This runs after item-row substitution, so parsing cannot relocate the
  // {{items_rows}} placeholder out of its table.
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("[data-draft-unknown-financial]").forEach((element) => {
    const row = element.closest("tr");
    if (row) row.remove();
    else element.remove();
  });
  let result = `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;

  // This marker is independent of the editable template, so even a legacy or
  // heavily customized template is unmistakably a draft.
  const marker = `<div data-draft-invoice-marker style="display:block!important;visibility:visible!important;position:relative!important;z-index:2147483647!important;margin:0 0 14px!important;padding:10px 14px!important;border:3px solid #b91c1c!important;color:#991b1b!important;background:#fef2f2!important;text-align:center!important;font:700 22px/1.25 Arial,sans-serif!important;letter-spacing:1px!important">DRAFT INVOICE<div style="font:700 14px/1.4 Arial,sans-serif!important;letter-spacing:0!important">${escHtml(options.referenceLabel || "Draft #")}${escHtml(options.referenceNumber)}</div></div>`;
  if (/<body\b[^>]*>/i.test(result)) {
    result = result.replace(/(<body\b[^>]*>)/i, `$1${marker}`);
  } else {
    result = `${marker}${result}`;
  }
  return result;
}

export function buildInvoiceHtml(
  orderData: any,
  settings: InvoiceRenderSettings,
  timeFmt: InvoiceTimeFormatter,
  options: InvoiceDocumentOptions,
): string {
  const order = orderData.order;
  const products = orderData.products || [];
  const referenceNumber = options.referenceNumber;
  const barcodeSvg = generateBarcodeSvg(referenceNumber);
  const billing = order.billing_address || {};
  const customerName = `${billing.first_name || ""} ${billing.last_name || ""}`.trim();
  const customerCompany = billing.company || "";
  const customerStreet = [billing.street_1, billing.street_2].filter(Boolean).join(", ");
  const customerCityState = [billing.city, billing.state, billing.zip].filter(Boolean).join(", ");
  const companyAddr = (settings.company_address || "").split("\n").map(escHtml).join("<br>");
  const logoHtml = settings.logo_base64
    ? `<img src="${settings.logo_base64}" alt="Logo" style="max-height:75px;max-width:180px;object-fit:contain" />`
    : "";
  const itemsRows = buildItemsRows(products);
  const totalItems = products.reduce(
    (sum: number, p: any) => sum + (Number(p.quantity) || 0),
    0,
  );
  const storeCreditAmt = parseFloat(order.store_credit_amount ?? "0");
  const storeCreditRow = storeCreditAmt > 0
    ? `<tr class="store-credit-row"><td>Store Credit</td><td>-${fmt(storeCreditAmt)}</td></tr>`
    : "";
  const notesText = (order.customer_message || "").trim();
  const notesHtml = notesText
    ? `<div class="notes-section">Notes: ${escHtml(notesText)}</div>`
    : "";
  const rawStaffNotes: string = order.staff_notes || "";
  const checkoutLine = rawStaffNotes.split("\n").find((line: string) => line.startsWith("Checkout by: "));
  const servedBy = checkoutLine
    ? checkoutLine.replace(/^Checkout by:\s*/, "").trim()
    : (options.servedByFallback || "Agent");

  const html = substituteVars(prepareTemplate(settings.html_template, options), {
    document_title: escHtml(options.documentTitle || "TAX INVOICE/RECEIPT"),
    document_reference_label: escHtml(options.referenceLabel || "Invoice#"),
    company_name: escHtml(settings.company_name || ""),
    logo_html: logoHtml,
    customer_name: escHtml(customerName),
    customer_company: escHtml(customerCompany),
    customer_street: escHtml(customerStreet),
    customer_city_state: escHtml(customerCityState),
    customer_email: escHtml(billing.email || ""),
    customer_phone: escHtml(billing.phone || ""),
    company_address: companyAddr,
    invoice_number: escHtml(referenceNumber),
    order_date: order.date_created ? timeFmt.dateLong(order.date_created) : "",
    items_rows: itemsRows,
    subtotal: fmt(order.subtotal_ex_tax ?? order.subtotal_inc_tax),
    discount: fmt(order.discount_amount),
    tax: fmt(order.total_tax),
    total: fmt(order.total_ex_tax ?? order.total_inc_tax),
    store_credit_row: storeCreditRow,
    unpaid: order.payment_status !== "paid" ? fmt(order.total_inc_tax) : "$0.00",
    outstanding: order.payment_status !== "paid" ? fmt(order.total_inc_tax) : "$0.00",
    total_items: String(totalItems),
    notes_html: notesHtml,
    barcode_svg: barcodeSvg,
    served_by: escHtml(servedBy),
    timestamp: timeFmt.timestamp(new Date()),
    terms: escHtml(settings.terms || ""),
  });
  return options.documentTitle === "DRAFT INVOICE"
    ? finalizeDraftHtml(html, options)
    : html;
}

export function buildDraftInvoiceOrderData(order: Order): any {
  const billing = { ...(order.billing_address || {}) };
  if (!billing.email) billing.email = order.customer_email || "";
  if (!billing.first_name && !billing.last_name && order.customer_name) {
    const parts = order.customer_name.trim().split(/\s+/);
    billing.first_name = parts.shift() || "";
    billing.last_name = parts.join(" ");
  }

  const subtotal = order.items.reduce(
    (sum, item) => sum + (parseFloat(item.price_at_sale) || 0) * item.quantity,
    0,
  );
  const total = parseFloat(order.total) || 0;

  return {
    order: {
      id: order.id,
      billing_address: billing,
      date_created: order.date,
      subtotal_ex_tax: subtotal,
      subtotal_inc_tax: subtotal,
      discount_amount: Math.max(0, subtotal - total),
      total_tax: 0,
      total_ex_tax: total,
      total_inc_tax: total,
      store_credit_amount: 0,
      payment_status: "unpaid",
      customer_message: order.customer_note || "",
      staff_notes: order.order_note || "",
    },
    products: order.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      price_ex_tax: item.price_at_sale,
      base_price: item.price_at_sale,
      product_options: (item.variant_option_values || []).map((value: any) => ({
        display_value: value?.label || value?.value || String(value),
      })),
    })),
  };
}

export async function generatePdfBase64(iframe: HTMLIFrameElement | null): Promise<string> {
  if (!iframe?.contentDocument?.body) throw new Error("Invoice not ready");
  const doc = iframe.contentDocument;
  if (doc.fonts?.ready) await doc.fonts.ready;
  await Promise.all(
    Array.from(doc.images).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }
      if (typeof image.decode === "function") {
        await image.decode().catch(() => undefined);
      }
    }),
  );
  const canvas = await html2canvas(iframe.contentDocument.body, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });
  const A4_W = 210;
  const A4_H = 297;
  const MARGIN = 10;
  const contentW = A4_W - MARGIN * 2;
  const mmPerPx = contentW / canvas.width;
  const pxPerPage = (A4_H - MARGIN * 2) / mmPerPx;
  const pages = Math.ceil(canvas.height / pxPerPage);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let i = 0; i < pages; i++) {
    if (i > 0) pdf.addPage();
    const sy = Math.floor(i * pxPerPage);
    const sh = Math.min(Math.ceil(pxPerPage), canvas.height - sy);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sh;
    const ctx = pageCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      MARGIN,
      MARGIN,
      contentW,
      sh * mmPerPx,
    );
  }
  return pdf.output("datauristring");
}