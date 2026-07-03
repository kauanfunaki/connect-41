import { PasswordField } from 'connect-41';

export function Login() {
  return (
    <div style={{ maxWidth: 320, padding: 16 }}>
      <PasswordField label="Senha" autoComplete="current-password" />
    </div>
  );
}

export function NovaSenha() {
  return (
    <div style={{ maxWidth: 320, padding: 16 }}>
      <PasswordField label="Nova senha" autoComplete="new-password" />
    </div>
  );
}
