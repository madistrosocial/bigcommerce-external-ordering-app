import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildXlsx } from "../server/xlsx-export";

const workbookBuffer = buildXlsx(
  ["Customer", "Email"],
  [["Acme & Sons", "orders@example.com"]],
  "CRM Customers",
);
assert.equal(workbookBuffer.subarray(0, 2).toString("ascii"), "PK");

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(workbookBuffer);
assert.equal(workbook.worksheets.length, 1);
assert.equal(workbook.worksheets[0].name, "CRM Customers");
assert.equal(workbook.worksheets[0].getCell("A1").text, "Customer");
assert.equal(workbook.worksheets[0].getCell("A2").text, "Acme & Sons");
assert.equal(workbook.worksheets[0].getCell("B2").text, "orders@example.com");

console.log("CRM XLSX generation and ExcelJS loading passed.");
