import type { EvalSemana } from "@/lib/types";

const SEMAFORO_CLS: Record<string, string> = {
  verde:    "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  amarillo: "bg-amber-100 text-amber-700 ring-amber-600/20",
  rojo:     "bg-red-100 text-red-700 ring-red-400/30",
};

const SEMAFORO_DOT: Record<string, string> = {
  verde:    "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo:     "bg-red-500",
};

function semaforoKey(s: string) {
  return s.toLowerCase().trim();
}

function PuntajePill({ value }: { value: string }) {
  const num = parseFloat(value);
  const cls =
    num >= 2.5 ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : num >= 1.5 ? "bg-amber-50 text-amber-700 ring-amber-600/20"
    : "bg-red-50 text-red-700 ring-red-400/30";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${cls}`}>
      {value}
    </span>
  );
}

function SemaforoBadge({ value }: { value: string }) {
  const key = semaforoKey(value);
  const cls = SEMAFORO_CLS[key] ?? "bg-gray-100 text-gray-500 ring-gray-300";
  const dot = SEMAFORO_DOT[key] ?? "bg-gray-300";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {value || "—"}
    </span>
  );
}

export function EvaluacionSemanalTable({ rows }: { rows: EvalSemana[] }) {
  if (rows.length === 0) return null;

  // Una fila por socio: la más reciente con datos
  const latest = new Map<string, EvalSemana>();
  for (const r of rows) {
    latest.set(r.socio, r); // las filas vienen ordenadas ascendente → la última sobreescribe
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/70">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Socio
            </th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Fecha (lun)
            </th>
            <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Puntaje (1-5)
            </th>
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Semáforo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Array.from(latest.values()).map((row) => (
            <tr key={row.socio} className="hover:bg-gray-50/60">
              <td className="px-4 py-2 text-xs font-medium text-gray-800">{row.socio}</td>
              <td className="px-4 py-2 text-xs tabular-nums text-gray-600">{row.fecha || "—"}</td>
              <td className="px-4 py-2 text-center">
                {row.puntaje ? <PuntajePill value={row.puntaje} /> : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-2">
                {row.semaforo ? <SemaforoBadge value={row.semaforo} /> : <span className="text-gray-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mini historial para mostrar dentro de la tarjeta de cada socio. */
export function EvalHistorialMini({ rows }: { rows: EvalSemana[] }) {
  if (rows.length === 0) return null;
  // Mostrar máximo las últimas 5 semanas con datos
  const last = [...rows].reverse().slice(0, 5);
  return (
    <div className="mt-3 space-y-2">
      {last.map((r) => {
        const key = semaforoKey(r.semaforo);
        const dot = SEMAFORO_DOT[key] ?? "bg-gray-300";
        return (
          <div key={r.semana} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-gray-500">{r.fecha}</span>
              <div className="flex items-center gap-1.5">
                <PuntajePill value={r.puntaje} />
                <span className={`h-2 w-2 rounded-full ${dot}`} title={r.semaforo} />
              </div>
            </div>
            {r.observacion && (
              <p className="mt-1 text-xs text-gray-700 line-clamp-2">{r.observacion}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
