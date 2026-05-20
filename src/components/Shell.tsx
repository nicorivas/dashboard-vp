import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import { RefreshButton } from "./RefreshButton";
import { NavTabs } from "./NavTabs";
import { canManageUsers } from "@/lib/admin-users";
import type { ResolvedUser } from "@/lib/types";

export function Shell({
  user,
  email,
  fetchedAt,
  children,
}: {
  user: ResolvedUser;
  email: string | null;
  fetchedAt?: number | null;
  children: React.ReactNode;
}) {
  const roleColor =
    user.role === "admin"
      ? "bg-violet-50 text-violet-700 ring-violet-600/20"
      : "bg-emerald-50 text-emerald-700 ring-emerald-600/20";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                FE Consulting
              </p>
              <h1 className="text-base font-semibold text-gray-900">Programa Valor Pyme · BCI 2026</h1>
            </Link>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${roleColor}`}
            >
              {user.label}
              {user.subLabel ? ` · ${user.subLabel}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <RefreshButton fetchedAt={fetchedAt ?? null} />
            <span className="hidden text-xs text-gray-600 sm:inline">{email}</span>
            <SignOutButton />
          </div>
        </div>
        {user.role === "admin" && (
          <div className="mx-auto max-w-7xl px-6">
            <NavTabs canManageUsers={canManageUsers(email)} />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
