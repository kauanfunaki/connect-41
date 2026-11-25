"use client";

// A data de caixa e o saldo da empresa, no Modelo do fluxo (25/11/2026,
// funcionalidade-837): quantos dias depois da previsão (ou do vencimento) o
// dinheiro anda na conta, e de onde vem o saldo de que o previsto parte. Um
// cliente do BPO vê o que recebe um dia depois; outro, no mesmo dia. Sem
// configurar, os dias ficam em zero e o saldo vem da conciliação (sem ela, do
// Omie).

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { salvarDataDeCaixa } from "@/app/(app)/fluxo-de-caixa/actions";
import type { ConfiguracaoDoFluxo, OrigemDoSaldo } from "@/lib/fluxoDeCaixa/previstoServidor";

const MAXIMO_DE_DIAS = 30;

const ROTULO = "text-micro uppercase tracking-wide text-fg-muted font-semibold";

export function DataDeCaixa({ companyId, atual }: { companyId: string; atual: ConfiguracaoDoFluxo }) {
  const [receber, setReceber] = useState(String(atual.diasReceber));
  const [pagar, setPagar] = useState(String(atual.diasPagar));
  const [origem, setOrigem] = useState<OrigemDoSaldo>(atual.origemDoSaldo);
  const [estado, setEstado] = useState<{ tipo: "salvo" } | { tipo: "erro"; mensagem: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const mudou = receber !== String(atual.diasReceber) || pagar !== String(atual.diasPagar) || origem !== atual.origemDoSaldo;

  return (
    <Card as="section" className="p-4 mb-4 flex flex-col gap-3" aria-labelledby="h-data-de-caixa">
      <div className="flex flex-col gap-0.5">
        <h2 id="h-data-de-caixa" className="text-section font-semibold text-fg">
          Data de caixa e saldo
        </h2>
        <p className="text-helper text-fg-muted max-w-[72ch]">
          Quantos dias depois da previsão (ou do vencimento) o dinheiro anda na conta. Se cair em fim de semana ou feriado, o Previsto passa
          para o próximo dia útil. O saldo é o ponto de partida do Previsto.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-x-4 gap-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setEstado(null);
          startTransition(async () => {
            const r = await salvarDataDeCaixa(companyId, Number(receber), Number(pagar), origem);
            setEstado("error" in r ? { tipo: "erro", mensagem: r.error } : { tipo: "salvo" });
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>A receber entra</span>
          <span className="flex items-center gap-2 text-ui text-fg-secondary">
            <Input compact type="number" inputMode="numeric" min={0} max={MAXIMO_DE_DIAS} value={receber} onChange={(e) => setReceber(e.target.value)} className="w-20" aria-describedby="dc-receber" />
            <span id="dc-receber">dias depois</span>
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>A pagar sai</span>
          <span className="flex items-center gap-2 text-ui text-fg-secondary">
            <Input compact type="number" inputMode="numeric" min={0} max={MAXIMO_DE_DIAS} value={pagar} onChange={(e) => setPagar(e.target.value)} className="w-20" aria-describedby="dc-pagar" />
            <span id="dc-pagar">dias depois</span>
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>Saldo inicial</span>
          <Select compact value={origem} onChange={(e) => setOrigem(e.target.value as OrigemDoSaldo)} className="w-72">
            <option value="auto">Da conciliação; sem ela, do Omie</option>
            <option value="conciliacao">Da conciliação do Connect</option>
            <option value="omie">Do Omie (a empresa concilia lá)</option>
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
