"use client";

import { useActionState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Button } from "@/components/ui/Button";
import type { EstadoDoLogin } from "@/app/(portal)/portal/login/actions";

type Props = {
  action: (anterior: EstadoDoLogin, form: FormData) => Promise<EstadoDoLogin>;
  /** A ficha "Quero ser cliente" está recebendo (ver `escritorioDaFicha`). */
  fichaDisponivel?: boolean;
};

export function PortalLoginForm({ action, fichaDisponivel = false }: Props) {
  const [estado, formAction, pendente] = useActionState<EstadoDoLogin, FormData>(action, null);

  // Segundo passo: a senha conferiu em mais de um cliente. A senha não volta
  // para a tela — o token da escolha já carrega as contas liberadas.
  if (estado && "escolher" in estado) {
    return (
      <Card className="p-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="escolha" value={estado.escolher.token} />
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
            <Button href="/portal/login" variant="ghost" size="sm">
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
      <form action={formAction} className="space-y-4">
        <CampoForm label="E-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </CampoForm>

        <CampoForm label="Senha" htmlFor="senha" required>
          <CampoDeSenha id="senha" name="senha" autoComplete="current-password" required />
        </CampoForm>

        {estado && "erro" in estado && <p className="text-[length:var(--fs-helper)] text-danger">{estado.erro}</p>}

        <Button type="submit" disabled={pendente} className="w-full justify-center">
          {pendente ? "Entrando…" : "Entrar"}
        </Button>

        <p className="text-[length:var(--fs-helper)] text-fg-muted text-center">
          <Link href="/portal/esqueci-senha" className="text-brand hover:underline">
            Esqueci minha senha
          </Link>
          {" · "}
          <Link href="/portal/privacidade" className="text-brand hover:underline">
            Privacidade
          </Link>
        </p>
      </form>

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
