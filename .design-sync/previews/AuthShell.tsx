import { AuthShell, AuthField, PasswordField, MailIcon } from 'connect-41';

// Composição fiel a src/app/login/page.tsx — os previews individuais de
// AuthField/PasswordField continuam existindo à parte, mas esta é a tela
// de Login completa (todos os elementos reais, não só os campos).
export function Login() {
  return (
    <AuthShell subtitle="Acesse sua conta para continuar">
      <form className="space-y-4">
        <AuthField label="E-mail" htmlFor="email" icon={<MailIcon />}>
          <input
            id="email"
            type="email"
            placeholder="voce@41contabil.com.br"
            className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
          />
        </AuthField>

        <PasswordField label="Senha" autoComplete="current-password" />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded border-border accent-[var(--c41-brand-600)]"
            />
            <span className="text-[12px] text-fg-secondary">Lembrar de mim</span>
          </label>
          <a href="#" className="text-[12px] font-medium text-brand hover:underline">
            Esqueceu a senha?
          </a>
        </div>

        <button
          type="submit"
          className="w-full h-9 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover active:scale-[0.99] transition-all duration-100 mt-1"
        >
          Entrar
        </button>

        <p className="text-center text-[13px] text-fg-muted">
          Não tem uma conta?{' '}
          <a href="#" className="font-medium text-brand hover:underline">
            Solicitar acesso
          </a>
        </p>
      </form>
    </AuthShell>
  );
}

// Mesma tela com erro de credenciais exibido — estado de validação real.
export function LoginComErro() {
  return (
    <AuthShell subtitle="Acesse sua conta para continuar">
      <form className="space-y-4">
        <AuthField label="E-mail" htmlFor="email" icon={<MailIcon />}>
          <input
            id="email"
            type="email"
            defaultValue="voce@41contabil.com.br"
            className="w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none"
          />
        </AuthField>

        <PasswordField label="Senha" autoComplete="current-password" />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded border-border accent-[var(--c41-brand-600)]"
            />
            <span className="text-[12px] text-fg-secondary">Lembrar de mim</span>
          </label>
          <a href="#" className="text-[12px] font-medium text-brand hover:underline">
            Esqueceu a senha?
          </a>
        </div>

        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          E-mail ou senha incorretos.
        </p>

        <button
          type="submit"
          className="w-full h-9 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover active:scale-[0.99] transition-all duration-100 mt-1"
        >
          Entrar
        </button>

        <p className="text-center text-[13px] text-fg-muted">
          Não tem uma conta?{' '}
          <a href="#" className="font-medium text-brand hover:underline">
            Solicitar acesso
          </a>
        </p>
      </form>
    </AuthShell>
  );
}
