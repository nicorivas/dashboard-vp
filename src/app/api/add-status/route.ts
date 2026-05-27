import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

type StatusRow = {
  partner: string;
  solucion: string;
  status: string;
  fecha: string;
};

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: StatusRow | StatusRow[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const rows: StatusRow[] = Array.isArray(body) ? body : [body];

  for (const row of rows) {
    if (!row.partner || !row.solucion || !row.status || !row.fecha) {
      return NextResponse.json(
        { error: "Cada fila requiere: partner, solucion, status, fecha" },
        { status: 400 }
      );
    }
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const values = rows.map((r) => [r.partner, r.solucion, r.status, r.fecha]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID!,
    range: "Status!A:D",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  return NextResponse.json({ ok: true, filas_escritas: rows.length });
}
