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
          <fieldset className="space-y-2">
            <legend className="text-[length:var(--fs-body)] font-medium text-fg mb-2">
              Este e-mail tem acesso a mais de um cliente. Em qual você quer entrar?
            </legend>
            {estado.escolher.opcoes.map((o, i) => (
              <label
                key={o.id}
                className="flex items-start gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-surface-hover"
              >
                <input type="radio" name="conta" value={o.id} defaultChecked={i === 0} className="mt-1" />
                <span>
                  <span className="block text-[length:var(--fs-body)] text-fg">{o.cliente}</span>
                  <span className="block text-[length:var(--fs-helper)] text-fg-muted">{o.escritorio}</span>
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
