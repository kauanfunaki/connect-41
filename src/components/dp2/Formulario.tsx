"use client";

import { useActionState, useRef, useState } from "react";
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
  children,
}: {
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
  return (
    <form ref={formulario} action={enviar} className={className}>
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
