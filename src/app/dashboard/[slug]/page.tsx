import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAggregate, fetchSolutionDetail } from "@/lib/sheets";
import { resolveUser } from "@/lib/partner-mapping";
import { findSolutionBySlug } from "@/lib/solutions";
import { Shell } from "@/components/Shell";
import { AvanceBar } from "@/components/AvanceBar";
import { EstadoBadge } from "@/components/EtapaDots";
import { MiniGantt } from "@/components/MiniGantt";

const UNIT_LABEL: Record<string, string> = {
  pymes: "PYMEs",
  trabajadores: "trabajadores PYME",
  empresas: "empresas",
};

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

function unitLabel(unit: string | null): string {
  if (!unit) return "PYMEs";
  return UNIT_LABEL[unit.toLowerCase()] ?? unit;
}

export const dynamic = "force-dynamic";

export default async function SolutionDetailPage({ params }: { params: { slug: string } }) {
  const bypass = process.env.BYPASS_AUTH === "1";
  let userEmail: string | null = null;
  if (bypass) {
    userEmail = process.env.BYPASS_USER || "valentina.galiano@feconsulting.cl";
  } else {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    userEmail = user.email ?? null;
  }

  const user = resolveUser(userEmail);
  if (!user) redirect("/dashboard");

  const meta = findSolutionBySlug(params.slug);
  if (!meta) return notFound();

  // Autorización: socios sólo pueden ver sus soluciones.
  if (user.role === "partner" && user.partner !== meta.partner) {
    return (
      <Shell user={user} email={userEmail}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <h2 className="text-lg font-semibold">Sin acceso a esta solución</h2>
          <p className="mt-2 text-sm">
            Esta solución pertenece a otro socio. Contacta a tu ejecutivo FE si crees que es un error.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:text-brand-900">
            ← Volver al dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  let detail: Awaited<ReturnType<typeof fetchSolutionDetail>> | null = null;
  let summary: Awaited<ReturnType<typeof fetchAggregate>>["summaries"][number] | null = null;
  let errorMsg: string | null = null;
  let fetchedAt = 0;

  try {
    const [agg, det] = await Promise.all([fetchAggregate(), fetchSolutionDetail(meta.tab)]);
    detail = det;
    fetchedAt = agg.fetchedAt;
    summary = agg.summaries.find((s) => s.slug === params.slug) ?? null;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error leyendo el Sheet";
  }

  return (
    <Shell user={user} email={userEmail} fetchedAt={fetchedAt}>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← Dashboard
      </Link>

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {meta.partner}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">{meta.solucion}</h1>
            <p className="mt-1 text-xs text-gray-500">
              Responsable FE: {detail?.responsableFE || "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-semibold tabular-nums text-gray-900">
              {summary?.avance ?? detail?.avance ?? 0}%
            </p>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">avance</p>
          </div>
        </div>
        <div className="mt-4">
          <AvanceBar value={summary?.avance ?? detail?.avance ?? 0} size="lg" />
        </div>

        {summary && (summary.pymeMeta != null || summary.pymeAcum != null || summary.pymeNotas) && (
          <div className="mt-5 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                  PYMEs · acum / meta 2026
                </p>
                {summary.pymeMeta != null || summary.pymeAcum != null ? (
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tabular-nums text-brand-800">
                      {summary.pymeAcum != null ? formatNumber(summary.pymeAcum) : "—"}
                    </span>
                    <span className="text-lg text-gray-400">
                      / {summary.pymeMeta != null ? formatNumber(summary.pymeMeta) : "—"}
                    </span>
                    <span className="text-sm text-gray-600">{unitLabel(summary.pymeUnit)}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">Cifras pendientes en KPIs_PYMEs</p>
                )}
                {summary.pymeSegmentos && (
                  <p className="mt-1 text-xs text-gray-600">
                    <span className="font-medium">Segmentos objetivo:</span> {summary.pymeSegmentos}
                  </p>
                )}
              </div>
              {summary.pymeSharedGroup && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300">
                  meta compartida
                </span>
              )}
            </div>
            {summary.pymeNotas && (
              <p className="mt-3 text-sm text-gray-700">{summary.pymeNotas}</p>
            )}
            {summary.pymeFuente && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-400">
                Fuente: {summary.pymeFuente}
              </p>
            )}
          </div>
        )}

        {summary?.proximoHito && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Próximo hito
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{summary.proximoHito}</p>
              <p className="mt-1 text-xs text-brand-700">{summary.fechaHito || "Fecha por definir"}</p>
            </div>
            {/* Comentarios del consolidado: sólo administradores */}
            {summary.comentarios && user.role === "admin" && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Comentarios internos
                </p>
                <p className="mt-1 text-sm text-gray-800">{summary.comentarios}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {summary && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Status
          </h2>
          {summary.statusHistory.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-sm text-gray-400">
              Sin actualizaciones aún.
            </div>
          ) : (
            <>
              {/* Status actual */}
              <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
                {summary.statusHistory[0].fecha && (
                  <p className="mb-1.5 text-xs font-medium text-brand-600">{summary.statusHistory[0].fecha}</p>
                )}
                <p className="text-sm text-gray-800">{summary.statusHistory[0].status}</p>
              </div>
              {/* Historial */}
              {summary.statusHistory.length > 1 && (
                <div className="mt-3 space-y-0 rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <p className="border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Historial
                  </p>
                  <ul className="divide-y divide-gray-100">
                    {summary.statusHistory.slice(1).map((entry, i) => (
                      <li key={i} className="flex items-start gap-4 px-4 py-3">
                        <span className="mt-0.5 shrink-0 text-xs text-gray-400 w-20">{entry.fecha}</span>
                        <p className="text-xs text-gray-600">{entry.status}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {detail && detail.weeks.length > 0 && detail.etapas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Línea de tiempo
          </h2>
          <MiniGantt
            weeks={detail.weeks}
            rows={detail.etapas.map((e) => ({
              eje: summary?.eje ?? "",
              socio: meta.partner,
              solucion: meta.solucion,
              etapa: e.etapa,
              responsable: e.responsable,
              estado: e.estado,
              semanas: e.semanas,
            }))}
            showSocio={false}
          />
        </section>
      )}

      {detail && detail.etapas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Etapas y tareas
          </h2>
          <div className="mb-4 flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-gray-50/60 px-5 py-3 text-xs text-gray-600">
            <span className="font-semibold uppercase tracking-wider text-gray-400 self-center">Referencias</span>
            {[
              { abbr: "AP", label: "Área de Proyectos" },
              { abbr: "MC", label: "Área de Marketing y Comunidad" },
              { abbr: "ES", label: "Área de Estudios" },
              { abbr: "MGN", label: "Multigremial Nacional" },
            ].map(({ abbr, label }) => (
              <span key={abbr} className="flex items-center gap-1.5">
                <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono font-semibold text-gray-700">{abbr}</span>
                <span className="text-gray-500">{label}</span>
              </span>
            ))}
          </div>
          <div className="space-y-5">
            {detail.etapas.map((etapa, idx) => (
              <article
                key={idx}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{etapa.etapa}</h3>
                    <p className="text-xs text-gray-500">Responsable: {etapa.responsable || "—"}</p>
                  </div>
                  <EstadoBadge estado={etapa.estado} />
                </header>

                {etapa.tareas.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-500">No hay tareas detalladas para esta etapa.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white text-[11px] uppercase tracking-wider text-gray-500">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Tarea</th>
                          <th className="px-4 py-2 text-left font-medium">Responsable</th>
                          <th className="px-4 py-2 text-left font-medium">Estado</th>
                          <th className="px-4 py-2 text-left font-medium">Inicio</th>
                          <th className="px-4 py-2 text-left font-medium">Fin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {etapa.tareas.map((t, ti) => (
                          <tr key={ti} className="border-t border-gray-100 align-top">
                            <td className="px-4 py-2 text-gray-900">{t.nombre}</td>
                            <td className="whitespace-nowrap px-4 py-2 text-gray-600">{t.responsable || "—"}</td>
                            <td className="px-4 py-2">
                              <EstadoBadge estado={t.estado} />
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">
                              {t.inicio || "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">
                              {t.fin || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
