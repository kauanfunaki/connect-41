"use client";

import { Fragment, useState } from "react";
import { CircleHelp, LogOut, Menu, X } from "lucide-react";
import { NavItem, classeDoItem } from "@/components/shell/NavLink";
import { IconButton } from "@/components/ui/IconButton";
import { iconeDaTela } from "@/components/portal/iconeDaTela";
import { SECOES_DO_PORTAL, telasVisiveis } from "@/lib/portal/telas";
import { sairDoPortal } from "@/app/(portal)/portal/login/actions";

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
  const visiveis = telasVisiveis(new Set(modulos));

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
          {/* Botão de ícone com caixa de 32px: o X sozinho era um alvo de 18px,
              e é no celular que este botão existe. O posicionamento fica num
              span: o IconButton já é `relative`, e `absolute` nele dependeria da
              ordem do CSS para vencer. */}
          <span className="flex lg:hidden absolute right-2 top-1/2 -translate-y-1/2">
            <IconButton onClick={() => setMenuAberto(false)} aria-label="Fechar menu">
              <X size={18} />
            </IconButton>
          </span>
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
              <NavItem key={i.href} href={i.href} icon={iconeDaTela(i)} label={i.rotulo} exact />
            ))}
          {SECOES_DO_PORTAL.map((secao) => {
            const itens = visiveis.filter((i) => i.secao === secao);
            if (itens.length === 0) return null;
            // Fragmento, e não <div>: os itens ficam filhos diretos do <nav> e
            // ganham o mesmo `space-y-0.5` do resto — dentro da div eles
            // encostavam um no outro, como na sidebar do Connect não acontece.
            return (
              <Fragment key={secao}>
                <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{secao}</p>
                {itens.map((i) => (
                  <NavItem key={i.href} href={i.href} icon={iconeDaTela(i)} label={i.rotulo} />
                ))}
              </Fragment>
            );
          })}
        </nav>

        {/* Ajuda no rodapé, junto do sair: vale para qualquer tela, e no menu
            de telas ela se misturaria com o trabalho. */}
        <div className="border-t border-border px-3 py-3 flex-shrink-0 space-y-0.5" onClick={() => setMenuAberto(false)}>
          <NavItem href="/portal/ajuda" icon={<CircleHelp />} label="Ajuda" />
          <form action={sairDoPortal}>
            <button
              type="submit"
              className={classeDoItem(false, "w-[calc(100%+0.75rem)] text-[14px] font-medium")}
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
        <header className="lg:hidden h-14 flex-shrink-0 flex items-center gap-2 border-b border-border bg-topbar-bg px-4">
          {/* 38px de alvo (o controle de topbar do IconButton), puxado para a
              borda para o ícone seguir alinhado ao conteúdo. */}
          <IconButton size="lg" className="-ml-2.5" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </IconButton>
          <span className="text-[14px] font-medium text-fg truncate">{grupoNome ?? "Portal do cliente"}</span>
        </header>
        <main className="c41-atmosfera scroll-y scroll-gutter-stable flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
