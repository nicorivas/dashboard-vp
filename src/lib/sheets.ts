import { google } from "googleapis";
import {
  type GanttRow,
  type SolutionSummary,
  type PartnerSummary,
  type SolutionDetail,
  type EtapaDetail,
  type Tarea,
  type Estado,
  type PymeKpis,
  ETAPAS,
} from "./types";
import { canonicalPartner, findDetTab, findSolutionByTab, solutionSlug, slugify } from "./solutions";

const GANTT_TAB = "3. Gantt por solución";
const CONSOLIDADO_TAB = "4. Consolidado (etapas x sol)";
const KPIS_TAB = "KPIs_PYMEs";
const KPIS_PARTNERS_TAB = "KPIs_PYMEs_Partners";
const MASTER_TAB = "Lista correcta de nombres";
const CACHE_TTL_MS = 30 * 1000;
const MASTER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — cambia poco

type AggregateData = {
  weeks: string[];
  ganttRows: GanttRow[];
  summaries: SolutionSummary[];
  partnerSummaries: PartnerSummary[];
  fetchedAt: number;
};

/** Fila de la hoja maestra "Lista correcta de nombres". */
export type MasterRow = {
  tipo: "Socio" | "Partner";
  entity: string;   // nombre canónico del socio o partner
  solucion: string; // nombre canónico de la solución
  mostrar: boolean; // si=true, no=false
};

let aggregateCache: { data: AggregateData; expiresAt: number } | null = null;
let masterCache: { data: MasterRow[]; expiresAt: number } | null = null;
const detailCache = new Map<string, { data: SolutionDetail; expiresAt: number }>();

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY.");
  }
  return new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function sheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function getSheetId() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("Falta SHEET_ID.");
  return id;
}

/**
 * Sheet del que se leen los KPIs de partners (pestaña `KPIs_PYMEs_Partners`).
 * Si `PARTNERS_SHEET_ID` no está seteado, se usa el Sheet principal — así el
 * comportamiento es idéntico al de hoy hasta que se migre a un Sheet aparte
 * (el Sheet "Gestión de Partners — Valor Pyme 2026").
 */
function getPartnersSheetId() {
  return process.env.PARTNERS_SHEET_ID || getSheetId();
}

function getMasterSheetId() {
  return process.env.PARTNERS_SHEET_ID || getSheetId();
}

/** Trim whitespace, devuelve string limpio. */
function s(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Normaliza nombres de eje al canónico de `EJES`. Tolera casing y variantes
 * heredadas ("Talento" → "Gestión y Talento", "Productividad" → "Digitalización").
 */
const EJE_ALIASES: Record<string, string> = {
  capital: "Capital",
  mercado: "Mercado",
  digitalización: "Digitalización",
  digitalizacion: "Digitalización",
  productividad: "Digitalización",
  talento: "Gestión y Talento",
  "gestión y talento": "Gestión y Talento",
  "gestion y talento": "Gestión y Talento",
  comunidad: "Comunidad",
};
function normalizeEje(raw: string): string {
  if (!raw) return "";
  const k = raw.trim().toLowerCase();
  if (EJE_ALIASES[k]) return EJE_ALIASES[k];
  // Title-case para que variaciones de casing (COMUNIDAD, comunidad) sean iguales
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseEstado(raw: string): Estado {
  const e = raw.trim();
  if (!e) return "";
  const low = e.toLowerCase();
  if (low.includes("curso")) return "En curso";
  if (low.includes("term") || low.includes("listo") || low.includes("comple")) return "Terminado";
  if (low.includes("pend")) return "Pendiente";
  if (low.includes("no aplica") || low === "n/a") return "No aplica";
  return e as Estado;
}

function parsePercent(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  // Si ya viene como number (UNFORMATTED_VALUE de una celda con formato % devuelve 0.4 = 40%).
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return 0;
    if (raw <= 1) return Math.round(raw * 100);
    return Math.max(0, Math.min(100, raw));
  }
  const text = String(raw).replace(/\s/g, "");
  const m = text.match(/([\d]+)\s*%/);
  if (m) return Math.max(0, Math.min(100, Number(m[1])));
  const num = Number(text);
  if (!isNaN(num)) {
    if (num <= 1) return Math.round(num * 100);
    return Math.max(0, Math.min(100, num));
  }
  return 0;
}

/**
 * Lee la hoja "Lista correcta de nombres" del Sheet maestro.
 * Es la fuente de verdad de nombres canónicos y visibilidad de soluciones.
 * Columnas esperadas (detección flexible): Tipo | Socio/Partner | Solución | Mostrar
 */
export async function fetchMasterList(force = false): Promise<MasterRow[]> {
  if (!force && masterCache && masterCache.expiresAt > Date.now()) return masterCache.data;

  try {
    const sheets = sheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getMasterSheetId(),
      range: `'${MASTER_TAB}'!A1:Z200`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    const values = res.data.values ?? [];
    const data = parseMasterList(values);
    masterCache = { data, expiresAt: Date.now() + MASTER_CACHE_TTL_MS };
    return data;
  } catch (err) {
    console.warn("[fetchMasterList] No se pudo leer la hoja maestra — se omite filtro de visibilidad.", err);
    return [];
  }
}

function parseMasterList(values: any[][]): MasterRow[] {
  if (!values.length) return [];

  // Busca fila de header: debe tener "tipo" o "socio"/"partner" y "soluc" y "mostrar"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 5); i++) {
    const row = (values[i] || []).map((c: any) => s(c).toLowerCase());
    const hasTipoOrEntity = row.some((c: string) => c.startsWith("tipo") || c.startsWith("socio") || c.startsWith("partner") || c.startsWith("nombre") || c.includes("socio") || c.includes("partner"));
    const hasSolucion = row.some((c: string) => c.startsWith("soluc") || c.includes("soluc"));
    const hasMostrar = row.some((c: string) => c.startsWith("mostrar") || c.includes("mostrar"));
    if (hasTipoOrEntity && hasSolucion && hasMostrar) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];

  const header = (values[headerIdx] || []).map((c: any) => s(c).toLowerCase());
  const findCol = (...cands: string[]) => {
    for (const cand of cands) {
      const idx = header.findIndex((h: string) => h === cand || h.startsWith(cand) || h.includes(cand));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const colTipo    = findCol("tipo");
  const colEntity  = findCol("socio", "partner", "nombre");
  const colSol     = findCol("soluc");
  const colMostrar = findCol("mostrar");

  if (colEntity < 0 || colSol < 0 || colMostrar < 0) return [];

  const out: MasterRow[] = [];
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const entity  = s(row[colEntity]);
    const solucion = s(row[colSol]);
    if (!entity || !solucion) continue;

    const tipoRaw = colTipo >= 0 ? s(row[colTipo]).toLowerCase() : "";
    const tipo: MasterRow["tipo"] = tipoRaw === "partner" ? "Partner" : "Socio";
    const mostrarRaw = s(row[colMostrar]).toLowerCase();
    const mostrar = mostrarRaw === "si" || mostrarRaw === "sí" || mostrarRaw === "yes" || mostrarRaw === "true";

    out.push({ tipo, entity, solucion, mostrar });
  }
  return out;
}

export async function fetchAggregate(force = false): Promise<AggregateData> {
  if (!force && aggregateCache && aggregateCache.expiresAt > Date.now()) {
    return aggregateCache.data;
  }

  const sheetId = getSheetId();
  const partnersSheetId = getPartnersSheetId();
  const samePartnersSheet = partnersSheetId === sheetId;
  const sheets = sheetsClient();

  // Rangos del Sheet principal. Si los partners viven en el mismo Sheet,
  // se piden todos en un solo batchGet; si no, los partners se leen aparte.
  const mainRanges = [
    `'${GANTT_TAB}'!A1:AT200`,
    `'${CONSOLIDADO_TAB}'!A1:L80`,
    `'${KPIS_TAB}'!A1:U60`,
  ];
  if (samePartnersSheet) mainRanges.push(`'${KPIS_PARTNERS_TAB}'!A1:U80`);

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges: mainRanges,
    // UNFORMATTED_VALUE: los números llegan como `number`, sin pasar por el
    // formato visual del Sheet (que usa "," como separador de miles en es-CL).
    // Las fechas se piden como string para no recibir serial numbers.
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const ganttValues = res.data.valueRanges?.[0]?.values ?? [];
  const consolidadoValues = res.data.valueRanges?.[1]?.values ?? [];
  const kpisValues = res.data.valueRanges?.[2]?.values ?? [];

  let kpisPartnerValues: any[][];
  if (samePartnersSheet) {
    kpisPartnerValues = res.data.valueRanges?.[3]?.values ?? [];
  } else {
    // Sheet de partners separado ("Gestión de Partners — Valor Pyme 2026").
    const partnersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: partnersSheetId,
      range: `'${KPIS_PARTNERS_TAB}'!A1:U200`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    kpisPartnerValues = partnersRes.data.values ?? [];
  }

  // Hoja maestra: nombres canónicos + visibilidad. Se carga en paralelo.
  const [masterList, ganttParsed, kpisBySlug] = await Promise.all([
    fetchMasterList(force),
    Promise.resolve(parseGantt(ganttValues)),
    Promise.resolve(parseKpiSheet(kpisValues, "socio")),
  ]);
  const { weeks, rows: ganttRows, ejeByTab } = ganttParsed;

  // Índices de la hoja maestra para lookup rápido.
  // normalize: minúsculas sin tildes para matching tolerante.
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const masterVisible  = new Set<string>(); // "entity|solucion" normalizado → visible
  const masterHidden   = new Set<string>(); // "entity|solucion" normalizado → oculto
  const masterNames    = new Map<string, { entity: string; solucion: string }>(); // norm key → canonical names
  for (const row of masterList) {
    // Canonicalizar el nombre del socio/partner para que coincida con lo que
    // devuelven parseConsolidado y buildPartnerSummaries (que también canonicalizan).
    const canonicalEntity = canonicalPartner(row.entity) ?? row.entity;
    const key = `${norm(canonicalEntity)}|${norm(row.solucion)}`;
    masterNames.set(key, { entity: canonicalEntity, solucion: row.solucion });
    if (row.mostrar) masterVisible.add(key);
    else masterHidden.add(key);
  }

  // Si la hoja maestra está vacía (aún no configurada), no filtramos nada.
  const masterActive = masterList.length > 0;

  // Índice tab → KpiRow como fallback cuando el nombre de solución difiere entre pestañas.
  const kpisByTab = new Map<string, KpiRow>();
  for (const kpi of kpisBySlug.values()) {
    const tab = findDetTab(kpi.entity, kpi.solucion);
    if (tab && !kpisByTab.has(tab)) kpisByTab.set(tab, kpi);
  }

  const summariesRaw = parseConsolidado(consolidadoValues, kpisBySlug);

  const summaries = summariesRaw
    .map((s) => {
      const tabKpi = s.detTab ? kpisByTab.get(s.detTab) : undefined;
      const eje = (s.detTab ? ejeByTab.get(s.detTab) : undefined) ?? tabKpi?.kpis.eje ?? s.eje;

      // Nombre canónico desde hoja maestra (si existe entrada).
      const masterKey = `${norm(s.socio)}|${norm(s.solucion)}`;
      const canonical = masterNames.get(masterKey);
      const socio    = canonical?.entity  ?? s.socio;
      const solucion = canonical?.solucion ?? s.solucion;

      if (!tabKpi || s.pymeMeta != null) return { ...s, socio, solucion, eje };
      return {
        ...s, socio, solucion, eje,
        pymeMeta: tabKpi.kpis.pymeMeta,
        pymeUnit: tabKpi.kpis.pymeUnit,
        pymeSegmentos: tabKpi.kpis.pymeSegmentos,
        pymeNotas: tabKpi.kpis.pymeNotas,
        pymeSharedGroup: tabKpi.kpis.pymeSharedGroup,
        pymeFuente: tabKpi.kpis.pymeFuente,
        pymeMonthly: tabKpi.kpis.pymeMonthly,
        pymeAcum: tabKpi.kpis.pymeAcum,
        pymeAcumMonth: tabKpi.kpis.pymeAcumMonth,
      };
    })
    .filter((s) => {
      if (!masterActive) return true;
      const key = `${norm(s.socio)}|${norm(s.solucion)}`;
      return masterVisible.has(key);
    });

  const partnerSummariesRaw = buildPartnerSummaries(kpisPartnerValues);
  const partnerSummaries = partnerSummariesRaw
    .map((p) => {
      const masterKey = `${norm(p.partner)}|${norm(p.solucion)}`;
      const canonical = masterNames.get(masterKey);
      return {
        ...p,
        partner:  canonical?.entity   ?? p.partner,
        solucion: canonical?.solucion ?? p.solucion,
      };
    })
    .filter((p) => {
      if (!masterActive) return true;
      const key = `${norm(p.partner)}|${norm(p.solucion)}`;
      return masterVisible.has(key);
    });

  const data: AggregateData = {
    weeks,
    ganttRows,
    summaries,
    partnerSummaries,
    fetchedAt: Date.now(),
  };
  aggregateCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

type KpiRow = {
  /** "BCI", "Fintegram", etc. — primera columna. */
  entity: string;
  solucion: string;
  slug: string;
  kpis: PymeKpis;
};

const MONTH_HEADERS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Parser genérico de las pestañas KPIs_PYMEs y KPIs_PYMEs_Partners.
 * Header esperado (en cualquier orden):
 *   <Socio|Partner> | Solución | Eje | Unidad | Meta 2026 | Ene..Dic | Segmentos | Notas | Grupo compartido | Fuente
 *
 * Las columnas Ene..Dic son el ALTA de cada mes (ingresos nuevos), no el
 * acumulado: el cliente escribe sólo lo que entró ese mes.
 *
 * @param mode "socio" para socios (canonicaliza con `canonicalPartner`); "partner"
 *             usa el nombre tal cual.
 */
function parseKpiSheet(values: any[][], mode: "socio" | "partner"): Map<string, KpiRow> {
  const out = new Map<string, KpiRow>();
  if (!values.length) return out;

  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 5); i++) {
    const row = values[i] || [];
    const c0 = s(row[0]).toLowerCase();
    if ((c0 === "socio" || c0 === "partner") && s(row[1]).toLowerCase().startsWith("soluc")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return out;

  const header = (values[headerIdx] || []).map((c) => s(c).toLowerCase());
  const findCol = (...candidates: string[]): number => {
    for (const cand of candidates) {
      const idx = header.findIndex((h) => h === cand || h.startsWith(cand));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const colEje = findCol("eje");
  const colUnit = findCol("unidad");
  const colMeta = findCol("meta 2026", "meta");
  const colSegm = findCol("segmentos");
  const colNotas = findCol("notas");
  const colShared = findCol("grupo compartido", "grupo");
  const colFuente = findCol("fuente");
  const monthCols: number[] = MONTH_HEADERS.map((m) => header.findIndex((h) => h === m || h.startsWith(m)));

  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const entityRaw = s(row[0]);
    const solucion = s(row[1]);
    if (!entityRaw || !solucion) continue;

    const entity = mode === "socio" ? (canonicalPartner(entityRaw) ?? entityRaw) : entityRaw;
    const slug =
      mode === "socio"
        ? solutionSlug(entity, solucion)
        : slugify(`partner-${entity}-${solucion}`);

    // Cada celda mensual es el ALTA del mes (ingresos nuevos), no el acumulado.
    // El acumulado a la fecha = suma de todos los meses reportados.
    const monthly: (number | null)[] = monthCols.map((c) =>
      c >= 0 ? parseNumberOrNull(row[c]) : null
    );
    let acum: number | null = null;
    let acumMonth = -1;
    for (let m = 0; m < 12; m++) {
      if (monthly[m] != null) {
        acum = (acum ?? 0) + (monthly[m] as number);
        acumMonth = m;
      }
    }

    const kpis: PymeKpis = {
      eje: colEje >= 0 ? normalizeEje(s(row[colEje])) || null : null,
      pymeMeta: colMeta >= 0 ? parseNumberOrNull(row[colMeta]) : null,
      pymeUnit: colUnit >= 0 ? s(row[colUnit]) || null : null,
      pymeSegmentos: colSegm >= 0 ? s(row[colSegm]) || null : null,
      pymeNotas: colNotas >= 0 ? s(row[colNotas]) || null : null,
      pymeSharedGroup: colShared >= 0 ? s(row[colShared]) || null : null,
      pymeFuente: colFuente >= 0 ? s(row[colFuente]) || null : null,
      pymeMonthly: monthly,
      pymeAcum: acum,
      pymeAcumMonth: acumMonth,
    };

    out.set(slug, { entity, solucion, slug, kpis });
  }
  return out;
}

function buildPartnerSummaries(values: any[][]): PartnerSummary[] {
  const map = parseKpiSheet(values, "partner");
  return Array.from(map.values()).map((r) => ({
    partner: r.entity,
    solucion: r.solucion,
    slug: r.slug,
    ...r.kpis,
  }));
}

/**
 * Convierte el valor de una celda a número.
 * Con `UNFORMATTED_VALUE` Sheets devuelve los números como `number` directo —
 * sólo necesitamos parsear strings (cuando la celda fue escrita como texto).
 *
 * Devuelve `null` para celdas vacías Y para `0`, porque `0` se interpreta como
 * "no reportado" (los KPIs son acumulados, así que un 0 entre valores reales
 * indica que la celda no se llenó). Si el cliente quiere reflejar adopción
 * cero, debe dejar la celda vacía.
 */
function parseNumberOrNull(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw === 0) return null;
    return raw;
  }
  const text = String(raw).trim();
  if (!text) return null;
  const cleaned = text.replace(/\s/g, "").toUpperCase();
  const km = cleaned.match(/^([\d.,]+)([KM])$/);
  if (km) {
    const base = km[1].replace(/[.,]/g, "");
    const n = Number(base);
    if (!Number.isFinite(n) || n === 0) return null;
    return Math.round(n * (km[2] === "K" ? 1_000 : 1_000_000));
  }
  const onlyDigits = cleaned.replace(/[^0-9-]/g, "");
  if (!onlyDigits || onlyDigits === "-") return null;
  const n = Number(onlyDigits);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function parseGantt(values: any[][]): {
  weeks: string[];
  rows: GanttRow[];
  /** Mapa detTab → eje desde la columna "Eje" del Gantt (fuente de verdad). */
  ejeByTab: Map<string, string>;
} {
  // Buscar la fila de header dinámicamente (columnas etiquetadas).
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    const row = (values[i] || []).map((c: any) => s(c).toLowerCase());
    const hasSocio = row.some((c: string) => c === "socio");
    const hasSolucion = row.some((c: string) => c.startsWith("soluc"));
    const hasEtapa = row.some((c: string) => c === "etapa");
    if (hasSocio && hasSolucion && hasEtapa) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx < 0) return { weeks: [], rows: [], ejeByTab: new Map() };

  const headerRow = (values[headerRowIdx] || []).map((c: any) => s(c).toLowerCase());
  const findCol = (...candidates: string[]): number => {
    for (const cand of candidates) {
      const idx = headerRow.findIndex((h: string) => h === cand || h.startsWith(cand));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const colEje = findCol("eje");
  const colSocio = findCol("socio");
  const colSol = findCol("soluc");
  const colEtapa = findCol("etapa");
  const colResp = findCol("responsable", "respons");
  const colEstado = findCol("estado");

  // Las columnas semanales son todas las que matchean "06-Apr" en el header.
  const weekCols: number[] = [];
  for (let i = 0; i < headerRow.length; i++) {
    if (/^\d{1,2}-[a-z]{3}$/.test(headerRow[i])) weekCols.push(i);
  }
  const weeks = weekCols.map((c) => s(values[headerRowIdx][c]));

  const rows: GanttRow[] = [];
  const ejeByTab = new Map<string, string>();
  let lastEje = "";
  let lastSocio = "";
  let lastSolucion = "";

  for (let i = headerRowIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    if (row.length === 0) continue;
    const rawSocio = colSocio >= 0 ? s(row[colSocio]) : "";
    const rawEje = colEje >= 0 ? s(row[colEje]) : "";
    // Reset del carry-forward de eje al cambiar de socio: la celda de socio nueva
    // marca el inicio de un bloque y el eje aplica sólo dentro de ese bloque.
    // Si el cliente no completó el eje, lastEje queda vacío para ese socio.
    if (rawSocio) lastEje = rawEje;
    else if (rawEje) lastEje = rawEje;

    const eje = normalizeEje(lastEje);
    const socio = rawSocio || lastSocio;
    const solucion = colSol >= 0 ? s(row[colSol]) || lastSolucion : "";
    const etapa = colEtapa >= 0 ? s(row[colEtapa]) : "";
    const responsable = colResp >= 0 ? s(row[colResp]) : "";
    const estado = colEstado >= 0 ? s(row[colEstado]) : "";
    if (!etapa) continue;
    if (rawSocio) lastSocio = rawSocio;
    if (solucion) lastSolucion = solucion;

    const semanas = weekCols.map((c) => s(row[c]));
    rows.push({ eje, socio, solucion, etapa, responsable, estado, semanas });

    // Usar detTab como clave (fuzzy match de nombre) para evitar mismatches
    // entre variaciones de nombre entre pestañas del Sheet.
    if (eje && socio && solucion) {
      const canonical = canonicalPartner(socio) ?? socio;
      const tab = findDetTab(canonical, solucion);
      if (tab && !ejeByTab.has(tab)) ejeByTab.set(tab, eje);
    }
  }
  return { weeks, rows, ejeByTab };
}

function parseConsolidado(values: any[][], kpisBySlug: Map<string, KpiRow>): SolutionSummary[] {
  // Header esperado: Socio | Solución | 1.Prep | 2.Conv | 3.Adop | 4.Acomp | 5.Eval | %Avance | Próximo hito | Fecha | Comentarios
  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 8); i++) {
    const row = values[i] || [];
    if (s(row[0]).toLowerCase() === "socio" && s(row[1]).toLowerCase().startsWith("soluc")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const out: SolutionSummary[] = [];
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const socioRaw = s(row[0]);
    const solucion = s(row[1]);
    // Sentinel: la pestaña tiene una segunda tabla de descripciones de etapa
    // ("TAREAS POR ETAPA …") cuya primera columna trae "1. Preparación", "2. Convocatoria", etc.
    // Cortamos cuando vemos el header de esa sección o cuando la primera columna no es un socio reconocido.
    if (socioRaw.toLowerCase().includes("tareas por etapa")) break;
    if (/^\d+\.\s/.test(socioRaw)) break;
    if (!socioRaw || !solucion) continue;

    const canonical = canonicalPartner(socioRaw);
    if (!canonical) continue;
    const socio = canonical;
    const etapas = ETAPAS.map((etapa, idx) => ({
      etapa,
      estado: parseEstado(s(row[2 + idx])),
    }));
    const avance = parsePercent(row[7]);
    const proximoHito = s(row[8]);
    const fechaHito = s(row[9]);
    const comentarios = s(row[10]);
    const detTab = findDetTab(socio, solucion);
    // Use canonical solution name so the slug always matches findSolutionBySlug,
    // even when the Sheet has a slightly different spelling (e.g. missing "de").
    const canonicalSolucion = detTab ? (findSolutionByTab(detTab)?.solucion ?? solucion) : solucion;
    const slug = solutionSlug(socio, canonicalSolucion);
    const kpi = kpisBySlug.get(slug);

    out.push({
      socio,
      solucion,
      slug,
      detTab,
      etapas,
      avance,
      proximoHito,
      fechaHito,
      comentarios,
      eje: kpi?.kpis.eje ?? null,
      pymeMeta: kpi?.kpis.pymeMeta ?? null,
      pymeUnit: kpi?.kpis.pymeUnit ?? null,
      pymeSegmentos: kpi?.kpis.pymeSegmentos ?? null,
      pymeNotas: kpi?.kpis.pymeNotas ?? null,
      pymeSharedGroup: kpi?.kpis.pymeSharedGroup ?? null,
      pymeFuente: kpi?.kpis.pymeFuente ?? null,
      pymeMonthly: kpi?.kpis.pymeMonthly ?? Array(12).fill(null),
      pymeAcum: kpi?.kpis.pymeAcum ?? null,
      pymeAcumMonth: kpi?.kpis.pymeAcumMonth ?? -1,
    });
  }
  return out;
}

export async function fetchSolutionDetail(tab: string, force = false): Promise<SolutionDetail> {
  const cached = detailCache.get(tab);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;

  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `'${tab}'!A1:AZ80`,
  });
  const values = res.data.values ?? [];
  const detail = parseDetail(tab, values);
  detailCache.set(tab, { data: detail, expiresAt: Date.now() + CACHE_TTL_MS });
  return detail;
}

function parseDetail(tab: string, values: any[][]): SolutionDetail {
  const meta = findSolutionByTab(tab);
  const titleRow = values[0] || [];
  const infoRow = values[1] || [];

  // Extraer responsable FE y avance del row 1
  // Formato: ["Socio: BCI","","Solución: ...","","Responsable FE:","","AP","% Avance (hoja 4):","","","","","40%"]
  let responsableFE = "";
  let avance = 0;
  for (let i = 0; i < infoRow.length; i++) {
    const cell = s(infoRow[i]).toLowerCase();
    if (cell.startsWith("responsable")) {
      // siguiente celda no vacía
      for (let j = i + 1; j < Math.min(i + 4, infoRow.length); j++) {
        const v = s(infoRow[j]);
        if (v) {
          responsableFE = v;
          break;
        }
      }
    }
    if (cell.includes("% avance") || cell.includes("avance")) {
      for (let j = i + 1; j < infoRow.length; j++) {
        const v = s(infoRow[j]);
        if (v && /\d/.test(v)) {
          avance = parsePercent(v);
          break;
        }
      }
    }
  }

  // Buscar fila de header con "Etapa","Tarea","Responsable","Estado","Inicio","Fin","Comentarios"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    const row = values[i] || [];
    if (s(row[0]).toLowerCase() === "etapa" && s(row[1]).toLowerCase() === "tarea") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return {
      slug: meta ? solutionSlug(meta.partner, meta.solucion) : tab,
      socio: meta?.partner ?? "",
      solucion: meta?.solucion ?? s(titleRow[0]),
      responsableFE,
      avance,
      weeks: [],
      etapas: [],
    };
  }

  const headerRow = values[headerIdx] || [];
  const weeks = headerRow.slice(7).map(s).filter(Boolean);

  const etapas: EtapaDetail[] = [];
  let current: EtapaDetail | null = null;

  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    if (row.length === 0) continue;
    const c0 = s(row[0]);
    const c1 = s(row[1]);

    // Fila de etapa: c0 con "1. Preparación" y c1 con "[Resumen etapa..."
    if (c0 && /^\d\./.test(c0)) {
      current = {
        etapa: c0,
        responsable: s(row[2]),
        estado: parseEstado(s(row[3])),
        semanas: weeks.map((_, idx) => s(row[7 + idx])),
        tareas: [],
      };
      etapas.push(current);
      continue;
    }

    // Fila de tarea: c0 vacía, c1 con texto. Skipeamos si c1 empieza con "[Resumen"
    if (!c0 && c1 && !c1.startsWith("[Resumen")) {
      const tarea: Tarea = {
        nombre: c1,
        responsable: s(row[2]),
        estado: parseEstado(s(row[3])),
        inicio: s(row[4]),
        fin: s(row[5]),
        comentarios: s(row[6]),
      };
      if (current) current.tareas.push(tarea);
    }
  }

  return {
    slug: meta ? solutionSlug(meta.partner, meta.solucion) : tab,
    socio: meta?.partner ?? "",
    solucion: meta?.solucion ?? "",
    responsableFE,
    avance,
    weeks,
    etapas,
  };
}

export function clearAllCache() {
  aggregateCache = null;
  detailCache.clear();
}
