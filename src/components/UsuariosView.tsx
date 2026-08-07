"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import type { DashboardUser } from "@/lib/types";
import { PARTNERS } from "@/lib/solutions";

const PARTNER_OPTIONS = PARTNERS.map((p) => p.name);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isFEUser(email: string): boolean {
  return email.toLowerCase().endsWith("@feconsulting.cl");
}

export function UsuariosView({ canManageUsers = false }: { canManageUsers?: boolean }) {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null);

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [savingPartnerId, setSavingPartnerId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la lista de usuarios.");
      setUsers(data.users ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setCreating(true);
    setCreateError(null);
    setJustCreated(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el usuario.");
      setJustCreated({ email: data.user.email, password: data.user.password });
      setNewEmail("");
      await loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Error creando el usuario.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRegenerate(user: DashboardUser) {
    if (
      !window.confirm(
        `¿Regenerar la contraseña de ${user.email}? La contraseña anterior dejará de funcionar.`
      )
    ) {
      return;
    }
    setRegeneratingId(user.id);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo regenerar la contraseña.");
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, initialPassword: data.password } : u))
      );
      setRevealed((prev) => new Set(prev).add(user.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Error regenerando la contraseña.");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleSetPartnerOverride(userId: string, partner: string) {
    setSavingPartnerId(userId);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_partner_override", id: userId, partner }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar el socio/rol.");
      // Recarga para obtener el resolvedLabel actualizado del servidor
      await loadUsers();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Error actualizando el socio/rol.");
    } finally {
      setSavingPartnerId(null);
    }
  }

  async function handleCopy(id: string, password: string) {
    const ok = await copyToClipboard(password);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
    } else {
      window.alert("No se pudo copiar al portapapeles.");
    }
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Gestión de usuarios</h2>
        <p className="mt-1 text-sm text-gray-500">
          {canManageUsers
            ? "Crea cuentas de acceso al dashboard, consulta sus contraseñas y asigna el socio/rol de cada usuario."
            : "Visualiza los usuarios del dashboard y corrige el socio/rol asignado cuando sea necesario."}
        </p>
      </div>

      {/* Crear usuario — solo para gestor pleno */}
      {canManageUsers && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <label htmlFor="new-user-email" className="text-sm font-medium text-gray-700">
            Crear nuevo usuario
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="new-user-email"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="persona@empresa.cl"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
            <button
              type="submit"
              disabled={creating || !newEmail.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {creating ? "Creando…" : "Crear usuario"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Se genera una contraseña automáticamente y el email queda confirmado (sin paso de
            verificación). Comparte la contraseña por un canal privado.
          </p>

          {createError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          {justCreated && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-medium">Usuario creado: {justCreated.email}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-emerald-700">Contraseña:</span>
                <code className="rounded bg-white px-2 py-0.5 font-mono text-emerald-900 ring-1 ring-emerald-200">
                  {justCreated.password}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy("__just-created", justCreated.password)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                >
                  {copiedId === "__just-created" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedId === "__just-created" ? "Copiada" : "Copiar"}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Lista de usuarios */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Usuarios{!loading && users.length > 0 ? ` · ${users.length}` : ""}
          </h3>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando usuarios…
          </div>
        ) : loadError ? (
          <div className="flex items-start gap-2 px-5 py-6 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loadError}</span>
          </div>
        ) : users.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            Todavía no hay usuarios.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-2.5">Email</th>
                  <th className="px-5 py-2.5">Socio / rol</th>
                  {canManageUsers && <th className="px-5 py-2.5">Contraseña</th>}
                  <th className="px-5 py-2.5">Creado</th>
                  <th className="px-5 py-2.5">Último ingreso</th>
                  <th className="px-5 py-2.5">Ingresos</th>
                  {canManageUsers && <th className="px-5 py-2.5 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isRevealed = revealed.has(u.id);
                  const hasPassword = u.initialPassword != null;
                  const isSaving = savingPartnerId === u.id;
                  const canEditRole = !isFEUser(u.email);
                  const isHistoryOpen = expandedHistoryId === u.id;
                  const stats = u.loginStats;

                  return (
                    <Fragment key={u.id}>
                    <tr className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-gray-900">{u.email}</td>

                      {/* Socio / rol — con dropdown editable para usuarios no-FE */}
                      <td className="px-5 py-3">
                        {canEditRole ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={u.partnerOverride ?? ""}
                              disabled={isSaving}
                              onChange={(e) => void handleSetPartnerOverride(u.id, e.target.value)}
                              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                            >
                              <option value="">— Auto ({u.resolvedLabel})</option>
                              {PARTNER_OPTIONS.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                          </div>
                        ) : (
                          <span className="text-gray-600">{u.resolvedLabel}</span>
                        )}
                      </td>

                      {/* Contraseña — solo para gestor pleno */}
                      {canManageUsers && (
                        <td className="px-5 py-3">
                          {hasPassword ? (
                            <div className="flex items-center gap-1.5">
                              <code className="rounded bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-800 ring-1 ring-gray-200">
                                {isRevealed ? u.initialPassword : "•".repeat(12)}
                              </code>
                              <button
                                type="button"
                                onClick={() => toggleReveal(u.id)}
                                title={isRevealed ? "Ocultar" : "Mostrar"}
                                className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                              >
                                {isRevealed ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(u.id, u.initialPassword as string)}
                                title="Copiar contraseña"
                                className="inline-flex items-center gap-1 rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                              >
                                {copiedId === u.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              — no guardada (usar "Regenerar")
                            </span>
                          )}
                        </td>
                      )}

                      <td className="px-5 py-3 text-gray-500">{fmtDate(u.createdAt)}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(u.lastSignInAt)}</td>

                      {/* Historial de ingresos — desde login_events, ver supabase/login_events.sql */}
                      <td className="px-5 py-3">
                        {stats ? (
                          <button
                            type="button"
                            onClick={() => setExpandedHistoryId(isHistoryOpen ? null : u.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 transition hover:text-brand-700"
                          >
                            {isHistoryOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            {stats.total} total · {stats.last30d} (30d)
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Sin registros</span>
                        )}
                      </td>

                      {/* Regenerar contraseña — solo para gestor pleno */}
                      {canManageUsers && (
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void handleRegenerate(u)}
                            disabled={regeneratingId === u.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                          >
                            {regeneratingId === u.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Regenerar
                          </button>
                        </td>
                      )}
                    </tr>
                    {isHistoryOpen && stats && (
                      <tr className="border-b border-gray-50 bg-gray-50/60 last:border-0">
                        <td colSpan={canManageUsers ? 7 : 5} className="px-5 py-3">
                          <p className="mb-1.5 text-xs font-medium text-gray-500">
                            Últimos ingresos de {u.email} ({stats.last7d} en los últimos 7 días)
                          </p>
                          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                            {stats.history.map((iso) => (
                              <li key={iso}>{fmtDateTime(iso)}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!canManageUsers && (
        <p className="text-xs text-gray-400">
          Para crear o eliminar usuarios, contacta al administrador principal (Nicolas Rivas).
        </p>
      )}
    </div>
  );
}
