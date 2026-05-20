import { randomInt } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";

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
  return USER_MANAGER_EMAILS.has(email.trim().toLowerCase());
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
