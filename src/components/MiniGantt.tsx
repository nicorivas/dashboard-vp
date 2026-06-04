/**
 * Vista Gantt: bandas de mes + barras continuas por etapa, agrupadas por solución.
 * - Server component (recibe `today` por prop para evitar diff SSR).
 * - Color de barra por estado (En curso / Terminado / Pendiente).
 * - Resaltado de la columna "hoy".
 */
import type { GanttRow, Estado } from "@/lib/types";

const MONTH_TOKEN_TO_NUM: Record<string, number> = {
  Jan: 0, Ene: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3, Abr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7, Ago: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11, Dic: 11,
};

const MONTH_LABEL: Record<number, string> = {
  0: "Ene", 1: "Feb", 2: "Mar", 3: "Abr", 4: "May", 5: "Jun",
  6: "Jul", 7: "Ago", 8: "Sep", 9: "Oct", 10: "Nov", 11: "Dic",
};

function parseWeek(token: string, year: number): Date | null {
  const m = token.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthRaw = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  const month = MONTH_TOKEN_TO_NUM[monthRaw];
  if (month === undefined) return null;
  return new Date(year, month, day);
}

function findTodayWeekIdx(weeks: string[], today: Date): number {
  const year = today.getFullYear();
  const dates = weeks.map((w) => parseWeek(w, year));
  for (let i = 0; i < dates.length - 1; i++) {
    const a = dates[i], b = dates[i + 1];
    if (a && b && today >= a && today < b) return i;
  }
  const last = dates[dates.length - 1];
  if (last && today >= last && today < new Date(year, last.getMonth(), last.getDate() + 7)) {
    return dates.length - 1;
  }
  return -1;
}

function buildMonthBands(weeks: string[]): { month: number; start: number; count: number }[] {
  const bands: { month: number; start: number; count: number }[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const m = weeks[i].match(/^\d{1,2}-([A-Za-z]{3})$/);
    if (!m) continue;
    const monthRaw = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    const month = MONTH_TOKEN_TO_NUM[monthRaw];
    if (month === undefined) continue;
    const last = bands[bands.length - 1];
    if (last && last.month === month) last.count++;
    else bands.push({ month, start: i, count: 1 });
  }
  return bands;
}

type Span = { start: number; end: number; estado: Estado };

function buildSpans(semanas: string[], estado: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  const e = parseEstadoLoose(estado);
  while (i < semanas.length) {
    if (!semanas[i] || !semanas[i].trim()) {
      i++;
      continue;
    }
    const start = i;
    while (i < semanas.length && semanas[i] && semanas[i].trim()) i++;
    spans.push({ start, end: i - 1, estado: e });
  }
  return spans;
}

function parseEstadoLoose(raw: string): Estado {
  const e = raw.toLowerCase();
  if (e.includes("curso")) return "En curso";
  if (e.includes("term") || e.includes("listo") || e.includes("comple")) return "Terminado";
  if (e.includes("pend")) return "Pendiente";
  if (e.includes("no inic")) return "No iniciado";
  return "";
}

const BAR_COLOR: Record<string, string> = {
  Terminado: "bg-blue-400",
  "En curso": "bg-emerald-500",
  Pendiente: "bg-red-400",
  "No iniciado": "bg-slate-300",
  "No aplica": "bg-gray-200",
  "": "bg-gray-200",
};

const ROW_H = 28; // px

export function MiniGantt({
  weeks,
  rows,
  showSocio = false,
  today = new Date(),
}: {
  weeks: string[];
  rows: GanttRow[];
  showSocio?: boolean;
  today?: Date;
}) {
  if (rows.length === 0 || weeks.length === 0) return null;

  const bands = buildMonthBands(weeks);
  const todayIdx = findTodayWeekIdx(weeks, today);

  const leftCols = showSocio
    ? "120px minmax(180px,1.4fr) minmax(160px,1fr)"
    : "minmax(200px,1.4fr) minmax(160px,1fr)";
  const leftColSpan = showSocio ? 3 : 2;
  const gridStyle = {
    gridTemplateColumns: `${leftCols} repeat(${weeks.length}, minmax(18px, 1fr))`,
  };

  const groupKey = (r: GanttRow) => `${r.socio}|||${r.solucion}`;

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="min-w-[1100px]">
        {/* Header banda de meses */}
        <div className="grid border-b border-gray-100 bg-gray-50/70" style={gridStyle}>
          <div
            className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400"
            style={{ gridColumn: `span ${leftColSpan}` }}
          >
            Línea de tiempo {today.getFullYear()}
          </div>
          {bands.map((b, i) => (
            <div
              key={`${b.month}-${i}`}
              className="border-l border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-600"
              style={{ gridColumn: `span ${b.count}` }}
            >
              {MONTH_LABEL[b.month]}
            </div>
          ))}
        </div>

        {/* Header semanas */}
        <div className="grid border-b border-gray-200 bg-white" style={gridStyle}>
          {showSocio && (
            <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Socio
            </div>
          )}
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Solución
          </div>
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Etapa
          </div>
          {weeks.map((w, idx) => {
            const isToday = idx === todayIdx;
            const day = w.split("-")[0];
            return (
              <div
                key={w}
                className={`border-l border-gray-100 py-2 text-center text-[10px] tabular-nums ${
                  isToday ? "bg-red-50 font-semibold text-red-600" : "text-gray-400"
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div>
          {rows.map((row, i) => {
            const prev = rows[i - 1];
            const isNewGroup = !prev || groupKey(prev) !== groupKey(row);
            const spans = buildSpans(row.semanas, row.estado);

            return (
              <div
                key={i}
                className={`grid items-center hover:bg-gray-50/70 ${
                  isNewGroup && i > 0 ? "border-t border-gray-200" : "border-t border-gray-100/70"
                }`}
                style={{ ...gridStyle, height: ROW_H }}
              >
                {/* Cells izquierda */}
                {showSocio && (
                  <div
                    className="truncate px-4 text-xs text-gray-700"
                    style={{ gridRow: 1, gridColumn: 1 }}
                  >
                    {isNewGroup ? row.socio : ""}
                  </div>
                )}
                <div
                  className="truncate px-4 text-xs"
                  style={{ gridRow: 1, gridColumn: showSocio ? 2 : 1 }}
                >
                  {isNewGroup ? (
                    <span className="font-medium text-gray-900">{row.solucion}</span>
                  ) : null}
                </div>
                <div
                  className="truncate px-4 text-xs text-gray-600"
                  style={{ gridRow: 1, gridColumn: showSocio ? 3 : 2 }}
                >
                  {row.etapa}
                </div>

                {/* Background de cada semana — todas en la misma row */}
                {weeks.map((_, idx) => (
                  <div
                    key={`bg-${idx}`}
                    className={`h-full border-l ${
                      idx === todayIdx ? "border-red-200 bg-red-50/40" : "border-gray-100"
                    }`}
                    style={{ gridRow: 1, gridColumn: leftColSpan + 1 + idx }}
                  />
                ))}

                {/* Barras: overlay en la misma row, encima del bg */}
                {spans.map((span, si) => {
                  const colStart = leftColSpan + 1 + span.start;
                  const colEnd = leftColSpan + 1 + span.end + 1;
                  return (
                    <div
                      key={`span-${si}`}
                      className={`pointer-events-none mx-0.5 h-3.5 self-center rounded-sm ${
                        BAR_COLOR[span.estado]
                      } shadow-sm`}
                      style={{ gridRow: 1, gridColumn: `${colStart} / ${colEnd}`, zIndex: 1 }}
                      title={`${row.etapa} · ${span.estado || row.estado || "—"}`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 bg-gray-50/40 px-4 py-2 text-[11px] text-gray-500">
          <span className="font-semibold uppercase tracking-wider text-gray-400">Leyenda</span>
          <Legend color="bg-emerald-500" label="En curso" />
          <Legend color="bg-blue-400" label="Terminado" />
          <Legend color="bg-red-400" label="Pendiente" />
          <Legend color="bg-slate-300" label="No iniciado" />
          <Legend color="bg-gray-200" label="No aplica" />
          {todayIdx >= 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-red-600">
              <span className="inline-block h-3 w-2 rounded-sm bg-red-100 ring-1 ring-red-300" />
              Hoy · sem. {weeks[todayIdx]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-4 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
