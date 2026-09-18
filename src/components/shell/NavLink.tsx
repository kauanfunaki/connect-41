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
  /**
   * Acende só na própria rota. Para o item cujo endereço é o começo de todos os
   * outros — a home do portal, `/portal`, acenderia em qualquer tela dele.
   */
  exact?: boolean;
};

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavItem({ href, icon, label, exact = false }: NavItemProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : isActivePath(pathname, href);

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

export type ItemDeModulo = { code: string; label: string; href: string };

/**
 * Um grupo de módulos na sidebar — uma linha que **leva** à tela do grupo.
 *
 * Era uma seção que abria e fechava dentro da sidebar, e o Kauan pediu o
 * contrário (17/09): clicar em "Contas" abre `/setor/bpo/grupo/contas`, com as
 * telas de contas e só elas. A sidebar fica com uma linha por grupo — seis no
 * BPO, no lugar de quinze itens — e nada nela muda de tamanho ao clicar.
 *
 * Fica aceso também quando a tela aberta é de um módulo do grupo: quem está em
 * `/pagar` vê "Contas" marcado, que é o que diz onde ele está.
 */
export function GrupoNavItem({
  label,
  href,
  icon,
  itens,
}: {
  label: string;
  href: string;
  icon: React.ReactNode;
  itens: ItemDeModulo[];
}) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href) || itens.some((i) => isActivePath(pathname, i.href));

  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[14px] font-medium transition-colors ${
        active ? "text-brand" : "text-fg-secondary hover:text-fg"
      }`}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-brand" />}
      <span className={`flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${active ? "text-brand" : ""}`}>{icon}</span>
      <span className="truncate">{label}</span>
      <span className={`ml-auto text-[11px] tabular-nums ${active ? "text-brand/70" : "text-fg-muted/70"}`}>
        {itens.length}
      </span>
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
