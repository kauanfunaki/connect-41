"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { TrocaSenhaState } from "@/app/(app)/configuracoes/actions";

type Props = {
  action: (prev: TrocaSenhaState, form: FormData) => Promise<TrocaSenhaState>;
};

export function AlterarSenhaForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const router = useRouter();

  const loggedOut = !!state && "loggedOut" in state;

  // Trocar a senha revoga todos os refresh tokens, inclusive o deste
  // navegador. Em vez de deixar a sessão morrer sozinha no próximo refresh
  // (até 15min depois, com um erro sem explicação), limpa os cookies e manda
  // pro login na hora.
  useEffect(() => {
    if (!loggedOut) return;
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        if (!cancelled) router.push("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedOut, router]);

  if (loggedOut) {
    return (
      <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">
        Senha alterada. Todas as sessões foram encerradas — redirecionando para o login…
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state && "error" in state && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <p className="text-[length:var(--fs-helper)] text-fg-muted">
        Ao trocar a senha, todas as sessões abertas são encerradas — inclusive esta. Você vai precisar entrar de novo.
      </p>

      <CampoForm label="Senha atual" htmlFor="currentPassword" required>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </CampoForm>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Nova senha" htmlFor="newPassword" required helper="Mínimo de 8 caracteres.">
          <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
        </CampoForm>
        <CampoForm label="Confirmar nova senha" htmlFor="confirmPassword" required>
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
        </CampoForm>
      </div>

      <Button type="submit" loading={isPending}>
        Alterar senha
      </Button>
    </form>
  );
}
