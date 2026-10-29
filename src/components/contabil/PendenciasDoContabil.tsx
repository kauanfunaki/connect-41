"use client";

import { useState, useTransition } from "react";
import { Check, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatCnpj } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import type { PendenciaNaTela } from "@/lib/contabil/servidor";
import { deixarDeFora, salvarRegra, type ResultadoDoContabil } from "@/app/(app)/contabil/sped/actions";

/**
 * As pendências do mês, uma linha por fornecedor e CFOP, cada uma com as
 * contas para preencher ali mesmo (29/10/2026). No painel antigo eram três
 * passos — baixar o CSV, preencher fora, subir de volta —; aqui gravar a regra
 * já refaz os lançamentos e a linha some.
 */
export function PendenciasDoContabil({ empresaId, pendencias, podeAgir }: { empresaId: string; pendencias: PendenciaNaTela[]; podeAgir: boolean }) {
  if (!pendencias.length) {
    return <EmptyState title="Nenhuma pendência" description="Todas as notas do mês têm conta. Confira os lançamentos e baixe a planilha da Domínio." icon={<Check />} />;
  }
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {pendencias.map((p) => <Linha key={`${p.cnpjFornecedor}|${p.cfop}`} empresaId={empresaId} p={p} podeAgir={podeAgir} />)}
    </ul>
  );
}

function Linha({ empresaId, p, podeAgir }: { empresaId: string; p: PendenciaNaTela; podeAgir: boolean }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [debito, setDebito] = useState("");
  const [credito, setCredito] = useState(p.sugestao?.reduzido ?? "");
  const nome = p.nomeFornecedor || "Fornecedor sem nome";

  function depois(r: ResultadoDoContabil) {
    if (r.ok) toast.success(r.mensagem);
    else toast.error(r.erro);
  }
  const salvar = () => iniciar(async () => depois(await salvarRegra({ empresa: empresaId, cnpjFornecedor: p.cnpjFornecedor, cfop: p.cfop, nomeFornecedor: p.nomeFornecedor, contaDebito: debito, contaCredito: credito })));
  const fora = () => iniciar(async () => depois(await deixarDeFora({ empresa: empresaId, cnpjFornecedor: p.cnpjFornecedor, cfop: p.cfop, nomeFornecedor: p.nomeFornecedor })));
  const falta = !credito ? "Informe a conta de crédito." : !p.soCredito && !debito ? "Informe a conta de débito." : "";

  return (
    <li className={`grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${pendente ? "opacity-60" : ""}`} aria-busy={pendente || undefined}>
      <div className="min-w-0">
        <p className="font-medium text-fg truncate" title={nome}>{nome}</p>
        <p className="text-helper text-fg-secondary">
          {p.cnpjFornecedor ? formatCnpj(p.cnpjFornecedor) : "Sem CNPJ"} · {p.cfop ? `CFOP ${p.cfop}` : "sem CFOP"} · {p.qtd} {p.qtd === 1 ? "nota" : "notas"} · <span className="tabular-nums">{moeda(p.centavos)}</span>
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {p.tipos.map((t) => <Selo key={t}>{t}</Selo>)}
          {p.cadastradaSemConta && <Selo tom="atencao">Regra sem conta</Selo>}
        </div>
      </div>
      {podeAgir && p.cnpjFornecedor ? (
        // Colunas fixas: os campos ficam um embaixo do outro de linha a linha, e o débito fixo guarda o lugar.
        <form className="grid grid-cols-2 sm:grid-cols-[6rem_6rem_auto_auto] items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!falta) salvar(); }}>
          {p.soCredito ? (
            <p className="h-8 flex items-center text-helper text-fg-muted" title="O débito é a conta fixa do tipo da nota, em Plano e contas">Débito fixo</p>
          ) : (
            <label className="grid gap-1 text-helper text-fg-secondary">Débito
              <Input compact inputMode="numeric" value={debito} onChange={(e) => setDebito(e.target.value.replace(/\D/g, ""))} aria-label={`Conta de débito de ${nome}`} />
            </label>
          )}
          <label className="grid gap-1 text-helper text-fg-secondary">Crédito
            <Input compact inputMode="numeric" value={credito} onChange={(e) => setCredito(e.target.value.replace(/\D/g, ""))} aria-label={`Conta de crédito de ${nome}`} />
          </label>
          <Button type="submit" size="sm" disabled={pendente || !!falta} title={falta || undefined}>Salvar</Button>
          <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={fora} title="As notas deste fornecedor e CFOP saem dos lançamentos, contadas">
            <EyeOff size={14} aria-hidden /> Deixar de fora
          </Button>
        </form>
      ) : !p.cnpjFornecedor ? (
        <p className="text-helper text-fg-muted">Nota sem CNPJ do fornecedor: corrija no acervo fiscal.</p>
      ) : null}
      {podeAgir && p.sugestao && credito === p.sugestao.reduzido && (
        <p className="lg:col-span-2 text-helper text-fg-muted">Crédito sugerido pelo plano: <span className="text-fg-secondary">{p.sugestao.nome}</span> ({Math.round(p.sugestao.semelhanca * 100)}% parecido). Confira antes de salvar.</p>
      )}
    </li>
  );
}
