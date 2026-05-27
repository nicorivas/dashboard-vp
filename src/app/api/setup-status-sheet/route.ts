import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY!;
    const sheetId = process.env.SHEET_ID!;

    const auth = new google.auth.JWT({
      email,
      key: rawKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // 1. Crear la pestaña "Status"
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: "Status",
              },
            },
          },
        ],
      },
    });

    // 2. Agregar fila de headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "Status!A1:D1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Socio/Partner", "Solución", "Status", "Fecha"]],
      },
    });

    return NextResponse.json({ ok: true, message: "Hoja 'Status' creada con headers." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
