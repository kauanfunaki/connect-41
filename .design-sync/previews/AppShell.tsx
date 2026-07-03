import {
  NavItem,
  SectorNavItem,
  WorkspaceSwitcher,
  ThemeToggle,
  GlobalSearch,
  NotificationBell,
  ProfileMenu,
} from 'connect-41';

// Composição fiel a src/app/(app)/layout.tsx — sidebar + topbar montados juntos,
// com uma página de exemplo simples no conteúdo principal só pra dar contexto
// de proporção (a página em si não é o foco deste preview).
const tenants = [
  { id: 't1', name: '41 Contábil' },
  { id: 't2', name: '41 Recrutamento' },
];

const sectors = [
  { code: 'contabil', label: 'Contábil', color: '#4F46E5' },
  { code: 'fiscal', label: 'Fiscal', color: '#C5374B' },
  { code: 'dprh', label: 'DP / RH', color: '#7C5CBF' },
];

export function Default() {
  return (
    <div className="flex h-[640px] overflow-hidden bg-canvas">
      {/* ── Sidebar ── */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-border bg-surface">
        <div className="flex items-center justify-center gap-2 h-12 px-4 border-b border-border flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="41 Tech" className="h-7 w-7 object-contain invert dark:invert-0" />
          <span className="text-fg font-semibold text-[14px] tracking-[-0.01em]">Connect 41</span>
        </div>

        <WorkspaceSwitcher tenants={tenants} currentTenantId="t1" />

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          <p className="px-2 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">Geral</p>
          <NavItem href="/" icon="⊞" label="Início" />
          <NavItem href="/empresas" icon="🏢" label="Empresas" />
          <NavItem href="/pessoas" icon="👤" label="Pessoas" />
          <NavItem href="/kanban" icon="📋" label="Kanban" />
          <NavItem href="/transferencias" icon="🔁" label="Transferências" />

          <p className="px-2 pt-4 pb-1.5 text-[11px] font-medium text-fg-muted uppercase tracking-wider">
            Meus Setores
          </p>
          {sectors.map((s) => (
            <SectorNavItem key={s.code} href={`/setor/${s.code}`} label={s.label} color={s.color} />
          ))}
        </nav>

        <div className="border-t border-border px-4 py-2.5 flex items-center flex-shrink-0">
          <ThemeToggle />
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-12 flex-shrink-0 flex items-center justify-between gap-4 border-b border-border bg-surface px-4">
          <GlobalSearch />
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="#"
              title="Administração"
              className="w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
            >
              ⚙️
            </a>
            <NotificationBell unreadCount={3} />
            <ProfileMenu name="Ana Souza" roleLabel="Administradora" photoUrl={null} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">Início</h1>
          <p className="text-[13px] text-fg-muted">Bem-vindo ao Connect 41 — CRM interno da 41 Tech.</p>
        </main>
      </div>
    </div>
  );
}
