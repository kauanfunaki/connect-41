"use client";

import { useId } from "react";
import { Select } from "@/components/ui/Select";
import { useNavegarSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";

/**
 * O seletor "Análise" da aba Análises e reconciliação (16/11/2026,
 * melhoria-718): as sete análises eram uma segunda fileira de abas embaixo das
 * quatro DREs, e o BPO pediu uma fileira só.
 *
 * Escolher já abre a análise, sem "Aplicar" — era um clique na aba —, e sem
 * recarregar a página, como o seletor de empresa do portal
 * (`SeletorDeEmpresaQueNavega`). O mês ao lado segue no formulário dele.
 */
export function SeletorDeAnalise({
  analises,
  ativa,
}: {
  /** As análises, cada uma com o endereço já montado (empresa e mês da tela). */
  analises: { chave: string; rotulo: string; href: string }[];
  ativa: string;
}) {
  const { ir } = useNavegarSemRecarregar();
  const id = useId();
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-ui font-medium text-fg-secondary">
        Análise
      </label>
      <Select
        // Solto (`defaultValue`), para a escolha aparecer no campo enquanto a
        // análise chega; o `key` o refaz quando a análise muda por fora (o
        // voltar do navegador, um link do CFO).
        key={ativa}
        id={id}
        compact
        defaultValue={ativa}
        className="min-w-0"
        onChange={(e) => {
          const escolhida = analises.find((a) => a.chave === e.target.value);
          if (escolhida && escolhida.chave !== ativa) ir(escolhida.href);
        }}
      >
        {analises.map((a) => (
          <option key={a.chave} value={a.chave}>
            {a.rotulo}
          </option>
        ))}
      </Select>
    </div>
  );
}
