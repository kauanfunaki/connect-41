"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Button } from "@/components/ui/Button";
import type { TrocaSenhaState } from "@/app/(app)/configuracoes/actions";
import { Aviso } from "@/components/ui/Aviso";

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
      <Aviso tom="sucesso">
        Senha alterada. Todas as sessões foram encerradas — redirecionando para o login…
      </Aviso>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state && "error" in state && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      <p className="text-helper text-fg-muted">
        Ao trocar a senha, todas as sessões abertas são encerradas — inclusive esta. Você vai precisar entrar de novo.
      </p>

      {/* A senha atual na largura de uma coluna, alinhada às duas de baixo —
          esticada na linha toda, era o dobro das outras. */}
      <FieldGrid>
        <CampoForm label="Senha atual" htmlFor="currentPassword" required>
          <CampoDeSenha id="currentPassword" name="currentPassword" autoComplete="current-password" required />
        </CampoForm>
      </FieldGrid>

      <FieldGrid>
        <CampoForm label="Nova senha" htmlFor="newPassword" required helper="Mínimo de 8 caracteres.">
          <CampoDeSenha id="newPassword" name="newPassword" autoComplete="new-password" minLength={8} required />
        </CampoForm>
        <CampoForm label="Confirmar nova senha" htmlFor="confirmPassword" required>
          <CampoDeSenha id="confirmPassword" name="confirmPassword" autoComplete="new-password" minLength={8} required />
        </CampoForm>
      </FieldGrid>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button type="submit" loading={isPending}>
          Alterar senha
        </Button>
      </div>
    </form>
  );
}
