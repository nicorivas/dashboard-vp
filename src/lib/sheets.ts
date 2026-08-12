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
  type StatusEntry,
  type EvalSemana,
  ETAPAS,
} from "./types";
import { canonicalPartner, canonicalSolutionName, findDetTab, findSolutionByTab, solutionSlug, slugify } from "./solutions";

const GANTT_TAB = "3. Gantt por solución";
const CONSOLIDADO_TAB = "4. Consolidado (etapas x sol)";
const KPIS_TAB = "KPIs_PYMEs";
const KPIS_PARTNERS_TAB = "KPIs_PYMEs_Partners";
const REPORTE_SOCIOS_TAB = "Reportes por mes";
const REPORTE_PARTNERS_TAB = "Reportes por mes";
const MASTER_TAB = "Lista correcta de nombres";
const STATUS_TAB = "Status";
const CACHE_TTL_MS = 30 * 1000;
const MASTER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — cambia poco

type AggregateData = {
  weeks: string[];
  ganttRows: GanttRow[];
  summaries: SolutionSummary[];
  partnerSummaries: PartnerSummary[];
  fetchedAt: number;
  fechaUltimaAdquisicion: string;
};

/** Fila de la hoja maestra "Lista correcta de nombres". */
export type MasterRow = {
  tipo: "Socio" | "Partner";
  entity: string;   // nombre canónico del socio o partner
  solucion: string; // nombre canónico de la solución
  mostrar: boolean; // si=true, no=false
  status: string | null; // status inicial desde la hoja maestra
  actorAdicional: string | null; // columna "+1": actor extra que también ve esta solución
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
  return getSheetId(); // 'Lista correcta de nombres' vive en el Sheet principal (SHEET_ID)
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
  if (low.includes("no inic")) return "No iniciado";
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

  const colTipo         = findCol("tipo");
  const colEntity       = findCol("socio", "partner", "nombre");
  const colSol          = findCol("soluc");
  const colMostrar      = findCol("mostrar");
  const colStatus       = findCol("status");
  const colActorAdicional = findCol("actor adicional", "adicional");

  if (colEntity < 0 || colSol < 0 || colMostrar < 0) return [];

  const out: MasterRow[] = [];
  let lastEntity = "";
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const entityRaw = s(row[colEntity]);
    if (entityRaw) lastEntity = entityRaw; // carry-forward: hereda el socio de la fila anterior
    const entity = lastEntity;
    const solucion = s(row[colSol]);
    if (!entity || !solucion) continue;

    const tipoRaw = colTipo >= 0 ? s(row[colTipo]).toLowerCase() : "";
    const tipo: MasterRow["tipo"] = tipoRaw === "partner" ? "Partner" : "Socio";
    const mostrarRaw = s(row[colMostrar]).toLowerCase();
    const mostrar = mostrarRaw === "si" || mostrarRaw === "sí" || mostrarRaw === "yes" || mostrarRaw === "true";
    const status = colStatus >= 0 ? s(row[colStatus]) || null : null;
    const actorAdicional = colActorAdicional >= 0 ? s(row[colActorAdicional]) || null : null;

    out.push({ tipo, entity, solucion, mostrar, status, actorAdicional });
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
    `'${STATUS_TAB}'!A1:D2000`,
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
  const statusValues = res.data.valueRanges?.[3]?.values ?? [];

  let kpisPartnerValues: any[][];
  if (samePartnersSheet) {
    kpisPartnerValues = res.data.valueRanges?.[4]?.values ?? [];
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

  // Hojas de respuestas del formulario de monitoreo mensual.
  // Se leen en paralelo junto con la hoja maestra; si la pestaña no existe,
  // el catch devuelve array vacío sin romper el resto del fetch.
  const fetchReporteSocios = sheets.spreadsheets.values
    .get({
      spreadsheetId: sheetId,
      range: `'${REPORTE_SOCIOS_TAB}'!A1:Z500`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    })
    .then((r) => r.data.values ?? ([] as any[][]))
    .catch(() => [] as any[][]);

  const fetchReportePartners = sheets.spreadsheets.values
    .get({
      spreadsheetId: partnersSheetId,
      range: `'${REPORTE_PARTNERS_TAB}'!A1:Z500`,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    })
    .then((r) => r.data.values ?? ([] as any[][]))
    .catch(() => [] as any[][]);

  // Hoja maestra: nombres canónicos + visibilidad. Se carga en paralelo.
  const [masterList, ganttParsed, kpisBySlug, reporteSociosValues, reportePartnersValues] = await Promise.all([
    fetchMasterList(force),
    Promise.resolve(parseGantt(ganttValues)),
    Promise.resolve(parseKpiSheet(kpisValues, "socio")),
    fetchReporteSocios,
    fetchReportePartners,
  ]);

  // Aplicar datos del formulario de monitoreo sobre los KPIs de socios.
  mergeReporteIntoKpis(kpisBySlug, parseReporteSheet(reporteSociosValues, "socio"));
  const { weeks, rows: ganttRows, ejeByTab } = ganttParsed;

  // Índices de la hoja maestra para lookup rápido.
  // normalize: minúsculas sin tildes para matching tolerante.
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const masterVisible  = new Set<string>(); // "entity|solucion" normalizado → visible
  const masterHidden   = new Set<string>(); // "entity|solucion" normalizado → oculto
  const masterNames    = new Map<string, { entity: string; solucion: string }>(); // norm key → canonical names
  // norm(entity)|norm(solucion) → list of additional actor names (canonical)
  const actoresAdicionalesByKey = new Map<string, string[]>();
  for (const row of masterList) {
    // Canonicalizar el nombre del socio/partner para que coincida con lo que
    // devuelven parseConsolidado y buildPartnerSummaries (que también canonicalizan).
    const canonicalEntity = canonicalPartner(row.entity) ?? row.entity;
    // Resolver el nombre canónico por el mismo camino que parseConsolidado:
    // findDetTab → findSolutionByTab → primera entrada del tab (nombre canónico).
    // Esto garantiza que "Contabilidad gratuita" → "Contabilidad Gratuita / ERP",
    // "Programa educación financiera" → "Programa de Educación Financiera y Gestión para Pymes", etc.
    const detTabMaster = findDetTab(canonicalEntity, row.solucion);
    const canonicalSol = detTabMaster
      ? (findSolutionByTab(detTabMaster)?.solucion ?? canonicalSolutionName(row.solucion))
      : canonicalSolutionName(row.solucion);
    const key = `${norm(canonicalEntity)}|${norm(canonicalSol)}`;
    masterNames.set(key, { entity: canonicalEntity, solucion: canonicalSol });
    if (row.mostrar) masterVisible.add(key);
    else masterHidden.add(key);
    if (row.actorAdicional) {
      const canonicalActor = canonicalPartner(row.actorAdicional) ?? row.actorAdicional;
      if (!actoresAdicionalesByKey.has(key)) actoresAdicionalesByKey.set(key, []);
      actoresAdicionalesByKey.get(key)!.push(canonicalActor);
    }
  }

  // Si la hoja maestra está vacía (aún no configurada), no filtramos nada.
  const masterActive = masterList.length > 0;

  // Índice de historial de status: norm(partner)|norm(solucion) → StatusEntry[] (más reciente primero)
  const statusByKey = new Map<string, StatusEntry[]>();
  for (const entry of parseStatusSheet(statusValues)) {
    const cp = canonicalPartner(entry.partner) ?? entry.partner;
    const key = `${norm(cp)}|${norm(canonicalSolutionName(entry.solucion))}`;
    if (!statusByKey.has(key)) statusByKey.set(key, []);
    statusByKey.get(key)!.unshift({ status: entry.status, fecha: entry.fecha });
  }
  // Seed inicial desde hoja maestra: siempre se agrega como entrada más antigua.
  for (const row of masterList) {
    if (!row.status) continue;
    const canonicalEntity = canonicalPartner(row.entity) ?? row.entity;
    const detTabSeed = findDetTab(canonicalEntity, row.solucion);
    const canonicalSolSeed = detTabSeed
      ? (findSolutionByTab(detTabSeed)?.solucion ?? canonicalSolutionName(row.solucion))
      : canonicalSolutionName(row.solucion);
    const key = `${norm(canonicalEntity)}|${norm(canonicalSolSeed)}`;
    const seed: StatusEntry = { status: row.status, fecha: "28/05/2026" };
    if (!statusByKey.has(key)) {
      statusByKey.set(key, [seed]);
    } else {
      statusByKey.get(key)!.push(seed);
    }
  }

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

      const statusKey = `${norm(socio)}|${norm(solucion)}`;
      const statusHistory = statusByKey.get(statusKey) ?? [];
      // Usar statusKey (nombres canónicos del maestro) para que el lookup coincida
      // con cómo se construyó actoresAdicionalesByKey.
      const actoresAdicionales = actoresAdicionalesByKey.get(statusKey) ?? actoresAdicionalesByKey.get(masterKey) ?? [];

      if (!tabKpi || s.pymeMeta != null) return { ...s, socio, solucion, eje, statusHistory, actoresAdicionales };
      return {
        ...s, socio, solucion, eje, statusHistory, actoresAdicionales,
        pymeMeta: tabKpi.kpis.pymeMeta,
        pymeUnit: tabKpi.kpis.pymeUnit,
        pymeSegmentos: tabKpi.kpis.pymeSegmentos,
        pymeNotas: tabKpi.kpis.pymeNotas,
        pymeSharedGroup: tabKpi.kpis.pymeSharedGroup,
        pymeFuente: tabKpi.kpis.pymeFuente,
        pymeMonthly: tabKpi.kpis.pymeMonthly,
        pymeAcum: tabKpi.kpis.pymeAcum,
        pymeAcumMonth: tabKpi.kpis.pymeAcumMonth,
        pymeHasFormReport: tabKpi.kpis.pymeHasFormReport,
      };
    })
    .filter((s) => {
      if (!masterActive) return true;
      const key = `${norm(s.socio)}|${norm(s.solucion)}`;
      return masterVisible.has(key);
    });

  // Parsear KPIs de partners y aplicar datos del formulario de monitoreo.
  const partnerKpiMap = parseKpiSheet(kpisPartnerValues, "partner");
  mergeReporteIntoKpis(partnerKpiMap, parseReporteSheet(reportePartnersValues, "partner"));
  const partnerSummariesRaw: PartnerSummary[] = Array.from(partnerKpiMap.values()).map((r) => ({
    partner: r.entity,
    solucion: r.solucion,
    slug: r.slug,
    statusHistory: [],
    actoresAdicionales: [],
    ...r.kpis,
  }));
  const partnerSummaries = partnerSummariesRaw
    .map((p) => {
      // Canonicalizar el nombre del partner (igual que en el loop de masterNames)
      // para tolerar variantes de capitalización/espaciado entre las dos pestañas.
      const canonicalP = canonicalPartner(p.partner) ?? p.partner;
      const masterKey = `${norm(canonicalP)}|${norm(p.solucion)}`;
      const canonical = masterNames.get(masterKey);
      const partner  = canonical?.entity   ?? canonicalP;
      const solucion = canonical?.solucion ?? p.solucion;
      const statusKey = `${norm(partner)}|${norm(solucion)}`;
      const actoresAdicionales = actoresAdicionalesByKey.get(statusKey) ?? actoresAdicionalesByKey.get(masterKey) ?? [];
      return {
        ...p,
        partner,
        solucion,
        statusHistory: statusByKey.get(statusKey) ?? [],
        actoresAdicionales,
      };
    })
    .filter((p) => {
      if (!masterActive) return true;
      const key = `${norm(p.partner)}|${norm(p.solucion)}`;
      return masterVisible.has(key);
    });

  const fechaUltimaAdquisicion = latestReporteDate([reporteSociosValues, reportePartnersValues]);

  const data: AggregateData = {
    weeks,
    ganttRows,
    summaries,
    partnerSummaries,
    fetchedAt: Date.now(),
    fechaUltimaAdquisicion,
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
  const colEje = findCol("eje", "ruta");
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
    const canonicalSolucion = canonicalSolutionName(solucion);
    const slug =
      mode === "socio"
        ? solutionSlug(entity, canonicalSolucion)
        : slugify(`partner-${entity}-${canonicalSolucion}`);

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
      pymeHasFormReport: false,
    };

    out.set(slug, { entity, solucion: canonicalSolucion, slug, kpis });
  }
  return out;
}

/**
 * Parsea la hoja de respuestas del formulario de monitoreo mensual
 * ("Reporte por mes" para socios, "Reportes por mes" para partners).
 *
 * Columnas clave que se detectan por header flexible:
 *   - Identificación socio/partner → entidad
 *   - Nombre de la solución → solución
 *   - Mes al que reporta → mes (0-11)
 *   - Adquirieron (columna explícita) → adquisición primaria
 *   - Nuevos registros → adquisición fallback
 *
 * @returns Map slug → array[12] con adquisición por mes (null = sin dato)
 */
function parseReporteSheet(values: any[][], mode: "socio" | "partner"): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  if (!values.length) return out;

  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 5); i++) {
    const row = (values[i] || []).map((c: any) => s(c).toLowerCase());
    const hasEntity = row.some((c: string) => c.includes("identificaci"));
    const hasSol = row.some((c: string) => c.includes("soluc"));
    const hasMes = row.some((c: string) => c.includes("mes"));
    if (hasEntity && hasSol && hasMes) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return out;

  const header = (values[headerIdx] || []).map((c: any) => s(c).toLowerCase());
  const findCol = (...cands: string[]) => {
    for (const cand of cands) {
      const idx = header.findIndex((h: string) => h.includes(cand));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const colEntity      = findCol("identificaci");
  const colSol         = findCol("nombre de la soluc", "nombre soluc");
  // "mes al que está reportando" es más específico que "mes" a secas
  const colMes         = findCol("mes al que");
  // Socios: "alcanzadas" es la métrica principal (col G del formulario).
  // Partners: "nuevos registros" ya funciona — se mantiene sin cambios.
  const colAlcanzadas  = findCol("alcanzadas", "número estimado");
  const colAdq         = findCol("adquirieron");
  const colNuevos      = findCol("nuevos registros");

  if (colEntity < 0 || colSol < 0 || colMes < 0) return out;

  const MONTH_NAMES: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };

  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const entityRaw  = s(row[colEntity]);
    const solucionRaw = s(row[colSol]);
    const mesRaw = s(row[colMes])
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();
    if (!entityRaw || !solucionRaw || !mesRaw) continue;

    const mesIdx = MONTH_NAMES[mesRaw];
    if (mesIdx == null) continue;

    let val: number | null = null;
    if (mode === "socio") {
      // Socios: nuevos registros → adquirieron
      if (colNuevos >= 0) val = parseNumberOrNull(row[colNuevos]);
      if (val == null && colAdq >= 0) val = parseNumberOrNull(row[colAdq]);
    } else {
      // Partners: sin cambios (nuevos registros funciona bien)
      if (colAdq >= 0) val = parseNumberOrNull(row[colAdq]);
      if (val == null && colNuevos >= 0) val = parseNumberOrNull(row[colNuevos]);
    }

    const entity = mode === "socio" ? (canonicalPartner(entityRaw) ?? entityRaw) : entityRaw;
    const canonicalSol = canonicalSolutionName(solucionRaw);
    const slug = mode === "socio"
      ? solutionSlug(entity, canonicalSol)
      : slugify(`partner-${entity}-${canonicalSol}`);

    if (!out.has(slug)) out.set(slug, Array(12).fill(null));
    // La última fila para el mismo mes toma precedencia (orden cronológico en el form)
    if (val != null) out.get(slug)![mesIdx] = val;
  }

  return out;
}

/**
 * Aplica datos del formulario de reporte sobre el mapa de KPIs.
 * Para cada mes con dato reportado, el formulario toma precedencia sobre el tab KPIs.
 */
function mergeReporteIntoKpis(kpiMap: Map<string, KpiRow>, reporteMap: Map<string, (number | null)[]>): void {
  for (const [slug, reporteMonthly] of reporteMap) {
    const kpi = kpiMap.get(slug);
    if (!kpi) continue;
    kpi.kpis.pymeHasFormReport = true;

    const merged = kpi.kpis.pymeMonthly.map((existing, i) =>
      reporteMonthly[i] != null ? reporteMonthly[i] : existing
    );

    let acum: number | null = null;
    let acumMonth = -1;
    for (let m = 0; m < 12; m++) {
      if (merged[m] != null) {
        acum = (acum ?? 0) + (merged[m] as number);
        acumMonth = m;
      }
    }

    kpi.kpis.pymeMonthly = merged;
    kpi.kpis.pymeAcum = acum;
    kpi.kpis.pymeAcumMonth = acumMonth;
  }
}

function parseStatusSheet(values: any[][]): Array<{ partner: string; solucion: string; status: string; fecha: string }> {
  if (!values.length) return [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(values.length, 3); i++) {
    const row = (values[i] || []).map((c: any) => s(c).toLowerCase());
    if (row.some((c: string) => c.includes("socio") || c.includes("partner")) &&
        row.some((c: string) => c.includes("status")) &&
        row.some((c: string) => c.includes("soluc"))) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) return [];
  const header = (values[headerIdx] || []).map((c: any) => s(c).toLowerCase());
  const findCol = (...cands: string[]) => {
    for (const cand of cands) {
      const idx = header.findIndex((h: string) => h.includes(cand));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const colPartner = findCol("socio", "partner");
  const colSol     = findCol("soluc");
  const colStatus  = findCol("status");
  const colFecha   = findCol("fecha");
  if (colPartner < 0 || colSol < 0 || colStatus < 0) return [];
  const out: Array<{ partner: string; solucion: string; status: string; fecha: string }> = [];
  for (let i = headerIdx + 1; i < values.length; i++) {
    const row = values[i] || [];
    const partner  = s(row[colPartner]);
    const solucion = s(row[colSol]);
    const status   = s(row[colStatus]);
    const fecha    = colFecha >= 0 ? s(row[colFecha]) : "";
    if (!partner || !solucion || !status) continue;
    out.push({ partner, solucion, status, fecha });
  }
  return out;
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
  const colEje = findCol("eje", "ruta");
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
    const canonical = canonicalPartner(socio) ?? socio;
    const detTab = solucion ? findDetTab(canonical, solucion) : null;
    const canonicalSolucion = detTab ? (findSolutionByTab(detTab)?.solucion ?? solucion) : solucion;
    rows.push({ eje, socio, solucion: canonicalSolucion, etapa, responsable, estado, semanas });

    // Usar detTab como clave (fuzzy match de nombre) para evitar mismatches
    // entre variaciones de nombre entre pestañas del Sheet.
    if (eje && socio && canonicalSolucion) {
      const tab = detTab;
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
    const canonicalSolucion = canonicalSolutionName(
      detTab ? (findSolutionByTab(detTab)?.solucion ?? solucion) : solucion
    );
    const slug = solutionSlug(socio, canonicalSolucion);
    const kpi = kpisBySlug.get(slug);

    out.push({
      socio,
      solucion: canonicalSolucion,
      slug,
      detTab,
      etapas,
      avance,
      proximoHito,
      fechaHito,
      comentarios,
      statusHistory: [],
      actoresAdicionales: [],
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
      pymeHasFormReport: kpi?.kpis.pymeHasFormReport ?? false,
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

export type MetricasSemana2026 = {
  fecha: string;
  traficoAcum: number | null;
  alcanceAcum: number | null;
  traficoAcum2025: number | null;
  alcanceAcum2025: number | null;
};

export type MetricasData = {
  fecha: string;
  fechaDomingo: string;
  trafico: number | null;
  trafico2025: number | null;
  traficoAcum2026: number | null;
  alcance: number | null;
  alcance2025: number | null;
  alcanceAcum2026: number | null;
  adquisicion: number | null;
  adopcion: number | null;
  series2026: MetricasSemana2026[];
};

function parseDateCL(str: string): Date | null {
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

// La columna "Semana" de Metricas admite una fecha única ("4/6/2026") o un rango
// mensual ("1/01/26 - 31/01/26"). Para el rango se usa la fecha de cierre y se
// normaliza a "d/m/yyyy" para que el resto del pipeline (orden, gráfico) la trate igual.
function parseFechaMetricas(str: string): { date: Date; fecha: string } | null {
  const single = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (single) {
    return {
      date: new Date(Number(single[3]), Number(single[2]) - 1, Number(single[1])),
      fecha: str,
    };
  }
  const range = str.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (range) {
    const day = Number(range[1]);
    const month = Number(range[2]);
    const year = range[3].length === 2 ? 2000 + Number(range[3]) : Number(range[3]);
    return { date: new Date(year, month - 1, day), fecha: `${day}/${month}/${year}` };
  }
  return null;
}

// Busca el timestamp más reciente en columna A de las hojas "Reportes por mes".
// Google Forms guarda la fecha de envío en la columna A con formato "dd/mm/yyyy HH:mm:ss".
function latestReporteDate(sheets: any[][][]): string {
  let latest: Date | null = null;
  for (const values of sheets) {
    for (let i = 1; i < values.length; i++) {
      const raw = s(values[i]?.[0]);
      if (!raw) continue;
      const d = parseDateCL(raw.split(" ")[0]);
      if (d && (!latest || d > latest)) latest = d;
    }
  }
  if (!latest) return "—";
  return `${latest.getDate()}/${latest.getMonth() + 1}/${latest.getFullYear()}`;
}

export async function fetchMetricas(): Promise<MetricasData | null> {
  try {
    const sheets = sheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: "Metricas!A1:J200",
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });
    const values = res.data.values ?? [];
    if (values.length < 2) return null;

    // Detección flexible del header (puede haber filas de título antes)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(values.length, 5); i++) {
      const row = (values[i] || []).map((c: unknown) => s(c).toLowerCase());
      if (row.some((h: string) => h.includes("semana") || h.includes("fecha") || h.includes("tr"))) {
        headerIdx = i;
        break;
      }
    }

    const header = (values[headerIdx] || []).map((c: unknown) => s(c).toLowerCase());

    // Columna de semana puede llamarse "Semana" o "Fecha"
    const colSemana = header.findIndex((h: string) => h.includes("semana") || h.includes("fecha"));
    // Tráfico semanal: tiene "tr" pero NO "acum" y NO "2025"
    const colTrafico = header.findIndex((h: string) =>
      h.includes("tr") && !h.includes("acum") && !h.includes("2025")
    );
    // Tráfico 2025: tiene "2025"
    const colTrafico2025 = header.findIndex((h: string) => h.includes("2025"));
    // Tráfico acumulado: tiene "tr" (o "trafico") y "acum"
    const colTraficoAcum = header.findIndex((h: string) =>
      h.includes("tr") && h.includes("acum")
    );
    // Alcance semanal: tiene "alcance" pero NO "acum" y NO "2025"
    const colAlcance = header.findIndex((h: string) =>
      h.includes("alcance") && !h.includes("acum") && !h.includes("2025")
    );
    // Alcance 2025: tiene "alcance" y "2025"
    const colAlcance2025 = header.findIndex((h: string) =>
      h.includes("alcance") && h.includes("2025")
    );
    // Alcance acumulado: tiene "alcance" y "acum"
    const colAlcanceAcum = header.findIndex((h: string) =>
      h.includes("alcance") && h.includes("acum")
    );
    // Adquisición y Adopción opcionales
    const colAdquisicion = header.findIndex((h: string) => h.includes("adquisic"));
    const colAdopcion    = header.findIndex((h: string) => h.includes("adopc"));

    // Cada campo usa el último valor no-nulo disponible entre todas las filas con fecha válida.
    // Así, si la semana más reciente tiene campos vacíos, se muestra el valor de la semana anterior.
    let bestDate: Date | null = null;
    let bestFecha = "";
    let bestTrafico: number | null = null;
    let bestTrafico2025: number | null = null;
    let bestTraficoAcum: number | null = null;
    let bestAlcance: number | null = null;
    let bestAlcance2025: number | null = null;
    let bestAlcanceAcum: number | null = null;
    let bestAdquisicion: number | null = null;
    let bestAdopcion: number | null = null;
    // Tráfico/Alcance 2025 en el sheet son valores por período (no acumulados);
    // se acumulan aquí mismo, sumando en el mismo orden cronológico, para poder
    // graficarlos como línea de comparación "fantasma" junto al acumulado 2026.
    let traficoAcum2025Running = 0;
    let alcanceAcum2025Running = 0;
    let hasTrafico2025 = false;
    let hasAlcance2025 = false;
    const series2026: MetricasSemana2026[] = [];

    for (let i = headerIdx + 1; i < values.length; i++) {
      const row = values[i] || [];
      const fechaStr = colSemana >= 0 ? s(row[colSemana]) : "";
      if (!fechaStr) continue;
      const parsed = parseFechaMetricas(fechaStr);
      if (!parsed) continue;
      const { date: d, fecha: fechaNorm } = parsed;
      if (!bestDate || d > bestDate) { bestDate = d; bestFecha = fechaNorm; }

      const t    = colTrafico     >= 0 ? parseNumberOrNull(row[colTrafico])     : null;
      const t25  = colTrafico2025 >= 0 ? parseNumberOrNull(row[colTrafico2025]) : null;
      const tAcm = colTraficoAcum >= 0 ? parseNumberOrNull(row[colTraficoAcum]) : null;
      const alc  = colAlcance     >= 0 ? parseNumberOrNull(row[colAlcance])     : null;
      const a25  = colAlcance2025 >= 0 ? parseNumberOrNull(row[colAlcance2025]) : null;
      const aAcm = colAlcanceAcum >= 0 ? parseNumberOrNull(row[colAlcanceAcum]) : null;
      const adq  = colAdquisicion >= 0 ? parseNumberOrNull(row[colAdquisicion]) : null;
      const adop = colAdopcion    >= 0 ? parseNumberOrNull(row[colAdopcion])    : null;

      if (t    != null) bestTrafico      = t;
      if (t25  != null) bestTrafico2025  = t25;
      if (tAcm != null) bestTraficoAcum  = tAcm;
      if (alc  != null) bestAlcance      = alc;
      if (a25  != null) bestAlcance2025  = a25;
      if (aAcm != null) bestAlcanceAcum  = aAcm;
      if (adq  != null) bestAdquisicion  = adq;
      if (adop != null) bestAdopcion     = adop;

      if (t25 != null) { traficoAcum2025Running += t25; hasTrafico2025 = true; }
      if (a25 != null) { alcanceAcum2025Running += a25; hasAlcance2025 = true; }

      if (d.getFullYear() === 2026) {
        series2026.push({
          fecha: fechaNorm,
          traficoAcum: bestTraficoAcum != null ? Math.round(bestTraficoAcum) : null,
          alcanceAcum: bestAlcanceAcum != null ? Math.round(bestAlcanceAcum) : null,
          traficoAcum2025: hasTrafico2025 ? Math.round(traficoAcum2025Running) : null,
          alcanceAcum2025: hasAlcance2025 ? Math.round(alcanceAcum2025Running) : null,
        });
      }
    }

    series2026.sort((a, b) => (parseDateCL(a.fecha)?.getTime() ?? 0) - (parseDateCL(b.fecha)?.getTime() ?? 0));

    // El acumulado parte de 0 el 1 de enero — se agrega ese punto para que el
    // gráfico arranque desde ahí en vez de saltar directo al primer valor real.
    if (series2026.length > 0) {
      series2026.unshift({
        fecha: `1/1/${parseDateCL(series2026[0].fecha)?.getFullYear() ?? new Date().getFullYear()}`,
        traficoAcum: 0,
        alcanceAcum: 0,
        traficoAcum2025: 0,
        alcanceAcum2025: 0,
      });
    }

    if (!bestDate) return null;

    const daysToSunday = (7 - bestDate.getDay()) % 7;
    const sunday = new Date(bestDate);
    sunday.setDate(sunday.getDate() + daysToSunday);
    const fechaDomingo = `${sunday.getDate()}/${sunday.getMonth() + 1}/${sunday.getFullYear()}`;

    const ri = (v: number | null) => v != null ? Math.round(v) : null;
    return {
      fecha:           bestFecha,
      fechaDomingo,
      trafico:         ri(bestTrafico),
      trafico2025:     ri(bestTrafico2025),
      traficoAcum2026: ri(bestTraficoAcum),
      alcance:         ri(bestAlcance),
      alcance2025:     ri(bestAlcance2025),
      alcanceAcum2026: ri(bestAlcanceAcum),
      adquisicion:     ri(bestAdquisicion),
      adopcion:        bestAdopcion,
      series2026,
    };
  } catch (err) {
    console.warn("[fetchMetricas] No se pudo leer la pestaña Metricas.", err);
    return null;
  }
}


export function clearAllCache() {
  aggregateCache = null;
  detailCache.clear();
}

export type HitoData = {
  titulo: string;
  trafico: number | null;
  registros: number | null;
  mostrar: boolean;
};

export async function fetchHito(): Promise<HitoData | null> {
  try {
    const sheets = sheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: getSheetId(),
      range: "Hito!B1:B4",
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const vals = res.data.values ?? [];
    const cell = (row: number) => vals[row]?.[0];
    const mostrarRaw = s(cell(3)).trim().toLowerCase();
    if (mostrarRaw !== "sí" && mostrarRaw !== "si") return null;
    return {
      titulo:    s(cell(0)),
      trafico:   parseNumberOrNull(cell(1)),
      registros: parseNumberOrNull(cell(2)),
      mostrar:   true,
    };
  } catch (err) {
    console.warn("[fetchHito] No se pudo leer la pestaña Hito.", err);
    return null;
  }
}

// ─── Evaluación semanal de socios ────────────────────────────────────────────

const EVAL_SOCIO_TABS = [
  "Defontana",
  "OTIC CChC",
  "Multigremial Nacional",
  "Blue Express",
  "Walmart",
  "BCI",
  "Microsoft",
  "FACEA UC",
];

let evalCache: { data: EvalSemana[]; expiresAt: number } | null = null;
const EVAL_CACHE_TTL_MS = 5 * 60 * 1000;

function getEvalSheetId() {
  const id = process.env.EVAL_SHEET_ID;
  if (!id) throw new Error("Falta EVAL_SHEET_ID.");
  return id;
}

/**
 * Lee todas las hojas de evaluación semanal por socio y devuelve las filas
 * con datos (semana, fecha, puntaje, semáforo, observación).
 * Sólo incluye semanas donde el puntaje ya fue ingresado.
 */
export async function fetchEvaluaciones(force = false): Promise<EvalSemana[]> {
  const now = Date.now();
  if (!force && evalCache && now < evalCache.expiresAt) return evalCache.data;

  const spreadsheetId = getEvalSheetId();
  const client = sheetsClient();

  // Una petición batchGet para todas las hojas
  const ranges = EVAL_SOCIO_TABS.map((tab) => `'${tab}'!A4:M200`);
  const res = await client.spreadsheets.values.batchGet({ spreadsheetId, ranges });

  const result: EvalSemana[] = [];
  for (let i = 0; i < EVAL_SOCIO_TABS.length; i++) {
    const socio = EVAL_SOCIO_TABS[i];
    const rows = res.data.valueRanges?.[i]?.values ?? [];
    // índice 0 → headers (row 4 del sheet), índice 1 → ponderaciones, índice 2+ → datos
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r];
      const semana = s(row[0]);
      const fecha = s(row[1]);
      const puntaje = s(row[10]);
      const semaforo = s(row[11]);
      const observacion = s(row[12]);
      if (!semana || !puntaje) continue; // semana sin datos aún
      result.push({ socio, semana, fecha, puntaje, semaforo, observacion });
    }
  }

  evalCache = { data: result, expiresAt: now + EVAL_CACHE_TTL_MS };
  return result;
}
