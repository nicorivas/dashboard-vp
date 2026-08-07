import { KpiCards } from "@/components/KpiCards";
import { SolutionCard } from "@/components/SolutionCard";
import { PymeProjectionChart } from "@/components/PymeProjectionChart";
import { SolutionSummaryTable } from "@/components/SolutionSummaryTable";
import { EvaluacionSemanalTable } from "@/components/EvaluacionSemanalTable";
import { MetricasAcumuladoCharts } from "@/components/MetricasAcumuladoCharts";
import type { EvalSemana, ResolvedUser, SolutionSummary } from "@/lib/types";
import type { HitoData, MetricasData } from "@/lib/sheets";

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

function norm(v: string) {
  return v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * Vista de socios reutilizable: tabla resumen + KPIs + chart de proyección +
 * cards agrupadas + Gantt detallado. Se usa tanto en /dashboard/socios (admin)
 * como en /dashboard cuando el usuario es partner (filtrado a sus soluciones).
 */
export function SociosView({
  user,
  summaries,
  evalRows = [],
  metricas = null,
  grandAcum = 0,
  fechaUltimaAdquisicion = "—",
  hito = null,
}: {
  user: ResolvedUser;
  summaries: SolutionSummary[];
  evalRows?: EvalSemana[];
  metricas?: MetricasData | null;
  grandAcum?: number;
  fechaUltimaAdquisicion?: string;
  hito?: HitoData | null;
}) {
  const isAdmin = user.role === "admin";
  const isPartner = user.role === "partner";

  // Mapa normalizado: nombre socio → filas de evaluación de ese socio
  const evalBySocio = new Map<string, EvalSemana[]>();
  for (const r of evalRows) {
    const key = norm(r.socio);
    if (!evalBySocio.has(key)) evalBySocio.set(key, []);
    evalBySocio.get(key)!.push(r);
  }

  const bySocio = new Map<string, SolutionSummary[]>();
  for (const s of summaries) {
    if (!bySocio.has(s.socio)) bySocio.set(s.socio, []);
    bySocio.get(s.socio)!.push(s);
    for (const actor of s.actoresAdicionales ?? []) {
      if (!bySocio.has(actor)) bySocio.set(actor, []);
      if (!bySocio.get(actor)!.some((x) => x.slug === s.slug))
        bySocio.get(actor)!.push(s);
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600">{user.label}</p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {isAdmin ? "Socios de Valor Pyme" : user.partner}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin
            ? "Cartera completa de soluciones de los socios de Valor Pyme 2026."
            : "Estas son las soluciones de Valor Pyme en las que participas."}
        </p>
      </div>

      {isPartner && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Métricas Valor Pyme
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Tráfico semanal</p>
              <p className="mt-0.5 text-[11px] text-gray-400">Pymes que entran a Valorpyme.cl</p>
              <p className="mt-3 text-3xl font-bold tabular-nums text-gray-900">
                {metricas?.trafico != null ? formatNumber(metricas.trafico) : "—"}
              </p>
              {metricas?.trafico2025 != null && (
                <p className="mt-1.5 text-sm tabular-nums text-gray-400">
                  {formatNumber(metricas.trafico2025)}{" "}
                  <span className="text-[10px]">misma semana 2025</span>
                  {metricas.trafico != null && metricas.trafico2025 > 0 && (() => {
                    const pct = Math.round(((metricas.trafico! - metricas.trafico2025!) / metricas.trafico2025!) * 100);
                    return (
                      <span className={`ml-1.5 text-[11px] font-semibold ${pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {pct >= 0 ? "+" : ""}{pct}%
                      </span>
                    );
                  })()}
                </p>
              )}
              {metricas?.traficoAcum2026 != null && (
                <p className="mt-1 text-sm tabular-nums text-gray-600">
                  <span className="font-medium">{formatNumber(metricas.traficoAcum2026)}</span>{" "}
                  <span className="text-[10px] text-gray-400">acum. 2026</span>
                </p>
              )}
              <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
                Actualizado hasta el día {metricas?.fechaDomingo ?? "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Alcance semanal</p>
              <p className="mt-0.5 text-[11px] text-gray-400">Pymes que se registran en Valorpyme.cl</p>
              <p className="mt-3 text-3xl font-bold tabular-nums text-gray-900">
                {metricas?.alcance != null ? formatNumber(metricas.alcance) : "—"}
              </p>
              {metricas?.alcance2025 != null && (
                <p className="mt-1.5 text-sm tabular-nums text-gray-400">
                  {formatNumber(metricas.alcance2025)}{" "}
                  <span className="text-[10px]">misma semana 2025</span>
                  {metricas.alcance != null && metricas.alcance2025 > 0 && (() => {
                    const pct = Math.round(((metricas.alcance! - metricas.alcance2025!) / metricas.alcance2025!) * 100);
                    return (
                      <span className={`ml-1.5 text-[11px] font-semibold ${pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {pct >= 0 ? "+" : ""}{pct}%
                      </span>
                    );
                  })()}
                </p>
              )}
              {metricas?.alcanceAcum2026 != null && (
                <p className="mt-1 text-sm tabular-nums text-gray-600">
                  <span className="font-medium">{formatNumber(metricas.alcanceAcum2026)}</span>{" "}
                  <span className="text-[10px] text-gray-400">acum. 2026</span>
                </p>
              )}
              <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
                Actualizado hasta el día {metricas?.fechaDomingo ?? "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Adquisición</p>
              <p className="mt-0.5 text-[11px] text-gray-400">Total PYMEs adquiridas en soluciones (socios + partners)</p>
              <p className="mt-3 text-3xl font-bold tabular-nums text-gray-900">
                {grandAcum > 0 ? formatNumber(grandAcum) : "—"}
              </p>
              <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
                Actualizado hasta el día {fechaUltimaAdquisicion}
              </p>
            </div>

            {/* Hito — tarjeta condicional desde pestaña Hito del sheet */}
            {hito && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{hito.titulo}</p>
                {hito.trafico != null && (
                  <>
                    <p className="mt-0.5 text-[11px] text-gray-400">Tráfico</p>
                    <p className="mt-3 text-3xl font-bold tabular-nums text-gray-900">
                      {formatNumber(hito.trafico)}
                    </p>
                  </>
                )}
                {hito.registros != null && (
                  <p className="mt-1.5 text-sm tabular-nums text-gray-600">
                    <span className="font-medium">{formatNumber(hito.registros)}</span>{" "}
                    <span className="text-[10px] text-gray-400">registros</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {metricas?.series2026 && metricas.series2026.length > 0 && (
            <MetricasAcumuladoCharts series2026={metricas.series2026} />
          )}
        </section>
      )}

      {summaries.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No encontramos soluciones asociadas en el Sheet.
        </div>
      )}

      {summaries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Resumen
          </h2>
          <SolutionSummaryTable summaries={summaries} showSocio={isAdmin} />
        </section>
      )}

      {isAdmin && summaries.length > 0 && (
        <section className="mb-8">
          <KpiCards summaries={summaries} />
        </section>
      )}

      {isAdmin && summaries.length > 0 && (
        <section className="mb-8">
          <PymeProjectionChart
            solutions={summaries
              .map((s) => {
                if (s.pymeMeta == null) return null;
                return {
                  slug: s.slug,
                  label: `${s.socio} · ${s.solucion}`,
                  socio: s.socio,
                  pymeTarget: s.pymeMeta,
                  monthly: s.pymeMonthly,
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)}
          />
        </section>
      )}

      {isAdmin && evalRows.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Evaluación semanal de socios
          </h2>
          <EvaluacionSemanalTable rows={evalRows} />
        </section>
      )}

      {summaries.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            {isPartner ? "Tus soluciones" : "Soluciones por socio"}
          </h2>
          {isPartner ? (
            <div className="grid gap-4 md:grid-cols-2">
              {summaries.map((s) => (
                <SolutionCard
                  key={s.slug}
                  s={s}
                  showSocio={false}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {Array.from(bySocio.entries()).map(([socio, sols]) => (
                <div key={socio}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                      {socio}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {sols.length} {sols.length === 1 ? "solución" : "soluciones"}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sols.map((s) => (
                      <SolutionCard
                        key={s.slug}
                        s={s}
                        showSocio={false}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

    </>
  );
}
