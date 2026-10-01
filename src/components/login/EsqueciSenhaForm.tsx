"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthField, AUTH_INPUT } from "./AuthShell";
import { MailIcon } from "./icons";
import { Button } from "@/components/ui/Button";
import type { EsqueciSenhaState } from "@/app/login/esqueci-senha/actions";

type Props = {
  action: (prev: EsqueciSenhaState, form: FormData) => Promise<EsqueciSenhaState>;
  /** Para onde "Voltar para o login" leva: o cliente do portal volta ao login dele. */
  voltarPara: string;
};

/** Só o e-mail: o link de senha nova vai para a conta, se ela existir. */
export function EsqueciSenhaForm({ action, voltarPara }: Props) {
  const [state, formAction, isPending] = useActionState<EsqueciSenhaState, FormData>(action, null);

  if (state && "success" in state) {
    return (
      <div className="text-center py-2 space-y-3">
        <p className="text-[14px] font-semibold text-fg">Confira o seu e-mail</p>
        <p className="text-[13px] text-fg-muted leading-relaxed">
          Se houver uma conta com esse e-mail, o link para criar a senha nova chega em alguns minutos. Não chegou?
          Olhe a caixa de spam ou fale com quem administra o seu acesso.
        </p>
        <Button href={voltarPara} variant="secondary" className="mt-2">
          Voltar para o login
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <AuthField label="E-mail" htmlFor="email" icon={<MailIcon />}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com.br"
          className={AUTH_INPUT}
        />
      </AuthField>

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <Button type="submit" size="md" disabled={isPending} className="w-full mt-1">
        {isPending ? "Enviando…" : "Enviar link"}
      </Button>

      <p className="text-center text-[13px] text-fg-muted">
        <Link href={voltarPara} className="font-medium text-brand hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}
