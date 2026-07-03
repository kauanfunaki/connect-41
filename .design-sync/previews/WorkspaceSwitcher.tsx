import { WorkspaceSwitcher } from 'connect-41';

const tenants = [
  { id: 't1', name: '41 Contábil' },
  { id: 't2', name: '41 Recrutamento' },
  { id: 't3', name: '41 Corretora' },
];

export function Default() {
  return (
    <div style={{ maxWidth: 240, padding: 16 }}>
      <WorkspaceSwitcher tenants={tenants} currentTenantId="t1" />
    </div>
  );
}
