import { NextResponse } from "next/server";
import {
  canManageUsers,
  canEditPartnerRole,
  createAdminClient,
  genPassword,
  getSessionEmail,
} from "@/lib/admin-users";
import { resolveUser } from "@/lib/partner-mapping";
import { canonicalPartner } from "@/lib/solutions";
import type { DashboardUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Gestión de usuarios del dashboard. Todas las operaciones usan el service role
 * key de Supabase y están restringidas según el nivel de permiso:
 *
 *   GET    → lista usuarios (canEditPartnerRole — todos los FE)
 *   POST   → crea un usuario { email } (canManageUsers — solo Nicolas)
 *   PATCH  → regenera contraseña { id } (canManageUsers)
 *           o actualiza socio/rol { action: "set_partner_override", id, partner } (canEditPartnerRole)
 */

function labelFor(email: string | undefined | null, partnerOverride: string | null): string {
  if (partnerOverride && partnerOverride.length > 0) {
    const canonical = canonicalPartner(partnerOverride) ?? partnerOverride;
    return `Empresa · ${canonical}`;
  }
  const resolved = resolveUser(email);
  if (!resolved) return "Sin socio asignado";
  return resolved.subLabel ? `${resolved.label} · ${resolved.subLabel}` : resolved.label;
}

export async function GET() {
  const callerEmail = await getSessionEmail();
  if (!canEditPartnerRole(callerEmail)) {
    return NextResponse.json(
      { error: "No tienes permiso para ver la lista de usuarios." },
      { status: 403 }
    );
  }
  const isFullManager = canManageUsers(callerEmail);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;

    const users: DashboardUser[] = data.users
      .map((u) => {
        const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
        const partnerOverride =
          typeof meta.partner_override === "string" && meta.partner_override.length > 0
            ? meta.partner_override
            : null;
        return {
          id: u.id,
          email: u.email ?? "",
          createdAt: u.created_at ?? "",
          lastSignInAt: u.last_sign_in_at ?? null,
          // Solo el gestor pleno ve contraseñas
          initialPassword:
            isFullManager && typeof meta.initial_password === "string"
              ? meta.initial_password
              : null,
          createdFromDashboard: meta.created_from_dashboard === true,
          resolvedLabel: labelFor(u.email, partnerOverride),
          partnerOverride,
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
  const callerEmail = await getSessionEmail();
  if (!canManageUsers(callerEmail)) {
    return NextResponse.json(
      { error: "No tienes permiso para gestionar usuarios." },
      { status: 403 }
    );
  }

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
        created_by: callerEmail,
        created_at: new Date().toISOString(),
      },
    });
    if (error) throw error;

    return NextResponse.json({
      user: {
        id: data.user?.id ?? "",
        email: data.user?.email ?? email,
        password,
        resolvedLabel: labelFor(data.user?.email, null),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    const status = /already|registered|exists/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const callerEmail = await getSessionEmail();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = (body as { action?: unknown }).action;

  // --- Acción: actualizar socio/rol ---
  if (action === "set_partner_override") {
    if (!canEditPartnerRole(callerEmail)) {
      return NextResponse.json(
        { error: "No tienes permiso para editar el socio/rol." },
        { status: 403 }
      );
    }
    const id = String((body as { id?: unknown }).id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Falta el id del usuario." }, { status: 400 });
    }
    const partner = String((body as { partner?: unknown }).partner ?? "").trim();
    try {
      const admin = createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(id, {
        app_metadata: { partner_override: partner },
      });
      if (error) throw error;
      const partnerOverride = partner.length > 0 ? partner : null;
      return NextResponse.json({
        id,
        partnerOverride,
        resolvedLabel: labelFor(undefined, partnerOverride),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // --- Acción por defecto: regenerar contraseña ---
  if (!canManageUsers(callerEmail)) {
    return NextResponse.json(
      { error: "No tienes permiso para gestionar usuarios." },
      { status: 403 }
    );
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
        password_updated_by: callerEmail,
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
