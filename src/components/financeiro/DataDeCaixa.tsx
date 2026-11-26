"use client";

// A data de caixa e o saldo da empresa, no Modelo do fluxo (25/11/2026,
// funcionalidade-837): quantos dias depois da previsão (ou do vencimento) o
// dinheiro anda na conta, e de onde vem o saldo de que o previsto parte. Um
// cliente do BPO vê o que recebe um dia depois; outro, no mesmo dia. Sem
// configurar, os dias ficam em zero e o saldo vem da conciliação (sem ela, do
// Omie).
//
// Uma faixa de uma linha desde 26/11/2026 (melhoria-879): era um cartão com
// parágrafo de explicação e rótulos em cima de cada campo, alto demais para
// três controles. A explicação foi para o "?" do título.

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { BotaoDaDica } from "@/components/dre/BotaoDaDica";
import { salvarDataDeCaixa } from "@/app/(app)/fluxo-de-caixa/actions";
import type { ConfiguracaoDoFluxo, OrigemDoSaldo } from "@/lib/fluxoDeCaixa/previstoServidor";

const MAXIMO_DE_DIAS = 30;

const DICA =
  "Quantos dias depois da previsão (ou do vencimento) o dinheiro anda na conta. Se cair em fim de semana ou feriado, o Previsto passa para o próximo dia útil. " +
  "O saldo inicial é o ponto de partida do Previsto: “Automático” usa a conciliação do Connect e, sem ela, o Omie; “Omie” é para a empresa que concilia lá.";

export function DataDeCaixa({ companyId, atual }: { companyId: string; atual: ConfiguracaoDoFluxo }) {
  const [receber, setReceber] = useState(String(atual.diasReceber));
  const [pagar, setPagar] = useState(String(atual.diasPagar));
  const [origem, setOrigem] = useState<OrigemDoSaldo>(atual.origemDoSaldo);
  const [estado, setEstado] = useState<{ tipo: "salvo" } | { tipo: "erro"; mensagem: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const mudou = receber !== String(atual.diasReceber) || pagar !== String(atual.diasPagar) || origem !== atual.origemDoSaldo;

  return (
    <Card as="section" className="px-4 py-2.5" aria-labelledby="h-data-de-caixa">
      <form
        className="flex flex-wrap items-center gap-x-3 gap-y-2 min-h-8 text-ui text-fg-secondary"
        onSubmit={(e) => {
          e.preventDefault();
          setEstado(null);
          startTransition(async () => {
            const r = await salvarDataDeCaixa(companyId, Number(receber), Number(pagar), origem);
            setEstado("error" in r ? { tipo: "erro", mensagem: r.error } : { tipo: "salvo" });
          });
        }}
      >
        <div className="flex items-center gap-0.5 mr-2">
          <h2 id="h-data-de-caixa" className="text-label font-semibold text-fg">
            Data de caixa e saldo
          </h2>
          <BotaoDaDica rotulo="a data de caixa e o saldo" dica={DICA} />
        </div>
        <label className="inline-flex items-center gap-2">
          A receber entra
          <Input compact type="number" inputMode="numeric" min={0} max={MAXIMO_DE_DIAS} value={receber} onChange={(e) => setReceber(e.target.value)} className="w-16" />
          dias depois
        </label>
        <span aria-hidden className="text-fg-muted">
          ·
        </span>
        <label className="inline-flex items-center gap-2">
          A pagar sai
          <Input compact type="number" inputMode="numeric" min={0} max={MAXIMO_DE_DIAS} value={pagar} onChange={(e) => setPagar(e.target.value)} className="w-16" />
          dias depois
        </label>
        <span aria-hidden className="text-fg-muted">
          ·
        </span>
        <label className="inline-flex items-center gap-2">
          Saldo inicial
          <Select compact value={origem} onChange={(e) => setOrigem(e.target.value as OrigemDoSaldo)} className="w-36">
            <option value="auto">Automático</option>
            <option value="conciliacao">Conciliação</option>
            <option value="omie">Omie</option>
          </Select>
        </label>
        <Button type="submit" size="sm" variant="secondary" loading={pendente} loadingLabel="Salvando…" disabled={!mudou}>
          Salvar
        </Button>
        <span role="status" className="text-fs-2">
          {estado?.tipo === "salvo" && !mudou && (
            <span className="font-medium text-success-fg">
              <Check size={12} className="inline -mt-0.5" aria-hidden /> Salvo
            </span>
          )}
          {estado?.tipo === "erro" && <span className="text-danger">{estado.mensagem}</span>}
        </span>
      </form>
    </Card>
  );
}
