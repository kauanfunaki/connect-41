import { SectorNavItem } from 'connect-41';

export function Contabil() {
  return (
    <div style={{ maxWidth: 220, padding: 16 }}>
      <SectorNavItem href="/setor/contabil" label="Contábil" color="#4F46E5" />
    </div>
  );
}

export function Fiscal() {
  return (
    <div style={{ maxWidth: 220, padding: 16 }}>
      <SectorNavItem href="/setor/fiscal" label="Fiscal" color="#C5374B" />
    </div>
  );
}
