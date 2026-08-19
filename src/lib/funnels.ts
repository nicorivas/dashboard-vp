import type {
  ConvocatoriaBlock,
  FunnelStage,
  InscripcionFunnel,
  MetricCell,
  MetricColumn,
  PartnerSummary,
  SolutionSummary,
  TrafficFuenteRow,
  TrafficGroup,
} from "./types";
import { ADQUISICION_DEFINICION, ALCANCE_DEFINICION } from "./types";
import { PARTNERS, slugify } from "./solutions";

export function col(label: string, opts?: { isRate?: boolean; nota?: string }): MetricColumn {
  return { label, isRate: opts?.isRate, nota: opts?.nota };
}

export function fila(
  fuente: string,
  valores: (number | { value: number; trend?: "up" | "down" })[],
  nota?: string
): TrafficFuenteRow {
  return {
    fuente,
    nota,
    valores: valores.map((v): MetricCell => (typeof v === "number" ? { value: v } : v)),
  };
}

export function grupo(
  id: string,
  titulo: string,
  columnas: MetricColumn[],
  filas: TrafficFuenteRow[],
  opts?: { soloFunnel?: boolean }
): TrafficGroup {
  return { id, titulo, columnas, filas, soloFunnel: opts?.soloFunnel };
}

/** Suma cada columna a través de todas las filas de un grupo — es lo que
 *  alimenta tanto la fila TOTAL de la tabla como el funnel al lado. Las
 *  columnas `isRate` (tasas como CTR) no se suman: no tiene sentido sumar
 *  porcentajes sin ponderar, por eso devuelven `null` (la tabla las muestra
 *  en blanco en la fila TOTAL; el funnel simplemente las omite). */
export function trafficGroupTotals(group: TrafficGroup): (MetricCell | null)[] {
  return group.columnas.map((c, i) => {
    if (c.isRate) return null;
    const sum = group.filas.reduce((acc, f) => acc + (f.valores[i]?.value ?? 0), 0);
    return { value: sum };
  });
}

/** Etapas del funnel de un grupo: los totales de las columnas de conteo (no
 *  las `isRate`), en el mismo orden en que aparecen las columnas. */
export function trafficGroupFunnelStages(group: TrafficGroup): FunnelStage[] {
  const totals = trafficGroupTotals(group);
  return group.columnas
    .map((c, i) => ({ c, total: totals[i] }))
    .filter((x): x is { c: MetricColumn; total: MetricCell } => x.total != null)
    .map((x) => ({ label: x.c.label, value: x.total.value, nota: x.c.nota }));
}

/**
 * Grupo dinámico de "General": Tráfico → Alcance → Adquisición acumulados
 * desde el inicio del año a la fecha de hoy — los mismos números que
 * muestran las tarjetas "Alcance semanal" y "Adquisición" de Resumen
 * (`ResumenView.tsx`), sólo que como funnel. No es mock: se construye en
 * `funnels/page.tsx` con datos reales de `fetchMetricas()` +
 * `totalPymeAcum()`, y se agrega al bloque 2026 de General.
 */
export function buildGeneralAcumuladoGroup(
  traficoAcum: number | null,
  alcanceAcum: number | null,
  adquisicionAcum: number | null
): TrafficGroup {
  return grupo(
    "general-2026-acumulado",
    "Acumulado 2026",
    [
      col("Tráfico"),
      col("Alcance", { nota: ALCANCE_DEFINICION }),
      col("Adquisición", { nota: ADQUISICION_DEFINICION }),
    ],
    [fila("Acumulado a la fecha", [traficoAcum ?? 0, alcanceAcum ?? 0, adquisicionAcum ?? 0])],
    { soloFunnel: true }
  );
}

/** Aclaración puntual (dada por Camila) para soluciones donde Alcance sale
 *  menor que Adquisición por una razón de monitoreo, no de datos — para no
 *  generar dudas al leer el funnel. Clave: `${partner}|${solucion}`. */
const ALCANCE_ACLARACION_POR_SOLUCION: Record<string, string> = {
  "BCI|Cuenta Digital":
    "Alcance es menor a adquisición porque este dato se empezó a monitorear en junio, versus la adquisición que es reportada por BCI desde inicios del año.",
};

/**
 * Funnels reales de Inscripción (Alcance → Adquisición): uno por cada
 * solución de socio/partner que ya reporta métricas — es decir, tiene
 * `pymeAcum` (adquisición, columna "nuevos registros"/"adquirieron") y/o
 * `pymeAlcanceAcum` (alcance, columna "alcanzadas" del formulario mensual,
 * ver `colAlcanzadas` en sheets.ts). Si sólo una de las dos fue reportada,
 * la otra etapa muestra 0 — la solución igual aparece, no se oculta.
 */
export function buildInscripcionFunnels(
  summaries: SolutionSummary[],
  partnerSummaries: PartnerSummary[]
): InscripcionFunnel[] {
  const rows: { partner: string; solucion: string; alcance: number | null; adquisicion: number | null }[] = [
    ...summaries.map((s) => ({ partner: s.socio, solucion: s.solucion, alcance: s.pymeAlcanceAcum, adquisicion: s.pymeAcum })),
    ...partnerSummaries.map((p) => ({ partner: p.partner, solucion: p.solucion, alcance: p.pymeAlcanceAcum, adquisicion: p.pymeAcum })),
  ];

  return rows
    .filter((r) => r.alcance != null || r.adquisicion != null)
    .map((r) => {
      const aclaracion = ALCANCE_ACLARACION_POR_SOLUCION[`${r.partner}|${r.solucion}`];
      return {
        id: slugify(`${r.partner}-inscripcion-${r.solucion}`),
        partner: r.partner,
        solucion: r.solucion,
        etapas: [
          {
            label: "Alcance de la solución",
            value: r.alcance ?? 0,
            nota: aclaracion ? `${ALCANCE_DEFINICION}\n${aclaracion}` : ALCANCE_DEFINICION,
          },
          { label: "Adquisición de la solución", value: r.adquisicion ?? 0, nota: ADQUISICION_DEFINICION },
        ],
      };
    });
}

/** Nombre canónico (el que matchea con los datos reales) → nombre a mostrar
 *  en el picker, cuando difieren. Ej. BORD 360 es la razón social; todos
 *  conocen la solución por su nombre de producto, "Sawu". No tocar el
 *  nombre canónico acá — rompería el cruce con los bloques de Convocatoria/
 *  Inscripción/la hoja maestra. */
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "BORD 360": "Sawu",
};

export function displayName(name: string): string {
  return DISPLAY_NAME_OVERRIDES[name] ?? name;
}

/** Todos los socios/partners, marcando cuáles tienen al menos un funnel
 *  cargado (Convocatoria o Inscripción) — activos vs. inactivos. "General"
 *  (resultados agregados del sitio, no es un socio real) siempre va primero
 *  y siempre activo.
 *
 *  `universe` es el listado real de nombres a mostrar (idealmente el de la
 *  hoja maestra "Lista correcta de nombres", la misma fuente de verdad que
 *  usan Socios/Partners) — el listado estático `PARTNERS` de solutions.ts
 *  sólo se usa como respaldo si esa hoja no está disponible. */
export function getFunnelsPartners(
  universe: string[] | undefined,
  convocatoriaBlocks: ConvocatoriaBlock[],
  inscripcionFunnels: InscripcionFunnel[] = []
): { name: string; displayName: string; active: boolean }[] {
  const activeSet = new Set([
    ...convocatoriaBlocks.map((b) => b.partner),
    ...inscripcionFunnels.map((f) => f.partner),
  ]);
  const names = universe && universe.length > 0 ? universe : PARTNERS.map((p) => p.name);
  const entries = names.map((name) => ({ name, displayName: displayName(name), active: activeSet.has(name) }));
  return [{ name: "General", displayName: "General", active: true }, ...entries];
}

/** Bloques de Convocatoria de un socio/partner (o "General"), filtrados y
 *  ordenados año (desc) → solución (alfabético, `null`/General primero). */
export function getConvocatoriaBlocks(partner: string, allBlocks: ConvocatoriaBlock[]): ConvocatoriaBlock[] {
  return allBlocks
    .filter((b) => b.partner === partner)
    .sort((a, b) => {
      if (a.anio !== b.anio) return b.anio - a.anio;
      if (a.solucion == null) return -1;
      if (b.solucion == null) return 1;
      return a.solucion.localeCompare(b.solucion, "es");
    });
}

/** Funnels de Inscripción de un socio/partner, uno por solución (sin año ni
 *  canal), ordenados alfabéticamente por solución. */
export function getInscripcionByPartner(partner: string, funnels: InscripcionFunnel[]): InscripcionFunnel[] {
  return funnels.filter((f) => f.partner === partner).sort((a, b) => a.solucion.localeCompare(b.solucion, "es"));
}
