"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; matchExact?: boolean }[] = [
  { href: "/dashboard", label: "Resumen", matchExact: true },
  { href: "/dashboard/socios", label: "Socios" },
  { href: "/dashboard/partners", label: "Partners" },
];

const USERS_TAB: { href: string; label: string; matchExact?: boolean } = {
  href: "/dashboard/usuarios",
  label: "Usuarios",
};

const FUNNELS_TAB: { href: string; label: string; matchExact?: boolean } = {
  href: "/dashboard/funnels",
  label: "Funnels",
};

export function NavTabs({
  visible = true,
  canManageUsers = false,
  canEditPartnerRole = false,
  canViewFunnels = false,
}: {
  visible?: boolean;
  /** Muestra la pestaña "Usuarios" — para la allowlist de gestión o cualquier FE. */
  canManageUsers?: boolean;
  canEditPartnerRole?: boolean;
  /** Muestra la pestaña "Funnels" — allowlist puntual, no todo admin. */
  canViewFunnels?: boolean;
}) {
  const pathname = usePathname();
  if (!visible) return null;
  let tabs = TABS;
  if (canViewFunnels) tabs = [...tabs, FUNNELS_TAB];
  if (canManageUsers || canEditPartnerRole) tabs = [...tabs, USERS_TAB];
  return (
    <nav className="flex items-center gap-1 border-b border-gray-200">
      {tabs.map((t) => {
        const active = t.matchExact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
