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

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

const res = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: process.env.SHEET_ID,
  ranges: ["'4. Consolidado (etapas x sol)'!A1:C40", "'KPIs_PYMEs'!A1:C40"],
  valueRenderOption: "UNFORMATTED_VALUE",
});

console.log("=== Consolidado (Defontana) ===");
const cons = res.data.valueRanges[0].values ?? [];
cons.filter(r => String(r[0]||"").toLowerCase().includes("defontana") || String(r[1]||"").toLowerCase().includes("contabilidad")).forEach(r => console.log(r));

console.log("\n=== KPIs_PYMEs (Defontana) ===");
const kpis = res.data.valueRanges[1].values ?? [];
kpis.filter(r => String(r[0]||"").toLowerCase().includes("defontana") || String(r[1]||"").toLowerCase().includes("contabilidad")).forEach(r => console.log(r));
