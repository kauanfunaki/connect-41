import { AppShell } from 'connect-41';

// Composição fiel a src/app/(app)/layout.tsx — agora um componente real
// (src/components/shell/AppShell.tsx), extraído do layout pra poder ter
// preview próprio aqui. O layout real só busca dados e passa via props;
// toda a estrutura visual mora neste componente.
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
    <AppShell
      tenantId="t1"
      accessibleTenants={tenants}
      sectors={sectors}
      canOpenAdmin={true}
      unreadCount={3}
      profileName="Ana Souza"
      profileRoleLabel="Administradora"
      profilePhotoUrl={null}
    >
      <div style={{ padding: 24 }}>
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">Início</h1>
        <p className="text-[13px] text-fg-muted">Bem-vindo ao Connect 41 — CRM interno da 41 Tech.</p>
      </div>
    </AppShell>
  );
}
