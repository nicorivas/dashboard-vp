import type { PartnerSummary } from "@/lib/types";
import { AvanceBar } from "./AvanceBar";

const UNIT_LABEL: Record<string, string> = {
  pymes: "PYMEs",
  trabajadores: "trabajadores PYME",
  empresas: "empresas",
};

const EJE_PILL: Record<string, string> = {
  Capital: "bg-gold-50 text-gold-700 ring-gold-400/20",
  Mercado: "bg-coral-50 text-coral-700 ring-coral-400/20",
  Digitalización: "bg-brand-50 text-brand-700 ring-brand-400/20",
  "Gestión y Talento": "bg-sand-100 text-sand-700 ring-sand-300/20",
  Comunidad: "bg-coral-50 text-coral-600 ring-coral-300/20",
};

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

export function PartnerCard({ p }: { p: PartnerSummary }) {
  const pct = p.pymeMeta && p.pymeAcum != null ? Math.round((p.pymeAcum / p.pymeMeta) * 100) : 0;
  const unit = UNIT_LABEL[p.pymeUnit?.toLowerCase() ?? "pymes"] ?? "PYMEs";

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {p.partner}
          </p>
          <h3 className="mt-0.5 truncate text-base font-semibold text-gray-900">{p.solucion}</h3>
        </div>
        {p.eje && (
          <span
            className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
              EJE_PILL[p.eje] ?? "bg-gray-50 text-gray-700 ring-gray-300"
            }`}
          >
            {p.eje}
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          PYMEs · acum / meta 2026
        </p>
        {p.pymeMeta != null || p.pymeAcum != null ? (
          <p className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xl font-semibold tabular-nums text-brand-700">
              {p.pymeAcum != null ? formatNumber(p.pymeAcum) : "—"}
            </span>
            <span className="text-sm text-gray-400">
              / {p.pymeMeta != null ? formatNumber(p.pymeMeta) : "—"}
            </span>
            <span className="text-xs text-gray-500">{unit}</span>
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-gray-400">por definir</p>
        )}
      </div>

      {p.pymeMeta != null && p.pymeAcum != null && (
        <div className="mt-3">
          <AvanceBar value={pct} size="sm" />
        </div>
      )}

      {p.pymeNotas && (
        <p className="mt-3 line-clamp-3 text-xs text-gray-600">{p.pymeNotas}</p>
      )}

      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Status</p>
        {p.statusHistory && p.statusHistory.length > 0 ? (
          <>
            <div className="rounded-lg border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-3">
              {p.statusHistory[0].fecha && (
                <p className="mb-1 text-[10px] font-medium text-brand-600">{p.statusHistory[0].fecha}</p>
              )}
              <p className="text-xs text-gray-800">{p.statusHistory[0].status}</p>
            </div>
            {p.statusHistory.length > 1 && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-white overflow-hidden">
                <p className="border-b border-gray-100 bg-gray-50/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Historial
                </p>
                <ul className="divide-y divide-gray-100">
                  {p.statusHistory.slice(1).map((entry, i) => (
                    <li key={i} className="flex items-start gap-3 px-3 py-2">
                      <span className="mt-0.5 shrink-0 text-[10px] text-gray-400 w-16">{entry.fecha}</span>
                      <p className="text-[11px] text-gray-600">{entry.status}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">Sin actualizaciones aún.</p>
        )}
      </div>
    </div>
  );
}
