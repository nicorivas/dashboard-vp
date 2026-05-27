import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
    const rawKey = process.env.GOOGLE_PRIVATE_KEY!;
    const auth = new google.auth.JWT({
      email,
      key: rawKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const partnersSheetId = process.env.PARTNERS_SHEET_ID!;
    const masterSheetId = process.env.MASTER_SHEET_ID || partnersSheetId;

    const results: Record<string, any> = {
      partnersSheetId,
      masterSheetId,
    };

    // Intentar leer de PARTNERS_SHEET_ID
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: partnersSheetId,
        range: "'Lista correcta de nombres'!A1:Z5",
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      results.partnersSheet = { rows: res.data.values?.length ?? 0, first5rows: res.data.values };
    } catch (e: any) {
      results.partnersSheet = { error: e.message };
    }

    // Intentar leer de MASTER_SHEET_ID si es distinto
    if (masterSheetId !== partnersSheetId) {
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: masterSheetId,
          range: "'Lista correcta de nombres'!A1:Z5",
          valueRenderOption: "UNFORMATTED_VALUE",
        });
        results.masterSheet = { rows: res.data.values?.length ?? 0, first5rows: res.data.values };
      } catch (e: any) {
        results.masterSheet = { error: e.message };
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
