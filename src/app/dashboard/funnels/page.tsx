import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canViewFunnels } from "@/lib/admin-users";
import {
  buildGeneralAcumuladoGroup,
  buildInscripcionFunnels,
  getConvocatoriaBlocks,
  getFunnelsPartners,
  getInscripcionByPartner,
} from "@/lib/funnels";
import { totalPymeAcum } from "@/lib/pyme-targets";
import { resolveUser } from "@/lib/partner-mapping";
import { fetchAggregate, fetchConvocatoriaBlocks, fetchMasterList, fetchMetricas } from "@/lib/sheets";
import type { ConvocatoriaBlock, InscripcionFunnel, TrafficGroup } from "@/lib/types";
import { Shell } from "@/components/Shell";
import { FunnelsView } from "@/components/FunnelsView";

export const dynamic = "force-dynamic";

export default async function DashboardFunnelsPage() {
  const bypass = process.env.BYPASS_AUTH === "1";
  let userEmail: string | null = null;
  let appMeta: Record<string, unknown> = {};
  if (bypass) {
    userEmail = process.env.BYPASS_USER || "valentina.galiano@feconsulting.cl";
  } else {
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) redirect("/login");
    userEmail = authUser.email ?? null;
    appMeta = (authUser.app_metadata ?? {}) as Record<string, unknown>;
  }

  // Sección restringida: sólo FE Consulting + la allowlist puntual de
  // admin-users.ts (defensa en profundidad además de ocultar el tab de nav).
  if (!canViewFunnels(userEmail)) redirect("/dashboard");

  const user = resolveUser(userEmail, appMeta);
  if (!user) redirect("/dashboard");

  // Universo real de nombres: la hoja maestra "Lista correcta de nombres"
  // (misma fuente que usan Socios/Partners) — más completa y siempre al día
  // que un listado fijo en código. Si falla la lectura, cae al listado
  // estático de solutions.ts para que la página no se rompa.
  let masterNames: string[] = [];
  try {
    const master = await fetchMasterList();
    masterNames = [...new Set(master.filter((r) => r.mostrar).map((r) => r.entity))].sort((a, b) =>
      a.localeCompare(b, "es")
    );
  } catch {
    masterNames = [];
  }

  // Convocatoria (Correo/Tráfico/Campaña) se lee en vivo del sheet
  // "Funnel_Convocatoria_Partners" — una pestaña por socio/partner. Si el
  // sheet no está disponible, `fetchConvocatoriaBlocks` ya devuelve []
  // (no rompe la página, esa sección simplemente no aparece).
  let convocatoriaBlocks: ConvocatoriaBlock[] = await fetchConvocatoriaBlocks();

  // Inscripción (Alcance → Adquisición) usa las métricas reales que ya
  // reportan los socios/partners — mismo fetch que Socios/Partners/Resumen.
  // El grupo "Acumulado 2026" de General reusa esos mismos totales (tráfico
  // + alcance + adquisición desde inicio de año a la fecha), igual que las
  // tarjetas de Resumen.
  let inscripcionFunnels: InscripcionFunnel[] = [];
  let generalAcumuladoGroup: TrafficGroup | null = null;
  try {
    const [{ summaries, partnerSummaries }, metricas] = await Promise.all([fetchAggregate(), fetchMetricas()]);
    inscripcionFunnels = buildInscripcionFunnels(summaries, partnerSummaries);
    const adquisicionAcum = totalPymeAcum([...summaries, ...partnerSummaries]).total;
    generalAcumuladoGroup = buildGeneralAcumuladoGroup(
      metricas?.traficoAcum2026 ?? null,
      metricas?.alcanceAcum2026 ?? null,
      adquisicionAcum
    );
  } catch {
    inscripcionFunnels = [];
  }

  if (generalAcumuladoGroup) {
    const acumuladoGroup = generalAcumuladoGroup;
    const idx = convocatoriaBlocks.findIndex((b) => b.partner === "General" && b.solucion === null);
    convocatoriaBlocks =
      idx >= 0
        ? convocatoriaBlocks.map((b, i) => (i === idx ? { ...b, grupos: [...b.grupos, acumuladoGroup] } : b))
        : [...convocatoriaBlocks, { partner: "General", anio: 2026, solucion: null, grupos: [acumuladoGroup] }];
  }

  const partners = getFunnelsPartners(masterNames, convocatoriaBlocks, inscripcionFunnels);
  const activePartners = partners.filter((p) => p.active).map((p) => p.name);
  const convocatoriaByPartner = Object.fromEntries(
    activePartners.map((name) => [name, getConvocatoriaBlocks(name, convocatoriaBlocks)])
  );
  const inscripcionByPartner = Object.fromEntries(
    activePartners.map((name) => [name, getInscripcionByPartner(name, inscripcionFunnels)])
  );

  return (
    <Shell user={user} email={userEmail}>
      <FunnelsView
        partners={partners}
        convocatoriaByPartner={convocatoriaByPartner}
        inscripcionByPartner={inscripcionByPartner}
      />
    </Shell>
  );
}
