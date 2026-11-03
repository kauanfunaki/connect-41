"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { ROTULO_DO_PASSO } from "@/lib/contabil/lote";

/**
 * O passo 7 (03/11/2026): os doze meses da empresa num ZIP, para quando o
 * Contábil importa o ano de uma vez. Cada mês vira uma pasta com um arquivo
 * por passo, e o _RESUMO.csv diz o que saiu e o que ficou pendente.
 */
export function LoteDoAno({ empresaId, mes }: { empresaId: string; mes: string }) {
  const atual = Number(mes.slice(0, 4));
  const [ano, setAno] = useState(String(atual));
  const [formato, setFormato] = useState("xlsx");
  const anos = Array.from({ length: 6 }, (_, i) => String(atual - i));
  const href = "/api/contabil/lote?" + new URLSearchParams({ empresa: empresaId, ano, formato });
  return <Card className="p-4 space-y-4 max-w-2xl">
    <div>
      <h3 className="text-card-title font-semibold">Gerar o ano inteiro</h3>
      <p className="text-helper text-fg-secondary">Entra cada mês de janeiro a dezembro: {[ROTULO_DO_PASSO.nfe, ROTULO_DO_PASSO.cte, ROTULO_DO_PASSO.nfse, ROTULO_DO_PASSO.saidas].join(", ")}. Os pagamentos sem nota entram quando a etapa deles estiver pronta. Mês sem lançamento não gera arquivo, mas aparece no resumo.</p>
    </div>
    <div className="flex flex-wrap items-end gap-4">
      <label className="block w-32"><span className="block text-helper text-fg-secondary mb-1">Ano</span>
        <Select compact value={ano} onChange={(e) => setAno(e.target.value)}>{anos.map((a) => <option key={a} value={a}>{a}</option>)}</Select></label>
      <RadioGroup variante="linha" legenda="Formato" valor={formato} onChange={setFormato} opcoes={[{ valor: "xlsx", rotulo: "Planilha (.xlsx)" }, { valor: "txt", rotulo: "Texto (.txt)" }]} />
    </div>
    <Button href={href} download><Download size={14} aria-hidden />Baixar o ZIP de {ano}</Button>
  </Card>;
}
