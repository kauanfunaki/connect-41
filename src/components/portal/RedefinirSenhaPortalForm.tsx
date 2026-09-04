"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { EstadoDaRedefinicao } from "@/app/(portal)/portal/redefinir-senha/actions";

type Props = {
  token: string;
  action: (anterior: EstadoDaRedefinicao, form: FormData) => Promise<EstadoDaRedefinicao>;
};

export function RedefinirSenhaPortalForm({ token, action }: Props) {
  const [estado, formAction, pendente] = useActionState<EstadoDaRedefinicao, FormData>(action, null);

  if (estado && "success" in estado) {
    return (
      <Card className="p-6 text-center">
        <p className="text-[length:var(--fs-body)] text-fg mb-4">Senha alterada.</p>
        <Link href="/portal/login" className="text-brand hover:underline text-[length:var(--fs-ui)]">
          Entrar no portal
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />

        <CampoForm label="Nova senha" htmlFor="senha" helper="Ao menos 8 caracteres." required>
          <Input id="senha" name="senha" type="password" autoComplete="new-password" required autoFocus />
        </CampoForm>

        <CampoForm label="Confirme a senha" htmlFor="confirmacao" required>
          <Input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" required />
        </CampoForm>

        {estado && "error" in estado && (
          <p className="text-[length:var(--fs-helper)] text-danger">{estado.error}</p>
        )}

        <Button type="submit" disabled={pendente} className="w-full justify-center">
          {pendente ? "Salvando…" : "Salvar senha"}
        </Button>
      </form>
    </Card>
  );
}
