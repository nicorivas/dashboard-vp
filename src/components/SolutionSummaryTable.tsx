import type { Estado, EtapaName, SolutionSummary } from "@/lib/types";
import { ETAPAS, EJES } from "@/lib/types";
import { ETAPA_LABELS } from "@/lib/solutions";
import Link from "next/link";

const UNIT_SHORT: Record<string, string> = {
  trabajadores: "trab.",
  empresas: "emp.",
};

const CELL_BY_ESTADO: Record<Estado, string> = {
  "En curso": "bg-emerald-100/80 text-emerald-800",
  Terminado: "bg-blue-100/80 text-blue-800",
  Pendiente: "bg-gray-50 text-gray-500",
  "No iniciado": "bg-gray-50 text-gray-400",
  "No aplica": "bg-gray-50 text-gray-300",
  "": "bg-gray-50 text-gray-400",
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

function avanceColor(v: number): string {
  if (v >= 80) return "text-blue-700";
  if (v >= 50) return "text-emerald-700";
  if (v >= 20) return "text-amber-700";
  return "text-red-600";
}

export function SolutionSummaryTable({
  summaries,
  showSocio = true,
}: {
  summaries: SolutionSummary[];
  showSocio?: boolean;
}) {
  if (summaries.length === 0) return null;

  // Ordenar por eje canónico para agrupar
  const sorted = summaries.slice().sort((a, b) => {
    const ra = ejeRank(a.eje?.trim() || "Sin eje");
    const rb = ejeRank(b.eje?.trim() || "Sin eje");
    return ra - rb;
  });

  // Total de columnas para colSpan del encabezado de eje:
  // (Socio?) + Solución + 5 etapas + Avance Gantt + PYMEs + % Avance Meta + Status + Actualización
  const totalCols = (showSocio ? 1 : 0) + 1 + ETAPAS.length + 1 + 1 + 1 + 1 + 1;

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[1380px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-brand-700 text-white">
            {showSocio && (
              <th className="sticky left-0 z-10 bg-brand-700 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider">
                Socio
              </th>
            )}
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider">
              Solución
            </th>
            {ETAPAS.map((e: EtapaName) => (
              <th
                key={e}
                className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider"
              >
                <div className="leading-tight">{e.split(".")[0]}.</div>
                <div className="leading-tight">{ETAPA_LABELS[e]}</div>
              </th>
            ))}
            <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">
              % Avance Gantt
            </th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider">
              PYMEs · acum / meta 2026
            </th>
            <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">
              % Avance Meta
            </th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider">
              Status
            </th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">
              Actualización
            </th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            const rows: React.ReactNode[] = [];
            let lastEje = "";
            for (const s of sorted) {
              const eje = s.eje?.trim() || "Sin eje";
              if (eje !== lastEje) {
                lastEje = eje;
                const rowCls = EJE_HEADER_ROW[eje] ?? "bg-gray-50/40 border-gray-200";
                const textCls = EJE_HEADER_TEXT[eje] ?? "text-gray-700";
                rows.push(
                  <tr key={`eje-${eje}`} className={`border-t-2 ${rowCls}`}>
                    <td
                      colSpan={totalCols}
                      className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider ${textCls}`}
                    >
                      Ruta · {eje}
                    </td>
                  </tr>
                );
              }

              const meta = s.pymeMeta;
              const acum = s.pymeAcum;
              const pct = meta != null && meta > 0 && acum != null ? Math.min(100, (acum / meta) * 100) : 0;

              // Co-actor rows (same data, different entity)
              for (const actor of s.actoresAdicionales ?? []) {
                rows.push(
                  <tr key={`coactor-${actor}-${s.slug}`} className="border-t border-gray-100 bg-gray-50/30 transition hover:bg-gray-50/70">
                    {showSocio && (
                      <td className="sticky left-0 z-[1] border-t border-gray-100 bg-gray-50/60 px-3 py-2 text-xs text-gray-500">
                        <span className="whitespace-nowrap">{actor}</span>
                        <p className="text-[9px] text-gray-400">participa en solución de {s.socio}</p>
                      </td>
                    )}
                    <td className="border-t border-gray-100 px-3 py-2 text-sm font-medium text-gray-500">{s.solucion}</td>
                    {s.etapas.map((e) => (
                      <td key={e.etapa} className={`border-t border-l border-gray-100 px-2 py-2 text-center text-[11px] font-medium ${CELL_BY_ESTADO[e.estado] ?? CELL_BY_ESTADO[""]}`}>
                        {e.estado || "—"}
                      </td>
                    ))}
                    <td className="border-t border-l border-gray-100 px-3 py-2 text-right">
                      <span className={`text-sm font-semibold tabular-nums ${avanceColor(s.avance)}`}>{s.avance}%</span>
                    </td>
                    <td className="border-t border-l border-gray-100 px-3 py-2 text-xs text-gray-400">
                      <span className="text-[10px] italic">compartida con {s.socio}</span>
                    </td>
                    <td className="border-t border-l border-gray-100 px-3 py-2 text-right text-xs text-gray-400 italic">compartida</td>
                    <td className="border-t border-l border-gray-100 px-3 py-2 text-xs text-gray-500 max-w-[260px]">
                      <span className="line-clamp-3">{s.statusHistory?.[0]?.status || "—"}</span>
                    </td>
                    <td className="border-t border-l border-gray-100 px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {s.statusHistory?.[0]?.fecha || "—"}
                    </td>
                  </tr>
                );
              }

              rows.push(
                <tr
                  key={s.slug}
                  className="border-t border-gray-100 transition hover:bg-gray-50/70"
                >
                  {showSocio && (
                    <td className="sticky left-0 z-[1] border-t border-gray-100 bg-white px-3 py-2 text-xs font-medium text-gray-700">
                      <span className="whitespace-nowrap">{s.socio}</span>
                      {s.actoresAdicionales && s.actoresAdicionales.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {s.actoresAdicionales.map((a) => (
                            <span key={a} className="inline-flex items-center rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] font-medium text-brand-700 whitespace-nowrap">
                              + {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="border-t border-gray-100 px-3 py-2">
                    <Link
                      href={`/dashboard/${s.slug}`}
                      className="text-sm font-medium text-gray-900 hover:text-brand-700"
                    >
                      {s.solucion}
                    </Link>
                  </td>

                  {s.etapas.map((e) => (
                    <td
                      key={e.etapa}
                      className={`border-t border-l border-gray-100 px-2 py-2 text-center text-[11px] font-medium ${
                        CELL_BY_ESTADO[e.estado] ?? CELL_BY_ESTADO[""]
                      }`}
                    >
                      {e.estado || "—"}
                    </td>
                  ))}

                  <td className="border-t border-l border-gray-100 px-3 py-2 text-right">
                    <span className={`text-sm font-semibold tabular-nums ${avanceColor(s.avance)}`}>
                      {s.avance}%
                    </span>
                  </td>

                  <td className="border-t border-l border-gray-100 px-3 py-2">
                    {meta != null || acum != null ? (
                      <div>
                        <div className="flex items-baseline gap-1 text-xs tabular-nums">
                          <span className="font-semibold text-gray-900">
                            {acum != null ? formatNumber(acum) : "—"}
                          </span>
                          <span className="text-gray-400">
                            / {meta != null ? formatNumber(meta) : "—"}
                          </span>
                          {s.pymeUnit && UNIT_SHORT[s.pymeUnit.toLowerCase()] && (
                            <span className="text-[10px] text-gray-400">
                              ({UNIT_SHORT[s.pymeUnit.toLowerCase()]})
                            </span>
                          )}
                        </div>
                        {meta != null && acum != null && (
                          <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full ${
                                pct >= 80
                                  ? "bg-blue-500"
                                  : pct >= 50
                                    ? "bg-emerald-500"
                                    : pct >= 20
                                      ? "bg-amber-500"
                                      : "bg-red-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                        {s.pymeSharedGroup && (
                          <p className="mt-0.5 text-[10px] text-amber-600">meta compartida</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">— / por definir</span>
                    )}
                  </td>

                  <td className="border-t border-l border-gray-100 px-3 py-2 text-right">
                    {meta != null && acum != null ? (
                      <span className={`text-sm font-semibold tabular-nums ${avanceColor(Math.round(pct))}`}>
                        {Math.round(pct)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>

                  {(() => {
                    const latest = s.statusHistory?.[0];
                    return (
                      <>
                        <td className="border-t border-l border-gray-100 px-3 py-2 text-xs text-gray-700 max-w-[260px]">
                          <span className="line-clamp-3">{latest?.status || "—"}</span>
                        </td>
                        <td className="border-t border-l border-gray-100 px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {latest?.fecha || "—"}
                        </td>
                      </>
                    );
                  })()}
                </tr>
              );
            }
            return rows;
          })()}
        </tbody>
      </table>

      <p className="border-t border-gray-100 bg-gray-50/40 px-4 py-2 text-[11px] text-gray-400">
        PYMEs acum / meta vienen de la pestaña <span className="font-medium">KPIs_PYMEs</span> del
        Sheet. El cliente las edita directo allí.
      </p>
    </div>
  );
}
