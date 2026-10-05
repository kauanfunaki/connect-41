"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ContactRound,
  Columns3,
  ArrowRightLeft,
  CalendarDays,
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
  CalendarCheck,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Menu,
  Pin,
  X,
  Building2,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { NavItem, SectorNavItem, CadastrosNavItem, GrupoNavItem } from "@/components/shell/NavLink";
import { ModuleIcon, Icone } from "@/components/shared/ModuleIcon";
import { RegistroDeTelasRecentes } from "@/components/shell/TelasRecentes";
import { agruparModulos, slugDoGrupo, ICONE_DO_GRUPO } from "@/lib/module-catalog";
import type { TelaNavegavel } from "@/lib/buscaDeTelas";
import { trocarSetor } from "@/components/shell/contexto";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { PainelDoItem, type TelaDoPainel } from "@/components/shell/PainelDoItem";
import { ABAS_DA_GESTAO } from "@/components/gestao/AbasDaGestao";
import { Button } from "@/components/ui/Button";
import { TrocaDeContexto } from "@/components/shell/TrocaDeContexto";
import { chaveDoCaminho, type ParDeCaminho } from "@/lib/ajuda/caminho";

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
  { label: "Clientes", href: "/clientes", icon: <BriefcaseBusiness /> },
  { label: "Pessoas", href: "/pessoas", icon: <Users /> },
];
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
      <p className="flex items-center gap-1.5 px-2.5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        <Pin size={11} className="flex-shrink-0" />
        Fixadas
      </p>
      {telas.map((t) => (
        <NavItem key={t.code} href={t.href} icon={<ModuleIcon code={t.code} />} label={t.label} />
      ))}
    </>
  );
}


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
  profileName: string;
  profileRoleLabel: string;
  profilePhotoUrl: string | null;
  subscriptionReadOnly?: boolean;
  canSelfRegularizeSubscription?: boolean;
  /** Que artigo da ajuda explica cada tela — o "?" do topo abre o da tela aberta. */
  paresDeAjuda?: readonly ParDeCaminho[];
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
  profileName,
  profileRoleLabel,
  profilePhotoUrl,
  subscriptionReadOnly = false,
  canSelfRegularizeSubscription = false,
  paresDeAjuda = [],
  children,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trocaAberta, setTrocaAberta] = useState(false);
  // Cabeçalho aberto (05/10): sem fundo nem borda, o brilho passa por trás dele.
  // A borda volta quando o conteúdo rola, para a tabela não sumir numa linha
  // invisível.
  const [rolou, setRolou] = useState(false);
  const pathname = usePathname();
  // O "?" de cada tela (02/10/2026): com artigo, abre o passo a passo dela e
  // guarda de onde veio para o "Voltar"; sem artigo, a central.
  const naAjuda = pathname.startsWith("/ajuda");
  const artigoDaTela = naAjuda ? null : chaveDoCaminho(pathname, paresDeAjuda);
  const linkDaAjuda = artigoDaTela ? `/ajuda/${encodeURIComponent(artigoDaTela)}?de=${encodeURIComponent(pathname)}` : "/ajuda";
  const rotuloDaAjuda = artigoDaTela ? "Ajuda desta tela" : "Ajuda";
  const emConfiguracoes = pathname.startsWith("/admin") || pathname.startsWith("/configuracoes");
  const corDoSetor = activeSector?.color;
  const tenantAtual = accessibleTenants.find((t) => t.id === tenantId);
  const podeTrocar = sectors.length > 1 || accessibleTenants.length > 1;

  return (
    // `--c41-setor` leva a cor do setor ativo a tudo que está dentro: a barra
    // do item ativo, o traço do título, o brilho da direita (globals.css).
    <div
      className="flex h-screen overflow-hidden bg-canvas"
      style={activeSector ? ({ "--c41-setor": activeSector.color } as React.CSSProperties) : undefined}
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
          Em lg+: volta a ser a coluna estática de sempre (translate-x-0, static). */}
      <aside
        className={`w-[240px] flex-shrink-0 flex flex-col border-r border-border bg-sidebar-bg fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo — a mesma altura do cabeçalho (60px), para as duas linhas de baixo
            se encontrarem; eram 56px, e a logo ficava 4px acima do "41 Tech" (02/10/2026). */}
        <div className="flex items-center justify-center gap-2.5 h-[60px] px-5 border-b border-border flex-shrink-0 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-light.svg"
            alt="Connect"
            className="block dark:hidden h-8 w-auto object-contain flex-shrink-0"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-horizontal-dark.svg"
            alt="Connect"
            className="hidden dark:block h-8 w-auto object-contain flex-shrink-0"
          />
          <Button
            variant="linkMuted"
            className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </Button>
        </div>

        {/* A busca no lugar do cartão de setor e escritório (02/10): trocar de
            setor ou de escritório foi para o menu do usuário. Abaixo de lg a
            lateral é gaveta, e a busca fica no topo. */}
        <div className="hidden lg:block px-3 pt-3 pb-1">
          <GlobalSearch telas={telasNavegaveis} variante="lateral" />
        </div>

        {/* Nav */}
        {/* `scroll-gutter-stable`: quando a lista passa da altura da tela, a barra
            de rolagem aparece, o content box encolhe 9px e tudo que é alinhado à
            direita (a contagem de cada grupo) salta de lugar. O comentário do
            globals.css evita o gutter em container estreito; aqui a troca vale:
            9px de faixa parada custam menos que o menu inteiro se mexendo. */}
        <nav
          onClick={() => setMobileOpen(false)}
          className="scroll-y scroll-gutter-stable flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
        >
          {activeSector ? (
            <>
              {/* A ordem é a do uso: Início, o que serve a todos os setores, e por
                  último as telas deste setor. Geral no meio, e não no fim, porque
                  tarefa e transferência são o dia a dia de qualquer setor — no fim
                  da lista, num setor com quinze telas, ficavam abaixo da dobra.

                  A identidade do setor não é mais um rótulo solto no topo: ela
                  está no seletor acima (com a cor) e volta como título das telas
                  do setor, que é onde diz de quem são aqueles grupos. */}
              <NavItem href="/home" icon={<Home size={16} />} label="Início" />
              <NavItem href="/tarefas" icon={<CalendarCheck size={16} />} label="Meu dia" />

              {/* Transversais. NUNCA somem por causa do setor ativo: transferência
                  é setor↔setor por natureza, e cadastro é do tenant. Isolar os
                  dois mataria a razão de existir do Connect. Espaços entra aqui:
                  é a mesma tela em todo setor, e solto no topo parecia um módulo.

                  30/09: Conversas foi para o setor Controladoria e Gestão para o
                  setor Gestão (pedido do Kauan: o Geral é só o que serve a
                  todos). "Meu dia" subiu para logo abaixo do Início — é a
                  primeira tela do expediente. */}
              <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                Geral
              </p>
              <NavItem href={`/setor/${activeSector.code}`} icon={<FolderKanban size={16} />} label="Espaços" />
              <PainelDoItem titulo="Cadastros" telas={TELAS_DE_CADASTROS} cor={corDoSetor}>
                <CadastrosNavItem icon={<ContactRound size={16} />} label="Cadastros" />
              </PainelDoItem>
              <NavItem href="/transferencias" icon={<ArrowRightLeft size={16} />} label="Transferências" />
              {solicitacoesLigadas && <NavItem href="/solicitacoes" icon={<Inbox size={16} />} label="Solicitações" />}
              <NavItem href="/agenda" icon={<CalendarDays size={16} />} label="Agenda" />

              {/* Até 8 módulos, a sidebar lista as telas direto, cada uma com seu
                  ícone: o setor pequeno não ganha nada em esconder cinco itens
                  atrás de três grupos. Acima disso (o BPO tem quinze), a linha é
                  o **grupo**, e clicar nela abre a tela do setor filtrada por ele
                  — pedido do Kauan em 17/09, no lugar de abrir e fechar seções. */}
              <TelasFixadas telas={telasFixadas} />

              {activeSectorModules.length > 0 && (
                <p className="flex items-center gap-2 px-2.5 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                  <span
                    aria-hidden
                    className="inline-block size-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: activeSector.color }}
                  />
                  <span className="truncate">{activeSector.label}</span>
                </p>
              )}
              {(() => {
                const grupos = agruparModulos(activeSectorModules);
                if (grupos.length <= 1 || activeSectorModules.length <= 8) {
                  return activeSectorModules.map((m) =>
                    // O painel da Gestão mostra as abas dele ao lado, como fazia
                    // quando era item do menu geral.
                    m.code === "gestao_painel" ? (
                      <PainelDoItem key={m.code} titulo={m.label} telas={TELAS_DA_GESTAO} cor={activeSector.color}>
                        <NavItem href={m.href} icon={<ModuleIcon code={m.code} />} label={m.label} />
                      </PainelDoItem>
                    ) : (
                      <NavItem key={m.code} href={m.href} icon={<ModuleIcon code={m.code} />} label={m.label} />
                    )
                  );
                }
                // A tela do grupo continua (é o clique); o painel ao lado mostra
                // as telas dele sem precisar abri-la.
                return grupos.map(({ grupo, itens }) => (
                  <PainelDoItem
                    key={grupo}
                    titulo={grupo}
                    cor={activeSector.color}
                    telas={itens.map((i) => ({ label: i.label, href: i.href, icon: <ModuleIcon code={i.code} /> }))}
                  >
                    <GrupoNavItem
                      label={grupo}
                      href={`/setor/${activeSector.code}/grupo/${slugDoGrupo(grupo)}`}
                      icon={<Icone nome={ICONE_DO_GRUPO[grupo]} />}
                      itens={itens}
                    />
                  </PainelDoItem>
                ));
              })()}
            </>
          ) : (
            <>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                Geral
              </p>
              <NavItem href="/home" icon={<Home size={16} />} label="Início" />
              <NavItem href="/tarefas" icon={<CalendarCheck size={16} />} label="Meu dia" />
              <PainelDoItem titulo="Cadastros" telas={TELAS_DE_CADASTROS} cor={corDoSetor}>
                <CadastrosNavItem icon={<ContactRound size={16} />} label="Cadastros" />
              </PainelDoItem>
              <NavItem href="/transferencias" icon={<ArrowRightLeft size={16} />} label="Transferências" />
              {solicitacoesLigadas && <NavItem href="/solicitacoes" icon={<Inbox size={16} />} label="Solicitações" />}
              <NavItem href="/agenda" icon={<CalendarDays size={16} />} label="Agenda" />

              <TelasFixadas telas={telasFixadas} />

              {sectors.length > 0 && (
                <>
                  <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                    Meus Setores
                  </p>
                  {/* Sem painel ao lado: o clique entra no ambiente do setor
                      (decisão de 30/09 — as telas de todos os setores juntas
                      poluíam a vista de quem tem acesso a todos). */}
                  {sectors.map((s) => (
                    <SectorNavItem
                      key={s.code}
                      label={s.label}
                      color={s.color}
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

      {/* ── Main area ── */}
      {/* O brilho mora aqui, e não no <main> (05/10, opção A da revisão de
          fundo): começa no topo da janela, atrás do cabeçalho aberto, e fica
          parado quando a página rola. */}
      <div className="c41-atmosfera flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header
          className={`h-[60px] flex-shrink-0 flex items-center gap-3 border-b px-4 lg:px-6 transition-colors ${
            rolou ? "border-border" : "border-transparent"
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="lg:hidden flex-shrink-0 text-fg-secondary hover:text-fg transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0 flex items-center">
            {/* Onde estou: o escritório e o setor ativo, que o cartão embaixo
                da logo mostrava até a busca ficar com o lugar dele (02/10). */}
            {/* Clicar nele abre a troca de setor e escritório (02/10/2026). */}
            <button
              type="button"
              onClick={() => setTrocaAberta(true)}
              disabled={!podeTrocar}
              data-dica={podeTrocar ? "Trocar setor ou escritório" : undefined}
              className="hidden lg:flex items-center gap-2 min-w-0 text-[13px] rounded-md -ml-1.5 px-1.5 py-1 transition-colors enabled:hover:bg-surface-hover disabled:cursor-default"
            >
              <AvatarImage src={tenantAtual?.logoUrl ?? null} name={tenantAtual?.name ?? "—"} size={22} shape="lg" fontSize={10} />
              <span className="font-medium text-fg truncate">{tenantAtual?.name ?? "—"}</span>
              {activeSector ? (
                <>
                  <span aria-hidden className="text-fg-muted">·</span>
                  <span className="inline-flex items-center gap-1.5 text-fg-secondary whitespace-nowrap">
                    <span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: activeSector.color }} />
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
            <div className="lg:hidden flex-1 min-w-0">
              <GlobalSearch telas={telasNavegaveis} />
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <ThemeToggle />
            {/* Ajuda (30/09): o caminho curto para a central /ajuda, ao lado de
                notificação, configurações e perfil. */}
            <Link
              href={linkDaAjuda}
              aria-label={rotuloDaAjuda}
              data-dica={rotuloDaAjuda}
              aria-current={naAjuda ? "page" : undefined}
              className={`w-[38px] h-[38px] inline-flex items-center justify-center rounded-md border transition-colors ${
                naAjuda
                  ? "bg-surface border-border-strong text-fg shadow-sm"
                  : "bg-surface-hover border-border text-fg-secondary hover:text-fg hover:border-border-strong"
              }`}
            >
              <CircleHelp size={16} />
            </Link>
            <NotificationBell unreadCount={unreadCount} />
            {/* Configurações saiu do rodapé da sidebar para o topo, só o ícone,
                ao lado de notificação e perfil (pedido de 30/09). Admin cai na
                administração do workspace; os outros, na própria conta. */}
            <Link
              href={canOpenAdmin ? "/admin" : "/configuracoes"}
              aria-label="Configurações"
              data-dica="Configurações"
              aria-current={emConfiguracoes ? "page" : undefined}
              className={`w-[38px] h-[38px] inline-flex items-center justify-center rounded-md border transition-colors ${
                emConfiguracoes
                  ? "bg-surface border-border-strong text-fg shadow-sm"
                  : "bg-surface-hover border-border text-fg-secondary hover:text-fg hover:border-border-strong"
              }`}
            >
              <Settings size={16} />
            </Link>
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

        {subscriptionReadOnly && (
          <div className="flex-shrink-0 bg-danger/10 border-b border-danger/20 px-4 py-2 text-[13px] text-danger flex items-center justify-center gap-2 text-center">
            Assinatura pendente — este workspace está em modo somente leitura.{" "}
            {/* Em MANAGED a tela /assinatura dá 404 (é a 41 Tech quem administra),
                então o link viraria um beco sem saída — vira instrução de contato. */}
            {canSelfRegularizeSubscription ? (
              <Link href="/assinatura" className="underline font-medium hover:no-underline">Regularizar assinatura</Link>
            ) : (
              <span className="font-medium">Entre em contato com a 41 Tech.</span>
            )}
          </div>
        )}

        {/* Page content */}
        <main
          className="scroll-y scroll-gutter-stable flex-1 overflow-y-auto"
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
