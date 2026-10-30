"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { formatInstantDateTime } from "@/lib/format";
import { contarItens } from "@/components/shared/CascoDaTabela";
import type { ConfiguracaoDoContabil as Configuracao } from "@/lib/contabil/servidor";
import { carregarPlano, salvarModelos, type ResultadoDoContabil } from "@/app/(app)/contabil/sped/actions";

const CAMPOS = [
  { chave: "debitoCte", rotulo: "Débito do CT-e (frete)", ajuda: "Ex.: 312 Fretes e carretos." },
  { chave: "debitoNfse", rotulo: "Débito da NFS-e (serviço tomado)", ajuda: "Ex.: 362 Serviços prestados por terceiros." },
  { chave: "contaImobilizado", rotulo: "Conta do imobilizado", ajuda: "A genérica dos CFOPs 1551, 2551, 3551, 1406 e 2406." },
  { chave: "historicoImobilizado", rotulo: "Histórico do imobilizado", ajuda: "Código do histórico padrão da Domínio." },
  { chave: "prefixoFornecedores", rotulo: "Classificação dos fornecedores", ajuda: "Ex.: 2.1.3.01. Liga a sugestão de conta pelo nome." },
  { chave: "codigoFilial", rotulo: "Código da filial na Domínio", ajuda: "Vai na coluna Matriz/Filial da planilha." },
] as const;

/**
 * O que a empresa precisa uma vez só: o plano de contas da Domínio e as contas
 * fixas (29/10/2026). Fica na matriz e vale para as filiais.
 */
export function ConfiguracaoDoContabil({ empresaId, configuracao, podeAgir, daMatriz }: { empresaId: string; configuracao: Configuracao; podeAgir: boolean; daMatriz: string | null }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [valores, setValores] = useState<Record<string, string>>({ ...configuracao.modelos });
  const arquivo = useRef<HTMLInputElement>(null);
  const depois = (r: ResultadoDoContabil) => (r.ok ? toast.success(r.mensagem) : toast.error(r.erro));

  function enviarPlano(lista: FileList | null) {
    const f = lista?.[0];
    if (!f) return;
    const dados = new FormData();
    dados.set("empresa", empresaId);
    dados.set("arquivo", f);
    iniciar(async () => { depois(await carregarPlano(dados)); if (arquivo.current) arquivo.current.value = ""; });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {daMatriz && <p className="lg:col-span-2 text-helper text-fg-secondary">Plano, contas e regras são da matriz, {daMatriz}, e valem para as filiais.</p>}
      <Card className="p-5 space-y-3">
        <div>
          <h3 className="text-card-title font-semibold text-fg">Plano de contas da Domínio</h3>
          <p className="mt-1 text-label text-fg-secondary">
            {configuracao.contasNoPlano
              ? `${contarItens(configuracao.contasNoPlano, "conta", "contas")}${configuracao.planoCarregadoEm ? `, carregado em ${formatInstantDateTime(configuracao.planoCarregadoEm)}` : ""}.`
              : "Ainda não carregado. Sem ele, a tela mostra só os códigos e não sugere conta."}
          </p>
        </div>
        <p className="text-helper text-fg-muted">Exporte o plano na Domínio, abra no Excel e salve como .xlsx ou .csv. Enviar de novo substitui o plano inteiro.</p>
        {podeAgir && (
          <>
            <input ref={arquivo} type="file" accept=".xlsx,.csv,.txt" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => enviarPlano(e.target.files)} />
            <Button variant="secondary" size="sm" disabled={pendente} onClick={() => arquivo.current?.click()}><Upload size={14} aria-hidden /> {configuracao.contasNoPlano ? "Enviar plano atualizado" : "Enviar plano de contas"}</Button>
          </>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="text-card-title font-semibold text-fg">Contas fixas</h3>
        <p className="mt-1 mb-4 text-label text-fg-secondary">O débito que não depende do fornecedor. Em branco, essas notas seguem a regra do fornecedor, como a NF-e.</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); iniciar(async () => depois(await salvarModelos({ empresa: empresaId, ...valores }))); }}>
          {CAMPOS.map((c) => (
            <CampoForm key={c.chave} label={c.rotulo} htmlFor={`modelo-${c.chave}`} helper={c.ajuda}>
              <Input id={`modelo-${c.chave}`} compact disabled={!podeAgir} inputMode={c.chave === "prefixoFornecedores" ? "decimal" : "numeric"} value={valores[c.chave] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))} />
            </CampoForm>
          ))}
          {podeAgir && <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={pendente}>Salvar contas</Button></div>}
        </form>
      </Card>
    </div>
  );
}
