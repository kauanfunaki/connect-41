"use client";

import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";

import { useState } from "react";
import { Upload, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useFiscal, classeSelectFiscal } from "./ContextoFiscal";
import { AcoesFiscais, AtalhoFiscal, BlocoFiscal, CampoFiscal, ListaDocumentos, MetricasFiscais, TabelaFiscal, dataFiscal, reais } from "./Compartilhados";
import { documentosDoContexto, mesmoEscopo, totaisDoContexto, type DocumentoTeste } from "@/lib/fiscal/previa/cenario";

const apoio = (d: DocumentoTeste) => ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo);
export function DocumentosFiscal({ aba }: { aba: string }) {
  const { cenario, simular, integrado } = useFiscal();
  const [lote, setLote] = useState("Lote XML de exemplo");
  const docs = documentosDoContexto(cenario);
  const totais = totaisDoContexto(cenario);
  const importacoes = cenario.importacoes.filter((i) => mesmoEscopo(i.contexto, cenario.contexto));
  if (aba === "envio") return <BlocoFiscal titulo="Enviar documentos de teste" descricao="Use os lotes prontos para experimentar a recepção e o relatório de importação.">
    <div className="rounded-lg border-2 border-dashed border-border-strong p-8 text-center"><Upload className="mx-auto mb-3 text-brand" size={32} /><h3 className="text-card-title font-semibold text-fg">Escolha um lote de exemplo</h3><p className="mx-auto mt-2 max-w-lg text-ui text-fg-secondary">O lote contém notas, documentos de serviço e um item incompleto para revisar na quarentena. As informações ficam neste navegador.</p><div className="mx-auto mt-5 flex max-w-lg flex-wrap items-end justify-center gap-3"><CampoFiscal nome="Tipo de lote"><Select value={lote} className={classeSelectFiscal} onChange={(e) => setLote(e.target.value)}><option>Lote XML de exemplo</option><option>Lote de contratos e recibos</option></Select></CampoFiscal><Button onClick={() => simular({ tipo: "importar", origem: lote })}>Carregar lote</Button></div></div>
    <div className="mt-5"><AtalhoFiscal modulo="fiscal_acervo" aba="importacoes">Acompanhar importações</AtalhoFiscal></div>
  </BlocoFiscal>;
  if (aba === "importacoes") return <BlocoFiscal titulo="Histórico de importações" descricao="Cada lote mostra recebidos, rejeitados e a origem da entrada." acao={<AtalhoFiscal modulo="fiscal_acervo" aba="envio">Enviar outro lote</AtalhoFiscal>}>
    <TabelaFiscal colunas={["Origem", "Recebidos", "Quarentena", "Importado em"]} linhas={importacoes.map((i) => ({ id: i.id, celulas: [i.origem, i.aceitos, i.rejeitados, dataFiscal(i.criadoEm)] }))} />
    {totais.rejeitados > 0 && <div className="mt-5"><AtalhoFiscal modulo="fiscal_acervo" aba="quarentena">Revisar quarentena</AtalhoFiscal></div>}
  </BlocoFiscal>;
  if (aba === "cobertura") {
    const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
    return <><MetricasFiscais itens={[["Documentos recebidos", docs.length], ["Prontos para apuração", docs.filter((d) => d.estado === "Classificado").length], ["Pendentes de decisão", totais.pendentes], ["Quarentena", totais.rejeitados]]} /><BlocoFiscal titulo="Cobertura do estabelecimento" descricao="Tipos de documento e pendências da competência selecionada." acao={<AtalhoFiscal modulo="fiscal_classificacao">Classificar documentos</AtalhoFiscal>}><TabelaFiscal colunas={["Estabelecimento", "NF-e / NFC-e", "CT-e", "NFS-e", "Sem XML", "Pendências"]} linhas={empresa.estabelecimentos.filter((e) => !cenario.contexto.estabelecimentoId || cenario.contexto.estabelecimentoId === e.id).map((e) => { const itens = docs.filter((d) => d.estabelecimentoId === e.id); return { id: e.id, celulas: [e.nome, itens.filter((d) => ["NF-e", "NFC-e"].includes(d.tipo)).length, itens.filter((d) => d.tipo === "CT-e").length, itens.filter((d) => d.tipo === "NFS-e").length, itens.filter((d) => !d.xml).length, itens.filter((d) => d.estado !== "Classificado").length] }; })} /></BlocoFiscal></>;
  }
  const itens = docs.filter((d) => aba === "nfse" ? d.tipo === "NFS-e" : aba === "apoio" ? apoio(d) : aba === "quarentena" ? d.estado === "Rejeitado" : !apoio(d));
  const titulo = aba === "nfse" ? "Notas de serviço" : aba === "apoio" ? "Contratos, recibos, RPA e faturas" : aba === "quarentena" ? "Documentos em quarentena" : "Acervo da competência";
  return <><MetricasFiscais itens={[["Documentos neste recorte", itens.length], ["Valor dos documentos", reais(itens.reduce((v, d) => v + d.valor, 0))], ["Sem XML", itens.filter((d) => !d.xml).length], ["Para revisar", itens.filter((d) => d.estado !== "Classificado").length]]} /><BlocoFiscal titulo={titulo} acao={<AcoesFiscais><AtalhoFiscal modulo="fiscal_acervo" aba="envio">Enviar documentos</AtalhoFiscal>{integrado && <MenuDeMaisAcoes rotulo="Outras opções do acervo" width={250}>{({ close }) => <ItemDoMenu href="/documentos-fiscais" onClick={close}>Documentos fiscais — integrado</ItemDoMenu>}</MenuDeMaisAcoes>}</AcoesFiscais>}>
    {aba === "quarentena" && <p className="mb-4 flex items-center gap-2 text-ui text-fg-secondary"><ShieldAlert size={16} />Recuperar corrige o exemplo e o encaminha à classificação.</p>}
    <ListaDocumentos key={`${aba}-${cenario.contexto.empresaId}-${cenario.contexto.estabelecimentoId}-${cenario.contexto.competencia}`} documentos={itens} acao={(d) => d.estado === "Rejeitado" ? <Button variant="secondary" size="xs" onClick={() => simular({ tipo: "recuperar", id: d.id })}>Recuperar</Button> : undefined} />
    {aba === "quarentena" && totais.rejeitados === 0 && <div className="mt-5"><AtalhoFiscal modulo="fiscal_classificacao">Continuar para classificação</AtalhoFiscal></div>}
  </BlocoFiscal></>;
}

export function ClassificacaoFiscal({ aba }: { aba: string }) {
  const { cenario, simular, visualizar, modulos } = useFiscal();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [destino, setDestino] = useState("Revenda");
  const [credito, setCredito] = useState(true);
  const [cst, setCst] = useState("00");
  const docs = documentosDoContexto(cenario).filter((d) => aba === "apoio" ? apoio(d) : aba === "decisoes" ? d.estado === "Classificado" : !apoio(d));
  const aplicar = (ids: string[]) => { simular({ tipo: "classificar", ids, destino, credito, cst }); setSelecionados([]); };
  const prontoParaApurar = documentosDoContexto(cenario).length > 0 && documentosDoContexto(cenario).every((d) => d.estado === "Classificado");
  const apuracao = modulos.includes("fiscal_contribuicoes") ? "fiscal_contribuicoes" : "fiscal_icms_ipi";
  return <div className="space-y-5">
    {aba !== "decisoes" && <BlocoFiscal titulo="Decisão de classificação" descricao="Defina o tratamento e aplique a um item ou aos documentos selecionados.">
      <div className="grid items-end gap-4 sm:grid-cols-4"><CampoFiscal nome="Destinação"><Select className={classeSelectFiscal} value={destino} onChange={(e) => setDestino(e.target.value)}>{["Revenda", "Insumo", "Uso e consumo", "Ativo imobilizado", "Sem crédito"].map((d) => <option key={d}>{d}</option>)}</Select></CampoFiscal><CampoFiscal nome="CST de teste"><Input aria-label="CST de teste" value={cst} maxLength={3} onChange={(e) => setCst(e.target.value)} /></CampoFiscal><label className="flex h-9 items-center gap-2 text-ui text-fg"><Checkbox checked={credito} onChange={(e) => setCredito(e.target.checked)} />Aproveitar crédito</label><Button disabled={!selecionados.length || !cst.trim()} onClick={() => aplicar(selecionados)}>Aplicar a {selecionados.length} selecionado(s)</Button></div>
    </BlocoFiscal>}
    <BlocoFiscal titulo={aba === "apoio" ? "Documentos sem nota" : aba === "decisoes" ? "Decisões registradas" : "Produtos e documentos fiscais"} acao={<MenuDeMaisAcoes rotulo="Opções da classificação" width={240}>{({ close }) => <><ItemDoMenu onClick={() => { close(); visualizar("Relatório de decisões", <TabelaFiscal colunas={["Documento", "Destinação", "Crédito"]} linhas={docs.filter((d) => d.estado === "Classificado").map((d) => ({ id: d.id, celulas: [`${d.tipo} ${d.numero}`, d.destino, d.credito ? "Sim" : "Não"] }))} />); }}>Prévia do relatório</ItemDoMenu>{aba === "decisoes" && <ItemDoMenu href="/fiscal/classificacao?aba=produtos" onClick={close}>Revisar decisões de produtos</ItemDoMenu>}{aba === "decisoes" && <ItemDoMenu href="/fiscal/classificacao?aba=apoio" onClick={close}>Revisar contratos e recibos</ItemDoMenu>}</>}</MenuDeMaisAcoes>}>
      <ListaDocumentos documentos={docs} selecionavel={aba !== "decisoes"} selecionados={selecionados} onSelecionar={setSelecionados} />
    </BlocoFiscal>
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-ui text-fg-secondary">{prontoParaApurar ? "Todos os documentos estão classificados. Continue para a apuração." : "Selecione um ou mais documentos e aplique a decisão acima. Confira as abas Produtos e Contratos e recibos antes de continuar."}</p>{prontoParaApurar && <AtalhoFiscal modulo={apuracao} aba={apuracao === "fiscal_contribuicoes" ? "fechamento" : "apuracao"}>Continuar para apuração</AtalhoFiscal>}</Card>
  </div>;
}
