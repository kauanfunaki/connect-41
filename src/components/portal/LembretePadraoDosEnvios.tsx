"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { OPCOES_DO_LEMBRETE } from "@/lib/envios/lembrete";

type Resultado = { ok: true } | { erro: string };

type Props = {
  /** O padrão gravado; `null` = sem lembrete. */
  dias: number | null;
  /** `definirLembretePadraoDosEnvios`, que confere de novo o papel e o escritório. */
  definirAction: (valor: string) => Promise<Resultado>;
  somenteLeitura?: boolean;
};

/**
 * O lembrete de não lido padrão dos envios (23/10/2026), em Administração ›
 * Portal do cliente › Envios. Vale na hora, como os interruptores das outras
 * abas: trocar o prazo já grava; um erro volta o campo para onde estava.
 */
export function LembretePadraoDosEnvios({ dias, definirAction, somenteLeitura = false }: Props) {
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const [valor, setValor] = useState(dias ? String(dias) : "");

  function trocar(novo: string) {
    const antes = valor;
    setValor(novo);
    startTransition(async () => {
      const r = await definirAction(novo).catch(() => ({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }));
      if ("erro" in r) {
        setValor(antes);
        toast.error(r.erro);
        return;
      }
      toast.success(novo ? `Os envios novos vêm com lembrete em ${novo} dias.` : "Os envios novos vêm sem lembrete.");
    });
  }

  return (
    <Card className="p-4 max-w-3xl">
      <CampoForm
        label="Lembrete de não lido padrão"
        htmlFor="lembretePadrao"
        helper="O prazo que um envio novo já traz escolhido. Quem envia ainda troca, envio a envio; os envios que já existem não mudam."
      >
        <Select id="lembretePadrao" value={valor} onChange={(e) => trocar(e.target.value)} disabled={somenteLeitura || pendente}>
          {OPCOES_DO_LEMBRETE.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </CampoForm>
    </Card>
  );
}
