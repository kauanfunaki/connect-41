"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CADASTROS_LAST_TAB_KEY, type CadastrosTab } from "@/lib/cadastrosNav";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getLastTabSnapshot(): CadastrosTab {
  const stored = window.localStorage.getItem(CADASTROS_LAST_TAB_KEY);
  return stored === "pessoas" ? "pessoas" : "empresas";
}

function getLastTabServerSnapshot(): CadastrosTab {
  return "empresas";
}

type NavItemProps = {
  href: string;
  icon: React.ReactNode;
  label: string;
};

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavItem({ href, icon, label }: NavItemProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[14px] font-medium transition-colors ${
        active ? "text-brand" : "text-fg-secondary hover:text-fg"
      }`}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-brand" />}
      <span className={`flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${active ? "text-brand" : ""}`}>{icon}</span>
      {label}
    </Link>
  );
}

type CadastrosNavItemProps = {
  icon: React.ReactNode;
  label: string;
};

// Item único da sidebar para as áreas de Empresas e Pessoas (agrupadas em
// "Cadastros"). Fica ativo em qualquer rota /empresas/* ou /pessoas/*, e leva
// para a última aba visitada (persistida via CadastrosTabSync), com Empresas
// como padrão na ausência dessa informação.
export function CadastrosNavItem({ icon, label }: CadastrosNavItemProps) {
  const pathname = usePathname();
  const lastTab = useSyncExternalStore(subscribeToStorage, getLastTabSnapshot, getLastTabServerSnapshot);

  const active = isActivePath(pathname, "/empresas") || isActivePath(pathname, "/pessoas");
  const href = `/${lastTab}`;

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[14px] font-medium transition-colors ${
        active ? "text-brand" : "text-fg-secondary hover:text-fg"
      }`}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-brand" />}
      <span className={`flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${active ? "text-brand" : ""}`}>{icon}</span>
      {label}
    </Link>
  );
}

type SectorNavItemProps = {
  href: string;
  label: string;
  color: string;
  icon?: React.ReactNode;
};

export function SectorNavItem({ href, label, color, icon }: SectorNavItemProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[13px] transition-colors ${
        active ? "text-brand font-medium" : "text-fg-secondary hover:text-fg"
      }`}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-brand" />}
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {icon && <span className={`flex-shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px] ${active ? "text-brand" : ""}`}>{icon}</span>}
      {label}
    </Link>
  );
}
