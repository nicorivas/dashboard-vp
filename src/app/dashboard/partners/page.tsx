import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAggregate } from "@/lib/sheets";
import { resolveUser } from "@/lib/partner-mapping";
import { Shell } from "@/components/Shell";
import { PartnersView } from "@/components/PartnersView";

export const dynamic = "force-dynamic";

export default async function DashboardPartnersPage() {
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
  if (user.role === "partner") redirect("/dashboard");

  let partnerSummaries: Awaited<ReturnType<typeof fetchAggregate>>["partnerSummaries"] = [];
  let fetchedAt = 0;
  let errorMsg: string | null = null;

  try {
    const agg = await fetchAggregate();
    partnerSummaries = agg.partnerSummaries;
    fetchedAt = agg.fetchedAt;
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
      <PartnersView user={user} partnerSummaries={partnerSummaries} />
    </Shell>
  );
}
