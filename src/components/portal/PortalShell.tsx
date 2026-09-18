"use client";

import { useState } from "react";
import { ChartColumn, LogOut, Menu, X } from "lucide-react";
import { NavItem } from "@/components/shell/NavLink";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { Button } from "@/components/ui/Button";
import { sairDoPortal } from "@/app/(portal)/portal/login/actions";

type Item = {
  href: string;
  rotulo: string;
  /** O módulo que sustenta a tela; `null` = sempre visível. */
  modulo: string | null;
  icone: React.ReactNode;
  secao: "Financeiro" | "Com a equipe" | null;
};

// Cada tela aparece só se o módulo que a sustenta está ligado no tenant. O
// acervo fiscal não tem gate de módulo no portal desde que nasceu, e segue sem.
// Os ícones são os mesmos das telas equivalentes na sidebar do Connect.
const ITENS: Item[] = [
  { href: "/portal", rotulo: "Documentos fiscais", modulo: null, icone: <ModuleIcon code="fiscal_documentos" />, secao: null },
  { href: "/portal/dre", rotulo: "DRE", modulo: "bpo_dre", icone: <ModuleIcon code="bpo_dre" />, secao: "Financeiro" },
  { href: "/portal/fluxo-de-caixa", rotulo: "Fluxo de caixa", modulo: "bpo_fluxo_caixa", icone: <ModuleIcon code="bpo_fluxo_caixa" />, secao: "Financeiro" },
  { href: "/portal/relatorios", rotulo: "Relatório", modulo: "bpo_fluxo_caixa", icone: <ChartColumn size={16} />, secao: "Financeiro" },
  { href: "/portal/pagar", rotulo: "Contas a pagar", modulo: "bpo_contas_pagar", icone: <ModuleIcon code="bpo_contas_pagar" />, secao: "Financeiro" },
  { href: "/portal/receber", rotulo: "Contas a receber", modulo: "bpo_contas_receber", icone: <ModuleIcon code="bpo_contas_receber" />, secao: "Financeiro" },
  { href: "/portal/cobranca", rotulo: "Cobrança", modulo: "bpo_cobranca", icone: <ModuleIcon code="bpo_cobranca" />, secao: "Financeiro" },
  { href: "/portal/pendencias", rotulo: "Pendências", modulo: "bpo_pendencias", icone: <ModuleIcon code="bpo_pendencias" />, secao: "Com a equipe" },
  { href: "/portal/aprovacoes", rotulo: "Aprovações", modulo: "bpo_aprovacoes", icone: <ModuleIcon code="bpo_aprovacoes" />, secao: "Com a equipe" },
  { href: "/portal/comunicacao", rotulo: "Conversa", modulo: "bpo_comunicacao", icone: <ModuleIcon code="bpo_comunicacao" />, secao: "Com a equipe" },
];

const SECOES = ["Financeiro", "Com a equipe"] as const;

/**
 * A moldura do portal: sidebar com as telas, no lugar das abas no topo.
 *
 * Pedido do Kauan em 18/09: dez abas em cima de cada tela poluíam — e empurravam
 * o conteúdo para baixo, mais ainda no celular, onde quebravam em três linhas.
 * Mesmo desenho da sidebar do Connect (240px, drawer abaixo de `lg`), com o
 * nome do grupo do cliente no topo e o sair no rodapé.
 */
export function PortalShell({
  grupoNome,
  modulos,
  children,
}: {
  grupoNome: string | null;
  /** Códigos dos módulos ligados no tenant — decide quais telas aparecem. */
  modulos: string[];
  children: React.ReactNode;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const ligados = new Set(modulos);
  const visiveis = ITENS.filter((i) => i.modulo === null || ligados.has(i.modulo));

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {menuAberto && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenuAberto(false)} aria-hidden="true" />
      )}

      <aside
        className={`w-[240px] flex-shrink-0 flex flex-col border-r border-border bg-sidebar-bg fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          menuAberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-center h-14 px-5 border-b border-border flex-shrink-0 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-light.svg" alt="Connect" className="block dark:hidden h-8 w-auto object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-horizontal-dark.svg" alt="Connect" className="hidden dark:block h-8 w-auto object-contain" />
          <Button
            variant="linkMuted"
            className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </Button>
        </div>

        <div className="px-5 py-3 border-b border-border flex-shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Portal do cliente</p>
          <p className="text-[13px] font-medium text-fg truncate mt-0.5" title={grupoNome ?? undefined}>
            {grupoNome ?? "Suas empresas"}
          </p>
        </div>

        <nav
          onClick={() => setMenuAberto(false)}
          className="scroll-y scroll-gutter-stable flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
          aria-label="Portal"
        >
          {visiveis
            .filter((i) => i.secao === null)
            .map((i) => (
              // Exato: "/portal" é o começo de todas as outras, e acenderia junto.
              <NavItem key={i.href} href={i.href} icon={i.icone} label={i.rotulo} exact />
            ))}
          {SECOES.map((secao) => {
            const itens = visiveis.filter((i) => i.secao === secao);
            if (itens.length === 0) return null;
            return (
              <div key={secao}>
                <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{secao}</p>
                {itens.map((i) => (
                  <NavItem key={i.href} href={i.href} icon={i.icone} label={i.rotulo} />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-3 flex-shrink-0">
          <form action={sairDoPortal}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[14px] font-medium text-fg-secondary hover:text-fg transition-colors"
            >
              <LogOut size={16} className="flex-shrink-0" />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Só no celular: é onde mora o botão do menu. No desktop a sidebar já
            está à vista, e uma barra vazia no topo só roubaria altura. */}
        <header className="lg:hidden h-14 flex-shrink-0 flex items-center gap-3 border-b border-border bg-topbar-bg px-4">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="flex-shrink-0 text-fg-secondary hover:text-fg transition-colors"
          >
            <Menu size={20} />
          </button>
          <span className="text-[14px] font-medium text-fg truncate">{grupoNome ?? "Portal do cliente"}</span>
        </header>
        <main className="scroll-y scroll-gutter-stable flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
