import { DeleteFieldButton } from 'connect-41';

async function excluirCampo() {}

export function Default() {
  return (
    <div style={{ padding: 24, display: 'flex', alignItems: 'center' }}>
      <DeleteFieldButton action={excluirCampo} nome="Regime tributário" />
    </div>
  );
}
