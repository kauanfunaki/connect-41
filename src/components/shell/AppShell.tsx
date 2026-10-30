"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import {
  ChevronRight,
  Home,
  ContactRound,
  Columns3,
  ArrowRightLeft,
  CalendarDays,
  FolderOpen,
  Inbox,
  Settings,
  Calculator,
  ReceiptText,
  UserRoundCog,
  FileSignature,
  FolderKanban,
  WalletCards,
  BriefcaseBusiness,
  UserSearch,
  ClipboardList,
  ShieldCheck,
  LayoutGrid,
  Bot,
  Globe,
  AppWindow,
  FolderGit2,
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  X,
  Building2,
  Users,
  Truck,
  GitBranch,
} from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import {
  NavItem,
  SectorNavItem,
  CadastrosNavItem,
  GrupoNavItem,
  ProvedorDaFaixa,
  TituloDoBloco,
  nomeNaFaixa,
} from "@/components/shell/NavLink";
import { ModuleIcon, Icone } from "@/components/shared/ModuleIcon";
import { RegistroDeTelasRecentes } from "@/components/shell/TelasRecentes";
import { agruparModulos, slugDoGrupo, ICONE_DO_GRUPO, getModuleDef } from "@/lib/module-catalog";
import { quadrosAtivo } from "@/lib/caminhoDoMenu";
import { CAMINHO_DOS_FORNECEDORES } from "@/lib/cadastrosNav";
import type { TelaNavegavel } from "@/lib/buscaDeTelas";
import { trocarSetor } from "@/components/shell/contexto";
import {
  cookieDoMenuLateral,
  DURACAO_DA_TRANSICAO_MS,
  estadoDaLateral,
  LARGURA_DA_COLUNA,
  LARGURA_DA_FAIXA,
  SO_NA_COLUNA,
  SO_NA_GAVETA,
  TELA_GRANDE,
} from "@/lib/menuLateral";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { PainelDoItem, type TelaDoPainel } from "@/components/shell/PainelDoItem";
import { ABAS_DA_GESTAO } from "@/components/gestao/AbasDaGestao";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { IconButton } from "@/components/ui/IconButton";
import { TrocaDeContexto } from "@/components/shell/TrocaDeContexto";
import { chaveDoCaminho, type ParDeCaminho } from "@/lib/ajuda/caminho";
import { BotaoDeAjuda } from "@/components/shell/BotaoDeAjuda";
import { TODAS_AS_TELAS_DO_GERAL, type TelaDoGeral } from "@/lib/menuGeral";
import { grupoContabil } from "@/lib/contabil/navegacao";
import { areaSpedAtiva, menuSped, MODULOS_SPED } from "@/lib/fiscal/menu-sped";
import { agruparPorCor, areaDoGrupoDeTelas, areaDoModulo, grupoDaTelaDaEquipe } from "@/lib/aparencia/gruposDaEquipe";
import { GRUPOS } from "@/lib/aparencia/cores";
import { useNumeroConferido } from "./useNumeroConferido";
import { contarSolicitacoesNovas } from "@/app/(app)/solicitacoes/actions";

type Tenant = { id: string; name: string; logoUrl: string | null };
type Sector = { code: string; label: string; color: string };
type SectorModule = { code: string; label: string; href: string };

// Ícone linear por setor (identidade visual; cor do setor continua vindo do dot).
const SECTOR_ICONS: Record<string, React.ReactNode> = {
  tech: <Columns3 size={16} />,
  dp: <UserRoundCog size={16} />,
  recrutamento: <UserSearch size={16} />,
  societario: <FileSignature size={16} />,
  financeiro: <WalletCards size={16} />,
  fiscal: <ReceiptText size={16} />,
  contabil: <Calculator size={16} />,
  bpo: <ClipboardList size={16} />,
  comercial: <BriefcaseBusiness size={16} />,
  corretora: <ShieldCheck size={16} />,
  gestao: <LayoutGrid size={16} />,
  controladoria: <ClipboardCheck size={16} />,
};

// O que o painel ao lado da sidebar mostra para os itens que têm telas dentro
// (pedido de 30/09, referência do HubStrom).
const TELAS_DE_CADASTROS: TelaDoPainel[] = [
  { label: "Empresas", href: "/empresas", icon: <Building2 /> },
  { label: "Pessoas", href: "/pessoas", icon: <Users /> },
];
// Só entra no painel de quem vê o BPO (21/10/2026): a mesma regra do Ctrl+K,
// que já traz a tela só para quem a abre (ver `telasDeCadastros`).
const TELA_DOS_FORNECEDORES: TelaDoPainel = { label: "Fornecedores e sacados", href: CAMINHO_DOS_FORNECEDORES, icon: <Truck /> };
const TELAS_DA_GESTAO: TelaDoPainel[] = ABAS_DA_GESTAO.map((a) => ({ label: a.rotulo, href: a.href, icon: a.icone }));

/**
 * As telas que a pessoa fixou, logo acima das telas do setor.
 *
 * Fica nesta posição nos dois modos (dentro de um setor ou em "Todos os
 * setores"): é atalho para tela de setor, então mora colado nelas, sem empurrar
 * Início e Geral para baixo. Ninguém tem fixadas no começo — a seção só existe
 * depois que a pessoa fixa a primeira, no alfinete do cartão da tela.
 */
function TelasFixadas({ telas }: { telas: TelaNavegavel[] }) {
  if (telas.length === 0) return null;
  return (
    <>
      <TituloDoBloco nome="Fixadas">
        <p className="c41-rotulo flex items-center gap-1.5 px-2.5 pt-4 pb-1.5">
          <Pin size={11} className="flex-shrink-0" />
          Fixadas
        </p>
      </TituloDoBloco>
      {telas.map((t) => (
        <NavItem key={t.code} href={t.href} exact={t.href === "/fiscal"} icon={<ModuleIcon code={t.code} />} label={t.label} area={areaDoModulo(t.code) ?? "marca"} />
      ))}
    </>
  );
}

// A partir de lg a lateral é coluna fixa; abaixo, gaveta. No servidor vale
// "tela grande": a gaveta só fica inerte depois da hidratação, no celular.
function assinarTela(aviso: () => void) {
  const mq = window.matchMedia(TELA_GRANDE);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}
const lerTela = () => window.matchMedia(TELA_GRANDE).matches;
const lerTelaNoServidor = () => true;

type Props = {
  tenantId: string;
  accessibleTenants: Tenant[];
  sectors: Sector[];
  // Subworkspace: quando há setor ativo, a sidebar é a DELE — identidade no
  // topo e os módulos daquele setor. `null` = "Todos os setores", e aí o menu
  // é o de sempre (navegação global + lista de setores).
  //
  // Acrescentar um modo em vez de substituir a interface é o que deixa o
  // caminho de volta pronto: se o modo setorial der problema, o antigo
  // continua ali.
  activeSector: Sector | null;
  activeSectorModules: SectorModule[];
  /** Tudo que a pessoa pode abrir, de qualquer setor — alimenta o Ctrl+K. */
  telasNavegaveis: TelaNavegavel[];
  /** As telas que ela fixou, na ordem dela, já filtradas pelo que pode abrir. */
  telasFixadas: TelaNavegavel[];
  // Config de runtime do endereço por setor — vem do layout, não de env no
  // cliente (ver contexto.ts).
  appDomain: string | null;
  sectorHostSuffix: string;
  canOpenAdmin: boolean;
  unreadCount: number;
  /** O módulo das solicitações do portal está ligado — mostra "Solicitações" no Geral. */
  solicitacoesLigadas?: boolean;
  /** Quantas solicitações novas esperam a pessoa — o número no item, conferido a cada minuto. */
  solicitacoesNovas?: number;
  /** Os Arquivos estão ligados — mostra "Arquivos" no Geral. */
  arquivosLigados?: boolean;
  /**
   * Mostra "Chamados" no Geral. Falso também no setor que atende os chamados:
   * lá a tela vem em `activeSectorModules` (ver `chamadosNoMenuDoSetor`).
   */
  chamadosLigados?: boolean;
  /**
   * As telas do Geral que o setor (ou os setores da pessoa, em "Todos os
   * setores") não escondeu — ver `src/lib/menuGeral.ts`. Sem a prop, todas.
   * Solicitações e Arquivos ainda dependem do módulo ligado, acima.
   */
  telasDoGeral?: readonly TelaDoGeral[];
  profileName: string;
  profileRoleLabel: string;
  profilePhotoUrl: string | null;
  subscriptionReadOnly?: boolean;
  canSelfRegularizeSubscription?: boolean;
  /** Que artigo da ajuda explica cada tela — o "?" do topo abre o da tela aberta. */
  paresDeAjuda?: readonly ParDeCaminho[];
  /**
   * O menu lateral começa recolhido (na faixa de ícones) no computador — a
   * escolha guardada no cookie.
   */
  menuRecolhidoInicial?: boolean;
  /**
   * A faixa da empresa em foco (21/10/2026), montada no layout: fica parada
   * entre o topo e a rolagem, nas telas do BPO (`FaixaDoFoco`).
   */
  faixaDoFoco?: React.ReactNode;
  children: React.ReactNode;
};

// Estrutura visual da aplicação (sidebar + topbar) — puramente apresentacional,
// sem acesso a banco. Quem busca os dados (auth, prisma) é o layout real
// (src/app/(app)/layout.tsx), que passa tudo pronto via props.
export function AppShell({
  tenantId,
  accessibleTenants,
  sectors,
  activeSector,
  activeSectorModules,
  telasNavegaveis,
  telasFixadas,
  appDomain,
  sectorHostSuffix,
  canOpenAdmin,
  unreadCount,
  solicitacoesLigadas = false,
  solicitacoesNovas = 0,
  arquivosLigados = false,
  chamadosLigados = false,
  telasDoGeral = TODAS_AS_TELAS_DO_GERAL,
  profileName,
  profileRoleLabel,
  profilePhotoUrl,
  subscriptionReadOnly = false,
  canSelfRegularizeSubscription = false,
  paresDeAjuda = [],
  menuRecolhidoInicial = false,
  faixaDoFoco,
  children,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // O menu lateral recolhido no computador (08/10/2026): o botão à esquerda da
  // troca de setor recolhe a lateral e devolve. A escolha fica num cookie que
  // o layout lê, para a página já nascer do jeito que ficou. Desde 14/10,
  // recolhida ela vira a faixa de ícones, em vez de sair da tela.
  const [menuRecolhido, setMenuRecolhido] = useState(menuRecolhidoInicial);
  // Enquanto a largura anda (200ms), a lateral corta o que passa da borda: ao
  // abrir, o menu inteiro já está desenhado nos 240px e vai aparecendo da
  // esquerda para a direita, sem os nomes quebrarem de linha no caminho. Fora
  // da transição não corta nada — o painel da busca passa da borda.
  const [animando, setAnimando] = useState(false);
  const timerDaTransicao = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timerDaTransicao.current), []);
  const alternarMenu = () => {
    const recolher = !menuRecolhido;
    document.cookie = cookieDoMenuLateral(recolher);
    setMenuRecolhido(recolher);
    // Com "reduzir movimento" a troca é seca (`motion-reduce:transition-none`).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setAnimando(true);
    clearTimeout(timerDaTransicao.current);
    timerDaTransicao.current = setTimeout(() => setAnimando(false), DURACAO_DA_TRANSICAO_MS + 40);
  };
  const [trocaAberta, setTrocaAberta] = useState(false);
  // Cabeçalho aberto (05/10): sem fundo nem borda, o brilho passa por trás dele.
  // A borda volta quando o conteúdo rola, para a tabela não sumir numa linha
  // invisível.
  const [rolou, setRolou] = useState(false);
  const pathname = usePathname(), params = useSearchParams();
  // Qual parte do Ops Center está aberta, pela mesma regra da página (OpsCenter).
  const visaoDoOps = pathname !== "/ops" ? null : params.get("view") ?? (["watcher", "status", "date"].some(k => params.has(k)) || Number(params.get("page")) > 1 ? "history" : "automations");
  // O "?" de cada tela (02/10/2026): com artigo, abre o passo a passo dela e
  // guarda de onde veio para o "Voltar"; sem artigo, a central.
  const naAjuda = pathname.startsWith("/ajuda");
  const artigoDaTela = naAjuda ? null : chaveDoCaminho(pathname, paresDeAjuda);
  const linkDaAjuda = artigoDaTela ? `/ajuda/${encodeURIComponent(artigoDaTela)}?de=${encodeURIComponent(pathname)}` : "/ajuda";
  const emConfiguracoes = pathname.startsWith("/admin") || pathname.startsWith("/configuracoes") || pathname.startsWith("/assinatura");
  // O número do item Solicitações (21/10/2026), conferido a cada minuto.
  const novasSolicitacoes = useNumeroConferido(solicitacoesNovas, contarSolicitacoesNovas, solicitacoesLigadas && telasDoGeral.includes("solicitacoes"));
  const grupoDaTela = grupoDaTelaDaEquipe(pathname);
  const tenantAtual = accessibleTenants.find((t) => t.id === tenantId);
  const podeTrocar = sectors.length > 1 || accessibleTenants.length > 1;
  // A gaveta fechada (abaixo de lg) só saía da tela com translate: os links
  // seguiam no Tab e no leitor de tela. `inert` tira os dois; Esc fecha
  // (07/10/2026, junto com o PortalShell). A faixa de ícones fica no Tab: ela
  // é o menu (ver `estadoDaLateral`).
  const telaGrande = useSyncExternalStore(assinarTela, lerTela, lerTelaNoServidor);
  const { naFaixa, foraDoTab } = estadoDaLateral({ telaGrande, recolhido: menuRecolhido, gavetaAberta: mobileOpen });
  // Abrindo a partir da faixa: as linhas já com a largura final, cortadas pela
  // lateral enquanto ela cresce.
  const larguraFinal = animando && !naFaixa ? "min-w-[240px]" : "";

  // O Geral por setor (14/10/2026): o que o setor escondeu não entra. Início e
  // Meu dia ficam fora desta conta — aparecem sempre.
  const noGeral = (tela: TelaDoGeral) => telasDoGeral.includes(tela);
  const algumaNoGeral = [
    noGeral("espacos"),
    noGeral("cadastros"),
    noGeral("transferencias"),
    solicitacoesLigadas && noGeral("solicitacoes"),
    arquivosLigados && noGeral("arquivos"),
    chamadosLigados && noGeral("chamados"),
    noGeral("agenda"),
  ].some(Boolean);
  // Fornecedores e sacados é aba de Cadastros só para o BPO (21/10/2026). As
  // telas navegáveis já vêm filtradas pelo setor e pelo módulo ligado.
  const telasDeCadastros = telasNavegaveis.some((t) => t.code === "bpo_cadastros") ? [...TELAS_DE_CADASTROS, TELA_DOS_FORNECEDORES] : TELAS_DE_CADASTROS;
  // O mesmo trecho nos dois modos (dentro de um setor e em "Todos os setores").
  // O Geral com as cores juntas (28/10/2026): os azuis — sem área e Chamados —
  // e depois os de Clientes e atendimento. `quadros` é o item do setor ativo.
  const itensDoGeral = (quadros: React.ReactNode = null) => {
    const solicitacoes = areaDoModulo("portal_solicitacoes") ?? "marca";
    const chamados = areaDoModulo("helpdesk") ?? "marca";
    const arquivos = areaDoModulo("arquivos") ?? "marca";
    const itens: { chave: string; area: string; no: React.ReactNode }[] = [
      { chave: "quadros", area: "marca", no: quadros },
      {
        chave: "cadastros",
        area: "marca",
        no: noGeral("cadastros") && (
          <PainelDoItem titulo="Cadastros" telas={telasDeCadastros} area="marca" icone={<ContactRound />}>
            <CadastrosNavItem icon={<ContactRound size={16} />} label="Cadastros" />
          </PainelDoItem>
        ),
      },
      { chave: "transferencias", area: "marca", no: noGeral("transferencias") && <NavItem href="/transferencias" icon={<ArrowRightLeft size={16} />} label="Transferências" area="marca" /> },
      { chave: "solicitacoes", area: solicitacoes, no: solicitacoesLigadas && noGeral("solicitacoes") && <NavItem href="/solicitacoes" icon={<Inbox size={16} />} label="Solicitações" contador={novasSolicitacoes} area={solicitacoes} /> },
      { chave: "chamados", area: chamados, no: chamadosLigados && noGeral("chamados") && <NavItem href="/chamados" icon={<ModuleIcon code="helpdesk" />} label="Chamados" area={chamados} /> },
      { chave: "arquivos", area: arquivos, no: arquivosLigados && noGeral("arquivos") && <NavItem href="/arquivos" icon={<FolderOpen size={16} />} label="Arquivos" area={arquivos} /> },
      { chave: "agenda", area: "marca", no: noGeral("agenda") && <NavItem href="/agenda" icon={<CalendarDays size={16} />} label="Agenda" area="marca" /> },
    ];
    return agruparPorCor(itens.filter((i) => i.no), (i) => i.area).map((i) => <Fragment key={i.chave}>{i.no}</Fragment>);
  };
  useEffect(() => {
    if (!mobileOpen) return;
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setMobileOpen(false);
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [mobileOpen]);

  return (
    // `--c41-setor` é a cor da tela: a barra do item ativo, o traço do título,
    // o brilho da direita (globals.css). Desde 21/10/2026 ela vem do grupo da
    // tela aberta (`data-grupo`, financeiro em azul, notas em laranja — como no
    // portal), e não mais do setor: no BPO tudo ficava laranja. Fora dos
    // grupos, a cor principal. Desde 28/10/2026 os grupos são as áreas de uso
    // (Finanças, Pessoas…), cada item do menu leva a da tela dele, e a bolinha
    // na cor do setor saiu do menu e do cabeçalho (o ícone do setor ficou).
    // `h-dvh`, e não `h-screen` (07/10/2026): no navegador do celular 100vh é
    // maior que a área visível, e o pé da página ficava atrás da barra dele.
    <div
      className="flex h-dvh overflow-hidden bg-canvas"
      data-grupo={grupoDaTela ?? undefined}
    >
      {/* Backdrop — só em telas pequenas, quando a sidebar vira drawer sobreposto. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      {/* Abaixo de lg: fixa fora da tela (drawer), deslizando por cima do conteúdo.
          Em lg+: volta a ser a coluna estática de sempre (translate-x-0, static),
          com 240px aberta ou 64px na faixa de ícones (14/10/2026). */}
      {/* Os itens do menu sabem por este contexto se estão na faixa de ícones. */}
      <ProvedorDaFaixa value={naFaixa}>
        <aside
          id="menu-lateral"
          inert={foraDoTab}
          className={`${LARGURA_DA_COLUNA} ${naFaixa ? LARGURA_DA_FAIXA : ""} flex-shrink-0 flex flex-col border-r border-border bg-sidebar-bg fixed inset-y-0 left-0 z-50 transition-[translate,width] duration-200 ease-out motion-reduce:transition-none lg:static lg:translate-x-0 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          } ${animando ? "overflow-hidden" : ""}`}
        >
          {/* Logo — a mesma altura do cabeçalho (60px), para as duas linhas de baixo
              se encontrarem; eram 56px, e a logo ficava 4px acima do "41 Tech" (02/10/2026).
              Desde 05/10 o logo também leva ao Início. Em 06/10 o item "Início"
              voltou ao menu: clicar no logo para voltar ao começo é convenção de
              site, e nem todo mundo da equipe conhece — os dois caminhos ficam.
              O `aria-current` fica só no item do menu, para não marcar duas vezes. */}
          {/* Na faixa, o topo é a marca do Connect, que leva ao Início — o mesmo
              do logo da lateral aberta (Ajustes 15/10, G1). Era o setor ativo
              abrindo a troca de setor, que já tem o botão no cabeçalho, ao lado
              do recolher. À esquerda, como os ícones de baixo: nada desliza
              enquanto a lateral encolhe. */}
          {naFaixa ? (
            <div className="flex items-center h-[60px] px-3 border-b border-border flex-shrink-0">
              <Link
                href="/home"
                {...nomeNaFaixa("Ir para o Início", "Início")}
                className="flex items-center justify-center size-10 flex-shrink-0 rounded-lg transition-opacity hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/symbol-color.svg" alt="" className="block dark:hidden size-8 object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/symbol-color-dark-bg.svg" alt="" className="hidden dark:block size-8 object-contain" />
              </Link>
            </div>
          ) : (
            <div className={`flex items-center justify-center gap-2.5 h-[60px] px-5 border-b border-border flex-shrink-0 relative ${larguraFinal}`}>
              <Link
                href="/home"
                onClick={() => setMobileOpen(false)}
                aria-label="Ir para o Início"
                data-dica="Início"
                className="inline-flex items-center rounded-md px-2 py-1 transition-opacity hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/logo-horizontal-light.svg"
                  alt=""
                  className="block dark:hidden h-8 w-auto object-contain flex-shrink-0"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/logo-horizontal-dark.svg"
                  alt=""
                  className="hidden dark:block h-8 w-auto object-contain flex-shrink-0"
                />
              </Link>
              {/* Alvo de 40px (07/10/2026): o `Button linkMuted` tinha o tamanho do
                  ícone, 18px, abaixo do mínimo de toque. */}
              <IconButton
                size="xl"
                className={`${SO_NA_GAVETA} absolute right-2 top-1/2 -translate-y-1/2`}
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
              >
                <X size={18} />
              </IconButton>
            </div>
          )}

          {/* A busca no lugar do cartão de setor e escritório (02/10): trocar de
              setor ou de escritório foi para o menu do usuário. Abaixo de lg a
              lateral é gaveta, e a busca fica no topo. Na faixa, a busca é a
              lupa, que abre o mesmo campo ao lado (14/10/2026) — e o Ctrl+K
              continua sendo dela. */}
          <div className={`hidden lg:block px-3 pt-3 pb-1 ${larguraFinal}`}>
            {naFaixa ? (
              <GlobalSearch key="icone" telas={telasNavegaveis} variante="icone" atalho={telaGrande} />
            ) : (
              <GlobalSearch key="lateral" telas={telasNavegaveis} variante="lateral" atalho={telaGrande} />
            )}
          </div>

          {/* Nav */}
          {/* `scroll-gutter-stable`: quando a lista passa da altura da tela, a barra
              de rolagem aparece, o content box encolhe 9px e tudo que é alinhado à
              direita (a contagem de cada grupo) salta de lugar. O comentário do
              globals.css evita o gutter em container estreito; aqui a troca vale:
              9px de faixa parada custam menos que o menu inteiro se mexendo. */}
          {/* Na faixa, sem barra de rolagem à vista (a roda do mouse e o Tab
              rolam): a barra comia a borda dos quadrados de 40px. */}
          <nav
            onClick={(e) => { if ((e.target as Element).closest("a")) setMobileOpen(false); }}
            className={`${
              naFaixa ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "scroll-y scroll-gutter-stable"
            } flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-0.5 ${larguraFinal}`}
          >
            {activeSector ? (
              <>
                {/* A ordem é a do uso: Início, o que serve a todos os setores, e por
                    último as telas deste setor. Geral no meio, e não no fim, porque
                    tarefa e transferência são o dia a dia de qualquer setor — no fim
                    da lista, num setor com quinze telas, ficavam abaixo da dobra.
                    O logo, no topo da barra, também leva ao Início (05/10).

                    A identidade do setor não é mais um rótulo solto no topo: ela
                    está no seletor acima (com a cor) e volta como título das telas
                    do setor, que é onde diz de quem são aqueles grupos. */}
                <NavItem href="/home" icon={<Home size={16} />} label="Início" area="marca" />
                <NavItem href="/tarefas" icon={<CalendarCheck size={16} />} label="Meu dia" area="marca" />

                {/* Transversais. NUNCA somem por causa do setor ativo: transferência
                    é setor↔setor por natureza, e cadastro é do tenant. Isolar os
                    dois mataria a razão de existir do Connect. Quadros entra aqui:
                    é a mesma tela em todo setor, e solto no topo parecia um módulo.
                    (Chamava-se "Espaços" até 14/10/2026; a chave segue `espacos`.)

                    30/09: Conversas foi para o setor Controladoria e Gestão para o
                    setor Gestão (pedido do Kauan: o Geral é só o que serve a
                    todos). "Meu dia" subiu para logo abaixo do Início — é a
                    primeira tela do expediente. */}
                {/* 14/10/2026: o setor ativo continua não escondendo nada sozinho;
                    quem esconde é o administrador, setor por setor
                    (Configurações › Setores) — o Recrutamento sem Solicitações e
                    Transferências, pedido do Kauan. É só o menu: o endereço da
                    tela continua abrindo. Sem nenhuma tela, o título também sai. */}
                {algumaNoGeral && (
                  <TituloDoBloco nome="Geral">
                    <p className="c41-rotulo px-2.5 pt-4 pb-1.5">
                      Geral
                    </p>
                  </TituloDoBloco>
                )}
                {itensDoGeral(
                  noGeral("espacos") && (
                    <NavItem
                      href={`/setor/${activeSector.code}`}
                      ativo={(p) => quadrosAtivo(p, activeSector.code)}
                      icon={<FolderKanban size={16} />}
                      label="Quadros"
                      area="marca"
                    />
                  )
                )}

                {/* Até 8 módulos, a sidebar lista as telas direto, cada uma com seu
                    ícone: o setor pequeno não ganha nada em esconder cinco itens
                    atrás de três grupos. Acima disso (o BPO tem quinze), a linha é
                    o **grupo**, e clicar nela abre a tela do setor filtrada por ele
                    — pedido do Kauan em 17/09, no lugar de abrir e fechar seções. */}
                <TelasFixadas telas={telasFixadas} />

                {/* O nome do setor leva a todas as telas dele (Ajustes 15/10, G10):
                    era só um rótulo com a bolinha, e a tela "Telas" do setor só
                    se achava pela trilha de um grupo. A seta diz que é caminho;
                    aceso quando a tela é a dele. O nome fica na cor do texto: a
                    do setor, em letra miúda, some no tema escuro.
                    28/10/2026: o ícone do setor no lugar da bolinha na cor dele
                    — com a cor da área de uso em cada item, a cor do setor ao
                    lado do nome era redundante (Kauan). */}
                {activeSectorModules.length > 0 && (
                  <TituloDoBloco nome={activeSector.label}>
                    <Link
                      href={`/setor/${activeSector.code}/telas`}
                      onClick={() => setMobileOpen(false)}
                      aria-current={pathname === `/setor/${activeSector.code}/telas` ? "page" : undefined}
                      data-dica={`Todas as telas de ${activeSector.label}`}
                      className="group c41-rotulo flex items-center gap-2 mt-3 mb-0.5 -mx-1 px-3.5 py-1.5 rounded-md hover:bg-surface-hover aria-[current=page]:bg-surface-hover transition-colors"
                    >
                      {SECTOR_ICONS[activeSector.code] && (
                        <span aria-hidden className="flex-shrink-0 text-fg-muted group-hover:text-fg [&>svg]:size-3.5">
                          {SECTOR_ICONS[activeSector.code]}
                        </span>
                      )}
                      <span className="truncate text-fg-secondary group-hover:text-fg">
                        {activeSector.label}
                      </span>
                      <ChevronRight size={12} aria-hidden className="ml-auto flex-shrink-0 text-fg-muted group-hover:text-fg" />
                    </Link>
                  </TituloDoBloco>
                )}
                {(() => {
                  const sped = menuSped(activeSectorModules);
                  const modulos = activeSectorModules.filter((m) => !MODULOS_SPED.has(m.code));
                  const itemSped = sped.laterais.length > 0 && <PainelDoItem titulo="SPED" area="fiscal" icone={<ReceiptText />} abrirPorClique telas={sped.laterais.map((item) => ({
                    label: item.label, href: (() => { const q = new URLSearchParams(); for (const campo of ["empresa", "competencia"]) { const valor = params.get(campo); if (valor) q.set(campo, valor); } return q.size ? `${item.href}?${q}` : item.href; })(), icon: <ModuleIcon code={item.modulo} />,
                    ativa: areaSpedAtiva(pathname) === item.area,
                  }))}>
                    {({ aberto, alternar, painelId }) => <NavItem href={sped.href ?? sped.laterais[0].href} icon={<ReceiptText size={16} />} label="SPED" comTelas ativo={!!areaSpedAtiva(pathname)} menu={{ aberto, onClick: alternar, painelId }} area="fiscal" />}
                  </PainelDoItem>;
                  const hrefContabil = (aba: string, secao: string) => {
                    const q = new URLSearchParams({ aba, secao, grupo: aba === "contribuicoes" ? "contribuicoes" : secao === "lancamentos" ? "lancamentos" : "depara" });
                    for (const campo of ["empresa", "mes"]) { const valor = params.get(campo); if (valor) q.set(campo, valor); }
                    return "/contabil/sped?" + q;
                  };
                  const noContabil = pathname === "/contabil/sped";
                  const grupoAtualContabil = grupoContabil({ aba: params.get("aba") ?? undefined, grupo: params.get("grupo") ?? undefined, secao: params.get("secao") ?? params.get("ver") ?? undefined });
                  const itemModulo = (m: SectorModule) => m.code === "contabil_sped" ? <PainelDoItem key={m.code} titulo="SPED" area={areaDoModulo(m.code) ?? "marca"} icone={<ModuleIcon code={m.code} />} abrirPorClique telas={[
                    { label: "De-para", href: hrefContabil("lancamentos", "regras"), icon: <ModuleIcon code={m.code} />, ativa: noContabil && grupoAtualContabil === "depara" },
                    { label: "Lançamentos", href: hrefContabil("lancamentos", "lancamentos"), icon: <ModuleIcon code={m.code} />, ativa: noContabil && grupoAtualContabil === "lancamentos" },
                    { label: "Gerar SPED Contribuições", href: hrefContabil("contribuicoes", "gerar"), icon: <ModuleIcon code={m.code} />, ativa: noContabil && grupoAtualContabil === "contribuicoes" },
                  ]}>
                    {({ aberto, alternar, painelId }) => <NavItem href={m.href} icon={<ModuleIcon code={m.code} />} label={m.label} comTelas ativo={noContabil} menu={{ aberto, onClick: alternar, painelId }} area={areaDoModulo(m.code) ?? "marca"} />}
                  </PainelDoItem> : m.code === "tech_github_contributions" ? <PainelDoItem key={m.code} titulo="GitHub" area={areaDoModulo(m.code) ?? "marca"} icone={<GitBranch />} abrirPorClique telas={[
                    { label: "Geral", href: "/github", icon: <LayoutGrid size={16} />, ativa: pathname === "/github" },
                    { label: "Desenvolvedores", href: "/github/desenvolvedores", icon: <Users size={16} />, ativa: pathname.startsWith("/github/desenvolvedores") },
                    { label: "Repositórios", href: "/github/repositorios", icon: <FolderGit2 size={16} />, ativa: pathname.startsWith("/github/repositorios") },
                  ]}>
                    {({ aberto, alternar, painelId }) => <NavItem href="/github" icon={<GitBranch size={16} />} label="GitHub" comTelas menu={{ aberto, onClick: alternar, painelId }} area={areaDoModulo(m.code) ?? "marca"} />}
                  </PainelDoItem> : m.code === "tech_ops_center" ? <PainelDoItem key={m.code} titulo="Ops Center" area={areaDoModulo(m.code) ?? "marca"} icone={<ModuleIcon code={m.code} />} abrirPorClique telas={[
                    // O que o Tech entregou (28/10/2026): a triagem dos chamados consulta
                    // Robôs, Sites e Apps. O Histórico fica dentro de Robôs.
                    { label: "Robôs", href: "/ops?view=automations", icon: <Bot size={16} />, ativa: visaoDoOps === "automations" || visaoDoOps === "history" },
                    { label: "Sites", href: "/ops?view=sites", icon: <Globe size={16} />, ativa: visaoDoOps === "sites" },
                    { label: "Apps", href: "/ops?view=apps", icon: <AppWindow size={16} />, ativa: visaoDoOps === "apps" },
                  ]}>
                    {({ aberto, alternar, painelId }) => <NavItem href="/ops" icon={<ModuleIcon code={m.code} />} label={m.label} comTelas menu={{ aberto, onClick: alternar, painelId }} area={areaDoModulo(m.code) ?? "marca"} />}
                  </PainelDoItem> : <NavItem key={m.code} href={m.href} exact={m.href === "/fiscal"} icon={<ModuleIcon code={m.code} />} label={m.label} area={areaDoModulo(m.code) ?? "marca"} />;
                  const diretos = modulos.filter((m) => getModuleDef(m.code)?.menuDireto);
                  const grupos = agruparModulos(modulos.filter((m) => !getModuleDef(m.code)?.menuDireto));
                  if (grupos.length <= 1 || modulos.length <= 8) {
                    // As cores juntas também nas telas do setor (28/10/2026).
                    return <>{itemSped}{agruparPorCor(modulos, (m) => areaDoModulo(m.code)).map((m) =>
                      // O painel da Gestão mostra as abas dele ao lado, como fazia
                      // quando era item do menu geral.
                      m.code === "gestao_painel" ? (
                        <PainelDoItem key={m.code} titulo={m.label} telas={TELAS_DA_GESTAO} area={areaDoModulo(m.code) ?? "marca"} icone={<ModuleIcon code={m.code} />}>
                          <NavItem href={m.href} icon={<ModuleIcon code={m.code} />} label={m.label} comTelas={TELAS_DA_GESTAO.length > 0} area={areaDoModulo(m.code) ?? "marca"} />
                        </PainelDoItem>
                      ) : (
                        itemModulo(m)
                      )
                    )}</>;
                  }
                  // A tela do grupo continua (é o clique); o painel ao lado mostra
                  // as telas dele sem precisar abri-la.
                  const areaDoGrupo = (itens: SectorModule[]) => areaDoGrupoDeTelas(itens.map((i) => i.code)) ?? "marca";
                  return <>{itemSped}{agruparPorCor(diretos, (m) => areaDoModulo(m.code)).map(itemModulo)}{agruparPorCor(grupos, (g) => areaDoGrupo(g.itens)).map(({ grupo, itens }) => (
                    <PainelDoItem
                      key={grupo}
                      titulo={grupo}
                      area={areaDoGrupo(itens)}
                      icone={<Icone nome={ICONE_DO_GRUPO[grupo]} />}
                      verTudo={{ href: `/setor/${activeSector.code}/grupo/${slugDoGrupo(grupo)}`, rotulo: "Ver as telas do grupo" }}
                      telas={itens.map((i) => ({ label: i.label, href: i.href, icon: <ModuleIcon code={i.code} /> }))}
                    >
                      <GrupoNavItem
                        label={grupo}
                        href={`/setor/${activeSector.code}/grupo/${slugDoGrupo(grupo)}`}
                        icon={<Icone nome={ICONE_DO_GRUPO[grupo]} />}
                        itens={itens}
                        area={areaDoGrupo(itens)}
                      />
                    </PainelDoItem>
                  ))}</>;
                })()}
              </>
            ) : (
              <>
                <TituloDoBloco nome="Geral" primeiro>
                  <p className="c41-rotulo px-2.5 pb-1.5">
                    Geral
                  </p>
                </TituloDoBloco>
                <NavItem href="/home" icon={<Home size={16} />} label="Início" area="marca" />
                <NavItem href="/tarefas" icon={<CalendarCheck size={16} />} label="Meu dia" area="marca" />
                {itensDoGeral()}

                <TelasFixadas telas={telasFixadas} />

                {sectors.length > 0 && (
                  <>
                    <TituloDoBloco nome="Meus setores">
                      <p className="c41-rotulo px-2.5 pt-4 pb-1.5">
                        Meus setores
                      </p>
                    </TituloDoBloco>
                    {/* Sem painel ao lado: o clique entra no ambiente do setor
                        (decisão de 30/09 — as telas de todos os setores juntas
                        poluíam a vista de quem tem acesso a todos). */}
                    {sectors.map((s) => (
                      <SectorNavItem
                        key={s.code}
                        label={s.label}
                        icon={SECTOR_ICONS[s.code]}
                        onEntrar={() => trocarSetor(s.code, appDomain, sectorHostSuffix)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </nav>

        </aside>
      </ProvedorDaFaixa>

      {/* ── Main area ── */}
      {/* O brilho mora aqui, e não no <main> (05/10, opção A da revisão de
          fundo): começa no topo da janela, atrás do cabeçalho aberto, e fica
          parado quando a página rola. */}
      <div className="c41-atmosfera flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header
          className={`relative h-[60px] flex-shrink-0 flex items-center gap-3 border-b px-4 lg:px-6 transition-colors ${
            rolou || grupoDaTela ? "border-border" : "border-transparent"
          }`}
        >
          {/* A linha da área de uso fechando o cabeçalho (28/10/2026), como a
              do Omie: diz em que área a tela aberta está, de longe. */}
          {grupoDaTela && <span aria-hidden data-linha-da-area className="absolute inset-x-0 -bottom-px h-[3px] bg-grupo" />}
          {/* 40px de alvo (era o ícone, 20px) e `-ml-2` para o ícone seguir
              onde estava; diz se a gaveta está aberta (07/10/2026). */}
          <IconButton
            size="xl"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={mobileOpen}
            aria-controls="menu-lateral"
            className={`${SO_NA_GAVETA} -ml-2`}
          >
            <Menu size={20} />
          </IconButton>
          {/* Recolher e mostrar o menu lateral no computador (08/10/2026), à
              esquerda da troca de setor; no celular a lateral já é gaveta.
              Um botão de menu por vez (13/10/2026): este só com a coluna
              fixa, o hambúrguer só na gaveta — o porquê do `max-lg:hidden`, e
              não `hidden lg:inline-flex`, está em menuLateral.ts. Desde 14/10
              recolher deixa a faixa de ícones, e o botão a abre de novo. */}
          <IconButton
            size="xl"
            onClick={alternarMenu}
            aria-label={menuRecolhido ? "Expandir o menu lateral" : "Recolher o menu lateral"}
            data-dica={menuRecolhido ? "Expandir o menu" : "Recolher o menu"}
            aria-expanded={!menuRecolhido}
            aria-controls="menu-lateral"
            className={`${SO_NA_COLUNA} -ml-2`}
          >
            {menuRecolhido ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </IconButton>
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Onde estou: o escritório e o setor ativo, que o cartão embaixo
                da logo mostrava até a busca ficar com o lugar dele (02/10). */}
            {/* Clicar nele abre a troca de setor e escritório (02/10/2026). */}
            <button
              type="button"
              onClick={() => setTrocaAberta(true)}
              disabled={!podeTrocar}
              data-dica={podeTrocar ? "Trocar setor ou escritório" : undefined}
              className="hidden lg:flex items-center gap-2 min-w-0 text-ui rounded-md -ml-1.5 px-1.5 py-1 transition-colors enabled:hover:bg-surface-hover disabled:cursor-default"
            >
              <AvatarImage src={tenantAtual?.logoUrl ?? null} name={tenantAtual?.name ?? "—"} size={22} shape="lg" fontSize={10} />
              <span className="font-medium text-fg truncate">{tenantAtual?.name ?? "—"}</span>
              {activeSector ? (
                <>
                  <span aria-hidden className="text-fg-muted">·</span>
                  <span className="inline-flex items-center gap-1.5 text-fg-secondary whitespace-nowrap">
                    {SECTOR_ICONS[activeSector.code] && (
                      <span aria-hidden className="text-fg-muted [&>svg]:size-3.5">{SECTOR_ICONS[activeSector.code]}</span>
                    )}
                    {activeSector.label}
                  </span>
                </>
              ) : sectors.length > 1 ? (
                <>
                  <span aria-hidden className="text-fg-muted">·</span>
                  <span className="text-fg-muted whitespace-nowrap">Todos os setores</span>
                </>
              ) : null}
              {podeTrocar && <ChevronDown size={13} aria-hidden className="flex-shrink-0 text-fg-muted" />}
            </button>
            {/* A área de uso da tela aberta (28/10/2026), como a aba do Omie: leva
                à página da área, com todas as telas dela que a pessoa abre. */}
            {grupoDaTela && (
              <Link
                href={`/area/${grupoDaTela}`}
                data-dica={`Todas as telas de ${GRUPOS[grupoDaTela].rotulo}`}
                className="hidden lg:inline-flex items-center rounded-full bg-grupo-solid text-on-brand text-helper font-semibold px-2.5 py-0.5 whitespace-nowrap transition-opacity hover:opacity-90"
              >
                {GRUPOS[grupoDaTela].rotulo}
              </Link>
            )}
            {/* A busca do topo é a do celular; no computador ela mora na
                lateral — no campo, com o menu aberto, ou na lupa da faixa de
                ícones (14/10/2026; até ali, recolhido, ela vinha para cá). */}
            <div className="flex-1 min-w-0 lg:hidden">
              <GlobalSearch telas={telasNavegaveis} atalho={!telaGrande} />
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <ThemeToggle />
            {/* Ajuda (30/09): o caminho curto para a central /ajuda, ao lado de
                notificação, configurações e perfil. Desde 05/10 a setinha ao
                lado do "?" leva à central sem passar pelo artigo da tela. */}
            <BotaoDeAjuda linkDaTela={artigoDaTela ? linkDaAjuda : null} naAjuda={naAjuda} />
            <NotificationBell unreadCount={unreadCount} />
            {/* Configurações saiu do rodapé da sidebar para o topo, só o ícone,
                ao lado de notificação e perfil (pedido de 30/09). Admin cai na
                administração do workspace; os outros, na própria conta. */}
            {/* O `IconButton` com `href` (07/10/2026), no lugar da cópia à mão
                do `framed lg`. */}
            <IconButton
              href={canOpenAdmin ? "/admin" : "/configuracoes"}
              variant="framed"
              size="lg"
              active={emConfiguracoes}
              aria-label="Configurações"
              data-dica="Configurações"
              aria-current={emConfiguracoes ? "page" : undefined}
            >
              <Settings size={16} />
            </IconButton>
            <ProfileMenu
              name={profileName}
              roleLabel={profileRoleLabel}
              photoUrl={profilePhotoUrl}
              tenants={accessibleTenants}
              currentTenantId={tenantId}
              sectors={sectors}
              activeSector={activeSector?.code ?? null}
              onTrocar={() => setTrocaAberta(true)}
            />
            <TrocaDeContexto
              open={trocaAberta}
              onClose={() => setTrocaAberta(false)}
              tenants={accessibleTenants}
              currentTenantId={tenantId}
              sectors={sectors}
              activeSector={activeSector?.code ?? null}
              appDomain={appDomain}
              sectorHostSuffix={sectorHostSuffix}
            />
          </div>
        </header>

        {/* No `Aviso` de perigo (15/10/2026), na largura da página: era uma
            faixa vermelha desenhada à mão, de ponta a ponta. */}
        {subscriptionReadOnly && (
          <div className="flex-shrink-0 w-full max-w-[1440px] mx-auto px-6 pt-4">
            <Aviso tom="perigo" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center">
              Assinatura pendente — este workspace está em modo somente leitura.{" "}
              {/* Em MANAGED a tela /assinatura dá 404 (é a 41 Tech quem administra),
                  então o link viraria um beco sem saída — vira instrução de contato.
                  Revisão de 05/10: botão não é link — era texto sublinhado na faixa. */}
              {canSelfRegularizeSubscription ? (
                <Button href="/assinatura" variant="secondary" size="xs">
                  Regularizar assinatura
                </Button>
              ) : (
                <span className="font-medium">Entre em contato com a 41 Tech.</span>
              )}
            </Aviso>
          </div>
        )}

        {faixaDoFoco}

        {/* Page content */}
        {/* O `relative` faz do <main> o bloco de contenção dos elementos com
          `position: absolute` da página (o campo de arquivo escondido com
          `sr-only`, por exemplo). Sem ele, o elemento escapava da rolagem de
          dentro e esticava a página: no detalhe do processo do portal, a tela
          inteira rolava e o casco subia junto (relato do Kauan, 08/10/2026). */}
        <main
          className="c41-cor-da-area scroll-y scroll-gutter-stable relative flex-1 overflow-y-auto"
          onScroll={(e) => setRolou(e.currentTarget.scrollTop > 0)}
        >
          {/* Anota a tela aberta como recente (no navegador) — é o que o Ctrl+K
              oferece antes de a pessoa digitar. */}
          <RegistroDeTelasRecentes />
          {children}
        </main>
      </div>
    </div>
  );
}
