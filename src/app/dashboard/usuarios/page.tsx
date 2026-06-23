import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { UsuariosView } from "@/components/UsuariosView";
import { resolveUser } from "@/lib/partner-mapping";
import { canManageUsers, canEditPartnerRole, getSessionEmail } from "@/lib/admin-users";
import type { ResolvedUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const email = await getSessionEmail();
  if (!email) redirect("/login");

  const user = resolveUser(email);

  // La sección es visible para todo el equipo FE (canEditPartnerRole). Si el
  // email no pertenece a FE, mostramos la pantalla bloqueada dentro del Shell.
  if (!canEditPartnerRole(email)) {
    const fallbackUser: ResolvedUser =
      user ?? { role: "partner", partner: "—", label: "Empresa", subLabel: "—" };
    return (
      <Shell user={fallbackUser} email={email}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <h2 className="text-lg font-semibold">Sección restringida</h2>
          <p className="mt-2 text-sm">
            La gestión de usuarios está disponible sólo para administradores autorizados. Si
            necesitas crear cuentas, contacta a tu ejecutivo FE.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell user={user as ResolvedUser} email={email}>
      <UsuariosView canManageUsers={canManageUsers(email)} />
    </Shell>
  );
}
