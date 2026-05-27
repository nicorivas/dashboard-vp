import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMasterList } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const masterList = await fetchMasterList(true); // force refresh
    return NextResponse.json({
      count: masterList.length,
      rows: masterList,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
