"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProvedorDaAtualizacao } from "@/components/shared/NavegacaoSemRecarregar";
import { CircleHelp, CircleUserRound, LogOut, Menu, X } from "lucide-react";
import { NavItem, classeDoItem } from "@/components/shell/NavLink";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { iconeDaTela } from "@/components/portal/iconeDaTela";
import { GRUPO_DA_SECAO, grupoDoCaminho, menuDoPortal, telasVisiveis, type TelaDoPortal } from "@/lib/portal/telas";
import { oQueOContadorDiz, type ContadoresDoMenu, type TelaComContador } from "@/lib/portal/contadoresDoMenu";
import { sairDoPortal } from "@/app/(portal)/portal/login/actions";
import { SugestaoDoPortal } from "./SugestaoDoPortal";
import { PularParaOConteudo } from "@/components/shared/PularParaOConteudo";

// A partir de lg a lateral é coluna fixa; abaixo, gaveta. No servidor vale
// "tela grande": a gaveta só fica inerte depois da hidratação, no celular. O
// mesmo critério do `AppShell`.
const TELA_GRANDE = "(min-width: 1024px)";
function assinarTela(aviso: () => void) {
  const mq = window.matchMedia(TELA_GRANDE);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}
const lerTela = () => window.matchMedia(TELA_GRANDE).matches;
const lerTelaNoServidor = () => true;

const ID_DO_ABRIR_MENU = "abrir-menu-do-portal";

/**
 * A moldura do portal: sidebar com as telas, no lugar das abas no topo.
 *
 * Pedido do Kauan em 18/09: dez abas em cima de cada tela poluíam — e empurravam
 * o conteúdo para baixo, mais ainda no celular, onde quebravam em três linhas.
 * Mesmo desenho da sidebar do Connect (240px, drawer abaixo de `lg`), com o
 * nome do acesso no topo (a empresa, ou a primeira e quantas mais — era o
 * nome do Cliente até 14/10/2026) e o sair no rodapé.
 */
export function PortalShell({
  grupoNome,
  modulos,
  bloqueadas = [],
  logo = null,
  sugestao = false,
  contadores = {},
  children,
}: {
  grupoNome: string | null;
  /** Códigos dos módulos ligados no tenant — decide quais telas aparecem. */
  modulos: string[];
  /** As telas que o escritório ainda não liberou (14/10/2026) — saem do menu. */
  bloqueadas?: string[];
  /** O logo do escritório no lugar do logo do Connect (Aparência do portal, 21/10/2026). */
  logo?: { src: string; nome: string } | null;
  /** O botão "Sugestão ou problema" no rodapé (21/10/2026) — com as solicitações ligadas. */
  sugestao?: boolean;
  /** Quantas coisas esperam o cliente nas telas que pedem ação (11/11/2026, P09). */
  contadores?: ContadoresDoMenu;
  children: React.ReactNode;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  // O grupo da tela aberta (21/10/2026): o traço do título, o brilho e o
  // cartão do número pegam a cor dele (ver `[data-grupo]` no globals.css).
  const grupoDaTela = grupoDoCaminho(usePathname());
  const menu = menuDoPortal(telasVisiveis(new Set(modulos), new Set(bloqueadas)));
  // A gaveta fechada (abaixo de lg) só saía da tela com translate: os links
  // seguiam no Tab e no leitor de tela (TalkBack, VoiceOver). `inert` tira os
  // dois; Esc fecha. Junto com o AppShell (07/10/2026), para os dois não
  // divergirem.
  const telaGrande = useSyncExternalStore(assinarTela, lerTela, lerTelaNoServidor);
  const gavetaFechada = !telaGrande && !menuAberto;
  // Com a gaveta aberta no celular, o resto da tela fica inerte (11/11/2026,
  // P28): o Tab e o leitor de tela não escapam para o conteúdo atrás do véu.
  const gavetaPorCima = !telaGrande && menuAberto;

  function fecharMenu() {
    setMenuAberto(false);
    setConfirmandoSaida(false);
  }

  useEffect(() => {
    if (!menuAberto) return;
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setMenuAberto(false);
      setConfirmandoSaida(false);
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [menuAberto]);

  // O foco acompanha a gaveta (11/11/2026, P28): ao abrir, vai ao primeiro
  // item do menu — antes ficava no botão escondido atrás do véu; ao fechar,
  // volta ao "Abrir menu", de onde a pessoa saiu. Só no celular: no
  // computador a coluna é fixa e não abre nem fecha.
  const estavaAberto = useRef(false);
  useEffect(() => {
    if (telaGrande) return;
    if (menuAberto) {
      document.querySelector<HTMLElement>("#menu-do-portal nav a")?.focus();
    } else if (estavaAberto.current) {
      document.getElementById(ID_DO_ABRIR_MENU)?.focus();
    }
    estavaAberto.current = menuAberto;
  }, [menuAberto, telaGrande]);

  return (
    // `h-dvh`, e não `h-screen` (07/10/2026): no navegador do celular 100vh é
    // maior que a área visível, e o fim da tela ficava atrás da barra dele.
    <div className="flex h-dvh overflow-hidden bg-canvas" data-grupo={grupoDaTela ?? undefined}>
      <PularParaOConteudo />
      {menuAberto && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={fecharMenu} aria-hidden="true" />
      )}

      <aside
        id="menu-do-portal"
        inert={gavetaFechada}
        className={`w-[240px] flex-shrink-0 flex flex-col border-r border-border bg-sidebar-bg fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          menuAberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-center h-14 px-5 border-b border-border flex-shrink-0 relative">
          {/* O logo leva ao Início, como no Connect desde 05/10 — e o Início
              segue no menu: para o cliente, o item escrito é o caminho óbvio. */}
          <Link
            href="/portal"
            onClick={fecharMenu}
            aria-label="Ir para o Início"
            className="inline-flex min-w-0 max-w-[184px] items-center rounded-md px-2 py-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {logo ? (
              // O logo do escritório (21/10/2026), com o nome ao lado: o envio
              // corta a imagem em quadrado (a mesma do workspace), e um quadrado
              // de 32px sozinho não diz de quem é. Igual nos dois temas — é a
              // imagem que ele mandou, sem versão clara e escura.
              <span className="flex min-w-0 items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.src} alt="" className="size-8 flex-shrink-0 rounded-md object-contain" />
                <span className="truncate font-display text-card-title font-semibold text-fg">{logo.nome}</span>
              </span>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo-horizontal-light.svg" alt="" className="block dark:hidden h-8 w-auto object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo-horizontal-dark.svg" alt="" className="hidden dark:block h-8 w-auto object-contain" />
              </>
            )}
          </Link>
          {/* Botão de ícone com caixa de 32px: o X sozinho era um alvo de 18px,
              e é no celular que este botão existe. O posicionamento fica num
              span: o IconButton já é `relative`, e `absolute` nele dependeria da
              ordem do CSS para vencer. */}
          <span className="flex lg:hidden absolute right-2 top-1/2 -translate-y-1/2">
            <IconButton onClick={fecharMenu} aria-label="Fechar menu">
              <X size={18} />
            </IconButton>
          </span>
        </div>

        <div className="px-5 py-3 border-b border-border flex-shrink-0">
          <p className="c41-rotulo">Portal do cliente</p>
          <p className="text-ui font-medium text-fg truncate mt-0.5" title={grupoNome ?? undefined}>
            {grupoNome ?? "Suas empresas"}
          </p>
        </div>

        <nav
          onClick={fecharMenu}
          className="scroll-y scroll-gutter-stable flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
          aria-label="Portal"
        >
          {/* O Início, e logo abaixo o que pede ação do cliente (11/11/2026,
              P10 — ficava no fim, em "Com a equipe"), com o número do que
              espera por ele (P09). Exato só o Início: "/portal" é o começo de
              todas as outras, e acenderia junto. */}
          {menu.topo.map((i) => (
            <ItemDoMenu key={i.href} tela={i} contadores={contadores} />
          ))}
          {menu.secoes.map(({ secao, telas }) => (
            // Fragmento, e não <div>: os itens ficam filhos diretos do <nav> e
            // ganham o mesmo `space-y-0.5` do resto — dentro da div eles
            // encostavam um no outro, como na sidebar do Connect não acontece.
            <Fragment key={secao}>
              {/* O pontinho na cor do grupo da seção (21/10/2026), como o do
                  setor no `Painel` da Home. */}
              <p data-grupo={GRUPO_DA_SECAO[secao]} className="flex items-center gap-1.5 px-2.5 pt-4 pb-1.5 c41-rotulo">
                <span aria-hidden className="size-1.5 flex-shrink-0 rounded-full bg-grupo" />
                {secao}
              </p>
              {telas.map((i) => (
                <ItemDoMenu key={i.href} tela={i} contadores={contadores} />
              ))}
            </Fragment>
          ))}
        </nav>

        {/* Ajuda no rodapé, junto do sair: vale para qualquer tela, e no menu
            de telas ela se misturaria com o trabalho. "Minha conta" (senha,
            empresas e tema) entra acima das duas pelo mesmo motivo — escolha
            do Kauan na página de decisões, 08/10/2026. */}
        <div className="border-t border-border px-3 py-3 flex-shrink-0">
          <div className="space-y-0.5" onClick={fecharMenu}>
            <NavItem href="/portal/conta" icon={<CircleUserRound />} label="Minha conta" />
            <NavItem href="/portal/ajuda" icon={<CircleHelp />} label="Ajuda" />
            {sugestao && <SugestaoDoPortal />}
          </div>
          {/* O "Sair" separado por um fio e com confirmação (11/11/2026, P39):
              encostado em Minha conta e Ajuda, um toque torto no celular
              tirava a pessoa do portal — e com "lembrar de mim", ela nem
              lembrava a senha. A confirmação é aqui mesmo, no lugar do botão. */}
          <div className="mt-2 border-t border-border pt-2">
            <SairDoPortal confirmando={confirmandoSaida} onConfirmar={setConfirmandoSaida} />
          </div>
        </div>
      </aside>

      <div inert={gavetaPorCima} className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Só no celular: é onde mora o botão do menu. No desktop a sidebar já
            está à vista, e uma barra vazia no topo só roubaria altura. */}
        <header className="lg:hidden h-14 flex-shrink-0 flex items-center gap-2 border-b border-border bg-topbar-bg px-4">
          {/* 40px de alvo, como o menu da equipe (07/10/2026; eram 38px),
              puxado para a borda para o ícone seguir alinhado ao conteúdo. Diz
              se a gaveta está aberta e qual ela é. */}
          <IconButton
            id={ID_DO_ABRIR_MENU}
            size="xl"
            className="-ml-2.5"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            aria-expanded={menuAberto}
            aria-controls="menu-do-portal"
          >
            <Menu size={20} />
          </IconButton>
          <span className="text-fs-4 font-medium text-fg truncate">{grupoNome ?? "Portal do cliente"}</span>
        </header>
        {/* O `relative` faz do <main> o bloco de contenção dos elementos com
          `position: absolute` da página (o campo de arquivo escondido com
          `sr-only`, por exemplo). Sem ele, o elemento escapava da rolagem de
          dentro e esticava a página: no detalhe do processo do portal, a tela
          inteira rolava e o casco subia junto (relato do Kauan, 08/10/2026). */}
        <main
          id="conteudo"
          tabIndex={-1}
          className="c41-atmosfera scroll-y scroll-gutter-stable relative flex-1 overflow-y-auto focus-visible:shadow-none"
        >
          <ProvedorDaAtualizacao>{children}</ProvedorDaAtualizacao>
        </main>
      </div>
    </div>
  );
}

/** Um item do menu, com o número do que espera o cliente quando a tela tem. */
function ItemDoMenu({ tela, contadores }: { tela: TelaDoPortal; contadores: ContadoresDoMenu }) {
  const n = contadores[tela.href as TelaComContador] ?? 0;
  return (
    <NavItem
      href={tela.href}
      icon={iconeDaTela(tela)}
      label={tela.rotulo}
      exact={tela.href === "/portal"}
      grupo={tela.grupo}
      contador={n}
      contadorDiz={n > 0 ? oQueOContadorDiz(tela.href, n) : undefined}
    />
  );
}

const ID_DO_SAIR = "sair-do-portal";
const ID_DO_CANCELAR_SAIDA = "cancelar-saida-do-portal";

/**
 * O "Sair" com confirmação no próprio lugar (11/11/2026, P39) — sem
 * `window.confirm`, que no app instalado abre uma caixa do sistema fora do
 * desenho. O foco vai ao "Cancelar" (o caminho seguro) e volta ao "Sair" se a
 * pessoa desistir; Esc também desiste, sem fechar a gaveta.
 */
function SairDoPortal({ confirmando, onConfirmar }: { confirmando: boolean; onConfirmar: (sim: boolean) => void }) {
  const estavaConfirmando = useRef(false);
  useEffect(() => {
    if (confirmando) document.getElementById(ID_DO_CANCELAR_SAIDA)?.focus();
    else if (estavaConfirmando.current) document.getElementById(ID_DO_SAIR)?.focus();
    estavaConfirmando.current = confirmando;
  }, [confirmando]);

  if (!confirmando) {
    return (
      <button
        id={ID_DO_SAIR}
        type="button"
        onClick={() => onConfirmar(true)}
        className={classeDoItem(false, "w-[calc(100%+0.75rem)] text-fs-4 font-medium")}
      >
        <LogOut size={16} className="flex-shrink-0" />
        Sair
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby="sair-do-portal-pergunta"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onConfirmar(false);
      }}
      className="rounded-lg border border-border bg-surface px-3 py-3"
    >
      <p id="sair-do-portal-pergunta" className="text-ui font-medium text-fg">
        Sair do portal?
      </p>
      <p className="mt-0.5 text-helper text-fg-muted">Para voltar, você entra de novo com seu e-mail e senha.</p>
      <div className="mt-3 flex gap-2">
        <Button id={ID_DO_CANCELAR_SAIDA} type="button" variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => onConfirmar(false)}>
          Cancelar
        </Button>
        <form action={sairDoPortal} className="flex flex-1">
          <BotaoDeSair />
        </form>
      </div>
    </div>
  );
}

function BotaoDeSair() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" loading={pending} loadingLabel="Saindo…" className="w-full justify-center">
      Sair
    </Button>
  );
}
