"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricasSemana2026 } from "@/lib/sheets";

// 2026 = coral (identidad ya usada en el resto de la app para "Alcance").
// 2025 = gris punteado (misma convención de "línea fantasma" que el resto
// del dashboard). Ambas quedan bien separadas en OKLab de la tercera:
const COLOR_2026 = "#d55839";
const COLOR_2025 = "#9ca3af";
// Enrolamiento = azul, una familia de color que no se confunde con ninguna
// de las dos anteriores (validado con scripts/validate_palette.js del skill
// de dataviz: ΔE 31 normal-vision vs. el coral — muy por sobre el piso de 15).
const COLOR_ENROLAMIENTO = "#2a78d6";

function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

function shortDate(fecha: string): string {
  const [d, m] = fecha.split("/");
  return d && m ? `${d}/${m}` : fecha;
}

function tickFormatter(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `${v}`;
}

/** Divide una serie en dos (normal / resaltada) para poder pintar un mismo
 *  trazo con dos colores según el estado de cada tramo, sin dejar huecos: el
 *  punto donde cambia el estado se agrega a ambas series para que los tramos
 *  se toquen visualmente. */
function splitByHighlight(
  points: { value: number | null; highlight: boolean }[]
): { normal: (number | null)[]; highlight: (number | null)[] } {
  const normal: (number | null)[] = new Array(points.length).fill(null);
  const highlight: (number | null)[] = new Array(points.length).fill(null);
  for (let i = 1; i < points.length; i++) {
    if (points[i].value == null || points[i - 1].value == null) continue;
    const target = points[i].highlight ? highlight : normal;
    target[i - 1] = points[i - 1].value;
    target[i] = points[i].value;
  }
  return { normal, highlight };
}

function MiniAreaChart({
  data,
  dataKey,
  color,
}: {
  data: { fecha: string; value: number | null; ghost: number | null }[];
  dataKey: string;
  color: string;
}) {
  const gradientId = `grad-${dataKey}`;
  const hasGhost = data.some((d) => d.ghost != null);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="0" stroke="#f1f5f9" />
        <XAxis
          dataKey="fecha"
          tickFormatter={shortDate}
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickFormatter={tickFormatter}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
          labelFormatter={(label) => `Acumulado al ${shortDate(String(label))}`}
          formatter={(value, name) => [typeof value === "number" ? formatNumber(value) : "—", name]}
        />
        {hasGhost && (
          <Area
            type="monotone"
            dataKey="ghost"
            name="Acumulado 2025"
            stroke="#9ca3af"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="none"
            dot={false}
            activeDot={{ r: 3, fill: "#9ca3af", stroke: "#fff", strokeWidth: 1.5 }}
            connectNulls
            isAnimationActive={false}
            strokeOpacity={0.6}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          name="Acumulado 2026"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

type AlcanceRow = {
  fecha: string;
  v2026: number | null;
  v2025: number | null;
  inj2026: boolean;
  inj2025: boolean;
};

function AlcanceTooltip({
  active,
  payload,
  label,
  showInyeccion,
}: {
  active?: boolean;
  payload?: { payload: AlcanceRow }[];
  label?: string;
  showInyeccion: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-lg">
      <p className="font-medium text-gray-500">Acumulado al {shortDate(label ?? row.fecha)}</p>
      <div className="mt-1.5 space-y-1">
        {row.v2026 != null && (
          <p className="flex items-center gap-1.5">
            <span className="font-semibold tabular-nums" style={{ color: COLOR_2026 }}>
              {formatNumber(row.v2026)}
            </span>
            <span className="text-gray-500">2026</span>
            {showInyeccion && row.inj2026 && (
              <span className="font-medium" style={{ color: COLOR_ENROLAMIENTO }}>
                · con inyección de enrolamiento
              </span>
            )}
          </p>
        )}
        {row.v2025 != null && (
          <p className="flex items-center gap-1.5">
            <span className="font-semibold tabular-nums text-gray-600">{formatNumber(row.v2025)}</span>
            <span className="text-gray-500">2025</span>
            {showInyeccion && row.inj2025 && (
              <span className="font-medium" style={{ color: COLOR_ENROLAMIENTO }}>
                · con inyección de enrolamiento
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** Gráfico de línea con las dos series (2026 sólida, 2025 punteada). Cuando
 *  `highlightInjections` viene activado, los tramos semana a semana donde el
 *  dato "con enrolamiento" superó al dato base se repintan en un color de
 *  acento distinto (mismo acento para ambas líneas, manteniendo el trazo
 *  sólido/punteado de cada año) — así se identifica de un vistazo en qué
 *  periodos hubo una inyección de enrolamiento (importaciones). */
function AlcanceLineChart({ rows, highlightInjections }: { rows: AlcanceRow[]; highlightInjections: boolean }) {
  const split2026 = splitByHighlight(rows.map((r) => ({ value: r.v2026, highlight: r.inj2026 })));
  const split2025 = splitByHighlight(rows.map((r) => ({ value: r.v2025, highlight: r.inj2025 })));

  const data = rows.map((r, i) => ({
    ...r,
    v2026Normal: highlightInjections ? split2026.normal[i] : r.v2026,
    v2026Highlight: highlightInjections ? split2026.highlight[i] : null,
    v2025Normal: highlightInjections ? split2025.normal[i] : r.v2025,
    v2025Highlight: highlightInjections ? split2025.highlight[i] : null,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="0" stroke="#f1f5f9" />
        <XAxis
          dataKey="fecha"
          tickFormatter={shortDate}
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickFormatter={tickFormatter}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip content={<AlcanceTooltip showInyeccion={highlightInjections} />} />
        <Line
          type="monotone"
          dataKey="v2025Normal"
          stroke={COLOR_2025}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3, fill: COLOR_2025, stroke: "#fff", strokeWidth: 1.5 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        {highlightInjections && (
          <Line
            type="monotone"
            dataKey="v2025Highlight"
            stroke={COLOR_ENROLAMIENTO}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            legendType="none"
            activeDot={{ r: 3, fill: COLOR_ENROLAMIENTO, stroke: "#fff", strokeWidth: 1.5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="v2026Normal"
          stroke={COLOR_2026}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: COLOR_2026, stroke: "#fff", strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        {highlightInjections && (
          <Line
            type="monotone"
            dataKey="v2026Highlight"
            stroke={COLOR_ENROLAMIENTO}
            strokeWidth={2}
            dot={false}
            legendType="none"
            activeDot={{ r: 4, fill: COLOR_ENROLAMIENTO, stroke: "#fff", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function LegendSwatch({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
      <svg width="16" height="8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="16"
          y2="4"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

export function MetricasAcumuladoCharts({ series2026 }: { series2026: MetricasSemana2026[] }) {
  const withData = series2026.filter((w) => w.traficoAcum != null || w.alcanceAcum != null);
  if (withData.length === 0) return null;

  const traficoData = series2026.map((w) => ({ fecha: w.fecha, value: w.traficoAcum, ghost: w.traficoAcum2025 }));

  const alcanceEnrolRows: AlcanceRow[] = series2026.map((w) => ({
    fecha: w.fecha,
    v2026: w.alcanceAcumEnrolamiento,
    v2025: w.alcanceAcumEnrolamiento2025,
    inj2026: w.inyeccionEnrolamiento2026,
    inj2025: w.inyeccionEnrolamiento2025,
  }));
  const alcanceSinEnrolRows: AlcanceRow[] = series2026.map((w) => ({
    fecha: w.fecha,
    v2026: w.alcanceAcum,
    v2025: w.alcanceAcum2025,
    inj2026: false,
    inj2025: false,
  }));

  const hasEnrolData = alcanceEnrolRows.some((r) => r.v2026 != null || r.v2025 != null);

  const lastTrafico = [...series2026].reverse().find((w) => w.traficoAcum != null)?.traficoAcum ?? null;
  const lastAlcance = [...series2026].reverse().find((w) => w.alcanceAcum != null)?.alcanceAcum ?? null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Tráfico acumulado 2026
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-400">Pymes que entran a Valorpyme.cl, semana a semana</p>
          </div>
          {lastTrafico != null && (
            <span className="text-lg font-semibold tabular-nums text-gray-900">
              {formatNumber(lastTrafico)}
            </span>
          )}
        </div>
        <div className="mt-3 h-56 w-full">
          <MiniAreaChart data={traficoData} dataKey="trafico" color="#0d8a5f" />
        </div>
      </div>

      {hasEnrolData && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Alcance acumulado — con enrolamiento
              </h3>
              <p className="mt-0.5 text-[11px] text-gray-400">2026 vs. 2025, incluyendo enrolamientos masivos</p>
            </div>
          </div>
          <div className="mt-3 h-56 w-full">
            <AlcanceLineChart rows={alcanceEnrolRows} highlightInjections />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3">
            <LegendSwatch color={COLOR_2026} label="2026" />
            <LegendSwatch color={COLOR_2025} dashed label="2025" />
            <LegendSwatch color={COLOR_ENROLAMIENTO} label="Período con inyección de enrolamiento" />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Alcance acumulado — sin enrolamiento
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-400">2026 vs. 2025, dato real de alcance orgánico</p>
          </div>
          {lastAlcance != null && (
            <span className="text-lg font-semibold tabular-nums text-gray-900">
              {formatNumber(lastAlcance)}
            </span>
          )}
        </div>
        <div className="mt-3 h-56 w-full">
          <AlcanceLineChart rows={alcanceSinEnrolRows} highlightInjections={false} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3">
          <LegendSwatch color={COLOR_2026} label="2026" />
          <LegendSwatch color={COLOR_2025} dashed label="2025" />
        </div>
      </div>
    </div>
  );
}
