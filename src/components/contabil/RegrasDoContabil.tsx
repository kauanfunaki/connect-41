"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatCnpj } from "@/lib/format";
import type { RegraNaTela } from "@/lib/contabil/servidor";
import { removerRegra } from "@/app/(app)/contabil/sped/actions";

/** O de-para gravado, com busca por nome, CNPJ, CFOP ou conta. Corrigir é gravar de novo pela pendência; aqui se desfaz. */
export function RegrasDoContabil({ empresaId, regras, podeAgir }: { empresaId: string; regras: RegraNaTela[]; podeAgir: boolean }) {
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return regras;
    const digitos = t.replace(/\D/g, "");
    return regras.filter((r) => r.nomeFornecedor.toLowerCase().includes(t) || (digitos && [r.cnpjFornecedor, r.cfop, r.contaDebito, r.contaCredito].some((v) => v.includes(digitos))));
  }, [busca, regras]);

  if (!regras.length) return <EmptyState title="Nenhuma regra ainda" description="As regras nascem das pendências: preencha as contas de um fornecedor e ela passa a valer para todos os meses." />;
  return (
    <div className="space-y-3">
      <Input compact icon={<Search size={14} />} className="max-w-sm" placeholder="Buscar por fornecedor, CNPJ, CFOP ou conta" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar regra" />
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {visiveis.map((r) => <Linha key={r.id} empresaId={empresaId} r={r} podeAgir={podeAgir} />)}
        {!visiveis.length && <li className="p-4 text-label text-fg-secondary">Nenhuma regra com “{busca}”.</li>}
      </ul>
    </div>
  );
}

function Linha({ empresaId, r, podeAgir }: { empresaId: string; r: RegraNaTela; podeAgir: boolean }) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [pendente, iniciar] = useTransition();
  const titulo = r.cnpjFornecedor ? r.nomeFornecedor || formatCnpj(r.cnpjFornecedor) : "Qualquer fornecedor";
  const conta = (codigo: string, nome: string) => codigo ? <span title={nome || "Fora do plano carregado"}>{codigo}</span> : <span className="text-fg-muted">—</span>;
  const desfazer = () => requestConfirm(
    { title: r.desconsiderar ? "Voltar a lançar?" : "Remover a regra?", description: r.desconsiderar ? "As notas voltam para os lançamentos ou para as pendências." : "As notas deste fornecedor voltam para as pendências.", confirmLabel: r.desconsiderar ? "Voltar a lançar" : "Remover" },
    async () => iniciar(async () => { const x = await removerRegra({ empresa: empresaId, id: r.id }); if (x.ok) toast.success(x.mensagem); else toast.error(x.erro); }),
  );
  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 p-3 text-label ${pendente ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className="font-medium text-fg truncate">{titulo}</p>
        <p className="text-helper text-fg-secondary">
          {r.cnpjFornecedor && `${formatCnpj(r.cnpjFornecedor)} · `}{r.cfop ? `CFOP ${r.cfop}` : "todos os CFOPs"}
          {r.historico && ` · “${r.historico}”`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {r.desconsiderar ? <Selo>Fora da contabilidade</Selo> : (
          <span className="tabular-nums text-fg-secondary">D {conta(r.contaDebito, r.debitoNome)} · C {conta(r.contaCredito, r.creditoNome)}</span>
        )}
        {r.foraDoPlano && <Selo tom="atencao">Conta fora do plano</Selo>}
        {podeAgir && <Button size="sm" variant="ghost" disabled={pendente} onClick={desfazer}><Undo2 size={14} aria-hidden /> {r.desconsiderar ? "Voltar a lançar" : "Remover"}</Button>}
      </div>
      {dialog}
    </li>
  );
}
