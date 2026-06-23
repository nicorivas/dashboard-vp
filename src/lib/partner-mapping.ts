import type { GanttRow, ResolvedUser, SolutionSummary } from "./types";
import { canonicalPartner } from "./solutions";

/**
 * Resolución email → rol + socio.
 *
 * - Administrador: equipo FE Consulting (@feconsulting.cl) + directores del
 *   proyecto BCI (@bci.cl). Ven todo.
 * - Empresa: el resto de los socios. Ven sólo sus soluciones.
 */

const FE_INTERNAL_DOMAINS = new Set(["feconsulting.cl"]);
const DIRECTOR_DOMAINS = new Set(["bci.cl"]);

const DOMAIN_TO_PARTNER: Record<string, string> = {
  "bci.cl": "BCI",
  "walmart.com": "Walmart",
  "walmartchile.cl": "Walmart",
  "blue.cl": "Blue Express",
  "blueexpress.cl": "Blue Express",
  "defontana.com": "Defontana",
  "microsoft.com": "Microsoft",
  "cchc.cl": "OTIC CChC",
  "oticcchc.cl": "OTIC CChC",
  "ccc.cl": "OTIC CChC",
  "uc.cl": "EAUC – PUC",
  "eclass.cl": "EAUC – PUC",
  "multigremial.cl": "Multigremial Nacional",
  "multigremialnacional.cl": "Multigremial Nacional",
  "abastible.cl": "Abastible",
};

const EMAIL_TO_PARTNER: Record<string, string> = {
  // Override explícito email → socio. Tiene precedencia sobre los dominios admin,
  // así puedes tener cuentas de prueba "como empresa" en dominios que normalmente
  // serían admin (ej. bci.cl).
  "prueba.bci@bci.cl": "BCI",
  "gonzalo.soto@bci.cl": "BCI",
};

export function resolveUser(
  email: string | null | undefined,
  appMeta?: Record<string, unknown> | null
): ResolvedUser | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const domain = normalized.split("@")[1] ?? "";

  // 0. Override guardado en app_metadata (establecido por admin desde gestión de usuarios).
  const metaOverride =
    typeof appMeta?.partner_override === "string" && appMeta.partner_override.length > 0
      ? appMeta.partner_override
      : null;
  if (metaOverride) {
    const canonical = canonicalPartner(metaOverride) ?? metaOverride;
    return { role: "partner", partner: canonical, label: "Empresa", subLabel: canonical };
  }

  // 1. Override explícito por email — siempre lo trato como empresa.
  if (EMAIL_TO_PARTNER[normalized]) {
    const canonical = canonicalPartner(EMAIL_TO_PARTNER[normalized]) ?? EMAIL_TO_PARTNER[normalized];
    return {
      role: "partner",
      partner: canonical,
      label: "Empresa",
      subLabel: canonical,
    };
  }

  // 2. Dominios administrativos (FE / directores BCI).
  if (FE_INTERNAL_DOMAINS.has(domain)) {
    return {
      role: "admin",
      partner: null,
      label: "Administrador",
      subLabel: "FE Consulting",
    };
  }
  if (DIRECTOR_DOMAINS.has(domain)) {
    const partner = canonicalPartner(DOMAIN_TO_PARTNER[domain]) ?? "BCI";
    return {
      role: "admin",
      partner,
      label: "Administrador",
      subLabel: `Director · ${partner}`,
    };
  }

  // 3. Resto: dominio → socio.
  const partnerName = DOMAIN_TO_PARTNER[domain];
  if (!partnerName) return null;
  const canonical = canonicalPartner(partnerName) ?? partnerName;
  return {
    role: "partner",
    partner: canonical,
    label: "Empresa",
    subLabel: canonical,
  };
}

export function filterGanttForUser(rows: GanttRow[], user: ResolvedUser): GanttRow[] {
  if (user.role !== "partner" || !user.partner) return rows;
  const target = user.partner.trim().toLowerCase();
  return rows.filter((r) => {
    const candidate = canonicalPartner(r.socio) ?? r.socio;
    return candidate.trim().toLowerCase() === target;
  });
}

export function filterSummariesForUser(
  summaries: SolutionSummary[],
  user: ResolvedUser
): SolutionSummary[] {
  if (user.role !== "partner" || !user.partner) return summaries;
  const target = user.partner.trim().toLowerCase();
  return summaries.filter((s) =>
    s.socio.trim().toLowerCase() === target ||
    s.actoresAdicionales.some((a) => a.trim().toLowerCase() === target)
  );
}
