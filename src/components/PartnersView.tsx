import type { PartnerSummary, ResolvedUser } from "@/lib/types";
import { EJES } from "@/lib/types";
import { PartnerCard } from "./PartnerCard";
import { PymeProjectionChart } from "./PymeProjectionChart";

const EJE_BG: Record<string, string> = {
  Capital: "bg-amber-50/40",
  Mercado: "bg-emerald-50/40",
  Digitalización: "bg-sky-50/40",
  "Gestión y Talento": "bg-violet-50/40",
  Comunidad: "bg-rose-50/40",
};

function ejeRank(eje: string): number {
  const idx = EJES.indexOf(eje as (typeof EJES)[number]);
  return idx >= 0 ? idx : EJES.length;
}

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

export function PartnersView({
  user,
  partnerSummaries,
}: {
  user: ResolvedUser;
  partnerSummaries: PartnerSummary[];
}) {
  // Tabla por solución, ordenada por eje canónico, luego por meta desc.
  const rows = partnerSummaries.slice().sort((a, b) => {
    const ra = ejeRank(a.eje?.trim() || "Sin eje");
    const rb = ejeRank(b.eje?.trim() || "Sin eje");
    if (ra !== rb) return ra - rb;
    return (b.pymeMeta ?? 0) - (a.pymeMeta ?? 0);
  });

  // Totales por eje para los headers de grupo.
  const totalsByEje = new Map<string, { acum: number; meta: number; count: number }>();
  for (const p of partnerSummaries) {
    const eje = p.eje?.trim() || "Sin eje";
    if (!totalsByEje.has(eje)) totalsByEje.set(eje, { acum: 0, meta: 0, count: 0 });
    const t = totalsByEje.get(eje)!;
    t.count++;
    if (p.pymeAcum != null) t.acum += p.pymeAcum;
    if (p.pymeMeta != null) t.meta += p.pymeMeta;
  }

  // Cards agrupadas por eje
  const groups = new Map<string, PartnerSummary[]>();
  for (const p of partnerSummaries) {
    const key = p.eje?.trim() || "Sin eje";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const groupKeys = [
    ...EJES.filter((e) => groups.has(e)),
    ...Array.from(groups.keys()).filter((k) => !EJES.includes(k as (typeof EJES)[number])),
  ];

  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600">{user.label}</p>
        <h1 className="text-2xl font-semibold text-gray-900">Partners del programa</h1>
        <p className="mt-1 text-sm text-gray-500">
          Soluciones aportadas por partners de Valor Pyme — ordenadas por eje. Edita la pestaña{" "}
          <span className="font-medium">KPIs_PYMEs_Partners</span> del Sheet para actualizar metas y
          acumulados mensuales.
        </p>
      </div>

      {/* Tabla por solución, agrupada por eje */}
      {rows.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
            Resumen
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-brand-700 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Partner</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Solución</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Acumulado</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">Meta 2026</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">% Avance</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">Actualización</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const out: React.ReactNode[] = [];
                  let lastEje = "";
                  for (const r of rows) {
                    const eje = r.eje?.trim() || "Sin eje";
                    if (eje !== lastEje) {
                      lastEje = eje;
                      const ejeTotals = totalsByEje.get(eje) ?? { meta: 0, acum: 0, count: 0 };
                      out.push(
                        <tr
                          key={`hdr-${eje}`}
                          className={`border-t-2 border-gray-200 ${EJE_BG[eje] ?? "bg-gray-50/40"}`}
                        >
                          <td colSpan={2} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-700">
                            Eje · {eje}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-700">
                            {ejeTotals.acum > 0 ? formatNumber(ejeTotals.acum) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-gray-700">
                            {ejeTotals.meta > 0 ? formatNumber(ejeTotals.meta) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                            {ejeTotals.meta > 0
                              ? `${Math.round((ejeTotals.acum / ejeTotals.meta) * 100)}%`
                              : "—"}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      );
                    }
                    const meta = r.pymeMeta ?? 0;
                    const acum = r.pymeAcum ?? 0;
                    const pct = meta > 0 ? Math.round((acum / meta) * 100) : 0;
                    out.push(
                      <tr key={r.slug} className="border-t border-gray-100 hover:bg-gray-50/70">
                        <td className="px-3 py-2 text-xs text-gray-700">{r.partner}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.solucion}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                          {r.pymeAcum != null && r.pymeAcum > 0 ? formatNumber(r.pymeAcum) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                          {r.pymeMeta != null && r.pymeMeta > 0 ? formatNumber(r.pymeMeta) : "—"}
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
                        <td className="border-l border-gray-100 px-3 py-2 text-xs text-gray-700 max-w-[260px]">
                          <span className="line-clamp-3">{r.statusHistory?.[0]?.status || "—"}</span>
                        </td>
                        <td className="border-l border-gray-100 px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {r.statusHistory?.[0]?.fecha || "—"}
                        </td>
                      </tr>
                    );
                  }
                  return out;
                })()}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Chart proyección de partners */}
      {partnerSummaries.some((p) => p.pymeMeta != null) && (
        <section className="mb-8">
          <PymeProjectionChart
            solutions={partnerSummaries
              .filter((p) => p.pymeMeta != null)
              .map((p) => ({
                slug: p.slug,
                label: `${p.partner} · ${p.solucion}`,
                socio: p.partner,
                pymeTarget: p.pymeMeta as number,
                monthly: p.pymeMonthly,
              }))}
          />
        </section>
      )}

      {/* Cards agrupadas por eje */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-700">
          Partners por eje
        </h2>
        <div className="space-y-8">
          {groupKeys.map((eje) => (
            <div key={eje}>
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">{eje}</h3>
                <span className="text-xs text-gray-400">
                  {groups.get(eje)!.length} {groups.get(eje)!.length === 1 ? "partner" : "partners"}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groups.get(eje)!.map((p) => (
                  <PartnerCard key={p.slug} p={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
