"use client";

import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";

import { useState } from "react";
import { Play, FileCheck, Layers, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuFiscal as MenuDeMaisAcoes } from "./MenuFiscal";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useFiscal, classeSelectFiscal } from "./ContextoFiscal";
import { AcoesFiscais, AtalhoFiscal, BlocoFiscal, CampoFiscal, EstadoFiscal, MetricasFiscais, PreviaTexto, TabelaFiscal, dataFiscal } from "./Compartilhados";
import { mesmoEscopo, precisaRevisar, type Imposto, type ArquivoTeste } from "@/lib/fiscal/previa/cenario";

export function ArquivosFiscal({ aba, imposto }: { aba: string; imposto?: Imposto }) {
  const { cenario, simular, visualizar } = useFiscal();
  const [tipo, setTipo] = useState<Imposto>(imposto ?? "ICMS/IPI");
  const todos = cenario.arquivos.filter((a) => mesmoEscopo(a.contexto, cenario.contexto) && (!imposto || a.tipo === imposto));
  const arquivos = todos.filter((a) => aba === "dominio" ? a.dominio : !a.dominio);
  const situacao = (a: ArquivoTeste) => precisaRevisar(cenario, a) ? "Revisão necessária" : a.entregue ? "Entregue · teste" : a.validacao;
  const abrir = (a: ArquivoTeste) => visualizar(a.nome, <div className="space-y-4"><EstadoFiscal>{situacao(a)}</EstadoFiscal><TabelaFiscal colunas={["Informação", "Conteúdo"]} linhas={[
    { id: "versao", celulas: ["Versão / obrigação", `v${a.versao} · ${a.tipo}`] }, { id: "periodo", celulas: ["Competência / estabelecimento", `${a.contexto.competencia} · ${a.contexto.estabelecimentoId || "Todos"}`] }, { id: "validacao", celulas: ["Última validação de teste", a.validacao] }, { id: "protocolo", celulas: ["Protocolo demonstrativo", a.protocolo || "Ainda não entregue"] },
  ]} />{a.erros.length > 0 && <div><h3 className="mb-2 text-ui font-semibold text-fg">Relatório de pendências</h3><ul className="list-disc space-y-1 pl-5 text-ui text-warning-fg">{a.erros.map((erro, i) => <li key={i}>{erro}</li>)}</ul></div>}<PreviaTexto texto={`PRÉVIA DE TESTE · SEM VALIDADE FISCAL\n\nArquivo: ${a.nome}\nObrigação: ${a.tipo}\nCompetência: ${a.contexto.competencia}\nVersão: ${a.versao}\n\n|EXEMPLO|DADOS FICTÍCIOS|\n\nA geração, o download e a impressão são representados por esta prévia visual.`} /></div>);
  return <div className="space-y-5"><MetricasFiscais itens={[["Versões de teste", todos.filter((a) => !a.dominio).length], ["Validação aprovada", todos.filter((a) => !a.dominio && a.validacao === "Aprovado" && !precisaRevisar(cenario, a)).length], ["Precisam de revisão", todos.filter((a) => precisaRevisar(cenario, a)).length], ["Entregas simuladas", todos.filter((a) => a.entregue).length]]} />
    <BlocoFiscal titulo={aba === "dominio" ? "Arquivos de exemplo da Domínio" : aba === "validacao" ? "Validação de teste" : aba === "entregas" ? "Entregas e protocolos" : "Versões geradas"} descricao={aba === "dominio" ? "Adicione uma referência fictícia para comparar as informações." : aba === "entregas" ? "Registre as versões aprovadas. As entregas anteriores continuam disponíveis para consulta." : "Cada alteração nos documentos ou parâmetros sinaliza as versões afetadas para revisão."} acao={aba !== "validacao" && aba !== "entregas" && <AcoesFiscais><Select className={`${classeSelectFiscal} w-40`} aria-label="Obrigação do arquivo" value={tipo} onChange={(e) => setTipo(e.target.value as Imposto)} disabled={!!imposto}><option>ICMS/IPI</option><option>Contribuições</option></Select><Button size="sm" onClick={() => simular({ tipo: "gerar", imposto: tipo, dominio: aba === "dominio" })}>{aba === "dominio" ? <Upload size={14} /> : <Layers size={14} />}{aba === "dominio" ? "Importar exemplo" : "Gerar versão de teste"}</Button></AcoesFiscais>}>
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
            {a.dominio && <ItemDoMenu onClick={() => { close(); visualizar("Comparação com a Domínio · teste", <TabelaFiscal colunas={["Referência", "Resultado demonstrativo"]} linhas={todos.filter((v) => !v.dominio && v.tipo === a.tipo && v.contexto.estabelecimentoId === a.contexto.estabelecimentoId).map((v) => ({ id: v.id, celulas: [v.nome, precisaRevisar(cenario, v) ? "Dados alterados · revisar" : "Estrutura de exemplo compatível · conferir valores"] }))} />); }}>Comparar versões</ItemDoMenu>}
          </>}</MenuDeMaisAcoes>
        </AcoesFiscais>,
      ] }))} />
    </BlocoFiscal>
    {aba === "validacao" && <Card className="p-4 text-ui text-fg-secondary">A validação de teste verifica as pendências do cenário local. Abra o relatório, corrija os documentos e gere uma nova versão para repetir o fluxo.</Card>}
    {aba === "validacao" && <AtalhoFiscal discreto modulo="fiscal_entregas" aba="arquivos">Consultar versões ou gerar novamente</AtalhoFiscal>}
  </div>;
}

export function OperacaoFiscal({ aba }: { aba: string }) {
  const { cenario, simular, visualizar } = useFiscal();
  const [imposto, setImposto] = useState<Imposto>("ICMS/IPI");
  const [falhar, setFalhar] = useState(false);
  const execucoes = cenario.execucoes.filter((e) => mesmoEscopo(e.contexto, cenario.contexto));
  const filtradas = execucoes.filter((e) => aba === "fila" ? e.estado === "Na fila" : aba === "erros" ? e.estado === "Erro" : true);
  if (aba === "executar") return <div className="space-y-5"><MetricasFiscais itens={[["Na fila local", execucoes.filter((e) => e.estado === "Na fila").length], ["Concluídas", execucoes.filter((e) => e.estado === "Concluída").length], ["Erros para reprocessar", execucoes.filter((e) => e.estado === "Erro").length], ["Canceladas", execucoes.filter((e) => e.estado === "Cancelada").length]]} />
    <BlocoFiscal titulo="Extração e importação" descricao="Receba um lote fictício para percorrer o fluxo da entrada à classificação."><AcoesFiscais><Button onClick={() => simular({ tipo: "importar", origem: "Extração simulada" })}><Upload size={14} />Simular extração</Button><AtalhoFiscal modulo="fiscal_acervo" aba="importacoes">Ver importações</AtalhoFiscal></AcoesFiscais></BlocoFiscal>
    <BlocoFiscal titulo="Gerar SPED de teste" descricao="Enfileire uma solicitação e acompanhe o resultado na fila local."><div className="grid gap-4 sm:grid-cols-2"><CampoFiscal nome="Obrigação"><Select className={classeSelectFiscal} value={imposto} onChange={(e) => setImposto(e.target.value as Imposto)}><option>ICMS/IPI</option><option>Contribuições</option></Select></CampoFiscal><label className="flex items-center gap-2 text-ui text-fg"><Checkbox checked={falhar} onChange={(e) => setFalhar(e.target.checked)} />Simular falha para testar recuperação</label></div><div className="mt-5"><AcoesFiscais><Button onClick={() => simular({ tipo: "enfileirar", imposto, falhar })}><Play size={14} />Enfileirar geração</Button><AtalhoFiscal modulo="fiscal_operacao" aba="fila">Abrir fila</AtalhoFiscal></AcoesFiscais></div></BlocoFiscal>
  </div>;
  return <BlocoFiscal titulo={aba === "fila" ? "Fila local de execuções" : aba === "erros" ? "Erros de teste" : "Histórico de execuções"} descricao="Abra o log para conferir as etapas e o retorno da simulação." acao={<AtalhoFiscal modulo="fiscal_operacao" aba="executar">Nova execução</AtalhoFiscal>}>
    <TabelaFiscal colunas={["Ação", "Período / estabelecimento", "Estado", "Criado em", "Ações"]} linhas={filtradas.map((e) => ({ id: e.id, celulas: [e.acao, <span key="contexto">{e.contexto.competencia}<span className="block text-helper text-fg-muted">{e.contexto.estabelecimentoId || "Todos"}</span></span>, <EstadoFiscal key="estado">{e.estado}</EstadoFiscal>, dataFiscal(e.criadoEm), <AcoesFiscais key="acoes">{e.estado === "Na fila" && <Button size="xs" onClick={() => simular({ tipo: "processar", id: e.id })}>Processar</Button>}{e.estado === "Erro" && <Button variant="secondary" size="xs" onClick={() => simular({ tipo: "reprocessar", id: e.id })}>Reprocessar</Button>}<MenuDeMaisAcoes rotulo={`Opções da execução ${e.acao}`} width={220}>{({ close }) => <><ItemDoMenu onClick={() => { close(); visualizar(`Log · ${e.acao}`, <PreviaTexto texto={e.log.join("\n")} />); }}>Ver log</ItemDoMenu>{e.estado === "Na fila" && <ItemDoMenu onClick={() => { close(); simular({ tipo: "cancelar", id: e.id }); }}>Cancelar execução</ItemDoMenu>}</>}</MenuDeMaisAcoes></AcoesFiscais>] }))} />
  </BlocoFiscal>;
}
