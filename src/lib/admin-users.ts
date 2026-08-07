import { randomInt } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import type { LoginStats } from "@/lib/types";

/**
 * Gestión de usuarios del dashboard — sólo server-side.
 *
 * Esta sección crea cuentas en Supabase Auth con el service role key
 * (`SUPABASE_ROOT`), así que TODO lo de este archivo se ejecuta en el servidor
 * y nunca debe importarse desde un componente cliente.
 */

/**
 * Allowlist explícita de quién puede gestionar usuarios (crear / ver / copiar
 * contraseñas). No alcanza con ser admin: ni el resto del equipo FE ni los
 * directores BCI entran aquí. Para sumar a alguien, agregar su email en
 * minúsculas.
 */
export const USER_MANAGER_EMAILS = new Set<string>(["nicolas.rivas@feconsulting.cl"]);

export function canManageUsers(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1] ?? "";
  return domain === "feconsulting.cl" || USER_MANAGER_EMAILS.has(normalized);
}

/**
 * Pueden editar el socio/rol de cualquier usuario no-FE desde la sección de
 * usuarios. Incluye a todo el equipo @feconsulting.cl (no sólo Nicolas).
 */
export function canEditPartnerRole(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1] ?? "";
  return domain === "feconsulting.cl" || canManageUsers(normalized);
}

/**
 * Email del usuario de la request actual. Respeta `BYPASS_AUTH` igual que el
 * resto del dashboard, para que la sección sea testeable en modo demo.
 */
export async function getSessionEmail(): Promise<string | null> {
  if (process.env.BYPASS_AUTH === "1") {
    return (process.env.BYPASS_USER || "valentina.galiano@feconsulting.cl").toLowerCase();
  }
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email?.toLowerCase() ?? null;
}

/**
 * Igual que `getSessionEmail` pero también devuelve el id del usuario, para
 * poder registrar el evento de login en `login_events`. `null` en modo
 * BYPASS_AUTH — ahí no hay usuario real de Supabase, así que no se registra.
 */
export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  if (process.env.BYPASS_AUTH === "1") return null;
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}

/**
 * Registra un ingreso en `login_events` (tabla propia, ver README/SQL en
 * `supabase/login_events.sql`). Silenciosa ante errores: un fallo acá nunca
 * debe bloquear el login.
 */
export async function recordLoginEvent(userId: string, email: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("login_events").insert({ user_id: userId, email });
  } catch {
    // No bloquear el login por un problema de tracking.
  }
}

const HISTORY_PER_USER = 20;

/**
 * Trae los últimos ingresos registrados (todas las cuentas) y los agrupa por
 * `user_id`. Limitado a las últimas `sampleSize` filas para no traer toda la
 * tabla en cuentas con mucha antigüedad.
 */
export async function getLoginStatsByUser(
  sampleSize = 5000
): Promise<Map<string, LoginStats>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("login_events")
    .select("user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(sampleSize);
  if (error) throw error;

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const stats = new Map<string, LoginStats>();
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    const createdAt = row.created_at as string;
    const ts = new Date(createdAt).getTime();

    const entry = stats.get(userId) ?? { total: 0, last7d: 0, last30d: 0, history: [] };
    entry.total += 1;
    if (ts >= sevenDaysAgo) entry.last7d += 1;
    if (ts >= thirtyDaysAgo) entry.last30d += 1;
    if (entry.history.length < HISTORY_PER_USER) entry.history.push(createdAt);
    stats.set(userId, entry);
  }
  return stats;
}

/**
 * Cliente admin de Supabase (service role). Lanza si falta la config — el
 * caller debe atraparlo y devolver un error legible.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_ROOT;
  if (!url || !secret) {
    throw new Error(
      "Falta SUPABASE_ROOT (service role key) o NEXT_PUBLIC_SUPABASE_URL en el entorno."
    );
  }
  return createSupabaseClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Contraseña inicial legible: 12 caracteres sin glifos ambiguos (0/O, 1/l/I),
 * con al menos una mayúscula, una minúscula, un dígito y un símbolo.
 */
export function genPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%&*";
  const all = upper + lower + digit + sym;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(upper), pick(lower), pick(digit), pick(sym)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
