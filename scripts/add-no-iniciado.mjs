/**
 * Agrega "No iniciado" al dropdown de Estado en todas las hojas Det_
 * del Sheet 12fO8p5KMzOlzzMxZHQXt3_AFa0Bn0w28pvySSCFAN2c
 *
 * Uso: node scripts/add-no-iniciado.mjs
 */
import { google } from "googleapis";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Leer .env.local manualmente
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
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

const SHEET_ID = "12fO8p5KMzOlzzMxZHQXt3_AFa0Bn0w28pvySSCFAN2c";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  return new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function main() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  // 1. Obtener metadata del spreadsheet (sheetsProperties + validación)
  console.log("Obteniendo metadata del spreadsheet...");
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    includeGridData: false,
    fields: "sheets.properties",
  });

  const allSheets = meta.data.sheets ?? [];
  const detSheets = allSheets.filter((sh) =>
    sh.properties?.title?.startsWith("Det_")
  );
  console.log(`Hojas Det_ encontradas: ${detSheets.map((s) => s.properties.title).join(", ")}`);

  if (detSheets.length === 0) {
    console.log("No se encontraron hojas Det_. Saliendo.");
    return;
  }

  // 2. Para cada hoja Det_, leer valores para ubicar columna Estado
  const requests = [];

  for (const sh of detSheets) {
    const title = sh.properties.title;
    const sheetId = sh.properties.sheetId;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${title}'!A1:H20`,
    });
    const values = res.data.values ?? [];

    // Buscar fila header con "Etapa" en col 0 y "Tarea" en col 1
    let headerIdx = -1;
    let estadoColIdx = -1;
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      if (
        String(row[0] ?? "").trim().toLowerCase() === "etapa" &&
        String(row[1] ?? "").trim().toLowerCase() === "tarea"
      ) {
        headerIdx = i;
        // Buscar col "Estado"
        for (let c = 0; c < row.length; c++) {
          if (String(row[c] ?? "").trim().toLowerCase() === "estado") {
            estadoColIdx = c;
            break;
          }
        }
        break;
      }
    }

    if (headerIdx < 0 || estadoColIdx < 0) {
      console.log(`  [${title}] No se encontró header Etapa/Tarea/Estado — saltando.`);
      continue;
    }
    console.log(`  [${title}] Header en fila ${headerIdx + 1}, Estado en columna ${estadoColIdx + 1} (${String.fromCharCode(65 + estadoColIdx)})`);

    // 3. Leer validación actual en esa columna para no pisarla
    const validRes = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      includeGridData: true,
      ranges: [`'${title}'!${String.fromCharCode(65 + estadoColIdx)}${headerIdx + 2}:${String.fromCharCode(65 + estadoColIdx)}${headerIdx + 2}`],
      fields: "sheets.data.rowData.values.dataValidation",
    });

    const existingValidation =
      validRes.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.dataValidation;

    let conditionValues;
    if (existingValidation?.condition?.values?.length) {
      const existing = existingValidation.condition.values.map((v) => v.userEnteredValue);
      console.log(`    Valores actuales: ${existing.join(", ")}`);
      if (existing.includes("No iniciado")) {
        console.log(`    Ya tiene "No iniciado" — saltando.`);
        continue;
      }
      conditionValues = [...existingValidation.condition.values, { userEnteredValue: "No iniciado" }];
    } else {
      // Sin validación existente: usar las conocidas
      console.log(`    Sin validación existente — creando con valores estándar.`);
      conditionValues = [
        { userEnteredValue: "En curso" },
        { userEnteredValue: "Terminado" },
        { userEnteredValue: "Pendiente" },
        { userEnteredValue: "No aplica" },
        { userEnteredValue: "No iniciado" },
      ];
    }

    requests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: headerIdx + 1, // 0-based, skip header
          endRowIndex: 200,
          startColumnIndex: estadoColIdx,
          endColumnIndex: estadoColIdx + 1,
        },
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: conditionValues,
          },
          showCustomUi: true,
          strict: false,
        },
      },
    });
    console.log(`    Solicitud preparada con valores: ${conditionValues.map((v) => v.userEnteredValue).join(", ")}`);
  }

  if (requests.length === 0) {
    console.log("Ninguna hoja requiere actualización.");
    return;
  }

  // 4. Ejecutar batchUpdate
  console.log(`\nAplicando ${requests.length} actualización(es)...`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });

  console.log("¡Listo! Dropdown de Estado actualizado con 'No iniciado' en todas las hojas Det_.");
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
