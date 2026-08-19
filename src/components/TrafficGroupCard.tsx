import type { TrafficGroup } from "@/lib/types";
import { trafficGroupFunnelStages, trafficGroupTotals } from "@/lib/funnels";
import { FunnelChart } from "./FunnelChart";
import { InfoTooltip } from "./InfoTooltip";

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

function formatPercent(x: number): string {
  return new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 }).format(x);
}

/** El punto de comparación de las flechas AR/AB es distinto para "General"
 *  (compara contra el año 2025 completo) que para el resto de socios/
 *  partners (comparan contra la tasa de General 2026, que es el benchmark
 *  del programa). */
function TrendArrow({ trend, isGeneral }: { trend?: "up" | "down"; isGeneral: boolean }) {
  if (!trend) return null;
  const compareTo = isGeneral ? "al año 2025" : "a la tasa General 2026";
  return trend === "up" ? (
    <InfoTooltip text={`Aumento con respecto ${compareTo}`} className="ml-1 cursor-help text-emerald-600">
      ▲
    </InfoTooltip>
  ) : (
    <InfoTooltip text={`Disminución con respecto ${compareTo}`} className="ml-1 cursor-help text-red-500">
      ▼
    </InfoTooltip>
  );
}

export function TrafficGroupCard({
  group,
  theme = "brand",
  isGeneral = false,
}: {
  group: TrafficGroup;
  theme?: "brand" | "orange";
  isGeneral?: boolean;
}) {
  const totals = trafficGroupTotals(group);
  const stages = trafficGroupFunnelStages(group);
  const headerColor = theme === "orange" ? "text-orange-700" : "text-brand-700";

  if (group.soloFunnel) {
    return (
      <div className="md:max-w-md">
        <FunnelChart funnel={{ solucion: group.titulo, etapas: stages }} theme={theme} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${headerColor}`}>{group.titulo}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="py-1.5 pr-3 font-semibold">Tipo de fuente de tráfico</th>
                {group.columnas.map((c) => (
                  <th key={c.label} className="py-1.5 pr-3 font-semibold">
                    {c.label}
                    {c.nota && <InfoTooltip text={c.nota} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {group.filas.map((f) => (
                <tr key={f.fuente}>
                  <td className="py-1.5 pr-3 font-medium text-gray-700">
                    {f.fuente}
                    {f.nota && <InfoTooltip text={f.nota} />}
                  </td>
                  {f.valores.map((v, i) => (
                    <td key={i} className="py-1.5 pr-3 tabular-nums text-gray-900">
                      {group.columnas[i]?.isRate ? formatPercent(v.value) : formatNumber(v.value)}
                      <TrendArrow trend={v.trend} isGeneral={isGeneral} />
                    </td>
                  ))}
                </tr>
              ))}
              {group.filas.length > 1 && (
                <tr className="font-semibold text-gray-900">
                  <td className="py-1.5 pr-3">TOTAL</td>
                  {totals.map((t, i) => (
                    <td key={i} className="py-1.5 pr-3 tabular-nums">
                      {t == null ? "—" : group.columnas[i]?.isRate ? formatPercent(t.value) : formatNumber(t.value)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FunnelChart funnel={{ solucion: group.titulo, etapas: stages }} theme={theme} />
    </div>
  );
}
