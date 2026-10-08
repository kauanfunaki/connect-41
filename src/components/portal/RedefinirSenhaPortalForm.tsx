"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import type { EstadoDaRedefinicao } from "@/app/(portal)/portal/redefinir-senha/actions";

type Props = {
  token: string;
  action: (anterior: EstadoDaRedefinicao, form: FormData) => Promise<EstadoDaRedefinicao>;
};

/**
 * A senha nova do cliente. Erro no `Aviso` e o botão com `loading` (07/10/2026),
 * no mesmo desenho do login e do "Esqueci a senha".
 */
export function RedefinirSenhaPortalForm({ token, action }: Props) {
  const [estado, formAction, pendente] = useActionState<EstadoDaRedefinicao, FormData>(action, null);

  if (estado && "success" in estado) {
    return (
      // O mesmo fecho da redefinição da equipe (login/RedefinirSenhaForm): a
      // frase e um botão para o próximo passo, no lugar do link solto.
      <Card className="p-6 text-center">
        <p className="text-body text-fg mb-4">Senha alterada.</p>
        <Button href="/portal/login" variant="secondary">
          Entrar no portal
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />

        <CampoForm label="Nova senha" htmlFor="senha" helper="Ao menos 8 caracteres." required>
          <CampoDeSenha id="senha" name="senha" autoComplete="new-password" required autoFocus />
        </CampoForm>

        <CampoForm label="Confirme a senha" htmlFor="confirmacao" required>
          <CampoDeSenha id="confirmacao" name="confirmacao" autoComplete="new-password" required />
        </CampoForm>

        {estado && "error" in estado && <Aviso>{estado.error}</Aviso>}

        <Button type="submit" loading={pendente} loadingLabel="Salvando…" className="w-full justify-center">
          Salvar senha
        </Button>
      </form>
    </Card>
  );
}
