"use client";

// As escritas da Conferência fiscal (API-CONNECT §13.8 a §13.11 e §14.1).

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { CampoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { apurarCombustivelNoMotor, decidirDocumentoDaConferenciaNoMotor, definirRegimeDoPrestadorNoMotor, gravarSimulacaoNoMotor } from "@/app/(app)/fiscal/escritas-actions";
import { Badge } from "@/components/ui/Badge";
import type { PermissaoDeEscrita } from "@/lib/fiscal/motor/escrita";
import { reaisDoMotor } from "@/lib/fiscal/motor/formato";
import { dinheiroDoCampo, regimeNaTela, type OrigemDoRegime, type Regime, type CombustivelApurado, type ConfrontoEnviado, type RelatorioOmieConferido, type SimulacaoGravada } from "@/lib/sped/escritasDoMotor";
import type { PreviaFinanceira } from "@/lib/sped/telasDoMotor";
import { AvisoDoResultado, EnvioDeArquivo, MotivoSemEscrita, useLacoPesado, type Resultado } from "./EscritasComuns";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

/**
 * Simular uma linha da prévia (§13.8): grava o valor digitado — ou apaga, e a
 * linha volta a "não levantado" (não é zero). O motor devolve a prévia
 * inteira recalculada, que aparece aqui logo abaixo e na tabela, relida.
 */
export function SimularLinha({ raiz, competencia, linhas, gravadas, permissao }: {
  raiz: string;
  competencia: string;
  /** As linhas simuláveis, com o rótulo da prévia quando ela tem. */
  linhas: { chave: string; rotulo: string }[];
  gravadas: SimulacaoGravada[];
  permissao: PermissaoDeEscrita;
}) {
  const router = useRouter();
  const [linha, setLinha] = useState(linhas[0]?.chave ?? "");
  const atual = gravadas.find((g) => g.linha === linha);
  const [valor, setValor] = useState(atual?.valor ?? "");
  const [observacao, setObservacao] = useState(atual?.observacao ?? "");
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [previa, setPrevia] = useState<PreviaFinanceira | null>(null);
  const [pendente, startTransition] = useTransition();
  if (!permissao.visivel || linhas.length === 0) return <MotivoSemEscrita permissao={permissao} />;
  const escolher = (l: string) => {
    const g = gravadas.find((x) => x.linha === l);
    setLinha(l); setValor(g?.valor ?? ""); setObservacao(g?.observacao ?? ""); setResultado(null);
  };
  const gravar = (apagar: boolean) => startTransition(async () => {
    const v = apagar ? null : dinheiroDoCampo(valor);
    if (!apagar && v === null) { setResultado({ ok: false, mensagem: "Valor inválido: use 1.234,56 ou 1234.56. Para tirar a simulação, use “Apagar”." }); return; }
    const r = await gravarSimulacaoNoMotor({ raiz, competencia, linha, valor: v, observacao: apagar ? "" : observacao, chave });
    depoisDe(r);
    setResultado({ ok: r.ok, mensagem: r.mensagem });
    if (r.ok && r.dados) { setPrevia(r.dados); if (apagar) { setValor(""); setObservacao(""); } router.refresh(); }
  });
  return <div className="space-y-3">
    <div className="grid gap-4 sm:grid-cols-4">
      <CampoFiscal nome="Linha"><Select value={linha} onChange={(e) => escolher(e.target.value)}>{linhas.map((l) => <option key={l.chave} value={l.chave}>{l.rotulo}</option>)}</Select></CampoFiscal>
      <CampoFiscal nome="Valor (R$)"><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Não levantado" /></CampoFiscal>
      <CampoFiscal nome="Observação" className="sm:col-span-2"><Input maxLength={300} value={observacao} onChange={(e) => setObservacao(e.target.value)} /></CampoFiscal>
    </div>
    <div className="flex flex-wrap gap-3">
      <Button size="sm" disabled={!permissao.pode} loading={pendente} loadingLabel="Gravando…" onClick={() => gravar(false)}>Gravar simulação</Button>
      {atual && <Button size="sm" variant="secondary" disabled={!permissao.pode || pendente} onClick={() => gravar(true)}>Apagar simulação</Button>}
    </div>
    <MotivoSemEscrita permissao={permissao} />
    <AvisoDoResultado resultado={resultado} />
    {previa && <dl className="grid gap-3 rounded-md border border-border bg-surface-2 p-4 sm:grid-cols-5" aria-label="Prévia recalculada">
      {([["Base do faturamento", previa.totais.base_faturamento], ["Base das entradas", previa.totais.base_entradas], ["Débito", previa.totais.debito], ["Crédito", previa.totais.credito], [previa.totais.parcial ? "A pagar (parcial)" : "A pagar", previa.totais.a_pagar]] as const).map(([k, v]) =>
        <div key={k}><dt className="text-helper text-fg-secondary">{k}</dt><dd className="mt-1 text-ui font-medium text-fg tabular-nums">{reaisDoMotor(v)}</dd></div>)}
    </dl>}
  </div>;
}

/**
 * "Apurar combustível" (§13.9): abre os XML das NF-e de entrada de cada
 * filial na competência. Uma filial por chamada, o laço aqui, mostrando o
 * resultado de cada uma.
 */
export function ApurarCombustivel({ raiz, competencia, filiais, permissao }: { raiz: string; competencia: string; filiais: { id: number; rotulo: string }[]; permissao: PermissaoDeEscrita }) {
  const [apurados, setApurados] = useState<(CombustivelApurado & { rotulo: string })[]>([]);
  const executar = useCallback(async (f: { id: number; rotulo: string }, chave: string) => {
    const r = await apurarCombustivelNoMotor({ raiz, estabelecimentoId: f.id, competencia, chave });
    if (r.ok && r.dados) { const d = r.dados; setApurados((x) => [...x.filter((y) => y.empresa_id !== d.empresa_id), { ...d, rotulo: f.rotulo }]); }
    return r;
  }, [raiz, competencia]);
  const rotulo = useCallback((f: { rotulo: string }) => f.rotulo, []);
  const laco = useLacoPesado(executar, rotulo);
  if (!permissao.visivel || filiais.length === 0) return null;
  const pendentes = laco.restantes.length ? laco.restantes : filiais;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!permissao.pode} loading={laco.rodando} loadingLabel={`Apurando ${laco.feitos + 1} de ${laco.total}…`} onClick={() => laco.rodar(pendentes)}>
        {laco.restantes.length ? `Continuar (${laco.restantes.length} filial(is))` : `Apurar combustível (${filiais.length} filial(is))`}
      </Button>
      <span className="text-helper text-fg-muted">Lê os XML das NF-e de entrada da competência: segundos por filial.</span>
    </div>
    <MotivoSemEscrita permissao={permissao} />
    <AvisoDoResultado resultado={laco.resultado} />
    {apurados.length > 0 && <TabelaFiscal colunas={["Filial", "Por CFOP", "Por NCM", "CFOP e NCM", "Itens", "Notas lidas", "Notas com falha"]} linhas={apurados.map((a) => ({ id: String(a.empresa_id), celulas: [
      a.rotulo, reaisDoMotor(a.valor_cfop), reaisDoMotor(a.valor_ncm), reaisDoMotor(a.valor_ambos), String(a.itens), String(a.notas_lidas), String(a.notas_falhadas),
    ] }))} />}
  </div>;
}

/** O relatório do Omie (§13.10): CSV até 20 MB; não é importado, só conferido contra a base. Competência: a do relatório, ou a escolhida. */
export function EnviarRelatorioOmie({ raiz, competencia, permissao }: { raiz: string; competencia: string; permissao: PermissaoDeEscrita }) {
  const [qual, setQual] = useState<"" | "tela">("");
  const [conferido, setConferido] = useState<RelatorioOmieConferido | null>(null);
  if (!permissao.visivel) return <MotivoSemEscrita permissao={permissao} />;
  return <div className="space-y-3">
    <CampoFiscal nome="Competência"><Select value={qual} onChange={(e) => setQual(e.target.value as typeof qual)}><option value="">A do relatório (quando ele tem uma só)</option><option value="tela">{competencia}</option></Select></CampoFiscal>
    <EnvioDeArquivo<RelatorioOmieConferido> destino="omie" raiz={raiz} permissao={permissao} campos={qual === "tela" ? { competencia } : {}} rotuloDoBotao="Conferir o relatório" aoConcluir={setConferido} />
    {conferido && <ResumoPorSituacao resumo={conferido.resumo} />}
  </div>;
}

/** A planilha de pagamentos do BPO para o confronto (§13.11): só .xlsx, até 20 MB; a competência filtra a planilha anual. */
export function EnviarPlanilhaDoBpo({ raiz, competencia, permissao }: { raiz: string; competencia: string; permissao: PermissaoDeEscrita }) {
  const [qual, setQual] = useState<"tela" | "">("tela");
  const [enviado, setEnviado] = useState<ConfrontoEnviado | null>(null);
  if (!permissao.visivel) return <MotivoSemEscrita permissao={permissao} />;
  return <div className="space-y-3">
    <CampoFiscal nome="Competência"><Select value={qual} onChange={(e) => setQual(e.target.value as typeof qual)}><option value="tela">{competencia}</option><option value="">Todas as da planilha</option></Select></CampoFiscal>
    <EnvioDeArquivo<ConfrontoEnviado> destino="confronto" raiz={raiz} permissao={permissao} campos={qual === "tela" ? { competencia } : {}} rotuloDoBotao="Confrontar a planilha" aoConcluir={setEnviado} />
    {enviado && <>
      <p className="text-helper text-fg-secondary">Competências da planilha: {enviado.competencias.join(", ") || "—"}. Sem nota: {reaisDoMotor(enviado.total_sem_nota)} em {enviado.documentos_sem_nota} pagamento(s). Possível duplicidade: {reaisDoMotor(enviado.total_duplicidade)}.</p>
      <ResumoPorSituacao resumo={enviado.resumo} />
    </>}
  </div>;
}

function ResumoPorSituacao({ resumo }: { resumo: Record<string, { documentos: number; valor: string | null }> }) {
  return <TabelaFiscal vazio="Sem linhas." descricaoVazio="" colunas={["Situação", "Documentos", "Valor"]} linhas={Object.entries(resumo).map(([s, v]) => ({ id: s, celulas: [s, String(v.documentos), reaisDoMotor(v.valor)] }))} />;
}

const DECISOES = [["aceito", "Aceito"], ["corrigido", "Corrigido (aponto a nota)"], ["pendente", "Pendente"], ["", "Sem decisão (desfazer)"]] as const;

/** Decidir um documento da conferência do Omie (§13.10). Em "corrigido", a pessoa aponta a nota pela chave de 44 dígitos. */
export function DecidirDocumento({ raiz, id, decisao, observacao, chaveDaNota, permissao }: { raiz: string; id: number; decisao: string; observacao: string; chaveDaNota: string; permissao: PermissaoDeEscrita }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState({ decisao: (DECISOES.some(([v]) => v === decisao) ? decisao : "aceito") as (typeof DECISOES)[number][0], observacao, chaveDaNota: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();
  if (!permissao.visivel) return null;
  const enviar = () => startTransition(async () => {
    const r = await decidirDocumentoDaConferenciaNoMotor({ raiz, id, decisao: dados.decisao, observacao: dados.observacao, chaveDaNota: dados.decisao === "corrigido" ? dados.chaveDaNota.replace(/\D/g, "") : "", chave });
    depoisDe(r);
    if (!r.ok) { setErro(r.mensagem); return; }
    setAberto(false);
    router.refresh();
  });
  return <>
    <Button size="xs" variant="secondary" disabled={!permissao.pode} title={permissao.motivo ?? undefined} onClick={() => { setErro(null); setAberto(true); }}>Decidir</Button>
    {aberto && <Modal open title={`Decidir o documento #${id}`} onClose={() => setAberto(false)}>
      <div className="grid gap-4">
        <CampoFiscal nome="Decisão"><Select value={dados.decisao} onChange={(e) => setDados((d) => ({ ...d, decisao: e.target.value as typeof d.decisao }))}>{DECISOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</Select></CampoFiscal>
        {dados.decisao === "corrigido" && <CampoFiscal nome="Chave da nota (44 dígitos, opcional)"><Input inputMode="numeric" value={dados.chaveDaNota} placeholder={chaveDaNota || "A do casamento automático"} onChange={(e) => setDados((d) => ({ ...d, chaveDaNota: e.target.value }))} /></CampoFiscal>}
        <CampoFiscal nome="Observação"><Input maxLength={300} value={dados.observacao} onChange={(e) => setDados((d) => ({ ...d, observacao: e.target.value }))} /></CampoFiscal>
      </div>
      {erro && <Aviso tom="atencao" className="mt-3">{erro}</Aviso>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button loading={pendente} loadingLabel="Gravando…" onClick={enviar}>Gravar decisão</Button>
        <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
      </div>
    </Modal>}
  </>;
}


/** O selo da camada que decidiu o regime (§14.1). Servidor ou cliente: não tem estado. */
export function OrigemDoRegimeSelo({ regime, origem, porCadastro }: { regime: string; origem: OrigemDoRegime | null; porCadastro: boolean }) {
  const t = regimeNaTela({ regime, origem });
  // Motor anterior a §14: sem `origem`, o que havia era `por_cadastro`.
  if (!t.origem) return <span className="text-helper text-fg-secondary">{porCadastro ? "Pelo cadastro" : "Pelo documento"}</span>;
  return <span title={t.origem.dica}><Badge variant={t.origem.variante}>{t.origem.rotulo}</Badge></span>;
}

/**
 * Corrigir o regime MEI/normal de um prestador **neste cliente** (§14.1). A
 * correção vence o cadastro global só nesta raiz; "desfazer" (`null`) volta
 * ao cadastro ou ao palpite pelo nome. A prévia é relida depois.
 */
export function CorrigirRegime({ raiz, competencia, cnpj, nome, regime, origem, permissao }: {
  raiz: string;
  competencia: string;
  cnpj: string;
  nome: string;
  regime: string;
  origem: OrigemDoRegime | null;
  permissao: PermissaoDeEscrita;
}) {
  const router = useRouter();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  if (!permissao.visivel || !/^\d{14}$/.test(cnpj)) return null;
  const t = regimeNaTela({ regime, origem });
  const corrigir = (novo: Regime | null) => startTransition(async () => {
    const r = await definirRegimeDoPrestadorNoMotor({ raiz, cnpj, regime: novo, nome, competencia, chave });
    depoisDe(r);
    setResultado({ ok: r.ok, mensagem: r.mensagem });
    if (r.ok) router.refresh();
  });
  return <span className="flex min-w-32 flex-col items-center gap-1">
    <span className="flex flex-wrap justify-center gap-1">
      {t.acoes.map((a) => <Button key={String(a.regime)} size="xs" variant={a.regime === null ? "ghost" : "secondary"} disabled={!permissao.pode || pendente} title={permissao.motivo ?? (a.regime === null ? "Volta ao cadastro global ou ao palpite pelo nome" : "Vale só para este cliente")} onClick={() => corrigir(a.regime)}>{a.rotulo}</Button>)}
    </span>
    {resultado && <span role={resultado.ok ? "status" : "alert"} className={`max-w-56 text-helper ${resultado.ok ? "text-success-fg" : "text-warning-fg"}`}>{resultado.mensagem}</span>}
  </span>;
}
