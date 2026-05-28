import type { SolutionSummary } from "@/lib/types";
import { totalPymeMeta, totalPymeAcum } from "@/lib/pyme-targets";

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

export function KpiCards({ summaries }: { summaries: SolutionSummary[] }) {
  const total = summaries.length;
  const socios = new Set(summaries.map((s) => s.socio)).size;
  const avgAvance = total === 0 ? 0 : Math.round(summaries.reduce((acc, s) => acc + s.avance, 0) / total);

  const { total: pymesMeta } = totalPymeMeta(summaries);
  const { total: pymesAcum } = totalPymeAcum(summaries);
  const sharePct = pymesMeta > 0 ? Math.round((pymesAcum / pymesMeta) * 100) : 0;

  const pymeValue = pymesMeta > 0 || pymesAcum > 0
    ? `${formatNumber(pymesAcum)} / ${formatNumber(pymesMeta)}`
    : "—";

  const stats = [
    {
      label: "PYMEs · acum / meta 2026",
      value: pymeValue,
      sub: pymesMeta > 0 ? `${sharePct}% de avance hacia la meta` : "fuente: pestaña KPIs_PYMEs",
      accent: true,
    },
    { label: "Soluciones activas", value: total, sub: `${socios} socios` },
    { label: "Avance promedio", value: `${avgAvance}%`, sub: "ponderado por solución" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded-2xl border p-5 shadow-sm ${
            s.accent
              ? "border-brand-200 bg-gradient-to-br from-brand-50 to-white"
              : "border-gray-200 bg-white"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{s.label}</p>
          <p
            className={`mt-2 font-semibold tabular-nums ${
              s.accent ? "text-xl lg:text-2xl" : "text-3xl"
            } ${s.accent ? "text-brand-700" : "text-gray-900"}`}
          >
            {s.value}
          </p>
          <p className="mt-1 text-xs text-gray-500">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}
