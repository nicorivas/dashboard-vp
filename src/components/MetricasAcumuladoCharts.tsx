"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricasSemana2026 } from "@/lib/sheets";

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

export function MetricasAcumuladoCharts({ series2026 }: { series2026: MetricasSemana2026[] }) {
  const withData = series2026.filter((w) => w.traficoAcum != null || w.alcanceAcum != null);
  if (withData.length === 0) return null;

  const traficoData = series2026.map((w) => ({ fecha: w.fecha, value: w.traficoAcum, ghost: w.traficoAcum2025 }));
  const alcanceData = series2026.map((w) => ({ fecha: w.fecha, value: w.alcanceAcum, ghost: w.alcanceAcum2025 }));

  const lastTrafico = [...series2026].reverse().find((w) => w.traficoAcum != null)?.traficoAcum ?? null;
  const lastAlcance = [...series2026].reverse().find((w) => w.alcanceAcum != null)?.alcanceAcum ?? null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Alcance acumulado 2026
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-400">Pymes que se registran en Valorpyme.cl, semana a semana</p>
          </div>
          {lastAlcance != null && (
            <span className="text-lg font-semibold tabular-nums text-gray-900">
              {formatNumber(lastAlcance)}
            </span>
          )}
        </div>
        <div className="mt-3 h-56 w-full">
          <MiniAreaChart data={alcanceData} dataKey="alcance" color="#d55839" />
        </div>
      </div>
    </div>
  );
}
