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

export type Estado = "En curso" | "Pendiente" | "Terminado" | "No aplica" | "";

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
};

/** Entrada del log de status (hoja "Status" del Sheet principal). */
export type StatusEntry = {
  status: string;
  fecha: string;
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
};

/** Solución entregada por un partner (KPIs_PYMEs_Partners). */
export type PartnerSummary = PymeKpis & {
  partner: string;
  solucion: string;
  slug: string;
  statusHistory: StatusEntry[];
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
};
