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

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <CampoForm label="E-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </CampoForm>

        <CampoForm label="Senha" htmlFor="senha" required>
          <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
        </CampoForm>

        {estado?.erro && <p className="text-[length:var(--fs-helper)] text-danger">{estado.erro}</p>}

        <Button type="submit" disabled={pendente} className="w-full justify-center">
          {pendente ? "Entrando…" : "Entrar"}
        </Button>

        <p className="text-[length:var(--fs-helper)] text-fg-muted text-center">
          <Link href="/portal/esqueci-senha" className="text-brand hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </Card>
  );
}
