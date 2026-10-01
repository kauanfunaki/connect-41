// Server Component — lê o erro da query string e renderiza o form HTML puro.
// O form faz POST direto para /api/auth/login-form que retorna um 303 HTTP real,
// garantindo que o cookie esteja no browser antes do redirect para /.
import Link from "next/link";
import { AuthShell, AuthField, AUTH_INPUT } from "@/components/login/AuthShell";
import { PasswordField } from "@/components/login/PasswordField";
import { MailIcon } from "@/components/login/icons";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";

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

        {/* A caixa de marcar do sistema (ui/Checkbox), e o link no mesmo
            tamanho do rótulo dela — eram 12px, menores que os rótulos de cima. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Checkbox id="remember" name="remember" label="Lembrar de mim" />
          <Link
            href="/login/esqueci-senha"
            className="text-[length:var(--fs-label)] font-medium text-brand hover:underline"
          >
            Esqueceu a senha?
          </Link>
        </div>

        {errorMsg && (
          <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
            {errorMsg}
          </p>
        )}

        {/* `mt-1` é acréscimo, não sobreposição: a variante não define margem,
            então não depende da ordem no CSS gerado. O afundar ao clicar já vem
            do próprio Button. */}
        <Button
          type="submit"
          size="md"
          className="w-full mt-1"
        >
          Entrar
        </Button>

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
