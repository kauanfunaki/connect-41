"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { OPCOES_DA_COBRANCA, rotuloDaCobranca } from "@/lib/societario/protocoloParado";
import { definirCobrancaDoProtocolo } from "@/app/(app)/societario/exigencias/actions";

/**
 * Depois de quantos dias sem resposta o protocolo avisa para cobrar o órgão
 * (lote 5, 28/10/2026). Vale na hora: trocar já grava; um erro volta o campo.
 */
export function CobrancaDoProtocolo({ dias, padrao }: { dias: number; padrao: number }) {
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const [valor, setValor] = useState(String(dias));

  function trocar(novo: string) {
    const antes = valor;
    setValor(novo);
    startTransition(async () => {
      const r = await definirCobrancaDoProtocolo(novo).catch(() => ({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }));
      if ("erro" in r) {
        setValor(antes);
        toast.error(r.erro);
        return;
      }
      toast.success(novo === "0" ? "O protocolo parado não avisa mais." : `O protocolo parado avisa com ${novo} dias sem resposta.`);
    });
  }

  return (
    <Card className="p-4 max-w-3xl">
      <CampoForm
        label="Cobrar o órgão do protocolo parado"
        htmlFor="cobrancaDoProtocolo"
        helper={`O protocolo que aguarda o órgão há esse tempo, sem resposta, avisa o responsável do processo (ou a coordenação) para cobrar — e de novo a cada mesmo intervalo. O padrão é ${padrao} dias.`}
      >
        <Select id="cobrancaDoProtocolo" value={valor} onChange={(e) => trocar(e.target.value)} disabled={pendente}>
          {OPCOES_DA_COBRANCA.map((d) => (
            <option key={d} value={String(d)}>
              {rotuloDaCobranca(d)}
            </option>
          ))}
        </Select>
      </CampoForm>
    </Card>
  );
}
