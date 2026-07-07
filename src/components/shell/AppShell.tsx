import Link from "next/link";
import {
  Home,
  Building2,
  Users,
  Columns3,
  ArrowRightLeft,
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
} from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ProfileMenu } from "@/components/shell/ProfileMenu";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { NavItem, SectorNavItem } from "@/components/shell/NavLink";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";

type Tenant = { id: string; name: string };
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

type Props = {
  tenantId: string;
  accessibleTenants: Tenant[];
  sectors: Sector[];
  canOpenAdmin: boolean;
  unreadCount: number;
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
  unreadCount,
  profileName,
  profileRoleLabel,
  profilePhotoUrl,
  children,
}: Props) {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* ── Sidebar ── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 h-12 px-4 border-b border-border flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="41 Tech" className="h-7 w-7 object-contain invert dark:invert-0" />
          <span className="text-fg font-semibold text-[14px] tracking-[-0.01em]">
            Connect 41
          </span>
        </div>

        <WorkspaceSwitcher tenants={accessibleTenants} currentTenantId={tenantId} />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          <p className="px-2 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
            Geral
          </p>
          <NavItem href="/" icon={<Home size={16} />} label="Início" />
          <NavItem href="/empresas" icon={<Building2 size={16} />} label="Empresas" />
          <NavItem href="/pessoas" icon={<Users size={16} />} label="Pessoas" />
          <NavItem href="/kanban" icon={<Columns3 size={16} />} label="Kanban" />
          <NavItem href="/transferencias" icon={<ArrowRightLeft size={16} />} label="Transferências" />

          {sectors.length > 0 && (
            <>
              <p className="px-2 pt-4 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
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

        {/* Footer: tema */}
        <div className="border-t border-border px-4 py-2.5 flex items-center flex-shrink-0">
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-12 flex-shrink-0 flex items-center justify-between gap-4 border-b border-border bg-surface px-4">
          <GlobalSearch />

          <div className="flex items-center gap-2 flex-shrink-0">
            {canOpenAdmin && (
              <Link
                href="/admin"
                title="Administração"
                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
              >
                <Settings size={16} />
              </Link>
            )}
            <NotificationBell unreadCount={unreadCount} />
            <ProfileMenu name={profileName} roleLabel={profileRoleLabel} photoUrl={profilePhotoUrl} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
