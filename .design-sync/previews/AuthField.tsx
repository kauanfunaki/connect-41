import { AuthField, MailIcon, LockIcon, UserIcon } from 'connect-41';

export function Email() {
  return (
    <div style={{ maxWidth: 320, padding: 16 }}>
      <AuthField label="E-mail" htmlFor="email" icon={<MailIcon />}>
        <input
          id="email"
          type="email"
          placeholder="voce@41tech.com.br"
          className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
        />
      </AuthField>
    </div>
  );
}

export function Password() {
  return (
    <div style={{ maxWidth: 320, padding: 16 }}>
      <AuthField label="Senha" htmlFor="password" icon={<LockIcon />}>
        <input
          id="password"
          type="password"
          placeholder="••••••••"
          className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
        />
      </AuthField>
    </div>
  );
}

export function Nome() {
  return (
    <div style={{ maxWidth: 320, padding: 16 }}>
      <AuthField label="Nome completo" htmlFor="nome" icon={<UserIcon />}>
        <input
          id="nome"
          type="text"
          placeholder="Seu nome"
          className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
        />
      </AuthField>
    </div>
  );
}
