import { NextResponse } from "next/server";
import {
  canManageUsers,
  createAdminClient,
  genPassword,
  getSessionEmail,
} from "@/lib/admin-users";
import { resolveUser } from "@/lib/partner-mapping";
import type { DashboardUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Gestión de usuarios del dashboard. Todas las operaciones usan el service role
 * key de Supabase y están restringidas a la allowlist `USER_MANAGER_EMAILS`.
 *
 *   GET    → lista usuarios (con la contraseña inicial guardada en app_metadata)
 *   POST   → crea un usuario { email }, genera y guarda su contraseña
 *   PATCH  → regenera la contraseña de un usuario { id }
 */

/** Verifica que el caller esté autorizado. Devuelve el email o una respuesta de error. */
async function guard(): Promise<{ email: string } | { response: NextResponse }> {
  const email = await getSessionEmail();
  if (!canManageUsers(email)) {
    return {
      response: NextResponse.json(
        { error: "No tienes permiso para gestionar usuarios." },
        { status: 403 }
      ),
    };
  }
  return { email: email as string };
}

function labelFor(email: string | undefined | null): string {
  const resolved = resolveUser(email);
  if (!resolved) return "Sin socio asignado";
  return resolved.subLabel ? `${resolved.label} · ${resolved.subLabel}` : resolved.label;
}

export async function GET() {
  const auth = await guard();
  if ("response" in auth) return auth.response;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;

    const users: DashboardUser[] = data.users
      .map((u) => {
        const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
        return {
          id: u.id,
          email: u.email ?? "",
          createdAt: u.created_at ?? "",
          lastSignInAt: u.last_sign_in_at ?? null,
          initialPassword:
            typeof meta.initial_password === "string" ? meta.initial_password : null,
          createdFromDashboard: meta.created_from_dashboard === true,
          resolvedLabel: labelFor(u.email),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await guard();
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const email = String((body as { email?: unknown }).email ?? "")
    .trim()
    .toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const password = genPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        initial_password: password,
        created_from_dashboard: true,
        created_by: auth.email,
        created_at: new Date().toISOString(),
      },
    });
    if (error) throw error;

    return NextResponse.json({
      user: {
        id: data.user?.id ?? "",
        email: data.user?.email ?? email,
        password,
        resolvedLabel: labelFor(data.user?.email),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    // Supabase devuelve un 422 cuando el email ya existe.
    const status = /already|registered|exists/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const auth = await guard();
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const id = String((body as { id?: unknown }).id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Falta el id del usuario." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const password = genPassword();
    const { data, error } = await admin.auth.admin.updateUserById(id, {
      password,
      app_metadata: {
        initial_password: password,
        password_updated_by: auth.email,
        password_updated_at: new Date().toISOString(),
      },
    });
    if (error) throw error;

    return NextResponse.json({ id: data.user?.id ?? id, password });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
