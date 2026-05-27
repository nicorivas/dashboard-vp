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

    const mainSheetId = process.env.SHEET_ID!;
    const results: Record<string, any> = { mainSheetId };

    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: mainSheetId,
        range: "'Lista correcta de nombres'!A1:Z5",
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      results.mainSheet = { rows: res.data.values?.length ?? 0, first5rows: res.data.values };
    } catch (e: any) {
      results.mainSheet = { error: e.message };
    }

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
