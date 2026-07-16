// Server Component — lê o erro da query string e renderiza o form HTML puro.
// O form faz POST direto para /api/auth/login-form que retorna um 303 HTTP real,
// garantindo que o cookie esteja no browser antes do redirect para /.
import Link from "next/link";
import { AuthShell, AuthField, AUTH_INPUT } from "@/components/login/AuthShell";
import { PasswordField } from "@/components/login/PasswordField";
import { MailIcon } from "@/components/login/icons";

const ERRORS: Record<string, string> = {
  "credenciais-invalidas": "E-mail ou senha incorretos.",
  "preencha-os-campos":    "Preencha e-mail e senha.",
  "muitas-tentativas":     "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
  "erro-interno":          "Erro interno. Tente novamente.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const errorMsg = error ? (ERRORS[error] ?? "Erro ao autenticar.") : null;

  return (
    <AuthShell subtitle="Acesse sua conta para continuar">
      <form method="POST" action="/api/auth/login-form" className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <AuthField label="E-mail" htmlFor="email" icon={<MailIcon />}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="voce@41contabil.com.br"
            className={AUTH_INPUT}
          />
        </AuthField>

        <PasswordField label="Senha" autoComplete="current-password" />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              name="remember"
              className="w-3.5 h-3.5 rounded border-border accent-[var(--c41-brand-600)]"
            />
            <span className="text-[12px] text-fg-secondary">Lembrar de mim</span>
          </label>
          <Link
            href="/login/esqueci-senha"
            className="text-[12px] font-medium text-brand hover:underline"
          >
            Esqueceu a senha?
          </Link>
        </div>

        {errorMsg && (
          <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          className="w-full h-9 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover active:scale-[0.99] transition-all duration-100 mt-1"
        >
          Entrar
        </button>

        <p className="text-center text-[13px] text-fg-muted">
          Não tem uma conta?{" "}
          <Link href="/login/criar-conta" className="font-medium text-brand hover:underline">
            Solicitar acesso
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
