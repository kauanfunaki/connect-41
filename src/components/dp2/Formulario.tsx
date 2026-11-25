"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** O que as ações do DP 2 devolvem: a frase de sucesso ou o erro, para a mesma linha do botão. */
export type EstadoDoDp2 = { ok: boolean; texto: string } | null;

export type AcaoDoDp2 = (anterior: EstadoDoDp2, dados: FormData) => Promise<EstadoDoDp2>;

/**
 * Formulário do DP 2: o botão de enviar e, ao lado, o resultado da ação
 * ("Calculado: 12 pessoas", "Informe a vigência"). As ações devolvem
 * `EstadoDoDp2` e revalidam a tela; quem cria e precisa ir para outra tela
 * redireciona no servidor.
 */
export function FormularioDoDp2({
  acao,
  rotulo,
  rotuloEnviando = "Salvando…",
  variante = "primary",
  tamanho = "md",
  className = "",
  icone,
  confirmar,
  manterAposEnviar,
  aoConcluir,
  children,
}: {
  /**
   * Chamado com o resultado de cada envio (25/11/2026, funcionalidade-767): para
   * quem guarda os campos em estado próprio limpar só depois do sucesso, como
   * o lançamento por rubrica.
   */
  aoConcluir?: (estado: NonNullable<EstadoDoDp2>) => void;
  /**
   * Campos que voltam com o valor enviado depois de um envio que deu certo
   * (19/11/2026, bug-795). O React limpa o formulário inteiro depois da ação;
   * no lançamento de eventos o colaborador fica, para lançar outra rubrica para
   * a mesma pessoa, e o resto (rubrica, horas, valor) volta limpo.
   */
  manterAposEnviar?: string[];
  /**
   * Pede confirmação antes de enviar (17/11/2026, bug-724): para o que a pessoa
   * não consegue desfazer sozinha, como fechar a competência.
   */
  confirmar?: { titulo: string; texto: string; rotulo: string };
  /** Ícone antes do rótulo: o "+" dos botões que criam ou adicionam. */
  icone?: React.ReactNode;
  acao: AcaoDoDp2;
  rotulo: string;
  rotuloEnviando?: string;
  variante?: "primary" | "secondary" | "danger" | "ghost";
  tamanho?: "xs" | "sm" | "md";
  className?: string;
  children?: React.ReactNode;
}) {
  const [estado, enviar, enviando] = useActionState(acao, null);
  const formulario = useRef<HTMLFormElement>(null), [perguntando, setPerguntando] = useState(false);
  // Com campos a manter (bug-795), o envio é por onSubmit: com `action`, o
  // React limpa o formulário inteiro ao fim da ação, e a volta dos campos
  // brigava com essa limpeza. Aqui a limpeza é nossa, depois do sucesso.
  const limparDepois = useRef(false);
  useEffect(() => {
    const f = formulario.current;
    if (!f || !estado?.ok || !limparDepois.current || !manterAposEnviar) return;
    limparDepois.current = false;
    limparMenos(f, manterAposEnviar);
  }, [estado, manterAposEnviar]);
  const concluir = useRef(aoConcluir);
  useEffect(() => {
    concluir.current = aoConcluir;
  });
  useEffect(() => {
    if (estado) concluir.current?.(estado);
  }, [estado]);
  const aoEnviar = manterAposEnviar
    ? (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        limparDepois.current = true;
        startTransition(() => enviar(dados));
      }
    : undefined;
  return (
    <form ref={formulario} action={manterAposEnviar ? undefined : enviar} onSubmit={aoEnviar} className={className}>
      {children}
      <div className={`flex flex-wrap items-center gap-3 ${children ? "mt-4" : ""}`}>
        <Button type={confirmar ? "button" : "submit"} onClick={confirmar ? () => { if (formulario.current?.reportValidity()) setPerguntando(true); } : undefined} variant={variante} size={tamanho} loading={enviando} loadingLabel={rotuloEnviando}>
          {icone}
          {rotulo}
        </Button>
        {confirmar && (
          <ConfirmDialog open={perguntando} title={confirmar.titulo} description={confirmar.texto} confirmLabel={confirmar.rotulo}
            onConfirm={() => { setPerguntando(false); formulario.current?.requestSubmit(); }} onCancel={() => setPerguntando(false)} />
        )}
        {estado && (
          <span role="status" className={`text-fs-2 ${estado.ok ? "text-success-fg" : "text-danger"}`}>
            {estado.texto}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * Limpa os campos do formulário, menos os de `manter` e os escondidos (que
 * levam o contexto, como a competência). O `select.value = ""` passa pelo
 * aviso do Select do Connect, que atualiza o que mostra.
 */
function limparMenos(f: HTMLFormElement, manter: readonly string[]): void {
  for (const el of Array.from(f.elements)) {
    if (el instanceof HTMLSelectElement) {
      if (!el.name || manter.includes(el.name) || el.value === "") continue;
      el.value = "";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (!el.name || manter.includes(el.name) || el.type === "hidden" || el.type === "checkbox" || el.type === "radio" || el.value === "") continue;
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}
