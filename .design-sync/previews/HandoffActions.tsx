import { HandoffActions } from 'connect-41';

async function aceitar() {}
async function rejeitar() {}

export function Default() {
  return (
    <div style={{ padding: 16 }}>
      <HandoffActions aceitarAction={aceitar} rejeitarAction={rejeitar} />
    </div>
  );
}
