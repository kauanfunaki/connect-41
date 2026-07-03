import { NavItem } from 'connect-41';

export function Ativo() {
  return (
    <div style={{ maxWidth: 220, padding: 16 }}>
      <NavItem href="/" icon="🏠" label="Início" />
    </div>
  );
}

export function Inativo() {
  return (
    <div style={{ maxWidth: 220, padding: 16 }}>
      <NavItem href="/empresas" icon="🏢" label="Empresas" />
    </div>
  );
}
