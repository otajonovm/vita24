const ExcelJS = require("exceljs");

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  const list = rows || [];
  const headers = list[0] ? Object.keys(list[0]) : ["Hisobot"];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of list) {
    lines.push(headers.map((key) => csvCell(row[key])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

async function toXlsx(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Hisobot");
  const list = rows || [];
  const headers = list[0] ? Object.keys(list[0]) : ["Hisobot"];
  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(36, Math.max(14, header.length + 4)) }));
  if (list.length) sheet.addRows(list);
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { toCsv, toXlsx };
