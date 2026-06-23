import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAggregate, fetchEvaluaciones } from "@/lib/sheets";
import { resolveUser, filterSummariesForUser } from "@/lib/partner-mapping";
import { Shell } from "@/components/Shell";
import { SociosView } from "@/components/SociosView";

export const dynamic = "force-dynamic";

export default async function DashboardSociosPage() {
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
  if (!user) redirect("/dashboard");

  // Esta vista es solo para administradores. Las empresas vuelven a /dashboard.
  if (user.role === "partner") redirect("/dashboard");

  let summaries: ReturnType<typeof filterSummariesForUser> = [];
  let fetchedAt = 0;
  let errorMsg: string | null = null;
  let evalRows: Awaited<ReturnType<typeof fetchEvaluaciones>> = [];

  try {
    const [agg, ev] = await Promise.all([fetchAggregate(), fetchEvaluaciones()]);
    summaries = filterSummariesForUser(agg.summaries, user);
    fetchedAt = agg.fetchedAt;
    evalRows = ev;
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
      <SociosView user={user} summaries={summaries} evalRows={evalRows} />
    </Shell>
  );
}
