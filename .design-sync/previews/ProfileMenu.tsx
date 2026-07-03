import { ProfileMenu } from 'connect-41';

export function Default() {
  return (
    <div style={{ padding: 16, display: 'flex', justifyContent: 'flex-end' }}>
      <ProfileMenu name="Ana Souza" roleLabel="Administradora" photoUrl={null} />
    </div>
  );
}
