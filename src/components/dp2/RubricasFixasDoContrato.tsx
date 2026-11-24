"use client";

// As rubricas fixas do contrato (19/11/2026, funcionalidade-767): o que se
// repete todo mês para a pessoa — gratificação de função, quebra de caixa,
// desconto de plano de saúde… Zero, uma ou várias; o cálculo da folha mensal
// as lança sozinho de "a partir de" até "até". A lista vai inteira num campo
// JSON (`rubricasFixas`) do formulário do contrato.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoMes } from "@/components/ui/CampoMes";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { LinhaDaRubricaFixa } from "@/lib/dp2/rubricasFixas";

export type RubricaParaFixar = { id: string; rotulo: string; unidade: "horas" | "dias" | null };

type Linha = Required<LinhaDaRubricaFixa> & { chave: string };

let sequencia = 0;
const novaChave = () => `fixa-${++sequencia}`;

export function RubricasFixasDoContrato({ rubricas, iniciais, mesPadrao }: { rubricas: RubricaParaFixar[]; iniciais: LinhaDaRubricaFixa[]; mesPadrao: string }) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    iniciais.map((l) => ({ rubricaId: l.rubricaId ?? "", quantidade: l.quantidade ?? "", valor: l.valor ?? "", inicio: l.inicio ?? mesPadrao, fim: l.fim ?? "", observacao: l.observacao ?? "", chave: novaChave() }))
  );
  const porId = new Map(rubricas.map((r) => [r.id, r]));
  const mudar = (chave: string, campo: keyof LinhaDaRubricaFixa, valor: string) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  const json = JSON.stringify(linhas.map((l) => ({ rubricaId: l.rubricaId, quantidade: l.quantidade, valor: l.valor, inicio: l.inicio, fim: l.fim, observacao: l.observacao })));

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="rubricasFixas" value={json} />
      {linhas.length === 0 ? (
        <p className="text-fs-2 text-fg-muted">
          Nenhuma rubrica fixa. O que se repete todo mês (gratificação, quebra de caixa, desconto de plano de saúde…) entra aqui, e o cálculo da folha lança sozinho.
        </p>
      ) : (
        linhas.map((l, i) => {
          const r = porId.get(l.rubricaId);
          const porQuantidade = !!r?.unidade;
          return (
            <div key={l.chave} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_auto]">
              <CampoForm label={`Rubrica ${i + 1}`} htmlFor={`${l.chave}-rubrica`}>
                <Select id={`${l.chave}-rubrica`} value={l.rubricaId} onChange={(e) => mudar(l.chave, "rubricaId", e.target.value)}>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {rubricas.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.rotulo}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label={porQuantidade ? (r?.unidade === "dias" ? "Dias" : "Horas") : "Valor"} htmlFor={`${l.chave}-quanto`}>
                <Input
                  id={`${l.chave}-quanto`}
                  inputMode="decimal"
                  prefix={porQuantidade ? undefined : "R$"}
                  placeholder={porQuantidade ? "10" : "0,00"}
                  value={porQuantidade ? l.quantidade : l.valor}
                  onChange={(e) => mudar(l.chave, porQuantidade ? "quantidade" : "valor", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="A partir de" htmlFor={`${l.chave}-inicio`}>
                <CampoMes aria-label="A partir de" value={l.inicio} onChange={(v) => mudar(l.chave, "inicio", v)} compact />
              </CampoForm>
              <CampoForm label="Até (opcional)" htmlFor={`${l.chave}-fim`}>
                <CampoMes aria-label="Até" value={l.fim} onChange={(v) => mudar(l.chave, "fim", v)} compact />
              </CampoForm>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" aria-label={`Retirar a rubrica fixa ${i + 1}`} onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                  <Trash2 size={14} aria-hidden="true" />
                  Retirar
                </Button>
              </div>
              <CampoForm label="Observação" htmlFor={`${l.chave}-obs`} className="sm:col-span-2 lg:col-span-5">
                <Input id={`${l.chave}-obs`} maxLength={300} value={l.observacao} onChange={(e) => mudar(l.chave, "observacao", e.target.value)} placeholder="Ex.: plano de saúde Unimed, titular + 1 dependente" />
              </CampoForm>
            </div>
          );
        })
      )}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setLinhas((ls) => [...ls, { rubricaId: "", quantidade: "", valor: "", inicio: mesPadrao, fim: "", observacao: "", chave: novaChave() }])}
        >
          <Plus size={14} aria-hidden="true" />
          Adicionar rubrica fixa
        </Button>
      </div>
    </div>
  );
}
