"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  ContactRound,
  Columns3,
  ArrowRightLeft,
  CalendarDays,
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
  ListTodo,
  Menu,
  Pin,
  X,
  MessageCircle,
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
import { ContextSwitcher } from "@/components/shell/ContextSwitcher";
import { Button } from "@/components/ui/Button";

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
};

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

type NotificationEntry = { id: string; message: string; read: boolean; href: string | null; createdAt: string };

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
  // cliente (ver ContextSwitcher).
  appDomain: string | null;
  sectorHostSuffix: string;
  canOpenAdmin: boolean;
  canManageMeetings: boolean;
  unreadCount: number;
  notifications: NotificationEntry[];
  profileName: string;
  profileRoleLabel: string;
  profilePhotoUrl: string | null;
  subscriptionReadOnly?: boolean;
  canSelfRegularizeSubscription?: boolean;
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
  canManageMeetings,
  unreadCount,
  notifications,
  profileName,
  profileRoleLabel,
  profilePhotoUrl,
  subscriptionReadOnly = false,
  canSelfRegularizeSubscription = false,
  children,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
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
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 h-14 px-5 border-b border-border flex-shrink-0 relative">
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

        <ContextSwitcher
          tenants={accessibleTenants}
          currentTenantId={tenantId}
          sectors={sectors}
          activeSector={activeSector?.code ?? null}
          appDomain={appDomain}
          sectorHostSuffix={sectorHostSuffix}
        />

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

              {/* Transversais. NUNCA somem por causa do setor ativo: transferência
                  é setor↔setor por natureza, e cadastro é do tenant. Isolar os
                  dois mataria a razão de existir do Connect. Espaços entra aqui:
                  é a mesma tela em todo setor, e solto no topo parecia um módulo. */}
              <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                Geral
              </p>
              <NavItem href={`/setor/${activeSector.code}`} icon={<FolderKanban size={16} />} label="Espaços" />
              <CadastrosNavItem icon={<ContactRound size={16} />} label="Cadastros" />
              <NavItem href="/tarefas" icon={<ListTodo size={16} />} label="Tarefas" />
              <NavItem href="/conversas" icon={<MessageCircle size={16} />} label="Conversas" />
              <NavItem href="/transferencias" icon={<ArrowRightLeft size={16} />} label="Transferências" />
              {canManageMeetings && (
                <NavItem href="/agenda" icon={<CalendarDays size={16} />} label="Agenda" />
              )}

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
                  return activeSectorModules.map((m) => (
                    <NavItem key={m.code} href={m.href} icon={<ModuleIcon code={m.code} />} label={m.label} />
                  ));
                }
                return grupos.map(({ grupo, itens }) => (
                  <GrupoNavItem
                    key={grupo}
                    label={grupo}
                    href={`/setor/${activeSector.code}/grupo/${slugDoGrupo(grupo)}`}
                    icon={<Icone nome={ICONE_DO_GRUPO[grupo]} />}
                    itens={itens}
                  />
                ));
              })()}
            </>
          ) : (
            <>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                Geral
              </p>
              <NavItem href="/home" icon={<Home size={16} />} label="Início" />
              <CadastrosNavItem icon={<ContactRound size={16} />} label="Cadastros" />
              <NavItem href="/tarefas" icon={<ListTodo size={16} />} label="Tarefas" />
              <NavItem href="/conversas" icon={<MessageCircle size={16} />} label="Conversas" />
              <NavItem href="/transferencias" icon={<ArrowRightLeft size={16} />} label="Transferências" />
              {canManageMeetings && (
                <NavItem href="/agenda" icon={<CalendarDays size={16} />} label="Agenda" />
              )}

              <TelasFixadas telas={telasFixadas} />

              {sectors.length > 0 && (
                <>
                  <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                    Meus Setores
                  </p>
                  {sectors.map((s) => (
                    <SectorNavItem
                      key={s.code}
                      href={`/setor/${s.code}`}
                      label={s.label}
                      color={s.color}
                      icon={SECTOR_ICONS[s.code]}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </nav>

        {/* Footer: configurações. Admin cai na administração do workspace;
            todo mundo tem /configuracoes (conta própria) no menu de perfil. */}
        <div className="border-t border-border px-3 py-3 flex-shrink-0">
          <Link
            href={canOpenAdmin ? "/admin" : "/configuracoes"}
            className="flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[14px] font-medium text-fg-secondary hover:text-fg transition-colors"
          >
            <Settings size={16} className="flex-shrink-0" />
            Configurações
          </Link>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-[60px] flex-shrink-0 flex items-center gap-3 border-b border-border bg-topbar-bg px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="lg:hidden flex-shrink-0 text-fg-secondary hover:text-fg transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <GlobalSearch telas={telasNavegaveis} />
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <ThemeToggle />
            <NotificationBell unreadCount={unreadCount} notifications={notifications} />
            <ProfileMenu name={profileName} roleLabel={profileRoleLabel} photoUrl={profilePhotoUrl} />
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
        <main className="scroll-y scroll-gutter-stable flex-1 overflow-y-auto">
          {/* Anota a tela aberta como recente (no navegador) — é o que o Ctrl+K
              oferece antes de a pessoa digitar. */}
          <RegistroDeTelasRecentes />
          {children}
        </main>
      </div>
    </div>
  );
}
