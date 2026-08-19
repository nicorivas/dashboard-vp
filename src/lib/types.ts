export type EtapaName =
  | "1. Preparación"
  | "2. Convocatoria"
  | "3. Adopción"
  | "4. Acompañamiento"
  | "5. Evaluación";

export const ETAPAS: EtapaName[] = [
  "1. Preparación",
  "2. Convocatoria",
  "3. Adopción",
  "4. Acompañamiento",
  "5. Evaluación",
];

export type Estado = "En curso" | "Pendiente" | "Terminado" | "No aplica" | "No iniciado" | "";

/**
 * Roles del dashboard:
 *  - admin   = vista global. Incluye al equipo FE Consulting y a los directores
 *              del proyecto (BCI). Ven cartera completa, KPIs, comentarios
 *              internos.
 *  - partner = empresa socia, ve sólo sus soluciones. Sin KPIs globales,
 *              sin comentarios internos, sin proyección agregada.
 */
export type Role = "admin" | "partner";

export type ResolvedUser = {
  role: Role;
  partner: string | null; // null para FE; string para BCI (admin) y para socios.
  label: string;          // "Administrador" o "Empresa"
  subLabel?: string;      // "FE Consulting" / "Director · BCI" / nombre del socio
};

/** Fila plana del Gantt (tab 3): cobertura por etapa, sin tareas. */
export type GanttRow = {
  eje: string;
  socio: string;
  solucion: string;
  etapa: string;
  responsable: string;
  estado: string;
  semanas: string[];
};

/** Eje del programa Valor Pyme — orden canónico para visualización. */
export type Eje = "Capital" | "Mercado" | "Digitalización" | "Gestión y Talento" | "Comunidad";
export const EJES: Eje[] = ["Capital", "Mercado", "Digitalización", "Gestión y Talento", "Comunidad"];

/** Campos KPI compartidos por socios y partners. Provienen de las pestañas
 *  KPIs_PYMEs / KPIs_PYMEs_Partners (editables por el cliente). */
export type PymeKpis = {
  eje: string | null;
  pymeMeta: number | null;
  pymeUnit: string | null;            // "pymes" | "trabajadores" | "empresas" | …
  pymeSegmentos: string | null;
  pymeNotas: string | null;
  pymeSharedGroup: string | null;
  pymeFuente: string | null;
  /** Ingresos NUEVOS de cada mes (incremental, no acumulado), indexado por mes
   *  0..11. `null` si el mes no fue reportado. El cliente escribe el alta del
   *  mes en cada celda; el acumulado se calcula sumando. */
  pymeMonthly: (number | null)[];
  /** Acumulado a la fecha = suma de todos los meses reportados; `null` si nunca
   *  se reportó. */
  pymeAcum: number | null;
  /** Mes (0..11) del último reporte, o -1 si no hay. */
  pymeAcumMonth: number;
  /** true si la solución aparece en alguna respuesta del formulario "Reportes por mes". */
  pymeHasFormReport: boolean;
  /** Acumulado de PYMEs alcanzadas/contactadas (columna "alcanzadas" del
   *  formulario mensual) — sólo viene del formulario, la pestaña KPIs no
   *  tiene esta columna. `null` si nunca se reportó. */
  pymeAlcanceAcum: number | null;
};

/** Entrada del log de status (hoja "Status" del Sheet principal). */
export type StatusEntry = {
  status: string;
  fecha: string;
};

/** Fila de evaluación semanal de un socio (Sheet eval). */
export type EvalSemana = {
  socio: string;
  semana: string;    // "S22"
  fecha: string;     // "25-may-2026"
  puntaje: string;   // "3.2"
  semaforo: string;  // "VERDE" | "AMARILLO" | "ROJO"
  observacion: string;
};

/** Resumen ejecutivo por solución de socio (tab 4 + KPIs_PYMEs). */
export type SolutionSummary = PymeKpis & {
  socio: string;
  solucion: string;
  slug: string;
  detTab: string | null;
  etapas: { etapa: EtapaName; estado: Estado }[];
  avance: number; // 0..100
  proximoHito: string;
  fechaHito: string;
  comentarios: string;
  statusHistory: StatusEntry[]; // más reciente primero
  /** Actores adicionales (socios o partners) que también participan en esta solución. */
  actoresAdicionales: string[];
};

/** Solución entregada por un partner (KPIs_PYMEs_Partners). */
export type PartnerSummary = PymeKpis & {
  partner: string;
  solucion: string;
  slug: string;
  statusHistory: StatusEntry[];
  actoresAdicionales: string[];
};

/** Detalle por solución (tabs Det_*). */
export type SolutionDetail = {
  slug: string;
  socio: string;
  solucion: string;
  responsableFE: string;
  avance: number;
  weeks: string[];
  etapas: EtapaDetail[];
};

export type EtapaDetail = {
  etapa: string;
  responsable: string;
  estado: Estado;
  semanas: string[];
  tareas: Tarea[];
};

export type Tarea = {
  nombre: string;
  responsable: string;
  estado: Estado;
  inicio: string;
  fin: string;
  comentarios: string;
};

/** Una etapa (columna del sheet) dentro de un funnel de convocatoria o
 *  inscripción. `nota` es una definición/explicación opcional que se
 *  muestra en el tooltip (ej. qué significa "Alcance"). */
export type FunnelStage = {
  label: string;
  value: number;
  nota?: string;
};

/** Funnel de la sección "Inscripción": alcance → adquisición de una
 *  solución. Sin año ni canal — es un funnel único y continuo por solución. */
export type InscripcionFunnel = {
  id: string;
  partner: string;
  solucion: string;
  etapas: FunnelStage[];
};

/** Una columna/métrica de una tabla de Convocatoria (ej. "Envío correo",
 *  "Suscripciones*"). `isRate` = es una tasa (0..1), no una magnitud — se
 *  muestra en la tabla pero no se usa como etapa del funnel. `nota` es la
 *  definición a mostrar en tooltip (ej. el placeholder de Suscripciones*). */
export type MetricColumn = {
  label: string;
  isRate?: boolean;
  nota?: string;
};

/** Valor de una celda: la cifra + una tendencia opcional (AR/AB del sheet →
 *  flecha verde arriba / roja abajo). */
export type MetricCell = {
  value: number;
  trend?: "up" | "down";
};

/** Una fila de la tabla: un "tipo de fuente" (Correo, Tráfico orgánico,
 *  Paid search...) con sus valores, alineados 1:1 con `TrafficGroup.columnas`.
 *  `nota` es la definición a mostrar en tooltip (ej. qué es "Paid search"). */
export type TrafficFuenteRow = {
  fuente: string;
  nota?: string;
  valores: MetricCell[];
};

/** Un cuadro de la sección Convocatoria: una o más filas (tipos de fuente)
 *  que comparten exactamente las mismas columnas — por eso van en una sola
 *  tabla, con un funnel al lado construido sumando sus filas. */
export type TrafficGroup = {
  id: string;
  /** Encabezado del cuadro y del funnel al lado, ej. "Correo", "Tráfico",
   *  "Campaña adicional". */
  titulo: string;
  /** true = mostrar sólo el funnel, sin la tabla al lado (ej. "Acumulado
   *  2026" de General: son cifras ya resumidas, la tabla no agrega nada). */
  soloFunnel?: boolean;
  columnas: MetricColumn[];
  filas: TrafficFuenteRow[];
};

/** Todos los cuadros de Convocatoria de un socio/partner (o "General",
 *  `solucion: null`) para un año determinado. */
export type ConvocatoriaBlock = {
  partner: string;
  anio: number;
  solucion: string | null;
  grupos: TrafficGroup[];
};

/** Definiciones de tooltip reutilizadas tanto al armar los datos reales
 *  (`sheets.ts`) como los funnels de Inscripción (`funnels.ts`) — viven
 *  acá, neutrales, para que ninguno de los dos módulos dependa del otro. */
export const ALCANCE_DEFINICION =
  "Número de pymes que han sido alcanzadas, contactadas o que han manifestado interés en la solución durante el mes.";
export const ADQUISICION_DEFINICION = "Número de pymes que han adquirido la solución a través de Valor Pyme.";
export const SUSCRIPCIONES_DEFINICION = "Nuevos registros en Valor Pyme (no considera re-registros).";
export const TRAFICO_ORGANICO_DEFINICION =
  "Todas las fuentes que generan visitas en la cual no hay inversión publicitaria y comparten los mismos KPI.";
export const PAID_SEARCH_DEFINICION = "Son las búsquedas pagadas.";
export const PAID_SOCIAL_DEFINICION = "Son las interacciones en RRSS pagadas.";

/** Usuario de Supabase Auth tal como lo expone `/api/users` a la sección de
 *  gestión de usuarios (sólo para el admin autorizado). */
export type DashboardUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  /** Contraseña inicial guardada en `app_metadata`; `null` si nunca se guardó
   *  (usuarios creados antes de esta funcionalidad). */
  initialPassword: string | null;
  /** `true` si el usuario fue creado desde esta sección del dashboard. */
  createdFromDashboard: boolean;
  /** Rol/socio que `resolveUser` asigna a este email — para referencia visual. */
  resolvedLabel: string;
  /** Override de socio almacenado en `app_metadata.partner_override`. Tiene
   *  precedencia sobre la detección por dominio. `null` si no hay override. */
  partnerOverride: string | null;
};
