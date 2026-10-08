"use client";

import { useActionState } from "react";
import { ArrowLeft } from "lucide-react";
import { MailIcon } from "./icons";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import type { EsqueciSenhaState } from "@/app/login/esqueci-senha/actions";

type Props = {
  action: (prev: EsqueciSenhaState, form: FormData) => Promise<EsqueciSenhaState>;
  /** Para onde "Voltar para o login" leva: o cliente do portal volta ao login dele. */
  voltarPara: string;
};

/**
 * Só o e-mail: o link de senha nova vai para a conta, se ela existir.
 *
 * Desde 07/10/2026 com o `Input` e o `Aviso` do sistema — a equipe e o cliente
 * do portal caem aqui, e o login do portal já usava os campos de `ui/`.
 */
export function EsqueciSenhaForm({ action, voltarPara }: Props) {
  const [state, formAction, isPending] = useActionState<EsqueciSenhaState, FormData>(action, null);

  if (state && "success" in state) {
    return (
      <div className="text-center py-2 space-y-3">
        <p className="text-label font-semibold text-fg">Confira o seu e-mail</p>
        <p className="text-ui text-fg-muted leading-relaxed">
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
      <CampoForm label="E-mail" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com.br"
          icon={<MailIcon />}
        />
      </CampoForm>

      {state?.error && <Aviso>{state.error}</Aviso>}

      <Button type="submit" size="md" loading={isPending} loadingLabel="Enviando…" className="w-full mt-1">
        Enviar link
      </Button>

      {/* Revisão de 05/10: botão não é link — era texto azul. */}
      <div className="text-center">
        <Button href={voltarPara} variant="ghost" size="sm">
          <ArrowLeft size={14} />
          Voltar para o login
        </Button>
      </div>
    </form>
  );
}
