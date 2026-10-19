// Exported CRM workbooks are assembled directly as OOXML ZIP files. This keeps
// these download routes independent of ExcelJS and its UUID dependency.
function crmCrc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let j = 0; j < 8; j++) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    table[i] = value;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function buildXlsx(headers: string[], rows: string[][], sheetLabel = "Customers"): Buffer {
  const escapeXml = (value: string) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const sheetName = escapeXml(sheetLabel.slice(0, 31) || "Data");
  const columnLetter = (index: number) => index < 26
    ? String.fromCharCode(65 + index)
    : String.fromCharCode(64 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26));
  const allRows = [headers, ...rows];
  const rowsXml = allRows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) =>
      `<c r="${columnLetter(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`
    ).join("")}</row>`
  ).join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
  const files = new Map<string, string>([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheetXml],
  ]);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let count = 0;
  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name, "utf8");
    const dataBuffer = Buffer.from(content, "utf8");
    const crc = crmCrc32(dataBuffer);
    const localHeader = Buffer.allocUnsafe(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0, 6); localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10); localHeader.writeUInt16LE(0, 12); localHeader.writeUInt32LE(crc, 14); localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22); localHeader.writeUInt16LE(nameBuffer.length, 26); localHeader.writeUInt16LE(0, 28); nameBuffer.copy(localHeader, 30);
    localParts.push(localHeader, dataBuffer);
    const centralHeader = Buffer.allocUnsafe(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(20, 4); centralHeader.writeUInt16LE(20, 6); centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10); centralHeader.writeUInt16LE(0, 12); centralHeader.writeUInt16LE(0, 14); centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20); centralHeader.writeUInt32LE(dataBuffer.length, 24); centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); centralHeader.writeUInt16LE(0, 32); centralHeader.writeUInt16LE(0, 34); centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38); centralHeader.writeUInt32LE(offset, 42); nameBuffer.copy(centralHeader, 46);
    centralParts.push(centralHeader);
    offset += 30 + nameBuffer.length + dataBuffer.length;
    count++;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.allocUnsafe(22);
  endRecord.writeUInt32LE(0x06054b50, 0); endRecord.writeUInt16LE(0, 4); endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(count, 8); endRecord.writeUInt16LE(count, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12); endRecord.writeUInt32LE(offset, 16); endRecord.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
