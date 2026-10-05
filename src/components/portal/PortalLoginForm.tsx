"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import type { EstadoDoLogin } from "@/app/(portal)/portal/login/actions";

type Escolha = Extract<NonNullable<EstadoDoLogin>, { escolher: unknown }>["escolher"];

type Props = {
  action: (anterior: EstadoDoLogin, form: FormData) => Promise<EstadoDoLogin>;
  /** A ficha "Quero ser cliente" está recebendo (ver `escritorioDaFicha`). */
  fichaDisponivel?: boolean;
  /** O "Entrar com o Google" está configurado (ver `configuracaoDoGoogleNoPortal`). */
  googleDisponivel?: boolean;
  /** O que a volta do Google tem a dizer: sem acesso, cancelado, expirou… */
  avisoDoGoogle?: string | null;
  /** O Google achou o e-mail em mais de um cliente: a tela abre na escolha. */
  escolhaDoGoogle?: Escolha | null;
};

/**
 * O login do portal: e-mail e senha, "lembrar de mim", "Entrar com o Google" e,
 * para quem não tem conta, a ficha "Quero ser cliente" (05/10/2026).
 *
 * "Usar outro e-mail" recomeça do zero trocando a `key` do formulário: navegar
 * para a mesma URL não limpa o estado do `useActionState`, e a pessoa ficava
 * presa na escolha de cliente.
 */
export function PortalLoginForm({ escolhaDoGoogle = null, avisoDoGoogle = null, ...resto }: Props) {
  const router = useRouter();
  const [rodada, setRodada] = useState(0);
  const [inicial, setInicial] = useState<EstadoDoLogin>(escolhaDoGoogle ? { escolher: escolhaDoGoogle } : null);
  const [aviso, setAviso] = useState<string | null>(avisoDoGoogle);

  function recomecar() {
    setInicial(null);
    setAviso(null);
    setRodada((r) => r + 1);
    // Tira o `?google=` da barra, para recarregar a página não trazer a escolha de volta.
    router.replace("/portal/login");
  }

  return <Entrada key={rodada} {...resto} estadoInicial={inicial} aviso={aviso} onRecomecar={recomecar} />;
}

function Entrada({
  action,
  fichaDisponivel = false,
  googleDisponivel = false,
  estadoInicial,
  aviso,
  onRecomecar,
}: Omit<Props, "avisoDoGoogle" | "escolhaDoGoogle"> & {
  estadoInicial: EstadoDoLogin;
  aviso: string | null;
  onRecomecar: () => void;
}) {
  const [estado, formAction, pendente] = useActionState<EstadoDoLogin, FormData>(action, estadoInicial);
  // Uma caixa só para os dois jeitos de entrar: o formulário da senha a envia,
  // e o botão do Google leva o valor num campo escondido.
  const [lembrar, setLembrar] = useState(false);

  // Segundo passo: a senha (ou o Google) conferiu em mais de um cliente. A
  // senha não volta para a tela — o token da escolha já carrega as contas
  // liberadas, e o "lembrar" escolhido no primeiro passo segue junto.
  if (estado && "escolher" in estado) {
    return (
      <Card className="p-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="escolha" value={estado.escolher.token} />
          <input type="hidden" name="lembrar" value={estado.escolher.lembrar ? "1" : "0"} />
          {/* Título do grupo no estilo do rótulo do CampoForm. Cada opção é um
              alvo de ao menos 44px (é tela de celular), com o rádio centrado
              nas duas linhas e a escolhida marcada na borda. */}
          <fieldset className="space-y-2">
            <legend className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">
              Este e-mail tem acesso a mais de um cliente. Em qual você quer entrar?
            </legend>
            {estado.escolher.opcoes.map((o, i) => (
              <label
                key={o.id}
                className="flex items-center gap-3 min-h-11 rounded-md border border-border-strong px-3 py-2 cursor-pointer transition-colors hover:bg-surface-hover has-[:checked]:border-brand has-[:checked]:bg-brand/8"
              >
                <input
                  type="radio"
                  name="conta"
                  value={o.id}
                  defaultChecked={i === 0}
                  className="size-4 flex-shrink-0 accent-[var(--c41-brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[length:var(--fs-body)] text-fg break-words">{o.cliente}</span>
                  <span className="block text-[length:var(--fs-helper)] text-fg-muted break-words">{o.escritorio}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Button type="submit" disabled={pendente} className="w-full justify-center">
            {pendente ? "Entrando…" : "Entrar"}
          </Button>

          {/* Revisão de 05/10: botão não é link — voltar ao passo do e-mail é ação. */}
          <div className="text-center">
            <Button type="button" variant="ghost" size="sm" onClick={onRecomecar}>
              <ArrowLeft size={14} />
              Usar outro e-mail
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      {aviso && (
        <p role="alert" className="mb-4 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[length:var(--fs-helper)] text-warning">
          {aviso}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <CampoForm label="E-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </CampoForm>

        <CampoForm label="Senha" htmlFor="senha" required>
          <CampoDeSenha id="senha" name="senha" autoComplete="current-password" required />
        </CampoForm>

        <Checkbox
          id="lembrar"
          name="lembrar"
          value="1"
          checked={lembrar}
          onChange={(e) => setLembrar(e.target.checked)}
          label="Lembrar de mim"
          helper="Fica conectado por 30 dias neste aparelho. Não marque num computador compartilhado."
        />

        {estado && "erro" in estado && <p className="text-[length:var(--fs-helper)] text-danger">{estado.erro}</p>}

        <Button type="submit" disabled={pendente} className="w-full justify-center">
          {pendente ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      {/* 05/10/2026: só no portal — o login da equipe não muda. GET comum, para
          o navegador seguir os redirects até o Google; o "lembrar" vai junto. */}
      {googleDisponivel && (
        <>
          <div className="my-4 flex items-center gap-3 text-[length:var(--fs-helper)] text-fg-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <form method="get" action="/portal/login/google">
            <input type="hidden" name="lembrar" value={lembrar ? "1" : "0"} />
            <Button type="submit" variant="secondary" className="w-full justify-center">
              <LogoDoGoogle />
              Entrar com o Google
            </Button>
          </form>
        </>
      )}

      <p className="mt-4 text-[length:var(--fs-helper)] text-fg-muted text-center">
        <Link href="/portal/esqueci-senha" className="text-brand hover:underline">
          Esqueci minha senha
        </Link>
        {" · "}
        <Link href="/portal/privacidade" className="text-brand hover:underline">
          Privacidade
        </Link>
      </p>

      {/* 05/10/2026: quem ainda não é cliente chega ao login e não tinha para
          onde ir. Botão, e não link (regra de 05/10): é a outra saída da tela. */}
      {fichaDisponivel && <NaoPossuiConta />}
    </Card>
  );
}

function NaoPossuiConta() {
  return (
    <div className="mt-5 pt-5 border-t border-border flex flex-col items-center gap-2 text-center">
      <p className="text-[length:var(--fs-helper)] text-fg-muted">Não possui conta?</p>
      <Button href="/portal/quero-ser-cliente" variant="secondary" className="w-full justify-center">
        Quero ser cliente
      </Button>
    </div>
  );
}

/** O "G" do Google nas cores dele — o botão de entrar segue a identidade do Google. */
function LogoDoGoogle() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
