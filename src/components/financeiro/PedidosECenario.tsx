"use client";

// Pedidos de venda e cenário, no Modelo do fluxo (26/11/2026, funcionalidade-838).
//
// Em cima, ligar a leitura dos pedidos de venda do Omie e escolher as etapas
// que entram no previsto (as etapas e o nome delas são do Omie da empresa, e
// aparecem depois da primeira leitura). Embaixo, as premissas do cenário —
// custo fixo por mês ou % das vendas — e se o cliente vê a aba no portal. Um
// "Salvar" só para o cartão: as premissas valem juntas.

import { useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { salvarPedidosECenario } from "@/app/(app)/fluxo-de-caixa/actions";
import type { PedidosECenarioDaEmpresa } from "@/lib/fluxoDeCaixa/previstoServidor";
import type { TipoDePremissa } from "@/lib/fluxoDeCaixa/cenario";

const ROTULO = "text-micro uppercase tracking-wide text-fg-muted font-semibold";

type Linha = { chave: number; nome: string; tipo: TipoDePremissa; valor: string };

let proximaChave = 0;

export function PedidosECenario({ companyId, dados }: { companyId: string; dados: PedidosECenarioDaEmpresa }) {
  const [pedidos, setPedidos] = useState(dados.configuracao.pedidos);
  const [etapas, setEtapas] = useState<string[]>(dados.configuracao.etapas);
  const [noPortal, setNoPortal] = useState(dados.configuracao.cenarioNoPortal);
  const [premissas, setPremissas] = useState<Linha[]>(() =>
    dados.premissas.map((p) => ({ chave: proximaChave++, nome: p.nome, tipo: p.tipo, valor: String(p.valor).replace(".", ",") }))
  );
  const [estado, setEstado] = useState<{ tipo: "salvo" } | { tipo: "erro"; mensagem: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  const mudar = (chave: number, campo: Partial<Linha>) => {
    setEstado(null);
    setPremissas((ps) => ps.map((p) => (p.chave === chave ? { ...p, ...campo } : p)));
  };

  function salvar() {
    setEstado(null);
    startTransition(async () => {
      const r = await salvarPedidosECenario(companyId, {
        pedidos,
        etapas,
        cenarioNoPortal: noPortal,
        // "1.234,56" ou "5,5" (o jeito brasileiro); sem vírgula, o ponto é decimal ("5.5").
        premissas: premissas.map((p) => ({
          nome: p.nome,
          tipo: p.tipo,
          valor: Number(p.valor.includes(",") ? p.valor.replace(/\./g, "").replace(",", ".") : p.valor),
        })),
      });
      setEstado("error" in r ? { tipo: "erro", mensagem: r.error } : { tipo: "salvo" });
    });
  }

  return (
    <Card as="section" className="p-4 mb-4 flex flex-col gap-4" aria-labelledby="h-pedidos-cenario">
      <h2 id="h-pedidos-cenario" className="text-section font-semibold text-fg">
        Pedidos de venda e cenário
      </h2>

      <div className="flex flex-col gap-2">
        <span className={ROTULO}>Pedidos de venda</span>
        <Checkbox
          label="Ler os pedidos de venda do Omie desta empresa"
          helper="Os pedidos ainda não faturados das etapas marcadas entram no previsto como “Pedidos a faturar”, pelo vencimento das parcelas."
          checked={pedidos}
          onChange={(e) => {
            setEstado(null);
            setPedidos(e.target.checked);
          }}
        />
        {pedidos &&
          (dados.etapas.length === 0 ? (
            <p className="text-helper text-fg-muted pl-6">As etapas aparecem depois da próxima sincronização do Omie desta empresa.</p>
          ) : (
            <fieldset className="pl-6 flex flex-col gap-1.5">
              <legend className="text-helper text-fg-secondary mb-1">
                Etapas que entram{dados.ultimaLeitura ? <span className="text-fg-muted"> · pedidos lidos em {dados.ultimaLeitura}</span> : null}
              </legend>
              {dados.etapas.map((e) => (
                <Checkbox
                  key={e.code}
                  label={
                    <span>
                      {e.name} <span className="text-fg-muted tabular-nums">· {e.pedidos === 1 ? "1 pedido" : `${e.pedidos} pedidos`}</span>
                      {e.inactive && <span className="text-fg-muted"> · inativa no Omie</span>}
                    </span>
                  }
                  checked={etapas.includes(e.code)}
                  onChange={(ev) => {
                    setEstado(null);
                    setEtapas((atual) => (ev.target.checked ? [...atual, e.code] : atual.filter((c) => c !== e.code)));
                  }}
                />
              ))}
            </fieldset>
          ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className={ROTULO}>Premissas do cenário</span>
        <p className="text-helper text-fg-muted max-w-[72ch]">
          Custos que ainda não são conta lançada, somados ao previsto mês a mês na aba Cenário. Em “% das vendas”, a base é o que entra de
          clientes e de pedidos no mês.
        </p>
        {premissas.length > 0 && (
          <ul className="flex flex-col gap-2">
            {premissas.map((p) => (
              <li key={p.chave} className="flex flex-wrap items-center gap-2">
                <Input compact aria-label="Nome da premissa" placeholder="Ex.: Frete" value={p.nome} maxLength={80} onChange={(e) => mudar(p.chave, { nome: e.target.value })} className="min-w-0 flex-1 sm:max-w-72" />
                <Select compact aria-label={`Tipo de ${p.nome || "premissa"}`} value={p.tipo} onChange={(e) => mudar(p.chave, { tipo: e.target.value as TipoDePremissa })} className="w-40">
                  <option value="fixo">Fixo por mês (R$)</option>
                  <option value="percentual">% das vendas</option>
                </Select>
                <Input
                  compact
                  inputMode="decimal"
                  aria-label={`Valor de ${p.nome || "premissa"}`}
                  value={p.valor}
                  onChange={(e) => mudar(p.chave, { valor: e.target.value })}
                  prefix={p.tipo === "fixo" ? "R$" : undefined}
                  suffix={p.tipo === "percentual" ? "%" : undefined}
                  className="w-36"
                />
                <IconButton size="md" variant="ghost" title={`Tirar ${p.nome || "a premissa"}`} onClick={() => setPremissas((ps) => ps.filter((x) => x.chave !== p.chave))}>
                  <Trash2 size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPremissas((ps) => [...ps, { chave: proximaChave++, nome: "", tipo: "fixo", valor: "" }])}
          >
            <Plus size={14} /> Adicionar premissa
          </Button>
        </div>
        <Checkbox label="O cliente vê a aba Cenário no portal" checked={noPortal} onChange={(e) => setNoPortal(e.target.checked)} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <Button type="button" size="sm" variant="secondary" onClick={salvar} loading={pendente} loadingLabel="Salvando…">
          Salvar
        </Button>
        <span role="status" className="text-fs-2">
          {estado?.tipo === "salvo" && (
            <span className="font-medium text-success-fg">
              <Check size={12} className="inline -mt-0.5" aria-hidden /> Salvo
            </span>
          )}
          {estado?.tipo === "erro" && <span className="text-danger">{estado.mensagem}</span>}
        </span>
      </div>
    </Card>
  );
}
