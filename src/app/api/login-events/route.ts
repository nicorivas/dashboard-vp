import { NextResponse } from "next/server";
import { getSessionUser, recordLoginEvent } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

/**
 * Registra un ingreso al dashboard. Se llama desde `/login` justo después de
 * un `signInWithPassword` exitoso. En modo BYPASS_AUTH no hay usuario real,
 * así que no se registra nada.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: true, skipped: true });

  await recordLoginEvent(user.id, user.email);
  return NextResponse.json({ ok: true });
}
