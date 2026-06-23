import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAggregate, fetchMetricas, fetchEvaluaciones } from "@/lib/sheets";
import { resolveUser, filterSummariesForUser } from "@/lib/partner-mapping";
import { totalPymeAcum } from "@/lib/pyme-targets";
import { Shell } from "@/components/Shell";
import { ResumenView } from "@/components/ResumenView";
import { SociosView } from "@/components/SociosView";
import type { ResolvedUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const user = resolveUser(userEmail, appMeta);
  if (!user) {
    return (
      <UnauthorizedShell email={userEmail}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <h2 className="text-lg font-semibold">Tu cuenta aún no está asociada a un socio</h2>
          <p className="mt-2 text-sm">
            Contacta a tu ejecutivo FE para vincular <strong>{userEmail}</strong> a un socio del programa.
          </p>
        </div>
      </UnauthorizedShell>
    );
  }

  let summaries: ReturnType<typeof filterSummariesForUser> = [];
  let partnerSummaries: Awaited<ReturnType<typeof fetchAggregate>>["partnerSummaries"] = [];
  let fetchedAt = 0;
  let errorMsg: string | null = null;
  let metricas: Awaited<ReturnType<typeof fetchMetricas>> = null;
  let evalRows: Awaited<ReturnType<typeof fetchEvaluaciones>> = [];
  let grandAcum = 0;

  try {
    const [agg, met, ev] = await Promise.all([fetchAggregate(), fetchMetricas(), fetchEvaluaciones()]);
    summaries = filterSummariesForUser(agg.summaries, user);
    partnerSummaries = agg.partnerSummaries;
    fetchedAt = agg.fetchedAt;
    metricas = met;
    evalRows = ev;
    grandAcum = totalPymeAcum([...agg.summaries, ...agg.partnerSummaries]).total;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Error leyendo el Sheet";
  }

  return (
    <Shell user={user} email={userEmail} fetchedAt={fetchedAt}>
      {errorMsg && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">No pudimos cargar los datos del Sheet</p>
          <p className="mt-1">{errorMsg}</p>
        </div>
      )}

      {/* Admin: Resumen agregado. Partner: vista de sus soluciones (filtradas). */}
      {user.role === "admin" ? (
        <ResumenView user={user} summaries={summaries} partnerSummaries={partnerSummaries} metricas={metricas} evalRows={evalRows} />
      ) : (
        <SociosView user={user} summaries={summaries} evalRows={evalRows} metricas={metricas} grandAcum={grandAcum} />
      )}
    </Shell>
  );
}

function UnauthorizedShell({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  const fakeUser: ResolvedUser = {
    role: "partner",
    partner: "—",
    label: "Empresa",
    subLabel: "—",
  };
  return (
    <Shell user={fakeUser} email={email}>
      {children}
    </Shell>
  );
}
