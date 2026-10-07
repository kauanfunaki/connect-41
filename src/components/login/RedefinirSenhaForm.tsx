"use client";

import { useActionState } from "react";
import { ArrowLeft } from "lucide-react";
import { LockIcon } from "./icons";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { CampoForm } from "@/components/ui/CampoForm";

type ActionState = { error: string } | { success: true } | null;

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  token: string;
};

export function RedefinirSenhaForm({ action, token }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);

  if (state && "success" in state) {
    return (
      <div className="text-center py-2 space-y-3">
        <p className="text-label font-semibold text-fg">Senha redefinida</p>
        <p className="text-ui text-fg-muted leading-relaxed">
          Sua senha foi alterada. Todas as sessões ativas foram encerradas por segurança — entre novamente com a nova
          senha.
        </p>
        <Button href="/login" variant="secondary" className="mt-2">
          Ir para o login
        </Button>
      </div>
    );
  }

  // As duas senhas com o `CampoDeSenha` do sistema (07/10/2026), cada uma com
  // o seu olho e o cadeado — a de confirmação era uma caixa cega, sem olho. Os
  // nomes `password` e `confirmPassword` são os que a action lê.
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <CampoForm label="Nova senha" htmlFor="password" required>
        <CampoDeSenha
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          icon={<LockIcon />}
        />
      </CampoForm>

      <CampoForm label="Confirmar nova senha" htmlFor="confirmPassword" required>
        <CampoDeSenha
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          icon={<LockIcon />}
        />
      </CampoForm>

      {state?.error && <Aviso>{state.error}</Aviso>}

      <Button type="submit" size="md" loading={isPending} className="w-full mt-1">
        Redefinir senha
      </Button>

      {/* Revisão de 05/10: botão não é link — era texto azul. */}
      <div className="text-center">
        <Button href="/login" variant="ghost" size="sm">
          <ArrowLeft size={14} />
          Voltar para o login
        </Button>
      </div>
    </form>
  );
}
