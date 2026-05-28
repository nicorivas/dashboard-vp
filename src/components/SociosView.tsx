import { KpiCards } from "@/components/KpiCards";
import { SolutionCard } from "@/components/SolutionCard";
import { MiniGantt } from "@/components/MiniGantt";
import { PymeProjectionChart } from "@/components/PymeProjectionChart";
import { SolutionSummaryTable } from "@/components/SolutionSummaryTable";
import type { GanttRow, ResolvedUser, SolutionSummary } from "@/lib/types";

/**
 * Vista de socios reutilizable: tabla resumen + KPIs + chart de proyección +
 * cards agrupadas + Gantt detallado. Se usa tanto en /dashboard/socios (admin)
 * como en /dashboard cuando el usuario es partner (filtrado a sus soluciones).
 */
export function SociosView({
  user,
  summaries,
  ganttRows,
  weeks,
}: {
  user: ResolvedUser;
  summaries: SolutionSummary[];
  ganttRows: GanttRow[];
  weeks: string[];
}) {
  const isAdmin = user.role === "admin";
  const isPartner = user.role === "partner";

  const bySocio = new Map<string, SolutionSummary[]>();
  for (const s of summaries) {
    if (!bySocio.has(s.socio)) bySocio.set(s.socio, []);
    bySocio.get(s.socio)!.push(s);
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

      {summaries.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            {isPartner ? "Tus soluciones" : "Soluciones por socio"}
          </h2>
          {isPartner ? (
            <div className="grid gap-4 md:grid-cols-2">
              {summaries.map((s) => (
                <SolutionCard key={s.slug} s={s} showSocio={false} />
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
                      <SolutionCard key={s.slug} s={s} showSocio={false} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {ganttRows.length > 0 && (
        <section>
          <details className="group" open>
            <summary className="mb-3 cursor-pointer list-none">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-700 hover:text-gray-900">
                <span className="transition-transform group-open:rotate-90">▶</span>
                Gantt detallado por etapa
                <span className="text-xs font-normal normal-case text-gray-400">
                  ({ganttRows.length} filas, {weeks.length} semanas)
                </span>
              </h2>
            </summary>
            <MiniGantt weeks={weeks} rows={ganttRows} showSocio={isAdmin} />
          </details>
        </section>
      )}
    </>
  );
}
