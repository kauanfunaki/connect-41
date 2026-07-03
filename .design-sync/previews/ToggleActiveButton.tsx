import { ToggleActiveButton } from 'connect-41';

async function toggle() {}

export function Ativo() {
  return (
    <div style={{ padding: 16 }}>
      <ToggleActiveButton action={toggle} ativo nome="Ana Souza" />
    </div>
  );
}

export function Inativo() {
  return (
    <div style={{ padding: 16 }}>
      <ToggleActiveButton action={toggle} ativo={false} nome="Bruno Lima" />
    </div>
  );
}
