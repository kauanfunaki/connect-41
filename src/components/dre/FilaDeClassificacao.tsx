"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { GRUPOS, TRANSFERENCIA } from "@/lib/dre/estrutura";
import { classificarCategoria, voltarAoPadrao, type AcaoDoDre } from "@/app/(app)/dre/actions";
import { moeda } from "./RelatorioDoDre";

export type ItemParaClassificar = {
  categoria: string;
  centavos: number;
  origem: "recebimento" | "pagamento";
  /** Nulo quando o lançamento não tem categoria cadastrada — aí não há o que mapear. */
  categoryId: string | null;
};

type Props = {
  companyId: string;
  itens: ItemParaClassificar[];
  /** Categorias que esta empresa desviou do padrão, para poder desfazer. */
  excecoes: { categoryId: string; nome: string; grupo: string }[];
};

export function FilaDeClassificacao({ companyId, itens, excecoes }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});

  async function correr(chave: string, fn: () => Promise<AcaoDoDre>) {
    setOcupado(chave);
    setErro(null);
    const r = await fn();
    if (r && "error" in r) setErro(r.error);
    setOcupado(null);
  }

  const total = itens.reduce((n, i) => n + i.centavos, 0);

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {erro}
        </p>
      )}

      {itens.length > 0 && (
        <Card className="p-4 border-warning/40 bg-warning-bg">
          <p className="text-[13px] text-fg">
            <strong>{moeda(total)}</strong> em{" "}
            {itens.length === 1 ? "1 categoria" : `${itens.length} categorias`} sem grupo no DRE.
            {/* O ponto da tela inteira: na planilha esse dinheiro não aparece em
                linha nenhuma, porque o SUMIF não encontra o que não está na lista. */}
            <span className="block text-[12px] text-fg-secondary mt-1">
              Esse valor não entra em nenhuma linha do relatório até ser classificado.
            </span>
          </p>
        </Card>
      )}

      {itens.map((i) => (
        <Card key={i.categoria} className="p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-fg">{i.categoria}</p>
            <p className="text-[11px] text-fg-muted">
              {i.origem === "recebimento" ? "recebido" : "pago"} · {moeda(i.centavos)}
            </p>
          </div>
          {i.categoryId ? (
            <div className="flex items-center gap-2">
              <Select
                aria-label={`Grupo do DRE para ${i.categoria}`}
                value={escolha[i.categoryId] ?? ""}
                onChange={(e) => setEscolha((s) => ({ ...s, [i.categoryId!]: e.target.value }))}
              >
                <option value="">Classificar em…</option>
                {GRUPOS.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
                {/* Não é resultado, mas é uma escolha — e escolher isso é
                    diferente de deixar sem classificar. */}
                <option value={TRANSFERENCIA}>Transferência entre contas (fora do DRE)</option>
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={ocupado === i.categoryId || !escolha[i.categoryId]}
                onClick={() =>
                  correr(i.categoryId!, () =>
                    classificarCategoria(companyId, i.categoryId!, escolha[i.categoryId!]!)
                  )
                }
              >
                {ocupado === i.categoryId ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          ) : (
            <span className="text-[12px] text-fg-muted">
              lançamento sem categoria — classifique na ficha dele
            </span>
          )}
        </Card>
      ))}

      {excecoes.length > 0 && (
        <Card className="p-4 flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">
            Fora do padrão nesta empresa
          </p>
          {excecoes.map((e) => (
            <div key={e.categoryId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-fg">
                {e.nome} <span className="text-fg-muted">→ {rotulo(e.grupo)}</span>
              </span>
              <button
                type="button"
                className="text-[12px] text-brand hover:underline"
                disabled={ocupado === e.categoryId}
                onClick={() => correr(e.categoryId, () => voltarAoPadrao(companyId, e.categoryId))}
              >
                voltar ao padrão
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function rotulo(grupo: string): string {
  if (grupo === TRANSFERENCIA) return "Transferência entre contas";
  return GRUPOS.find((g) => g.code === grupo)?.label ?? grupo;
}
