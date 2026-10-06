"use client";

import { useActionState } from "react";
import { ArrowLeft } from "lucide-react";
import { PasswordField } from "./PasswordField";
import { AuthField, AUTH_INPUT } from "./AuthShell";
import { LockIcon } from "./icons";
import { Button } from "@/components/ui/Button";

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
        <p className="text-[14px] font-semibold text-fg">Senha redefinida</p>
        <p className="text-[13px] text-fg-muted leading-relaxed">
          Sua senha foi alterada. Todas as sessões ativas foram encerradas por segurança — entre novamente com a nova
          senha.
        </p>
        <Button href="/login" variant="secondary" className="mt-2">
          Ir para o login
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <PasswordField label="Nova senha" autoComplete="new-password" />

      {/* PasswordField usa id/name fixos ("password") — o campo de confirmação
          precisa dos seus próprios, então não reaproveita o componente aqui.
          Mas usa a mesma caixa, com o cadeado: sem ele, o texto desta senha
          começava 24px à esquerda do da senha de cima. */}
      <AuthField label="Confirmar nova senha" htmlFor="confirmPassword" icon={<LockIcon />}>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          className={AUTH_INPUT}
        />
      </AuthField>

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        size="md"
        disabled={isPending}
        className="w-full mt-1"
      >
        {isPending ? "Salvando…" : "Redefinir senha"}
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
