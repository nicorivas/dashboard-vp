"use client";

import { useState } from "react";
import type { FunnelStage } from "@/lib/types";

/** Franjas de la rampa de color, de más oscura (primera etapa) a más clara
 *  (última) — un funnel es una sola serie ordenada, por eso el color es
 *  secuencial (una familia), nunca categórico. Convocatoria usa `brand`
 *  (verde), Inscripción usa `orange` para distinguirse de un vistazo. */
const THEME_COLORS: Record<"brand" | "orange", string[]> = {
  brand: ["bg-brand-600", "bg-brand-500", "bg-brand-400", "bg-brand-300"],
  orange: ["bg-orange-600", "bg-orange-500", "bg-orange-400", "bg-orange-300"],
};

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

function formatPercent(x: number): string {
  return new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 }).format(x);
}

function barColor(index: number, total: number, theme: "brand" | "orange"): string {
  const colors = THEME_COLORS[theme];
  if (total <= 1) return colors[0];
  const step = Math.round((index / (total - 1)) * (colors.length - 1));
  return colors[step];
}

/** Ancho proporcional a la magnitud real, comprimido con raíz cuadrada para
 *  que la cola de etapas chicas siga siendo visible (una escala lineal las
 *  deja en ~0%). El piso lo pone `min-w-[Npx]` en el botón, no un porcentaje
 *  fijo — así sólo se activa para la cola realmente diminuta y no aplana
 *  etapas intermedias con magnitudes distintas entre sí. */
function widthPct(value: number, first: number): number {
  if (first <= 0 || value <= 0) return 0;
  return Math.min(100, Math.sqrt(value / first) * 100);
}

export function FunnelChart({
  funnel,
  theme = "brand",
}: {
  funnel: { canal?: string; solucion: string; etapas: FunnelStage[] };
  theme?: "brand" | "orange";
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { etapas } = funnel;
  const first = etapas[0]?.value || 0;
  const ringColor = theme === "orange" ? "ring-orange-600" : "ring-brand-600";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          {funnel.canal && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{funnel.canal}</p>
          )}
          <h4 className="mt-0.5 text-sm font-semibold text-gray-900">{funnel.solucion}</h4>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-2">
        {etapas.map((etapa, i) => {
          const width = widthPct(etapa.value, first);
          const vsPrevious = i === 0 ? 1 : (etapas[i - 1].value > 0 ? etapa.value / etapas[i - 1].value : 0);
          const isActive = activeIndex === i;

          return (
            <div
              key={`${etapa.label}-${i}`}
              className="relative w-full max-w-md"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
            >
              <div className="flex justify-center">
                <button
                  type="button"
                  tabIndex={0}
                  className={`flex min-w-[110px] items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-white transition ${barColor(i, etapas.length, theme)} ${isActive ? `ring-2 ring-offset-2 ${ringColor}` : ""}`}
                  style={{ width: `${width}%` }}
                >
                  <span className="truncate text-xs font-medium">{etapa.label}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatNumber(etapa.value)}</span>
                </button>
              </div>

              <p className="mt-1 text-center text-[11px] text-gray-500">
                {i === 0 ? <>100% del funnel</> : <>{formatPercent(vsPrevious)} vs etapa anterior</>}
              </p>

              {isActive && (
                <div className="absolute left-1/2 top-full z-10 mt-1 w-60 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg">
                  <p className="font-semibold text-gray-900">{etapa.label}</p>
                  <dl className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">Cantidad</dt>
                      <dd className="font-medium tabular-nums text-gray-900">{formatNumber(etapa.value)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">vs. etapa anterior</dt>
                      <dd className="font-medium tabular-nums text-gray-900">
                        {i === 0 ? "—" : formatPercent(vsPrevious)}
                      </dd>
                    </div>
                  </dl>
                  {etapa.nota && (
                    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-gray-500">
                      {etapa.nota.split("\n").map((parrafo, pi) =>
                        pi === 0 ? <p key={pi}>{parrafo}</p> : <p key={pi} className="font-semibold text-gray-700">{parrafo}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
