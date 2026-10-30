"use client";

import { startTransition, useActionState } from "react";

/**
 * Envio de formulário que só limpa os campos quando grava.
 *
 * Com `<form action={...}>` o React limpa os campos não controlados assim que a
 * action termina — tenha ela gravado ou devolvido `{ error }`. Num registro de
 * afastamento com nove campos, uma data recusada apagava tudo o que a pessoa
 * tinha digitado (auditoria de UX, 30/10/2026; o mesmo motivo do `onSubmit` em
 * `DadosPessoaisDoCandidato`). Aqui o envio vai pelo `onSubmit`, e o
 * formulário só volta ao vazio quando a action devolve `null` — o registro
 * entrou e o bloco fica pronto para o próximo.
 *
 * Uso: `const [state, enviar, isPending] = useEnvioQueGuardaNoErro(action);`
 * e `<form onSubmit={enviar}>`.
 */
export function useEnvioQueGuardaNoErro<S extends { error: string } | null>(acao: (anterior: S, form: FormData) => Promise<S>) {
  const [estado, despachar, enviando] = useActionState(
    async (anterior: Awaited<S>, { form, dados }: { form: HTMLFormElement; dados: FormData }): Promise<S> => {
      const r = await acao(anterior as S, dados);
      if (!r) form.reset();
      return r;
    },
    null as Awaited<S>
  );

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dados = new FormData(form);
    startTransition(() => despachar({ form, dados }));
  }

  return [estado, enviar, enviando] as const;
}
