"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useSyncExternalStore } from "react";
import { CADASTROS_LAST_TAB_KEY, type CadastrosTab } from "@/lib/cadastrosNav";
import { caminhoDoMenuAtivo as isActivePath } from "@/lib/caminhoDoMenu";

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

// ─── A faixa de ícones (14/10/2026) ─────────────────────────────────────────
//
// O menu recolhido no computador deixou de sumir: vira uma faixa de 64px só
// com os ícones (desenho aprovado pelo Kauan em 14/10). Os itens são os
// mesmos componentes — quem diz como desenhar é este contexto, que o AppShell
// liga só de lg para cima (abaixo, a gaveta é sempre o menu inteiro).

const FaixaDoMenu = createContext(false);

/** Liga a faixa de ícones para os itens de dentro. */
export const ProvedorDaFaixa = FaixaDoMenu.Provider;

/** O item está na faixa de ícones (menu recolhido no computador)? */
export function useNaFaixa(): boolean {
  return useContext(FaixaDoMenu);
}

/**
 * O desenho de um item na faixa: só o ícone, num quadrado de 40px. O ativo é
 * o mesmo da coluna aberta — azul cheio, ícone branco — e a barra na cor do
 * setor fica na borda da faixa, onde fica na coluna (`-left-3`: o item começa
 * 12px para dentro).
 */
export function classeDoItemNaFaixa(active: boolean): string {
  return `relative flex items-center justify-center size-10 flex-shrink-0 rounded-lg transition-colors ${
    active ? "text-on-brand bg-brand-solid" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"
  }`;
}

/**
 * Os atributos do nome na faixa: o `aria-label` é o nome que o leitor de tela
 * lê (o texto não está mais à vista), e a dica do Connect mostra o mesmo nome à
 * direita do ícone — no mouse e no foco do teclado (ver DicaFlutuante).
 */
export function nomeNaFaixa(nome: string, dica = nome) {
  return { "aria-label": nome, "data-dica": dica, "data-dica-lado": "direita" } as const;
}

/**
 * O miolo do item na faixa. `comTelas`: o item tem telas dentro (Cadastros, os
 * grupos de um setor, o painel da Gestão) — um pontinho no canto avisa. A
 * lista dessas telas não aparece na faixa; o clique leva à tela principal.
 */
function IconeNaFaixa({ icon, active, comTelas = false }: { icon: React.ReactNode; active: boolean; comTelas?: boolean }) {
  return (
    <>
      {active && <span aria-hidden className="absolute -left-3 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--c41-setor)]" />}
      <span aria-hidden className="flex-shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]">
        {icon}
      </span>
      {comTelas && <span aria-hidden data-marca="telas" className="absolute top-[7px] right-[7px] size-1.5 rounded-full bg-current opacity-70" />}
    </>
  );
}

/**
 * O título de um bloco do menu (Geral, Fixadas, o setor, Meus Setores). Na
 * faixa vira um fio fino entre os blocos; o nome continua lá, só para o leitor
 * de tela. `primeiro`: o bloco que abre a lista não ganha fio em cima.
 */
export function TituloDoBloco({ nome, primeiro = false, children }: { nome: string; primeiro?: boolean; children: React.ReactNode }) {
  const naFaixa = useNaFaixa();
  if (!naFaixa) return <>{children}</>;
  return (
    <div data-separador className={primeiro ? undefined : "py-2"}>
      <p className="sr-only">{nome}</p>
      {!primeiro && <span aria-hidden className="block ml-2 w-6 h-px bg-border" />}
    </div>
  );
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
  /** Tem telas dentro (o painel ao lado) — na faixa, o pontinho no canto. */
  comTelas?: boolean;
  ativo?: boolean;
  menu?: { aberto: boolean; onClick: () => void; painelId: string };
};

/**
 * O desenho de todo item da sidebar. O item encosta na borda esquerda da
 * coluna (`-ml-3`) para a barra do ativo ficar colada nela; por isso o fundo
 * arredonda só à direita. Ativo: cheio de azul com letra e ícone brancos
 * (paleta B "Mais azul", 13/10/2026; antes era o fundo de seleção claro com
 * texto azul) e a barra **na cor do setor** — o fio que liga o menu ao traço
 * do título da tela (polimento de 30/09). Eram quatro cópias destas classes,
 * uma por tipo de item.
 */
export function classeDoItem(active: boolean, extra = ""): string {
  return `relative flex items-center gap-2.5 py-2 pr-2.5 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-r-lg transition-colors ${
    active ? "text-on-brand bg-brand-solid" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"
  } ${extra}`.trim();
}

function BarraAtiva() {
  return <span aria-hidden className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--c41-setor)]" />;
}

export function NavItem({ href, icon, label, exact = false, comTelas = false, ativo, menu }: NavItemProps) {
  const pathname = usePathname();
  const naFaixa = useNaFaixa();
  const active = ativo ?? (exact ? pathname === href : isActivePath(pathname, href));

  const focarMenu = () => requestAnimationFrame(() => document.getElementById(menu!.painelId)?.querySelector<HTMLElement>("[role='menuitem']")?.focus());
  if (menu) return <button type="button" aria-label={naFaixa ? label : undefined} aria-haspopup="menu" aria-expanded={menu.aberto} aria-controls={menu.painelId} aria-current={active ? "true" : undefined} onClick={(e) => { menu.onClick(); if (!menu.aberto && e.detail === 0) focarMenu(); }} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); if (!menu.aberto) menu.onClick(); focarMenu(); } }} className={naFaixa ? classeDoItemNaFaixa(active) : classeDoItem(active, "w-[calc(100%+0.75rem)] text-label font-medium")}>
    {naFaixa ? <IconeNaFaixa icon={icon} active={active} comTelas /> : <>{active && <BarraAtiva />}<span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span><span>{label}</span><span aria-hidden className="ml-auto">›</span></>}
  </button>;

  if (naFaixa) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} {...nomeNaFaixa(label)} className={classeDoItemNaFaixa(active)}>
        <IconeNaFaixa icon={icon} active={active} comTelas={comTelas} />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={classeDoItem(active, "text-label font-medium")}
    >
      {active && <BarraAtiva />}
      <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
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
  const naFaixa = useNaFaixa();
  const active = isActivePath(pathname, href) || itens.some((i) => isActivePath(pathname, i.href));

  // Na faixa, a contagem vai para o nome: "Contas, 4 telas".
  if (naFaixa) {
    const telas = `${itens.length} ${itens.length === 1 ? "tela" : "telas"}`;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        {...nomeNaFaixa(`${label}, ${telas}`, `${label} · ${telas}`)}
        className={classeDoItemNaFaixa(active)}
      >
        <IconeNaFaixa icon={icon} active={active} comTelas />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={classeDoItem(active, "text-label font-medium")}
    >
      {active && <BarraAtiva />}
      <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      <span className="truncate">{label}</span>
      {/* Sem alfa (07/10/2026): o cinza a 70% dava 3,0:1 e os números quase sumiam. */}
      <span className={`ml-auto text-micro tabular-nums ${active ? "text-on-brand/80" : "text-fg-muted"}`}>
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
  const naFaixa = useNaFaixa();
  const lastTab = useSyncExternalStore(subscribeToStorage, getLastTabSnapshot, getLastTabServerSnapshot);

  const active = isActivePath(pathname, "/empresas") || isActivePath(pathname, "/pessoas");
  const href = `/${lastTab}`;

  if (naFaixa) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} {...nomeNaFaixa(label)} className={classeDoItemNaFaixa(active)}>
        <IconeNaFaixa icon={icon} active={active} comTelas />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={classeDoItem(active, "text-label font-medium")}
    >
      {active && <BarraAtiva />}
      <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
      {label}
    </Link>
  );
}

type SectorNavItemProps = {
  label: string;
  color: string;
  icon?: React.ReactNode;
  /** Troca o ambiente para o setor (ver `trocarSetor` em shell/contexto.ts). */
  onEntrar: () => void;
};

/**
 * Um setor na lista de "Todos os setores". Desde 30/09 o clique **entra no
 * ambiente do setor** (a sidebar passa a ser a dele), em vez de abrir o hub
 * `/setor/{code}` dentro do modo geral — pedido do Kauan: listar as telas de
 * todos os setores juntas, para quem tem acesso a todos, poluía demais.
 */
//
// Mesmo tamanho e peso dos outros itens da lista (07/10/2026): era 13px regular
// com ícone de 15px logo abaixo de "Início… Agenda" em 14px médio com 16px, e os
// setores pareciam menores e mais apagados sem motivo escrito.
export function SectorNavItem({ label, color, icon, onEntrar }: SectorNavItemProps) {
  const naFaixa = useNaFaixa();

  // Na faixa: o ícone do setor com a bolinha da cor dele no canto.
  if (naFaixa) {
    return (
      <button type="button" onClick={onEntrar} {...nomeNaFaixa(label)} className={classeDoItemNaFaixa(false)}>
        <IconeNaFaixa icon={icon ?? <span className="text-ui font-semibold">{label.charAt(0)}</span>} active={false} />
        <span aria-hidden data-marca="cor" className="absolute top-[7px] right-[7px] size-[7px] rounded-full" style={{ background: color }} />
      </button>
    );
  }

  return (
    <button type="button" onClick={onEntrar} className={classeDoItem(false, "w-[calc(100%+0.75rem)] text-label font-medium")}>
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {icon && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      {label}
    </button>
  );
}
