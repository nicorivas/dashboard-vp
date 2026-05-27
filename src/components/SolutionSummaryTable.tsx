import type { Estado, EtapaName, SolutionSummary } from "@/lib/types";
import { ETAPAS } from "@/lib/types";
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
  "No aplica": "bg-gray-50 text-gray-300",
  "": "bg-gray-50 text-gray-400",
};

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

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
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
            <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider">
              % Avance
            </th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider">
              PYMEs · acum / meta 2026
            </th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s, idx) => {
            const meta = s.pymeMeta;
            const acum = s.pymeAcum;
            const pct = meta != null && meta > 0 && acum != null ? Math.min(100, (acum / meta) * 100) : 0;
            return (
              <tr
                key={s.slug}
                className={`border-t border-gray-100 transition hover:bg-gray-50/70 ${
                  idx === 0 ? "" : ""
                }`}
              >
                {showSocio && (
                  <td className="sticky left-0 z-[1] whitespace-nowrap border-t border-gray-100 bg-white px-3 py-2 text-xs font-medium text-gray-700">
                    {s.socio}
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

              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="border-t border-gray-100 bg-gray-50/40 px-4 py-2 text-[11px] text-gray-400">
        PYMEs acum / meta vienen de la pestaña <span className="font-medium">KPIs_PYMEs</span> del
        Sheet. El cliente las edita directo allí.
      </p>
    </div>
  );
}
