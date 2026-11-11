"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";

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
  children,
}: {
  acao: AcaoDoDp2;
  rotulo: string;
  rotuloEnviando?: string;
  variante?: "primary" | "secondary" | "danger" | "ghost";
  tamanho?: "xs" | "sm" | "md";
  className?: string;
  children?: React.ReactNode;
}) {
  const [estado, enviar, enviando] = useActionState(acao, null);
  return (
    <form action={enviar} className={className}>
      {children}
      <div className={`flex flex-wrap items-center gap-3 ${children ? "mt-4" : ""}`}>
        <Button type="submit" variant={variante} size={tamanho} loading={enviando} loadingLabel={rotuloEnviando}>
          {rotulo}
        </Button>
        {estado && (
          <span role="status" className={`text-fs-2 ${estado.ok ? "text-success-fg" : "text-danger"}`}>
            {estado.texto}
          </span>
        )}
      </div>
    </form>
  );
}
