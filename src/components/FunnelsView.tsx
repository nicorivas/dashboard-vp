"use client";

import { useState } from "react";
import type { ConvocatoriaBlock, InscripcionFunnel } from "@/lib/types";
import { FunnelChart } from "./FunnelChart";
import { TrafficGroupCard } from "./TrafficGroupCard";

export function FunnelsView({
  partners,
  convocatoriaByPartner,
  inscripcionByPartner,
}: {
  partners: { name: string; displayName: string; active: boolean }[];
  convocatoriaByPartner: Record<string, ConvocatoriaBlock[]>;
  inscripcionByPartner: Record<string, InscripcionFunnel[]>;
}) {
  const firstActive = partners.find((p) => p.active)?.name ?? null;
  const [selected, setSelected] = useState<string | null>(firstActive);
  const [inactiveNotice, setInactiveNotice] = useState<string | null>(null);

  const handleClick = (partner: { name: string; displayName: string; active: boolean }) => {
    if (!partner.active) {
      // Limpia la selección activa: mostrar sólo el aviso, no dejar los
      // funnels del socio anterior debajo — confunde sobre a quién pertenecen.
      setSelected(null);
      setInactiveNotice(partner.displayName);
      return;
    }
    setInactiveNotice(null);
    setSelected(partner.name);
  };

  const convocatoriaBlocks = selected ? convocatoriaByPartner[selected] ?? [] : [];
  const inscripcionFunnels = selected ? inscripcionByPartner[selected] ?? [] : [];
  const anios = [...new Set(convocatoriaBlocks.map((b) => b.anio))];

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Funnels</h2>
        <p className="mt-1 text-sm text-gray-500">
          Convocatoria e inscripción por socio y partner del programa.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {partners.map((p) => {
          const isSelected = selected === p.name;
          const className = p.active
            ? isSelected
              ? "bg-brand-600 text-white ring-brand-600"
              : "bg-brand-50 text-brand-700 ring-brand-600/30 hover:bg-brand-100"
            : "bg-gray-50 text-gray-400 ring-gray-200 hover:bg-gray-100";
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => handleClick(p)}
              aria-pressed={isSelected}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${className}`}
            >
              {p.displayName}
            </button>
          );
        })}
      </div>

      {inactiveNotice && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Aún no hay funnel para <span className="font-medium text-gray-800">{inactiveNotice}</span> — Esta
          funcionalidad estará disponible en una próxima etapa.
        </div>
      )}

      {selected && (convocatoriaBlocks.length > 0 || inscripcionFunnels.length > 0) && (
        <div className="mt-8 space-y-10">
          {convocatoriaBlocks.length > 0 && (
            <section>
              <div className="border-l-4 border-brand-500 pl-3">
                <h3 className="text-base font-semibold text-gray-900">Convocatoria</h3>
              </div>
              <div className="mt-5 space-y-8">
                {anios.map((anio) => (
                  <div key={anio}>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{anio}</h4>
                    <div className="mt-3 space-y-6">
                      {convocatoriaBlocks
                        .filter((b) => b.anio === anio)
                        .map((b) => (
                          <div key={`${b.anio}-${b.solucion ?? "general"}`}>
                            {b.solucion && <p className="text-xs font-medium text-gray-700">{b.solucion}</p>}
                            <div className="mt-3 space-y-4">
                              {b.grupos.map((g) => (
                                <TrafficGroupCard key={g.id} group={g} theme="brand" isGeneral={selected === "General"} />
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {inscripcionFunnels.length > 0 && (
            <section>
              <div className="border-l-4 border-orange-500 pl-3">
                <h3 className="text-base font-semibold text-gray-900">Inscripción</h3>
                <p className="text-xs text-gray-500">Alcance y adquisición reportados por la solución</p>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {inscripcionFunnels.map((funnel) => (
                  <FunnelChart key={funnel.id} funnel={funnel} theme="orange" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {selected && convocatoriaBlocks.length === 0 && inscripcionFunnels.length === 0 && (
        <p className="mt-6 text-sm text-gray-400">Sin funnels cargados para este socio todavía.</p>
      )}
    </div>
  );
}
