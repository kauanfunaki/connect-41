"use client";

import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Upload, ShieldAlert, FileText, Wallet, FileX, ListChecks, CheckCircle2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { AlinhadoAoCampo } from "@/components/ui/CampoForm";
import type { CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { MenuFiscal as MenuDeMaisAcoes } from "./MenuFiscal";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useFiscal, classeSelectFiscal } from "./ContextoFiscal";
import { AcoesFiscais, AtalhoFiscal, BlocoFiscal, CampoFiscal, ListaDocumentos, MetricasFiscais, TabelaFiscal, dataFiscal, reais } from "./Compartilhados";
import { documentosDoContexto, mesmoEscopo, totaisDoContexto, type DocumentoTeste } from "@/lib/fiscal/previa/cenario";

const apoio = (d: DocumentoTeste) => ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo);

/**
 * NFS-e, contratos e recibos e quarentena eram abas que mostravam a mesma
 * lista recortada; viraram este filtro da lista do Acervo (15/10/2026) — aba
 * troca a tela, recorte é filtro. Sem filtro, as notas fiscais, como a antiga
 * aba Acervo. Os endereços antigos (`?aba=nfse`…) redirecionam para cá.
 */
const GRUPO: CampoDeFiltro = {
  chave: "grupo",
  rotulo: "Grupo",
  vazioLabel: "Notas fiscais",
  opcoes: [
    { value: "nfse", label: "NFS-e" },
    { value: "apoio", label: "Contratos e recibos" },
    { value: "quarentena", label: "Em quarentena" },
    { value: "todos", label: "Todos os documentos" },
  ],
};
const doGrupo = (grupo: string) => (d: DocumentoTeste) => grupo === "nfse" ? d.tipo === "NFS-e" : grupo === "apoio" ? apoio(d) : grupo === "quarentena" ? d.estado === "Rejeitado" : grupo === "todos" ? true : !apoio(d);

export function DocumentosFiscal({ aba }: { aba: string }) {
  const { cenario, simular, integrado, modulos } = useFiscal();
  const grupo = useSearchParams().get("grupo") ?? "";
  const [lote, setLote] = useState("Lote XML de exemplo");
  const [abrirEntrada, setAbrirEntrada] = useState(aba === "envio");
  const docs = documentosDoContexto(cenario);
  const totais = totaisDoContexto(cenario);
  const importacoes = cenario.importacoes.filter((i) => mesmoEscopo(i.contexto, cenario.contexto));
  if (aba === "importacoes") return <BlocoFiscal titulo="Histórico de importações" descricao="Cada lote mostra recebidos, rejeitados e a origem da entrada." acao={<AtalhoFiscal modulo="fiscal_acervo" aba="envio">Enviar outro lote</AtalhoFiscal>}>
    <TabelaFiscal colunas={["Origem", "Recebidos", "Quarentena", "Importado em"]} linhas={importacoes.map((i) => ({ id: i.id, celulas: [i.origem, i.aceitos, i.rejeitados, dataFiscal(i.criadoEm)] }))} />
    {totais.rejeitados > 0 && <div className="mt-5"><AtalhoFiscal modulo="fiscal_acervo" aba="acervo" filtros={{ grupo: "quarentena" }}>Revisar quarentena</AtalhoFiscal></div>}
  </BlocoFiscal>;
  if (aba === "cobertura") {
    const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
    return <><MetricasFiscais itens={[
      { rotulo: "Documentos recebidos", valor: docs.length, icone: <FileText />, href: "/fiscal/documentos?aba=acervo&grupo=todos" },
      { rotulo: "Prontos para apuração", valor: docs.filter((d) => d.estado === "Classificado").length, icone: <CheckCircle2 />, href: "/fiscal/documentos?aba=acervo&grupo=todos&situacao=Classificado" },
      { rotulo: "Pendentes de decisão", valor: totais.pendentes, icone: <ListChecks />, href: "/fiscal/documentos?aba=acervo&grupo=todos&situacao=Pendente", tom: totais.pendentes > 0 ? "text-warning-fg" : undefined },
      { rotulo: "Quarentena", valor: totais.rejeitados, icone: <ShieldOff />, href: "/fiscal/documentos?aba=acervo&grupo=quarentena", tom: totais.rejeitados > 0 ? "text-warning-fg" : undefined },
    ]} /><BlocoFiscal titulo="Cobertura do estabelecimento" descricao="Tipos de documento e pendências da competência selecionada." acao={<AtalhoFiscal modulo="fiscal_classificacao">Classificar documentos</AtalhoFiscal>}><TabelaFiscal colunas={["Estabelecimento", "NF-e / NFC-e", "CT-e", "NFS-e", "Sem XML", "Pendências"]} linhas={empresa.estabelecimentos.filter((e) => !cenario.contexto.estabelecimentoId || cenario.contexto.estabelecimentoId === e.id).map((e) => { const itens = docs.filter((d) => d.estabelecimentoId === e.id); return { id: e.id, celulas: [e.nome, itens.filter((d) => ["NF-e", "NFC-e"].includes(d.tipo)).length, itens.filter((d) => d.tipo === "CT-e").length, itens.filter((d) => d.tipo === "NFS-e").length, itens.filter((d) => !d.xml).length, itens.filter((d) => d.estado !== "Classificado").length] }; })} /></BlocoFiscal></>;
  }
  const itens = docs.filter(doGrupo(grupo));
  const quarentena = grupo === "quarentena";
  return <div className="space-y-5"><MetricasFiscais itens={[
    { rotulo: "Documentos neste recorte", valor: itens.length, icone: <FileText /> },
    { rotulo: "Valor dos documentos", valor: reais(itens.reduce((v, d) => v + d.valor, 0)), icone: <Wallet /> },
    { rotulo: "Sem XML", valor: itens.filter((d) => !d.xml).length, icone: <FileX /> },
    { rotulo: "Para revisar", valor: itens.filter((d) => d.estado !== "Classificado").length, icone: <ListChecks /> },
  ]} />
    {quarentena && <p className="flex items-center gap-2 text-ui text-fg-secondary"><ShieldAlert size={16} />Recuperar corrige o exemplo e o encaminha à classificação.</p>}
    <div>
      <ListaDocumentos key={`${grupo}-${cenario.contexto.empresaId}-${cenario.contexto.estabelecimentoId}-${cenario.contexto.competencia}`} documentos={itens} filtrosExtras={[GRUPO]} acao={(d) => d.estado === "Rejeitado" ? <Button variant="secondary" size="xs" onClick={() => simular({ tipo: "recuperar", id: d.id })}>Recuperar</Button> : undefined}
        acoes={<AcoesFiscais><Button size="sm" onClick={() => setAbrirEntrada(true)}><Upload size={14} />Enviar documentos</Button>{integrado && <MenuDeMaisAcoes rotulo="Outras opções do acervo" width={250} size="md">{({ close }) => <ItemDoMenu href="/documentos-fiscais" onClick={close}>Documentos fiscais — integrado</ItemDoMenu>}</MenuDeMaisAcoes>}</AcoesFiscais>} />
    </div>
    {quarentena && totais.rejeitados === 0 && modulos.includes("fiscal_classificacao") && <div><AtalhoFiscal modulo="fiscal_classificacao">Continuar para classificação</AtalhoFiscal></div>}
    <Modal open={abrirEntrada} onClose={() => setAbrirEntrada(false)} title="Enviar documentos de teste" maxWidth="max-w-lg">
      <p className="mb-4 text-ui text-fg-secondary">Escolha um lote fictício para simular a recepção e acompanhar a importação sem sair desta tela.</p>
      <div className="flex flex-col gap-4"><CampoFiscal nome="Tipo de lote"><Select value={lote} className={classeSelectFiscal} onChange={(e) => setLote(e.target.value)}><option>Lote XML de exemplo</option><option>Lote de contratos e recibos</option></Select></CampoFiscal><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAbrirEntrada(false)}>Cancelar</Button><Button onClick={() => { simular({ tipo: "importar", origem: lote }); setAbrirEntrada(false); }}><Upload size={14} />Carregar lote</Button></div></div>
    </Modal>
  </div>;
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
      <div className="grid gap-4 sm:grid-cols-4"><CampoFiscal nome="Destinação"><Select className={classeSelectFiscal} value={destino} onChange={(e) => setDestino(e.target.value)}>{["Revenda", "Insumo", "Uso e consumo", "Ativo imobilizado", "Sem crédito"].map((d) => <option key={d}>{d}</option>)}</Select></CampoFiscal><CampoFiscal nome="CST de teste"><Input value={cst} maxLength={3} onChange={(e) => setCst(e.target.value)} /></CampoFiscal><AlinhadoAoCampo><Checkbox id="fiscal-credito" label="Aproveitar crédito" checked={credito} onChange={(e) => setCredito(e.target.checked)} /></AlinhadoAoCampo><AlinhadoAoCampo><Button disabled={!selecionados.length || !cst.trim()} onClick={() => aplicar(selecionados)}>Aplicar a {selecionados.length} selecionado(s)</Button></AlinhadoAoCampo></div>
    </BlocoFiscal>}
    {/* A lista no casco das listas, com as opções na barra (15/10/2026). */}
    <div><ListaDocumentos documentos={docs} selecionavel={aba !== "decisoes"} selecionados={selecionados} onSelecionar={setSelecionados} acoes={<MenuDeMaisAcoes rotulo="Opções da classificação" width={240} size="md">{({ close }) => <><ItemDoMenu onClick={() => { close(); visualizar("Relatório de decisões", <TabelaFiscal colunas={["Documento", "Destinação", "Crédito"]} linhas={docs.filter((d) => d.estado === "Classificado").map((d) => ({ id: d.id, celulas: [`${d.tipo} ${d.numero}`, d.destino, d.credito ? "Sim" : "Não"] }))} />); }}>Prévia do relatório</ItemDoMenu>{aba === "decisoes" && <ItemDoMenu href="/fiscal/classificacao?aba=produtos" onClick={close}>Revisar decisões de produtos</ItemDoMenu>}{aba === "decisoes" && <ItemDoMenu href="/fiscal/classificacao?aba=apoio" onClick={close}>Revisar contratos e recibos</ItemDoMenu>}</>}</MenuDeMaisAcoes>} /></div>
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-ui text-fg-secondary">{prontoParaApurar ? "Todos os documentos estão classificados. Continue para a apuração." : "Selecione um ou mais documentos e aplique a decisão acima. Confira as abas Produtos e Contratos e recibos antes de continuar."}</p>{prontoParaApurar && <AtalhoFiscal modulo={apuracao} aba={apuracao === "fiscal_contribuicoes" ? "fechamento" : "apuracao"}>Continuar para apuração</AtalhoFiscal>}</Card>
  </div>;
}
