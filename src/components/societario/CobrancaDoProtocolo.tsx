"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { OPCOES_DA_COBRANCA, rotuloDaCobranca } from "@/lib/societario/protocoloParado";
import { definirCobrancaDoProtocolo } from "@/app/(app)/exigencias/actions";

/**
 * Depois de quantos dias sem resposta o protocolo avisa para cobrar o órgão
 * (lote 5, 28/10/2026). Vale na hora: trocar já grava; um erro volta o campo.
 */
export function CobrancaDoProtocolo({
  dias,
  padrao,
  naLinha = false,
}: {
  dias: number;
  padrao: number;
  /**
   * No cabeçalho da aba Protocolos parados (04/11/2026): só o "Avisar depois
   * de" com o seletor, sem cartão. Era um cartão solto no pé das Exigências.
   */
  naLinha?: boolean;
}) {
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

  const seletor = (
    <Select
      id="cobrancaDoProtocolo"
      value={valor}
      onChange={(e) => trocar(e.target.value)}
      disabled={pendente}
      {...(naLinha ? { compact: true, className: "w-52" } : {})}
    >
      {OPCOES_DA_COBRANCA.map((d) => (
        <option key={d} value={String(d)}>
          {rotuloDaCobranca(d)}
        </option>
      ))}
    </Select>
  );

  if (naLinha) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-ui text-fg-secondary">
        <label htmlFor="cobrancaDoProtocolo" title={`O padrão é ${padrao} dias.`}>
          Avisar o responsável depois de
        </label>
        {seletor}
      </div>
    );
  }

  return (
    <Card className="p-4 max-w-3xl">
      <CampoForm
        label="Cobrar o órgão do protocolo parado"
        htmlFor="cobrancaDoProtocolo"
        helper={`O protocolo que aguarda o órgão há esse tempo, sem resposta, avisa o responsável do processo (ou a coordenação) para cobrar — e de novo a cada mesmo intervalo. O padrão é ${padrao} dias.`}
      >
        {seletor}
      </CampoForm>
    </Card>
  );
}
