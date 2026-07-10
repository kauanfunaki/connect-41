"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  Building2,
  Users,
  Columns3,
  ArrowRightLeft,
  CalendarDays,
  Settings,
  Calculator,
  ReceiptText,
  UserRoundCog,
  FileSignature,
  WalletCards,
  BriefcaseBusiness,
  UserSearch,
  ClipboardList,
  ShieldCheck,
  LayoutGrid,
  Menu,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { NavItem, SectorNavItem } from "@/components/shell/NavLink";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";

type Tenant = { id: string; name: string; logoUrl: string | null };
type Sector = { code: string; label: string; color: string };

// Ícone linear por setor (identidade visual; cor do setor continua vindo do dot).
const SECTOR_ICONS: Record<string, React.ReactNode> = {
  tech: <Columns3 size={16} />,
  dprh: <UserRoundCog size={16} />,
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

type NotificationEntry = { id: string; message: string; read: boolean; href: string | null; createdAt: string };

type Props = {
  tenantId: string;
  accessibleTenants: Tenant[];
  sectors: Sector[];
  canOpenAdmin: boolean;
  canManageMeetings: boolean;
  unreadCount: number;
  notifications: NotificationEntry[];
  profileName: string;
  profileRoleLabel: string;
  profilePhotoUrl: string | null;
  children: React.ReactNode;
};

// Estrutura visual da aplicação (sidebar + topbar) — puramente apresentacional,
// sem acesso a banco. Quem busca os dados (auth, prisma) é o layout real
// (src/app/(app)/layout.tsx), que passa tudo pronto via props.
export function AppShell({
  tenantId,
  accessibleTenants,
  sectors,
  canOpenAdmin,
  canManageMeetings,
  unreadCount,
  notifications,
  profileName,
  profileRoleLabel,
  profilePhotoUrl,
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
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <WorkspaceSwitcher tenants={accessibleTenants} currentTenantId={tenantId} />

        {/* Nav */}
        <nav
          onClick={() => setMobileOpen(false)}
          className="scroll-y flex-1 overflow-y-auto px-3 py-4 space-y-0.5"
        >
          <p className="px-2.5 pb-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
            Geral
          </p>
          <NavItem href="/" icon={<Home size={16} />} label="Início" />
          <NavItem href="/empresas" icon={<Building2 size={16} />} label="Empresas" />
          <NavItem href="/pessoas" icon={<Users size={16} />} label="Pessoas" />
          <NavItem href="/kanban" icon={<Columns3 size={16} />} label="Kanban" />
          <NavItem href="/transferencias" icon={<ArrowRightLeft size={16} />} label="Transferências" />
          {canManageMeetings && (
            <NavItem href="/agenda" icon={<CalendarDays size={16} />} label="Agenda" />
          )}

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
        </nav>

        {/* Footer: configurações */}
        <div className="border-t border-border px-3 py-3 flex-shrink-0">
          {canOpenAdmin ? (
            <Link
              href="/admin"
              className="flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[14px] font-medium text-fg-secondary hover:text-fg transition-colors"
            >
              <Settings size={16} className="flex-shrink-0" />
              Configurações
            </Link>
          ) : (
            // TODO: sem tela de configurações pra usuário comum ainda — só o visual, sem rota.
            <button
              type="button"
              title="Em breve"
              disabled
              className="w-full flex items-center gap-2.5 px-2.5 py-2 -ml-3 pl-[calc(0.625rem+0.75rem)] rounded-lg text-[14px] font-medium text-fg-muted opacity-60 cursor-not-allowed"
            >
              <Settings size={16} className="flex-shrink-0" />
              Configurações
            </button>
          )}
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
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <ThemeToggle />
            <NotificationBell unreadCount={unreadCount} notifications={notifications} />
            <ProfileMenu name={profileName} roleLabel={profileRoleLabel} photoUrl={profilePhotoUrl} />
          </div>
        </header>

        {/* Page content */}
        <main className="scroll-y flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
