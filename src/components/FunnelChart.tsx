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

/** Frase de referencia a una etapa ("del tráfico", "de los clics"...) para
 *  el pie de cada barra — en vez del genérico "vs etapa anterior", nombra la
 *  etapa real con la preposición/artículo correcto. Cubre las etiquetas que
 *  usan hoy los sheets de Convocatoria (ver tabs en Funnel_Convocatoria_Partners)
 *  más las de Inscripción/Acumulado 2026; una etiqueta nueva que no esté
 *  mapeada cae al heurístico genérico de abajo. */
const ETAPA_REFERENCIA: Record<string, string> = {
  "tráfico": "del tráfico",
  "alcance": "del alcance",
  "adquisición": "de la adquisición",
  "envío correo": "de los envíos de correo",
  "apertura de correo": "de las aperturas de correo",
  "clic": "de los clics",
  "envío de formulario": "de los envíos de formulario",
  "registro academia": "de los registros en la academia",
  "postulación a convocatoria": "de las postulaciones a la convocatoria",
  "registro en fintegram": "de los registros en Fintegram",
  "visualizaciones de página": "de las visualizaciones de página",
  "visualizaciones de páginas": "de las visualizaciones de página",
  "suscripciones": "de las suscripciones",
  "suscripciones*": "de las suscripciones",
  "alcance de la solución": "del alcance de la solución",
  "adquisición de la solución": "de la adquisición de la solución",
};

function etapaReferencia(label: string): string {
  const key = label.trim().toLowerCase();
  if (ETAPA_REFERENCIA[key]) return ETAPA_REFERENCIA[key];
  // Heurística genérica para una etiqueta nueva que aún no esté mapeada
  // arriba: plural si termina en "s", género por la terminación típica del
  // español (fem: -a/-ión/-dad/-tud/-umbre; el resto, masc).
  const isPlural = /s$/.test(key);
  const firstWord = key.split(" ")[0].replace(/s$/, "");
  const isFeminine = /(a|ión|dad|tud|umbre)$/.test(firstWord);
  if (isPlural) return isFeminine ? `de las ${key}` : `de los ${key}`;
  return isFeminine ? `de la ${key}` : `del ${key}`;
}

function barColor(index: number, total: number, theme: "brand" | "orange"): string {
  const colors = THEME_COLORS[theme];
  if (total <= 1) return colors[0];
  const step = Math.round((index / (total - 1)) * (colors.length - 1));
  return colors[step];
}

/** Ancho proporcional a la magnitud real, comprimido con raíz cuadrada para
 *  que la cola de etapas chicas siga siendo visible (una escala lineal las
 *  deja en ~0%). El texto va arriba de la barra, no adentro — así la barra
 *  puede angostarse hasta un piso mínimo (`BAR_MIN_WIDTH_PX`) sin perder
 *  legibilidad, y funnels con muchas etapas chicas parecidas entre sí (ej.
 *  la campaña de OTIC) se ven proporcionales de verdad en vez de aplanadas
 *  todas al mismo ancho. */
function widthPct(value: number, first: number): number {
  if (first <= 0 || value <= 0) return 0;
  return Math.min(100, Math.sqrt(value / first) * 100);
}

const BAR_MIN_WIDTH_PX = 10;

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
          <h4 className="mt-0.5 text-sm font-semibold text-gray-900">Funnel {funnel.solucion}</h4>
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
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-xs font-medium text-gray-700">{etapa.label}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                  {formatNumber(etapa.value)}
                </span>
              </div>
              <div className="mt-1 flex justify-center">
                <button
                  type="button"
                  tabIndex={0}
                  aria-label={`${etapa.label}: ${formatNumber(etapa.value)}`}
                  className={`h-3 rounded-full transition ${barColor(i, etapas.length, theme)} ${isActive ? `ring-2 ring-offset-2 ${ringColor}` : ""}`}
                  style={{ width: `${width}%`, minWidth: `${BAR_MIN_WIDTH_PX}px` }}
                />
              </div>

              <p className="mt-1 text-center text-[11px] text-gray-500">
                {i === 0 ? <>100% del funnel</> : <>{formatPercent(vsPrevious)} {etapaReferencia(etapas[i - 1].label)}</>}
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
                      <dt className="text-gray-500">{i === 0 ? "vs. etapa anterior" : etapaReferencia(etapas[i - 1].label)}</dt>
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
