// Server Component — lê o erro da query string e renderiza o form HTML puro.
// O form faz POST direto para /api/auth/login-form que retorna um 303 HTTP real,
// garantindo que o cookie esteja no browser antes do redirect para /.
import Link from "next/link";
import { MolduraDaEquipe } from "@/components/login/MolduraDaEquipe";
import { MailIcon, LockIcon } from "@/components/login/icons";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { CampoForm } from "@/components/ui/CampoForm";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

const ERRORS: Record<string, string> = {
  "credenciais-invalidas": "E-mail ou senha incorretos.",
  "preencha-os-campos":    "Preencha e-mail e senha.",
  "muitas-tentativas":     "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
  "erro-interno":          "Erro interno. Tente novamente.",
  // O e-mail tem conta em mais de um escritório e a escolha venceu (06/10/2026).
  "escolha-expirou":       "A escolha do escritório expirou. Entre de novo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const errorMsg = error ? (ERRORS[error] ?? "Erro ao autenticar.") : null;

  return (
    // A moldura da entrada do portal, com o carrossel da equipe (06/10/2026).
    // O formulário vai num cartão: no celular é ele que sobe sobre o topo azul.
    <MolduraDaEquipe
      titulo="Bem-vindo de volta"
      subtitulo="Acompanhe o trabalho do escritório: processos, prazos, pendências e agenda."
    >
      <Card className="p-6">
        {/* Os campos do sistema, como no login do portal (07/10/2026): o
            `Input` e o `CampoDeSenha`, com o asterisco de obrigatório e os
            mesmos rótulos ("Mostrar o que foi digitado"). Antes eram uma cópia
            do Input, com um olho em SVG próprio. O ícone dentro do campo fica
            até o Kauan decidir se o portal também o ganha ou se os dois o
            perdem. Os nomes `email` e `password` são os que
            /api/auth/login-form lê. */}
        <form method="POST" action="/api/auth/login-form" className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <CampoForm label="E-mail" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="voce@41contabil.com.br"
              icon={<MailIcon />}
            />
          </CampoForm>

          <CampoForm label="Senha" htmlFor="password" required>
            <CampoDeSenha
              id="password"
              name="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              icon={<LockIcon />}
            />
          </CampoForm>

          <Checkbox id="remember" name="remember" label="Lembrar de mim" />

          {errorMsg && <Aviso>{errorMsg}</Aviso>}

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
        </form>

        {/* O link embaixo do botão, centralizado e com o rótulo do portal
            (07/10/2026) — era "Esqueceu a senha?" à direita da caixa de marcar. */}
        <p className="mt-4 text-helper text-fg-muted text-center">
          <Link href="/login/esqueci-senha" className="text-brand hover:underline">
            Esqueci minha senha
          </Link>
        </p>

        {/* Até 01/10/2026 havia aqui "Solicitar acesso", que abria chamado no
            Hub da 41 Tech — virou canal de propaganda. Acesso quem libera é o
            administrador de cada escritório. */}
        <p className="mt-2 text-center text-ui text-fg-muted">
          Não tem acesso? Fale com quem administra o Connect na sua empresa.
        </p>
      </Card>
    </MolduraDaEquipe>
  );
}
