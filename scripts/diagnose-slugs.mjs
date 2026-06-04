/**
 * Diagnóstico: imprime los nombres de solución y slugs generados para OTIC
 * desde el Sheet de Consolidado y Gantt, y los compara con los slugs canónicos.
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

function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
function slugify(s) {
  return normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Canónico en el código
const SOLUTION_TO_TAB_RAW = [
  ["BCI", "Cuenta Digital", "Det_BCI_CtaDigital"],
  ["BCI", "Modelo Nace Emprendimiento", "Det_BCI_Nace"],
  ["Walmart", "Marketplace", "Det_Walmart_Marketplace"],
  ["Blue Express", "Cupón descuento despacho", "Det_BlueEx_Cupon"],
  ["Defontana", "Contabilidad Gratuita / ERP", "Det_Defontana_ERP"],
  ["Defontana", "Defontana Digital", "Det_Defontana_Digital"],
  ["Microsoft", "Elevate", "Det_MSFT_Elevate"],
  ["Microsoft", "Agente Copilot", "Det_MSFT_Copilot"],
  ["Microsoft", "Ciberseguridad", "Det_MSFT_Ciber"],
  ["OTIC CChC", "Ruta Inclusión financiera", "Det_OTIC_Inclusion"],
  ["OTIC CChC", "Academia Pyme", "Det_OTIC_Academia"],
  ["OTIC CChC", "Programa de Desarrollo de Proveedores", "Det_OTIC_Proveedores"],
  ["FACEA UC", "Pyme UC", "Det_EAUC_PymeUC"],
  ["Multigremial Nacional", "Academia Emprendedores", "Det_MGN_AcadEmpren"],
  ["Multigremial Nacional", "Academia de Emprendedores", "Det_MGN_AcadEmpren"],
  ["Multigremial Nacional", "Ferias y Encuentros Empresariales", "Det_MGN_Ferias"],
];

const canonicalSlugs = new Map(
  SOLUTION_TO_TAB_RAW.map(([p, s]) => [slugify(`${p}-${s}`), `${p} — ${s}`])
);

console.log("=== Slugs canónicos en el código ===");
for (const [slug, label] of canonicalSlugs) console.log(` ${slug}  →  ${label}`);

async function main() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const SHEET_ID = process.env.SHEET_ID;

  // Leer Consolidado
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'4. Consolidado (etapas x sol)'!A1:L80",
  });
  const values = res.data.values ?? [];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 8); i++) {
    const row = values[i] || [];
    if (String(row[0] ?? "").toLowerCase() === "socio" && String(row[1] ?? "").toLowerCase().startsWith("soluc")) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) { console.log("No se encontró header en Consolidado"); return; }

  const CANONICAL_PARTNERS = {
    "otic": "OTIC CChC", "otic cchc": "OTIC CChC",
    "bci": "BCI", "walmart": "Walmart",
    "blue express": "Blue Express", "defontana": "Defontana",
    "microsoft": "Microsoft", "facea uc": "FACEA UC",
    "multigremial nacional": "Multigremial Nacional", "mgn": "Multigremial Nacional",
  };
  function canonize(name) {
    const n = normalize(name);
    return CANONICAL_PARTNERS[n] ?? name;
  }

  console.log("\n=== Soluciones leídas del Consolidado (Sheet) ===");
  let lastSocio = "";
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const socioRaw = String(row[0] ?? "").trim();
    const solucion = String(row[1] ?? "").trim();
    if (socioRaw.toLowerCase().includes("tareas por etapa") || /^\d+\.\s/.test(socioRaw)) break;
    if (socioRaw) lastSocio = socioRaw;
    if (!lastSocio || !solucion) continue;
    const socio = canonize(lastSocio);
    const slug = slugify(`${socio}-${solucion}`);
    const match = canonicalSlugs.has(slug) ? "✓" : "✗ NO MATCH";
    console.log(`  [${match}] ${socio} — ${solucion}`);
    if (!canonicalSlugs.has(slug)) console.log(`         slug generado: "${slug}"`);
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
