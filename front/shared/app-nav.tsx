"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GearSix,
  PlusCircle,
  Queue,
} from "@phosphor-icons/react/dist/ssr";

type NavItem = {
  href: string;
  label: string;
  icon: typeof GearSix;
  match: (path: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Minhas filas",
    icon: Queue,
    match: (path) => path === "/dashboard" || path.startsWith("/projects/"),
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
    match: (path) => path.includes("settings"),
  },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Navegação principal">
      <ul className="app-nav-list">
        {navItems.map((item) => {
          const active = item.match(pathname);
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
