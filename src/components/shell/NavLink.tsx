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

/**
 * O desenho de todo item da sidebar. O item encosta na borda esquerda da
 * coluna (`-ml-3`) para a barra do ativo ficar colada nela; por isso o fundo
 * arredonda só à direita. Ativo: fundo de seleção, texto azul e a barra **na
 * cor do setor** — o fio que liga o menu ao traço do título da tela
 * (polimento de 30/09). Eram quatro cópias destas classes, uma por tipo de item.
 */
export function classeDoItem(active: boolean, extra = ""): string {
  return `relative flex items-center gap-2.5 py-2 pr-2.5 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-r-lg transition-colors ${
    active ? "text-brand bg-selected-bg" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"
  } ${extra}`.trim();
}

function BarraAtiva() {
  return <span aria-hidden className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--c41-setor)]" />;
}

export function NavItem({ href, icon, label, exact = false }: NavItemProps) {
  const pathname = usePathname();
  const active = exact ? pathname === href : isActivePath(pathname, href);

  return (
    <Link
      href={href}
      className={classeDoItem(active, "text-[14px] font-medium")}
    >
      {active && <BarraAtiva />}
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
      className={classeDoItem(active, "text-[14px] font-medium")}
    >
      {active && <BarraAtiva />}
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
      className={classeDoItem(active, "text-[14px] font-medium")}
    >
      {active && <BarraAtiva />}
      <span className={`flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${active ? "text-brand" : ""}`}>{icon}</span>
      {label}
    </Link>
  );
}

type SectorNavItemProps = {
  label: string;
  color: string;
  icon?: React.ReactNode;
  /** Troca o ambiente para o setor (ver `trocarSetor` no ContextSwitcher). */
  onEntrar: () => void;
};

/**
 * Um setor na lista de "Todos os setores". Desde 30/09 o clique **entra no
 * ambiente do setor** (a sidebar passa a ser a dele), em vez de abrir o hub
 * `/setor/{code}` dentro do modo geral — pedido do Kauan: listar as telas de
 * todos os setores juntas, para quem tem acesso a todos, poluía demais.
 */
export function SectorNavItem({ label, color, icon, onEntrar }: SectorNavItemProps) {
  return (
    <button type="button" onClick={onEntrar} className={classeDoItem(false, "w-[calc(100%+0.75rem)] text-[13px]")}>
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {icon && <span className="flex-shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px]">{icon}</span>}
      {label}
    </button>
  );
}
