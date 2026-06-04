import type { Estado, EtapaName } from "@/lib/types";
import { ETAPA_LABELS } from "@/lib/solutions";

const COLORS: Record<Estado, string> = {
  Terminado: "bg-blue-500 ring-blue-200",
  "En curso": "bg-emerald-500 ring-emerald-200",
  Pendiente: "bg-red-400 ring-red-200",
  "No iniciado": "bg-slate-300 ring-slate-200",
  "No aplica": "bg-gray-100 ring-gray-200",
  "": "bg-gray-100 ring-gray-200",
};

export function EtapaDots({ etapas }: { etapas: { etapa: EtapaName; estado: Estado }[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {etapas.map((e) => (
        <span
          key={e.etapa}
          title={`${ETAPA_LABELS[e.etapa]}: ${e.estado || "—"}`}
          className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${COLORS[e.estado] ?? COLORS[""]}`}
        />
      ))}
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: Estado | string }) {
  const e = String(estado).trim();
  const cls = e.toLowerCase().includes("curso")
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : e.toLowerCase().includes("term")
      ? "bg-blue-50 text-blue-700 ring-blue-600/20"
      : e.toLowerCase().includes("no inic")
        ? "bg-slate-50 text-slate-600 ring-slate-300"
        : e.toLowerCase().includes("pend")
          ? "bg-red-50 text-red-700 ring-red-400/30"
          : e.toLowerCase().includes("no aplica")
            ? "bg-gray-50 text-gray-500 ring-gray-300"
            : "bg-gray-50 text-gray-700 ring-gray-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {e || "—"}
    </span>
  );
}
