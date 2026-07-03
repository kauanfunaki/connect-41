import { AuthShell, AuthField, MailIcon, LockIcon } from 'connect-41';

export function Login() {
  return (
    <AuthShell subtitle="Entre com suas credenciais para acessar o Connect 41">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AuthField label="E-mail" htmlFor="email" icon={<MailIcon />}>
          <input
            id="email"
            type="email"
            placeholder="voce@41tech.com.br"
            className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
          />
        </AuthField>
        <AuthField label="Senha" htmlFor="password" icon={<LockIcon />}>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
          />
        </AuthField>
      </div>
    </AuthShell>
  );
}
