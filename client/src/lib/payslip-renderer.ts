import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function generatePdfBase64FromElement(element: HTMLElement | null): Promise<string> {
  if (!element?.isConnected) throw new Error("Payslip is not ready.");

  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    Array.from(element.querySelectorAll("img")).map(async (image) => {
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

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#fbfaf7",
    useCORS: true,
    logging: false,
  });
  if (!canvas.width || !canvas.height) throw new Error("Could not render this payslip.");

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const millimetersPerPixel = contentWidth / canvas.width;
  const pixelsPerPage = (pageHeight - margin * 2) / millimetersPerPixel;
  const pageCount = Math.ceil(canvas.height / pixelsPerPage);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let page = 0; page < pageCount; page++) {
    if (page > 0) pdf.addPage();
    const sourceY = Math.floor(page * pixelsPerPage);
    const sourceHeight = Math.min(Math.ceil(pixelsPerPage), canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sourceHeight;
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the payslip PDF.");
    context.fillStyle = "#fbfaf7";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      margin,
      margin,
      contentWidth,
      sourceHeight * millimetersPerPixel,
    );
  }

  return pdf.output("datauristring");
}
