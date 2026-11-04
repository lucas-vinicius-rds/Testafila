"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  GearSix,
  PlusCircle,
  Queue,
} from "@phosphor-icons/react/dist/ssr";

type NavItem = {
  href: string;
  label: string;
  icon: typeof GearSix;
  match: (path: string, settings: boolean) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Minhas filas",
    icon: Queue,
    match: (path, settings) => !settings && (path === "/dashboard" || (path.startsWith("/projects/") && path !== "/projects/new")),
  },
  {
    href: "/projects/new",
    label: "Criar nova fila",
    icon: PlusCircle,
    match: (path) => path === "/projects/new",
  },
  {
    href: "/dashboard?settings=1",
    label: "Configurações",
    icon: GearSix,
    match: (path, settings) => path === "/dashboard" && settings,
  },
];

export function AppNav() {
  const pathname = usePathname();
  const settings = useSearchParams().get("settings") === "1";

  return (
    <nav className="app-nav" aria-label="Navegação principal">
      <ul className="app-nav-list">
        {navItems.map((item) => {
          const active = item.match(pathname, settings);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`app-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={22} weight={active ? "bold" : "duotone"} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
