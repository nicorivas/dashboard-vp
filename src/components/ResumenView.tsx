import { totalsByEje, totalPymeAcum, totalPymeMeta } from "@/lib/pyme-targets";
import type { PartnerSummary, ResolvedUser, SolutionSummary } from "@/lib/types";
import { EJES } from "@/lib/types";
import type { MetricasData } from "@/lib/sheets";

const EJE_COLOR: Record<string, string> = {
  Capital: "from-amber-50 to-white border-amber-200 text-amber-800",
  Mercado: "from-sky-50 to-white border-sky-200 text-sky-800",
  Digitalización: "from-rose-50 to-white border-rose-200 text-rose-800",
  "Gestión y Talento": "from-emerald-50 to-white border-emerald-200 text-emerald-800",
  Comunidad: "from-violet-50 to-white border-violet-200 text-violet-800",
};

const EJE_HEADER_ROW: Record<string, string> = {
  Capital: "bg-amber-100/70 border-amber-200",
  Mercado: "bg-sky-100/70 border-sky-200",
  Digitalización: "bg-rose-100/70 border-rose-200",
  "Gestión y Talento": "bg-emerald-100/70 border-emerald-200",
  Comunidad: "bg-violet-100/70 border-violet-200",
};

const EJE_HEADER_TEXT: Record<string, string> = {
  Capital: "text-amber-800",
  Mercado: "text-sky-800",
  Digitalización: "text-rose-800",
  "Gestión y Talento": "text-emerald-800",
  Comunidad: "text-violet-800",
};

function ejeRank(eje: string): number {
  const idx = EJES.indexOf(eje as (typeof EJES)[number]);
  return idx >= 0 ? idx : EJES.length;
}

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

function pctText(acum: number, meta: number): string {
  if (meta <= 0) return "—";
  return `${Math.round((acum / meta) * 100)}%`;
}

type Row = {
  tipo: "Socio" | "Partner";
  entity: string;
  solucion: string;
  eje: string;
  acum: number | null;
  meta: number | null;
};

export function ResumenView({
  user,
  summaries,
  partnerSummaries,
  metricas,
}: {
  user: ResolvedUser;
  summaries: SolutionSummary[];
  partnerSummaries: PartnerSummary[];
  metricas: MetricasData | null;
}) {
  const all = [...summaries, ...partnerSummaries];
  const byEje = totalsByEje(all);
  const grandMeta = totalPymeMeta(all).total;
  const grandAcum = totalPymeAcum(all).total;

  // Una fila por solución (socio o partner). Sin agregar.
  const rows: Row[] = [
    ...summaries.map((s) => ({
      tipo: "Socio" as const,
      entity: s.socio,
      solucion: s.solucion,
      eje: s.eje?.trim() || "Sin eje",
      acum: s.pymeAcum,
      meta: s.pymeMeta,
    })),
    ...partnerSummaries.map((p) => ({
      tipo: "Partner" as const,
      entity: p.partner,
      solucion: p.solucion,
      eje: p.eje?.trim() || "Sin eje",
      acum: p.pymeAcum,
      meta: p.pymeMeta,
    })),
  ].sort((a, b) => {
    const ra = ejeRank(a.eje);
    const rb = ejeRank(b.eje);
    if (ra !== rb) return ra - rb;
    if (a.tipo !== b.tipo) return a.tipo === "Socio" ? -1 : 1;
    return (b.meta ?? 0) - (a.meta ?? 0);
  });

  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600">{user.label}</p>
        <h1 className="text-2xl font-semibold text-gray-900">Resumen de Valor Pyme</h1>
        <p className="mt-1 text-sm text-gray-500">
          PYMEs adquiridas y meta 2026 — vista consolidada por ruta, socio y partner.
        </p>
      </div>

      {/* KPIs por eje */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
          PYMEs por ruta · acumulado / meta 2026
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {EJES.filter((eje) => (byEje.get(eje)?.count ?? 0) > 0).map((eje) => {
            const t = byEje.get(eje) ?? { meta: 0, acum: 0, count: 0 };
            const pct = t.meta > 0 ? Math.round((t.acum / t.meta) * 100) : 0;
            return (
              <div
                key={eje}
                className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${
                  EJE_COLOR[eje] ?? "from-gray-50 to-white border-gray-200 text-gray-800"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{eje}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatNumber(t.acum)}
                  <span className="text-base font-normal text-gray-400"> / {formatNumber(t.meta)}</span>
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/50">
                  <div className="h-full bg-current opacity-70" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className="mt-1.5 text-xs opacity-80">
                  {t.count} {t.count === 1 ? "solución" : "soluciones"} · {pct}% de avance
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* KPI total */}
      <section className="mb-8">
        <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                Total · acum / meta 2026
              </p>
              <p className="mt-2">
                <span className="text-4xl font-semibold tabular-nums text-brand-800">
                  {formatNumber(grandAcum)}
                </span>
                <span className="text-2xl text-gray-400"> / {formatNumber(grandMeta)}</span>
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {pctText(grandAcum, grandMeta)} de avance hacia la meta consolidada (socios +
                partners).
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>{new Set(summaries.map((s) => s.socio)).size} socios · {summaries.length} soluciones</p>
              <p>{new Set(partnerSummaries.map((p) => p.partner)).size} partners · {partnerSummaries.length} soluciones</p>
            </div>
          </div>
        </div>
      </section>

      {metricas && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Métricas Valor Pyme
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              {
                key: "trafico",
                title: "Tráfico",
                desc: "Pymes que entran a valorpyme.cl",
                value: metricas.trafico,
              },
              {
                key: "alcance",
                title: "Alcance",
                desc: "Pymes que se registran en Valorpyme.cl",
                value: metricas.alcance,
              },
              {
                key: "adquisicion",
                title: "Adquisición",
                desc: "Acumulada de Pymes que se registran en las soluciones",
                value: metricas.adquisicion,
              },
              {
                key: "adopcion",
                title: "Adopción",
                desc: "Pymes que usan las soluciones activamente",
                value: metricas.adopcion,
              },
            ].map((m) => (
              <div
                key={m.key}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {m.title}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">{m.desc}</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums text-gray-900">
                  {m.value != null ? formatNumber(m.value) : "—"}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-400">
                  Actualizado {metricas.fecha}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabla por solución */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
          PYMEs por solución
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-brand-700 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Tipo</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Socio / Partner</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Solución</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Acumulado</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Meta 2026</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">% Avance</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const out: React.ReactNode[] = [];
                let lastEje = "";
                for (const r of rows) {
                  if (r.eje !== lastEje) {
                    lastEje = r.eje;
                    const ejeTotals = byEje.get(r.eje) ?? { meta: 0, acum: 0, count: 0 };
                    const ejeRowCls = EJE_HEADER_ROW[r.eje] ?? "bg-gray-50/40 border-gray-200";
                    const ejeTextCls = EJE_HEADER_TEXT[r.eje] ?? "text-gray-700";
                    out.push(
                      <tr
                        key={`hdr-${r.eje}`}
                        className={`border-t-2 ${ejeRowCls}`}
                      >
                        <td colSpan={3} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${ejeTextCls}`}>
                          Ruta · {r.eje}
                        </td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold tabular-nums ${ejeTextCls}`}>
                          {ejeTotals.acum > 0 ? formatNumber(ejeTotals.acum) : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold tabular-nums ${ejeTextCls}`}>
                          {ejeTotals.meta > 0 ? formatNumber(ejeTotals.meta) : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold ${ejeTextCls}`}>
                          {ejeTotals.meta > 0
                            ? `${Math.round((ejeTotals.acum / ejeTotals.meta) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                    );
                  }
                  const meta = r.meta ?? 0;
                  const acum = r.acum ?? 0;
                  const pct = meta > 0 ? Math.round((acum / meta) * 100) : 0;
                  out.push(
                    <tr
                      key={`${r.tipo}-${r.entity}-${r.solucion}`}
                      className="border-t border-gray-100 hover:bg-gray-50/70"
                    >
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            r.tipo === "Socio" ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {r.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{r.entity}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.solucion}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {r.acum != null && r.acum > 0 ? formatNumber(r.acum) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {r.meta != null && r.meta > 0 ? formatNumber(r.meta) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {meta > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full ${
                                  pct >= 80 ? "bg-blue-500" : pct >= 50 ? "bg-emerald-500" : pct >= 20 ? "bg-amber-500" : "bg-red-400"
                                }`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-gray-700">{pct}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                }
                return out;
              })()}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Datos por solución desde las pestañas <span className="font-medium">KPIs_PYMEs</span> y{" "}
          <span className="font-medium">KPIs_PYMEs_Partners</span>. Si una solución no tiene meta
          aún, aparece como —.
        </p>
      </section>
    </>
  );
}
