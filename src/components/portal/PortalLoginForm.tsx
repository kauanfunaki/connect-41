"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { EstadoDoLogin } from "@/app/(portal)/portal/login/actions";

type Props = {
  action: (anterior: EstadoDoLogin, form: FormData) => Promise<EstadoDoLogin>;
};

export function PortalLoginForm({ action }: Props) {
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

          <p className="text-[length:var(--fs-helper)] text-fg-muted text-center">
            <Link href="/portal/login" className="text-brand hover:underline">
              Usar outro e-mail
            </Link>
          </p>
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
          <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
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
    </Card>
  );
}
