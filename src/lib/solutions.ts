import type { EtapaName } from "./types";

/**
 * Lista canónica de socios. Las claves de los aliases sirven para hacer match
 * con valores que aparecen en el Sheet (caja insensible) — algunas pestañas
 * usan formas cortas (EAUC) y otras la canónica (EAUC – PUC).
 */
export const PARTNERS = [
  { name: "BCI", aliases: [] as string[] },
  { name: "Walmart", aliases: [] },
  { name: "Blue Express", aliases: [] },
  { name: "Defontana", aliases: [] },
  { name: "Microsoft", aliases: [] },
  { name: "OTIC CChC", aliases: [] },
  { name: "FACEA UC", aliases: ["EAUC", "EAUC – PUC", "EAUC - PUC", "EAUC-PUC", "FACEA – UC", "FACEA-UC"] },
  { name: "Multigremial Nacional", aliases: ["MGN"] },
  { name: "Abastible", aliases: [] },
] as const;

export function canonicalPartner(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const p of PARTNERS) {
    if (p.name.toLowerCase() === n) return p.name;
    if (p.aliases.some((a) => a.toLowerCase() === n)) return p.name;
  }
  // fallback: startsWith para casos sutiles ("EAUC – PUC" vs "EAUC")
  for (const p of PARTNERS) {
    if (p.name.toLowerCase().startsWith(n) || n.startsWith(p.name.toLowerCase())) {
      return p.name;
    }
  }
  return null;
}

/**
 * Mapa de solución → pestaña Det_X. Los nombres de solución se normalizan
 * (lowercase, sin tildes, colapsando espacios) para tolerar pequeñas
 * diferencias entre la pestaña Gantt, el Consolidado y el Det.
 */
const SOLUTION_TO_TAB_RAW: Array<[partner: string, solution: string, tab: string]> = [
  ["BCI", "Cuenta Digital", "Det_BCI_CtaDigital"],
  ["BCI", "Modelo Nace Emprendimiento", "Det_BCI_Nace"],
  ["BCI", "Banca Nace", "Det_BCI_Nace"],
  ["Walmart", "Marketplace", "Det_Walmart_Marketplace"],
  ["Blue Express", "Cupón descuento despacho", "Det_BlueEx_Cupon"],
  ["Defontana", "Contabilidad Gratuita / ERP", "Det_Defontana_ERP"],
  ["Defontana", "Defontana Digital", "Det_Defontana_Digital"],
  ["Microsoft", "Elevate", "Det_MSFT_Elevate"],
  ["Microsoft", "Agente Copilot", "Det_MSFT_Copilot"],
  ["Microsoft", "Ciberseguridad", "Det_MSFT_Ciber"],
  ["OTIC CChC", "Ruta Inclusión financiera", "Det_OTIC_Inclusion"],
  ["OTIC CChC", "Programa inclusión financiera", "Det_OTIC_Inclusion"],
  ["OTIC CChC", "Academia Pyme", "Det_OTIC_Academia"],
  ["OTIC CChC", "Programa de Desarrollo de Proveedores", "Det_OTIC_Proveedores"],
  ["OTIC CChC", "Programa proveedores por Chile", "Det_OTIC_Proveedores"],
  ["FACEA UC", "Pyme UC", "Det_FACEA UC_PymeUC"],
  ["Multigremial Nacional", "Academia Emprendedores", "Det_MGN_AcadEmpren"],
  ["Multigremial Nacional", "Academia de Emprendedores", "Det_MGN_AcadEmpren"],
  ["Multigremial Nacional", "Ferias y Encuentros Empresariales", "Det_MGN_Ferias"],
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function findDetTab(partner: string, solucion: string): string | null {
  const canonical = canonicalPartner(partner) ?? partner;
  const np = normalize(canonical);
  const ns = normalize(solucion);
  for (const [p, sol, tab] of SOLUTION_TO_TAB_RAW) {
    if (normalize(p) !== np) continue;
    const tn = normalize(sol);
    if (tn === ns) return tab;
    if (tn.startsWith(ns) || ns.startsWith(tn)) return tab;
  }
  // Fallback: match by significant words (>2 chars) to tolerate stop words like "de"
  const nsWords = new Set(ns.split(" ").filter((w) => w.length > 2));
  if (nsWords.size > 0) {
    for (const [p, sol, tab] of SOLUTION_TO_TAB_RAW) {
      if (normalize(p) !== np) continue;
      const tnWords = new Set(normalize(sol).split(" ").filter((w) => w.length > 2));
      if (tnWords.size === 0) continue;
      const matches = [...nsWords].filter((w) => tnWords.has(w)).length;
      if (matches === nsWords.size || matches === tnWords.size) return tab;
    }
  }
  return null;
}

export function findSolutionByTab(tab: string): { partner: string; solucion: string } | null {
  const hit = SOLUTION_TO_TAB_RAW.find(([, , t]) => t === tab);
  if (!hit) return null;
  return { partner: hit[0], solucion: hit[1] };
}

export function findSolutionBySlug(slug: string): { partner: string; solucion: string; tab: string } | null {
  for (const [partner, solucion, tab] of SOLUTION_TO_TAB_RAW) {
    if (slugify(`${partner}-${solucion}`) === slug) return { partner, solucion, tab };
  }
  return null;
}

export function solutionSlug(partner: string, solucion: string): string {
  return slugify(`${partner}-${solucion}`);
}

export const ETAPA_LABELS: Record<EtapaName, string> = {
  "1. Preparación": "Preparación",
  "2. Convocatoria": "Convocatoria",
  "3. Adopción": "Adopción",
  "4. Acompañamiento": "Acompañamiento",
  "5. Evaluación": "Evaluación",
};
