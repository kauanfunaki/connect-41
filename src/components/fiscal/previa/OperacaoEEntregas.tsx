"use client";

import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Play, FileCheck, Layers, Upload, Clock, CheckCircle2, AlertTriangle, Ban, BadgeCheck, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { MenuFiscal as MenuDeMaisAcoes } from "./MenuFiscal";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useFiscal, classeSelectFiscal } from "./ContextoFiscal";
import { AcoesFiscais, AtalhoFiscal, BlocoFiscal, CampoFiscal, EstadoFiscal, MetricasFiscais, PreviaTexto, TabelaFiscal, dataFiscal } from "./Compartilhados";
import { mesmoEscopo, precisaRevisar, type Imposto, type ArquivoTeste } from "@/lib/fiscal/previa/cenario";

export function ArquivosFiscal({ aba, imposto }: { aba: string; imposto?: Imposto }) {
  const { cenario, simular, visualizar } = useFiscal();
  const [tipo, setTipo] = useState<Imposto>(imposto ?? "ICMS/IPI");
  const todos = cenario.arquivos.filter((a) => mesmoEscopo(a.contexto, cenario.contexto) && (!imposto || a.tipo === imposto));
  const arquivos = todos.filter((a) => !a.dominio);
  const situacao = (a: ArquivoTeste) => precisaRevisar(cenario, a) ? "Revisão necessária" : a.entregue ? "Entregue · teste" : a.validacao;
  const abrir = (a: ArquivoTeste) => visualizar(a.nome, <div className="space-y-4"><EstadoFiscal>{situacao(a)}</EstadoFiscal><TabelaFiscal colunas={["Informação", "Conteúdo"]} linhas={[
    { id: "versao", celulas: ["Versão / obrigação", `v${a.versao} · ${a.tipo}`] }, { id: "periodo", celulas: ["Competência / estabelecimento", `${a.contexto.competencia} · ${a.contexto.estabelecimentoId || "Todos"}`] }, { id: "validacao", celulas: ["Última validação de teste", a.validacao] }, { id: "protocolo", celulas: ["Protocolo demonstrativo", a.protocolo || "Ainda não entregue"] },
  ]} />{a.erros.length > 0 && <div><h3 className="mb-2 text-ui font-semibold text-fg">Relatório de pendências</h3><ul className="list-disc space-y-1 pl-5 text-ui text-warning-fg">{a.erros.map((erro, i) => <li key={i}>{erro}</li>)}</ul></div>}<PreviaTexto texto={`PRÉVIA DE TESTE · SEM VALIDADE FISCAL\n\nArquivo: ${a.nome}\nObrigação: ${a.tipo}\nCompetência: ${a.contexto.competencia}\nVersão: ${a.versao}\n\n|EXEMPLO|DADOS FICTÍCIOS|\n\nA geração, o download e a impressão são representados por esta prévia visual.`} /></div>);
  const revisar = todos.filter((a) => precisaRevisar(cenario, a)).length;
  return <div className="space-y-5"><MetricasFiscais itens={[
    { rotulo: "Versões de teste", valor: todos.filter((a) => !a.dominio).length, icone: <Layers /> },
    { rotulo: "Validação aprovada", valor: todos.filter((a) => !a.dominio && a.validacao === "Aprovado" && !precisaRevisar(cenario, a)).length, icone: <BadgeCheck /> },
    { rotulo: "Precisam de revisão", valor: revisar, icone: <RefreshCw />, tom: revisar > 0 ? "text-warning-fg" : undefined },
    { rotulo: "Entregas simuladas", valor: todos.filter((a) => a.entregue).length, icone: <Send />, href: imposto ? undefined : "/fiscal/entregas?aba=entregas" },
  ]} />
    <BlocoFiscal titulo={aba === "validacao" ? "Validação de teste" : aba === "entregas" ? "Entregas e protocolos" : "Versões geradas"} descricao={aba === "entregas" ? "Registre as versões aprovadas. As entregas anteriores continuam disponíveis para consulta." : "Cada alteração nos documentos ou parâmetros sinaliza as versões afetadas para revisão."} acao={aba !== "validacao" && aba !== "entregas" && <AcoesFiscais><Select className={`${classeSelectFiscal} w-40`} aria-label="Obrigação do arquivo" value={tipo} onChange={(e) => setTipo(e.target.value as Imposto)} disabled={!!imposto}><option>ICMS/IPI</option><option>Contribuições</option></Select><Button size="sm" onClick={() => simular({ tipo: "gerar", imposto: tipo })}><Layers size={14} />Gerar versão de teste</Button></AcoesFiscais>}>
      <TabelaFiscal colunas={["Arquivo / obrigação", "Competência", "Versão", "Situação", "Criado em", "Ações"]} linhas={arquivos.map((a) => ({ id: a.id, celulas: [
        <span key="nome" className="block max-w-64 break-words text-helper">{a.nome}<span className="mt-1 block text-ui font-medium">{a.tipo} · {a.contexto.estabelecimentoId || "Todos os estabelecimentos"}</span></span>, a.contexto.competencia, `v${a.versao}`, <EstadoFiscal key="estado">{situacao(a)}</EstadoFiscal>, <span key="data" className="whitespace-nowrap text-helper">{dataFiscal(a.criadoEm)}</span>,
        <AcoesFiscais key="acoes">
          {!a.dominio && !a.entregue && !precisaRevisar(cenario, a) && (a.validacao !== "Aprovado"
            ? <Button size="xs" variant="secondary" onClick={() => simular({ tipo: "validar", id: a.id })}><FileCheck size={13} />Validar</Button>
            : aba === "entregas" ? <Button size="xs" variant="secondary" onClick={() => simular({ tipo: "entregar", id: a.id })}>Registrar entrega</Button>
              : <AtalhoFiscal discreto modulo="fiscal_entregas" aba="entregas">Ir para entrega</AtalhoFiscal>)}
          <MenuDeMaisAcoes rotulo={`Opções de ${a.nome}`} width={220}>{({ close }) => <>
            <ItemDoMenu onClick={() => { close(); abrir(a); }}>{aba === "validacao" ? "Ver relatório de validação" : "Ver / baixar prévia"}</ItemDoMenu>
            {precisaRevisar(cenario, a) && <ItemDoMenu href="/fiscal/entregas?aba=arquivos" onClick={close}>Gerar nova versão</ItemDoMenu>}
          </>}</MenuDeMaisAcoes>
        </AcoesFiscais>,
      ] }))} />
    </BlocoFiscal>
    {aba === "validacao" && <Card className="p-4 text-ui text-fg-secondary">A validação de teste verifica as pendências do cenário local. Abra o relatório, corrija os documentos e gere uma nova versão para repetir o fluxo.</Card>}
    {aba === "validacao" && <AtalhoFiscal discreto modulo="fiscal_entregas" aba="arquivos">Consultar versões ou gerar novamente</AtalhoFiscal>}
  </div>;
}

/**
 * Fila, Histórico e Erros eram abas que mostravam a mesma tabela de execuções
 * recortada pelo estado; viraram o filtro Estado do Histórico (15/10/2026). Os
 * endereços antigos (`?aba=fila`, `?aba=erros`) redirecionam para cá.
 */
const ESTADOS_DA_EXECUCAO: Record<string, string> = { fila: "Na fila", concluida: "Concluída", erro: "Erro", cancelada: "Cancelada" };
const ESTADO: CampoDeFiltro = { chave: "estado", rotulo: "Estado", vazioLabel: "Todos", opcoes: Object.entries(ESTADOS_DA_EXECUCAO).map(([value, label]) => ({ value, label })) };
const hrefDoEstado = (estado: string) => `/fiscal/operacao?aba=historico&estado=${estado}`;

export function OperacaoFiscal({ aba }: { aba: string }) {
  const { cenario, simular, visualizar } = useFiscal();
  const estado = ESTADOS_DA_EXECUCAO[useSearchParams().get("estado") ?? ""];
  const [imposto, setImposto] = useState<Imposto>("ICMS/IPI");
  const [falhar, setFalhar] = useState(false);
  const execucoes = cenario.execucoes.filter((e) => mesmoEscopo(e.contexto, cenario.contexto));
  const filtradas = execucoes.filter((e) => !estado || e.estado === estado);
  const quantas = (e: string) => execucoes.filter((x) => x.estado === e).length;
  if (aba === "executar") return <div className="space-y-5"><MetricasFiscais itens={[
    { rotulo: "Na fila local", valor: quantas("Na fila"), icone: <Clock />, href: hrefDoEstado("fila") },
    { rotulo: "Concluídas", valor: quantas("Concluída"), icone: <CheckCircle2 />, href: hrefDoEstado("concluida") },
    { rotulo: "Erros para reprocessar", valor: quantas("Erro"), icone: <AlertTriangle />, href: hrefDoEstado("erro"), tom: quantas("Erro") > 0 ? "text-danger" : undefined },
    { rotulo: "Canceladas", valor: quantas("Cancelada"), icone: <Ban />, href: hrefDoEstado("cancelada") },
  ]} />
    <BlocoFiscal titulo="Extração e importação" descricao="Receba um lote fictício para percorrer o fluxo da entrada à classificação."><AcoesFiscais><Button onClick={() => simular({ tipo: "importar", origem: "Extração simulada" })}><Upload size={14} />Simular extração</Button><AtalhoFiscal modulo="fiscal_acervo" aba="importacoes">Ver importações</AtalhoFiscal></AcoesFiscais></BlocoFiscal>
    <BlocoFiscal titulo="Gerar SPED de teste" descricao="Enfileire uma solicitação e acompanhe o resultado na fila local."><div className="grid gap-4 sm:grid-cols-2"><CampoFiscal nome="Obrigação"><Select className={classeSelectFiscal} value={imposto} onChange={(e) => setImposto(e.target.value as Imposto)}><option>ICMS/IPI</option><option>Contribuições</option></Select></CampoFiscal><AlinhadoAoCampo><Checkbox id="fiscal-falhar" label="Simular falha para testar recuperação" checked={falhar} onChange={(e) => setFalhar(e.target.checked)} /></AlinhadoAoCampo></div><div className="mt-5"><AcoesFiscais><Button onClick={() => simular({ tipo: "enfileirar", imposto, falhar })}><Play size={14} />Enfileirar geração</Button><AtalhoFiscal modulo="fiscal_operacao" aba="historico" filtros={{ estado: "fila" }}>Abrir fila</AtalhoFiscal></AcoesFiscais></div></BlocoFiscal>
  </div>;
  // No casco das listas, com o Estado no "Filtros" (15/10/2026).
  return <div>
    <CascoDaTabela contagem={contarItens(filtradas.length, "execução", "execuções")} filtros={<FiltrosDaTela naBarra campos={[ESTADO]} />} acoes={<AtalhoFiscal modulo="fiscal_operacao" aba="executar">Nova execução</AtalhoFiscal>}>
    <TabelaFiscal vazio="Nenhuma execução neste filtro." colunas={["Ação", "Período / estabelecimento", "Estado", "Criado em", "Ações"]} linhas={filtradas.map((e) => ({ id: e.id, celulas: [e.acao, <span key="contexto">{e.contexto.competencia}<span className="block text-helper text-fg-muted">{e.contexto.estabelecimentoId || "Todos"}</span></span>, <EstadoFiscal key="estado">{e.estado}</EstadoFiscal>, dataFiscal(e.criadoEm), <AcoesFiscais key="acoes">{e.estado === "Na fila" && <Button size="xs" onClick={() => simular({ tipo: "processar", id: e.id })}>Processar</Button>}{e.estado === "Erro" && <Button variant="secondary" size="xs" onClick={() => simular({ tipo: "reprocessar", id: e.id })}>Reprocessar</Button>}<MenuDeMaisAcoes rotulo={`Opções da execução ${e.acao}`} width={220}>{({ close }) => <><ItemDoMenu onClick={() => { close(); visualizar(`Log · ${e.acao}`, <PreviaTexto texto={e.log.join("\n")} />); }}>Ver log</ItemDoMenu>{e.estado === "Na fila" && <ItemDoMenu onClick={() => { close(); simular({ tipo: "cancelar", id: e.id }); }}>Cancelar execução</ItemDoMenu>}</>}</MenuDeMaisAcoes></AcoesFiscais>] }))} />
    </CascoDaTabela>
    <p className="mt-3 text-helper text-fg-muted">Abra o log no ⋯ de cada execução para conferir as etapas e o retorno da simulação.</p>
  </div>;
}
