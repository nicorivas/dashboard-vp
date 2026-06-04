/**
 * Diagnóstico: verifica qué encabezado tiene la columna de eje/ruta en los Sheets.
 */
import { google } from "googleapis";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dir, "../.env.local"), "utf8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[key] = val;
}

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function checkHeaders(sheets, sheetId, tabName, label) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tabName}'!A1:Z5`,
    });
    const values = res.data.values ?? [];
    // Buscar fila con encabezados (que contenga "soluc" en alguna celda)
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      const lower = row.map((c) => String(c ?? "").trim().toLowerCase());
      if (lower.some((c) => c.includes("soluc"))) {
        console.log(`\n[${label}] "${tabName}" — fila ${i + 1}:`);
        row.forEach((cell, idx) => {
          if (cell) console.log(`  Col ${idx + 1} (${String.fromCharCode(65 + idx)}): "${cell}"`);
        });
        return;
      }
    }
    console.log(`\n[${label}] "${tabName}" — no se encontró fila de encabezado con "soluc"`);
    if (values[0]) console.log(`  Fila 1:`, values[0].join(" | "));
  } catch (err) {
    console.log(`\n[${label}] "${tabName}" — ERROR: ${err.message}`);
  }
}

async function main() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const SHEET_ID = process.env.SHEET_ID;
  const PARTNERS_SHEET_ID = process.env.PARTNERS_SHEET_ID || SHEET_ID;

  await checkHeaders(sheets, SHEET_ID, "KPIs_PYMEs", "Socios");
  await checkHeaders(sheets, PARTNERS_SHEET_ID, "KPIs_PYMEs_Partners", "Partners");
  await checkHeaders(sheets, SHEET_ID, "3. Gantt por solución", "Gantt");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
