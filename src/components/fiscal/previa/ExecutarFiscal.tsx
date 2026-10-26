"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, CheckCircle2, AlertTriangle, Play } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { useFiscal } from "./ContextoFiscal";
import { AcoesFiscais, BlocoFiscal, CampoFiscal, ETAPAS_DA_EXTRACAO, EstadoFiscal, MetricasFiscais, PreviaTexto, TabelaFiscal, dataFiscal } from "./Compartilhados";
import { execucaoNoContexto, type AcaoFiscal, type ExecucaoTeste } from "@/lib/fiscal/previa/cenario";
import { MODOS_EXECUCAO, geracao, mesInteiro, parametrosIniciais, parametrosExecucaoSchema, type ModoExecucao, type ParametrosExecucao } from "@/lib/fiscal/previa/execucao";

const ESTADOS: Record<string, string> = { fila: "Na fila", executando: "Executando", concluida: "Concluída", erro: "Erro", cancelada: "Cancelada" };
const FILTROS: CampoDeFiltro[] = [
  { chave: "estado", rotulo: "Estado", opcoes: Object.entries(ESTADOS).map(([value, label]) => ({ value, label })) },
  { chave: "acao", rotulo: "Ação", opcoes: Object.entries(MODOS_EXECUCAO).map(([value, label]) => ({ value, label })) },
];
function duracao(e: ExecucaoTeste) {
  if (!e.iniciadoEm) return "Não iniciada";
  if (!e.concluidoEm) return "Em andamento";
  const segundos = Math.max(0, Math.round((Date.parse(e.concluidoEm) - Date.parse(e.iniciadoEm)) / 1000));
  return segundos >= 60 ? `${Math.floor(segundos / 60)} min ${segundos % 60} s` : `${segundos} s`;
}
function ResumoParametros({ execucao: e }: { execucao: ExecucaoTeste }) {
  if (!e.parametros) return <span className="text-helper text-fg-muted">Parâmetros históricos indisponíveis</span>;
  const p = e.parametros;
  return <span className="block max-w-72 text-helper text-fg-secondary">
    {geracao(p.modo) ? `${p.tipoSped === "1" ? "Substituto" : "Original"} · ${p.saida || "Nome automático por versão"}${p.forcarErros ? " · forçar erros" : ""}${p.forcarCobertura ? " · forçar cobertura" : ""}` : `${p.modo === "paralela" ? `${p.instancias} instâncias · ` : ""}${p.workers} processos paralelos · ${p.etapas.map((e) => ETAPAS_DA_EXTRACAO[e].toLocaleLowerCase("pt-BR")).join(", ")}${p.semEntradas ? " · pular entradas" : ""}`}
    <span className="block">Solicitante: {p.solicitante || "Não informado"}</span>
  </span>;
}

export function OperacaoFiscal({ aba }: { aba: string }) {
  const { cenario, simular: enviar, modulos, pronto } = useFiscal();
  const query = useSearchParams();
  const [p, setP] = useState<ParametrosExecucao>(() => ({ ...parametrosIniciais(cenario.contexto.competencia), saida: "saida_sped.txt" }));
  const [obrigacao, setObrigacao] = useState<"sped" | "sped_contribuicoes">("sped");
  const [workers, setWorkers] = useState({ paralela: 32, simples: 8, erros: 32 });
  const [erro, setErro] = useState("");
  const [logId, setLogId] = useState<string | null>(null);
  const blocoDoLog = useRef<HTMLDivElement>(null);
  // O log abre no fim da página: "Ver log" leva a tela e o foco até ele (26/10/2026).
  function verLog(id: string) {
    setLogId(id);
    requestAnimationFrame(() => { blocoDoLog.current?.scrollIntoView({ block: "start", behavior: "smooth" }); blocoDoLog.current?.focus({ preventScroll: true }); });
  }
  function simular(acao: AcaoFiscal) {
    setLogId("id" in acao ? acao.id : null);
    enviar(acao);
  }
  const execucoes = cenario.execucoes.filter((e) => execucaoNoContexto(e, cenario.contexto));
  const estado = ESTADOS[query.get("estado") ?? ""];
  const filtradas = execucoes.filter((e) => (!estado || e.estado === estado) && (!query.get("acao") || e.parametros?.modo === query.get("acao")));
  const fila = execucoes.filter((e) => e.estado === "Na fila" || e.estado === "Executando");
  const log = execucoes.find((e) => e.id === logId) ?? (aba === "executar" ? fila[0] : undefined);
  const paginas = Math.max(1, Math.ceil(filtradas.length / 12));
  const pagina = Math.min(paginas, Math.max(1, Number(query.get("pagina")) || 1));
  const podeGerar = modulos.includes("fiscal_entregas");
  const podeExtrair = modulos.includes("fiscal_acervo");
  function campo<K extends keyof ParametrosExecucao>(chave: K, valor: ParametrosExecucao[K]) { setP((atual) => ({ ...atual, [chave]: valor })); }
  function solicitar(modo: ModoExecucao) {
    const dados = { ...p, modo, workers: modo === "paralela" || modo === "simples" || modo === "erros" ? workers[modo] : p.workers,
      ...(modo === "sped_contribuicoes" && { forcarErros: false, forcarCobertura: false }) };
    const validado = parametrosExecucaoSchema.safeParse(dados);
    if (!validado.success) { setErro(validado.error.issues[0].message); return; }
    setErro(""); simular({ tipo: "solicitar-execucao", parametros: validado.data });
  }
  const controles = (e: ExecucaoTeste) => <AcoesFiscais>
    {e.estado === "Na fila" && <><Button size="xs" disabled={!pronto} onClick={() => simular({ tipo: "iniciar-execucao", id: e.id })}>Simular início</Button><Button size="xs" variant="secondary" disabled={!pronto} onClick={() => simular({ tipo: "cancelar", id: e.id })}>Cancelar pedido</Button></>}
    {e.estado === "Executando" && <><Button size="xs" disabled={!pronto} onClick={() => simular({ tipo: "concluir-execucao", id: e.id })}>Simular conclusão</Button><Button size="xs" variant="secondary" disabled={!pronto} onClick={() => simular({ tipo: "falhar-execucao", id: e.id })}>Simular falha</Button></>}
    {e.estado === "Erro" && <Button size="xs" variant="secondary" disabled={!pronto} onClick={() => simular({ tipo: "reprocessar", id: e.id })}>Nova tentativa</Button>}
    <Button size="xs" variant="ghost" onClick={() => verLog(e.id)}>Ver log</Button>
  </AcoesFiscais>;
  const linhas = (lista: ExecucaoTeste[]) => lista.map((e) => ({ id: e.id, celulas: [
    <span key="acao">{e.acao}<ResumoParametros execucao={e} />{e.tentativaDe && <span className="block text-helper text-fg-muted">Nova tentativa de {e.tentativaDe.slice(0, 8)}</span>}</span>,
    e.parametros ? `${e.parametros.dataIni} a ${e.parametros.dataFim}` : e.contexto.competencia,
    <EstadoFiscal key="estado">{e.estado}</EstadoFiscal>,
    <span key="hora" className="text-helper">Pedido: {dataFiscal(e.criadoEm)}<span className="block">Início: {e.iniciadoEm ? dataFiscal(e.iniciadoEm) : "Não registrado"}</span><span className="block">Fim: {e.concluidoEm ? dataFiscal(e.concluidoEm) : "Não registrado"} · {duracao(e)}</span></span>,
    <span key="resultado" className="block max-w-60 text-helper">{e.documentos !== undefined && <span className="block">{e.documentos} documento(s)</span>}{e.log.at(-1)?.replace(/^\d{4}-\d{2}-\d{2}T\S+ · /, "") || "Sem retorno registrado"}{modulos.includes("fiscal_entregas") && (e.arquivoIds ?? []).map((arquivoId) => { const arquivo = cenario.arquivos.find((a) => a.id === arquivoId); return arquivo && <Button key={arquivoId} href={`/fiscal/entregas?arquivo=${encodeURIComponent(arquivoId)}`} size="xs" variant="link">{arquivo.tipo} · v{arquivo.versao}</Button>; })}</span>,
    controles(e),
  ] }));
  return <div className="space-y-5">
    {aba === "executar" ? <>
      <MetricasFiscais itens={[
        { rotulo: "Na fila", valor: fila.filter((e) => e.estado === "Na fila").length, icone: <Clock />, href: "/fiscal/operacao?aba=historico&estado=fila" },
        { rotulo: "Executando", valor: fila.filter((e) => e.estado === "Executando").length, icone: <Play />, href: "/fiscal/operacao?aba=historico&estado=executando" },
        { rotulo: "Concluídas", valor: execucoes.filter((e) => e.estado === "Concluída").length, icone: <CheckCircle2 />, href: "/fiscal/operacao?aba=historico&estado=concluida" },
        { rotulo: "Com erro", valor: execucoes.filter((e) => e.estado === "Erro").length, icone: <AlertTriangle />, href: "/fiscal/operacao?aba=historico&estado=erro" },
      ]} />
      <BlocoFiscal titulo="Preparar pedido de teste" descricao="Empresa e estabelecimento são os selecionados acima. Os pedidos ficam salvos até você avançar a simulação.">
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoFiscal nome="Solicitante"><Input aria-label="Solicitante" maxLength={200} placeholder="Nome opcional" value={p.solicitante} onChange={(e) => campo("solicitante", e.target.value)} /></CampoFiscal>
          <CampoFiscal nome="Data inicial"><CampoData aria-label="Data inicial" min="2026-09-01" max="2026-10-31" value={p.dataIni} onChange={(valor) => campo("dataIni", valor)} /></CampoFiscal>
          <CampoFiscal nome="Data final"><CampoData aria-label="Data final" min="2026-09-01" max="2026-10-31" value={p.dataFim} onChange={(valor) => campo("dataFim", valor)} /></CampoFiscal>
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          {(["first_mile", "last_mile"] as const).map((etapa) => <Checkbox key={etapa} id={`exec-${etapa}`} label={ETAPAS_DA_EXTRACAO[etapa]} checked={p.etapas.includes(etapa)} onChange={(e) => campo("etapas", e.target.checked ? [...p.etapas, etapa] : p.etapas.filter((v) => v !== etapa))} />)}
          <Checkbox id="exec-sem-entradas" label="Pular entradas (SIEG)" checked={p.semEntradas} onChange={(e) => campo("semEntradas", e.target.checked)} />
        </div>
      </BlocoFiscal>
      {erro && <div role="alert"><Aviso tom="atencao">{erro}</Aviso></div>}
      {(["paralela", "simples", "erros"] as const).map((modo) => <BlocoRecolhivel key={modo} titulo={MODOS_EXECUCAO[modo]} className="bg-surface" abertoInicial={false}>
        <p className="mb-4 text-ui text-fg-secondary">{modo === "paralela" ? "Divide o período entre instâncias de teste." : modo === "simples" ? "Simula uma única instância para o período." : "Recupera os documentos fictícios em quarentena para nova classificação."}</p>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          {modo === "paralela" && <CampoFiscal nome="Instâncias"><Input aria-label="Instâncias" type="number" min={1} max={16} value={p.instancias} onChange={(e) => campo("instancias", Number(e.target.value))} /></CampoFiscal>}
          <CampoFiscal nome={modo === "paralela" ? "Processos paralelos por instância" : "Processos paralelos"}><Input aria-label={`Processos paralelos · ${MODOS_EXECUCAO[modo]}`} type="number" min={1} max={64} value={workers[modo]} onChange={(e) => setWorkers((atual) => ({ ...atual, [modo]: Number(e.target.value) }))} /></CampoFiscal>
        </div>
        <Button className="mt-4" disabled={!podeExtrair || !pronto} onClick={() => solicitar(modo)}>Solicitar {MODOS_EXECUCAO[modo].toLocaleLowerCase("pt-BR")}</Button>
      </BlocoRecolhivel>)}
      <BlocoRecolhivel titulo="Gerar SPED" abertoInicial={query.get("secao") === "gerar"} className="bg-surface">
        <p className="mb-4 text-ui text-fg-secondary">Usa os documentos fictícios já recebidos, em um único mês inteiro. ICMS/IPI gera por estabelecimento; Contribuições reúne a empresa pelo CNPJ raiz.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <CampoFiscal nome="Escrituração"><Select aria-label="Escrituração" value={obrigacao} onChange={(e) => { const modo = e.target.value as typeof obrigacao; setObrigacao(modo); setP((atual) => ({ ...atual, saida: modo === "sped" ? "saida_sped.txt" : "", forcarErros: false, forcarCobertura: false })); }}><option value="sped">EFD ICMS/IPI</option><option value="sped_contribuicoes">EFD Contribuições · PIS/COFINS</option></Select></CampoFiscal>
          <CampoFiscal nome="Tipo do arquivo"><Select aria-label="Tipo do arquivo" value={p.tipoSped ?? ""} onChange={(e) => campo("tipoSped", e.target.value === "0" || e.target.value === "1" ? e.target.value : undefined)}><option value="">Selecione</option><option value="0">Original</option><option value="1">Substituto</option></Select></CampoFiscal>
          <CampoFiscal nome="Arquivo de saída"><Input aria-label="Arquivo de saída" maxLength={200} value={p.saida} placeholder={obrigacao === "sped_contribuicoes" ? "Automático por versão" : "saida_sped.txt"} onChange={(e) => campo("saida", e.target.value)} /></CampoFiscal>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4"><Button variant="secondary" onClick={() => { const [dataIni, dataFim] = mesInteiro(p.dataIni.slice(0, 7) || cenario.contexto.competencia); setP((atual) => ({ ...atual, dataIni, dataFim })); }}>Ajustar para o mês inteiro</Button>
          {obrigacao === "sped" && <><Checkbox id="exec-forcar-erros" label="Gerar mesmo com erro pendente" checked={p.forcarErros} onChange={(e) => campo("forcarErros", e.target.checked)} /><Checkbox id="exec-forcar-cobertura" label="Gerar mesmo sem documentos" checked={p.forcarCobertura} onChange={(e) => campo("forcarCobertura", e.target.checked)} /></>}
        </div>
        <Button className="mt-4" disabled={!podeGerar || !pronto} onClick={() => solicitar(obrigacao)}>Solicitar geração de teste</Button>
      </BlocoRecolhivel>
      <BlocoFiscal titulo="Fila de simulação" descricao={`${fila.length} pedido(s). Use os controles para avançar a simulação ou cancelar um pedido pendente.`}>
        <TabelaFiscal vazio="Nenhum pedido na fila ou executando." colunas={["Ação / parâmetros", "Período", "Estado", "Horários / duração", "Resultado", "Ações"]} linhas={linhas(fila.slice(0, 12))} />
        {fila.length > 12 && <Button href="/fiscal/operacao?aba=historico" variant="link">Consultar todos os pedidos no Histórico</Button>}
      </BlocoFiscal>
    </> : <>
      <CascoDaTabela contagem={contarItens(filtradas.length, "execução", "execuções")} filtros={<FiltrosDaTela naBarra campos={FILTROS} />} acoes={<Button href="/fiscal/operacao?aba=executar">Nova execução</Button>}>
        <TabelaFiscal vazio="Nenhuma execução neste filtro." colunas={["Ação / parâmetros", "Período", "Estado", "Horários / duração", "Resultado / arquivo", "Ações"]} linhas={linhas(filtradas.slice((pagina - 1) * 12, pagina * 12))} />
      </CascoDaTabela>
      <Pagination page={pagina} totalPages={paginas} total={filtradas.length} rotulo="execuções" buildHref={(n) => { const q = new URLSearchParams(query.toString()); q.set("pagina", String(n)); return `/fiscal/operacao?${q}`; }} />
    </>}
    {log && <div ref={blocoDoLog} tabIndex={-1} role="region" aria-label={`Log · ${log.acao}`} className="scroll-mt-4 outline-none"><BlocoFiscal titulo={`Log · ${log.acao}`} descricao={`Pedido ${log.id}`}><PreviaTexto texto={log.log.join("\n")} /></BlocoFiscal></div>}
  </div>;
}
