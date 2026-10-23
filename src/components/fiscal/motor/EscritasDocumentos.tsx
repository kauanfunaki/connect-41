"use client";

// As escritas de Documentos e importações (API-CONNECT §13.1 a §13.3).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Selo } from "@/components/ui/Selo";
import { CampoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { apurarCoberturaNoMotor, resolverRejeitadoNoMotor } from "@/app/(app)/fiscal/escritas-actions";
import type { PermissaoDeEscrita } from "@/lib/fiscal/motor/escrita";
import type { EnvioDeDocumentos } from "@/lib/sped/escritasDoMotor";
import { AvisoDoResultado, EnvioDeArquivo, MotivoSemEscrita, type Resultado } from "./EscritasComuns";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

/**
 * "Apurar cobertura" (§13.1): vira um pedido na fila do motor (a apuração
 * varre o índice inteiro, ~2 min). A tela mostra o pedido e leva à fila, onde
 * o log se acompanha. Competência já apurando é `409 cobertura_em_andamento`;
 * pedido igual aberto, a confirmação de pedir de novo.
 */
export function ApurarCobertura({ raiz, estabelecimentoId, competencia, permissao, hrefFila }: {
  raiz: string;
  estabelecimentoId: number;
  competencia: string;
  permissao: PermissaoDeEscrita;
  /** A fila (Executar) com o recorte, sem o `execucao=`; `null` quando a pessoa não vê a fila. */
  hrefFila: string | null;
}) {
  const router = useRouter();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [execucaoId, setExecucaoId] = useState<number | null>(null);
  const [duplicado, setDuplicado] = useState<number | null>(null);
  const apurar = (confirmarDuplicado: boolean) => startTransition(async () => {
    const r = await apurarCoberturaNoMotor({ raiz, estabelecimentoId, competencia, confirmarDuplicado, chave });
    depoisDe(r);
    if (!r.ok && r.codigo === "execucao_duplicada") {
      const ex = r.detalhe?.existente as { id?: number } | undefined;
      setDuplicado(ex?.id ?? 0);
      setExecucaoId(ex?.id ?? null);
      setResultado({ ok: false, mensagem: `Já existe o pedido #${ex?.id ?? "?"} de cobertura desta competência na fila. Pedir de novo mesmo assim?` });
      return;
    }
    setDuplicado(null);
    setResultado({ ok: r.ok, mensagem: r.mensagem });
    if (r.ok && r.dados) { setExecucaoId(r.dados.id); router.refresh(); }
  });
  if (!permissao.visivel) return null;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={!permissao.pode} loading={pendente} loadingLabel="Enviando…" onClick={() => apurar(duplicado !== null)}>{duplicado !== null ? "Pedir de novo mesmo assim" : "Apurar cobertura"}</Button>
      {execucaoId && hrefFila && <Button size="sm" variant="secondary" href={`${hrefFila}&execucao=${execucaoId}`}>Acompanhar o pedido #{execucaoId}</Button>}
    </div>
    <MotivoSemEscrita permissao={permissao} />
    <AvisoDoResultado resultado={resultado} />
  </div>;
}

/** "Resolver" (ou reabrir) um rejeitado da quarentena (§13.2). Resolver não apaga: o XML fica no motor. */
export function ResolverRejeitado({ raiz, id, resolvido, permissao }: { raiz: string; id: number; resolvido: boolean; permissao: PermissaoDeEscrita }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();
  if (!permissao.visivel) return null;
  const enviar = () => startTransition(async () => {
    const r = await resolverRejeitadoNoMotor({ raiz, id, resolvido: !resolvido, observacao, chave });
    depoisDe(r);
    if (!r.ok) { setErro(r.mensagem); return; }
    setAberto(false);
    router.refresh();
  });
  return <>
    <Button size="xs" variant={resolvido ? "ghost" : "secondary"} disabled={!permissao.pode} title={permissao.motivo ?? undefined} onClick={() => { setErro(null); setAberto(true); }}>{resolvido ? "Reabrir" : "Resolver"}</Button>
    {aberto && <Modal open title={resolvido ? `Reabrir o rejeitado #${id}` : `Resolver o rejeitado #${id}`} onClose={() => setAberto(false)}>
      <p className="text-ui text-fg-secondary">{resolvido ? "O rejeitado volta a pendente na quarentena." : "Marca como resolvido. O XML continua guardado no motor; nada é apagado."}</p>
      <CampoFiscal nome="Observação" className="mt-4"><Input maxLength={255} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder={resolvido ? "" : "Ex.: evento, não documento"} /></CampoFiscal>
      {erro && <Aviso tom="atencao" className="mt-3">{erro}</Aviso>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button loading={pendente} loadingLabel="Gravando…" onClick={enviar}>{resolvido ? "Reabrir" : "Resolver"}</Button>
        <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
      </div>
    </Modal>}
  </>;
}

const TOM_DA_SITUACAO = { novo: "sucesso", duplicado: "neutro", erro: "perigo", ignorado: "atencao" } as const;

/** "Enviar documentos" (§13.3): XML, PDF, imagem, CSV de NFS-e e .zip, até 25 MB por envio. Mostra o relatório da ingestão. */
export function EnviarDocumentos({ raiz, permissao }: { raiz: string; permissao: PermissaoDeEscrita }) {
  const [relatorio, setRelatorio] = useState<EnvioDeDocumentos | null>(null);
  return <div className="space-y-4">
    <EnvioDeArquivo<EnvioDeDocumentos> destino="documentos" raiz={raiz} permissao={permissao} rotuloDoBotao="Enviar ao motor" aoConcluir={setRelatorio} />
    {relatorio && <TabelaFiscal vazio="Nenhum arquivo lido." descricaoVazio="" colunas={["Arquivo", "Tipo", "Situação", "Detalhe"]} linhas={relatorio.relatorio.map((l, i) => ({ id: `${i}`, celulas: [
      <span key="a" className="block max-w-64 break-all text-helper">{l.arquivo}</span>, l.tipo || "—",
      <Selo key="s" tom={TOM_DA_SITUACAO[l.situacao]}>{l.situacao}</Selo>, <span key="d" className="block max-w-64 break-words text-helper">{l.detalhe || "—"}</span>,
    ] }))} />}
  </div>;
}
