import { NextResponse } from "next/server";
import { fetchMetricas } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Endpoint temporal de diagnóstico. Borrar después de usarlo.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const metricas = await fetchMetricas();
  return NextResponse.json({ metricas });
}
