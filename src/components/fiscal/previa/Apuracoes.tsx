"use client";

import { Select } from "@/components/ui/Select";

import { useState } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { IconButton } from "@/components/ui/IconButton";
import { useConfirm } from "@/components/ui/useConfirm";
import { useFiscal, classeSelectFiscal } from "./ContextoFiscal";
import { AtalhoFiscal, BlocoFiscal, CampoFiscal, DetalheDocumento, EstadoFiscal, MetricasFiscais, TabelaFiscal, reais } from "./Compartilhados";
import { documentosDoContexto, mesmoEscopo, totaisDoContexto, type Imposto } from "@/lib/fiscal/previa/cenario";
import { ArquivosFiscal } from "./OperacaoEEntregas";

export function FormParametrosFiscal() {
  const { cenario, simular } = useFiscal();
  const { dialog, requestConfirm } = useConfirm();
  const [parametros, setParametros] = useState(cenario.parametros[cenario.contexto.empresaId]);
  const iniciais = cenario.parametros[cenario.contexto.empresaId];
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
  const alterados = (["icms", "ipi", "pis", "cofins"] as const).filter((campo) => parametros[campo] !== iniciais[campo]);
  return <><BlocoFiscal titulo="Alíquotas demonstrativas" descricao="Parâmetros por empresa. Alterar sinaliza todas as competências da empresa para revisão."><form onSubmit={(e) => {
    e.preventDefault();
    const novos = { ...parametros };
    requestConfirm({ title: "Confirmar alteração dos parâmetros", description: `${empresa.nome}: ${alterados.map((campo) => `${campo.toUpperCase()} de ${iniciais[campo]}% para ${novos[campo]}%`).join("; ")}. Todas as competências desta empresa precisarão de nova apuração, e os arquivos afetados serão sinalizados para revisão.`, confirmLabel: "Confirmar alterações" }, async () => { simular({ tipo: "parametros", parametros: novos }); });
  }}><div className="grid gap-4 sm:grid-cols-4">{(["icms", "ipi", "pis", "cofins"] as const).map((campo) => <CampoFiscal key={campo} nome={campo.toUpperCase()}><Input type="number" required min="0" max="100" step="0.01" suffix="%" aria-label={`Alíquota de ${campo.toUpperCase()}`} value={parametros[campo]} onChange={(e) => setParametros({ ...parametros, [campo]: Number(e.target.value) })} /></CampoFiscal>)}</div><Button className="mt-5" type="submit" disabled={!alterados.length}>Salvar parâmetros de teste</Button></form></BlocoFiscal>{dialog}</>;
}

function FormAjuste({ imposto, estadual }: { imposto: Imposto; estadual: boolean }) {
  const { simular } = useFiscal();
  const [codigo, setCodigo] = useState(estadual ? "SC-EXEMPLO" : imposto === "ICMS/IPI" ? "E111-EXEMPLO" : "M-EXEMPLO");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("100");
  const [efeito, setEfeito] = useState<"Débito" | "Crédito">("Crédito");
  const [obrigacao, setObrigacao] = useState(estadual ? "DCIP / DIME / Quadro 12" : imposto === "ICMS/IPI" ? "E111" : "Bloco M");
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); simular({ tipo: "ajuste", imposto, codigo, descricao, valor: Number(valor), efeito, obrigacao }); }}>
    <div className="grid gap-4 sm:grid-cols-2"><CampoFiscal nome="Código"><Input required value={codigo} onChange={(e) => setCodigo(e.target.value)} /></CampoFiscal><CampoFiscal nome="Valor de teste"><Input required type="number" min="0.01" step="0.01" prefix="R$" value={valor} onChange={(e) => setValor(e.target.value)} /></CampoFiscal><CampoFiscal nome="Descrição"><Input required value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Motivo do ajuste demonstrativo" /></CampoFiscal><CampoFiscal nome="Efeito no imposto"><Select value={efeito} className={classeSelectFiscal} onChange={(e) => setEfeito(e.target.value as typeof efeito)}><option>Crédito</option><option>Débito</option></Select></CampoFiscal><CampoFiscal nome="Registro / obrigação"><Input value={obrigacao} onChange={(e) => setObrigacao(e.target.value)} /></CampoFiscal></div><Button type="submit">Registrar ajuste de teste</Button>
  </form>;
}

export function ApuracaoFiscal({ aba, imposto }: { aba: string; imposto: Imposto }) {
  const { cenario, simular, visualizar } = useFiscal();
  const { dialog, requestConfirm } = useConfirm();
  const docs = documentosDoContexto(cenario);
  const totais = totaisDoContexto(cenario);
  const periodos = cenario.periodos.filter((p) => mesmoEscopo(p, cenario.contexto));
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
  const estadual = aba === "dcip-dime";
  const estabelecimento = empresa.estabelecimentos.find((e) => e.id === cenario.contexto.estabelecimentoId);
  const ajustes = cenario.ajustes.filter((a) => mesmoEscopo(a.contexto, cenario.contexto) && a.imposto === imposto && (!estadual || a.obrigacao.includes("DIME") || a.obrigacao.includes("DCIP")));
  if (aba === "sped") return <ArquivosFiscal aba="arquivos" imposto="Contribuições" />;
  if (aba === "ajustes" || estadual) return <div className="space-y-5"><BlocoFiscal titulo={estadual ? "DCIP e DIME · Santa Catarina" : `Ajustes · ${imposto}`} descricao={estadual ? "Lançamentos demonstrativos das obrigações estaduais e Quadro 12." : "Ajustes demonstrativos com efeito de débito ou crédito."} acao={<Button size="sm" disabled={estadual && estabelecimento?.uf !== "SC"} onClick={() => visualizar("Novo ajuste de teste", <FormAjuste imposto={imposto} estadual={estadual} />)}><Plus size={14} />Novo ajuste</Button>}>
    {estadual && estabelecimento?.uf !== "SC" && <p className="mb-5 rounded-md bg-info-bg p-3 text-ui text-fg-secondary">Selecione uma filial de Santa Catarina para testar os lançamentos de DCIP e DIME.</p>}
    <TabelaFiscal colunas={["Código / descrição", "Efeito", "Valor", "Registro / obrigação", "Ações"]} linhas={ajustes.map((a) => ({ id: a.id, celulas: [<span key="codigo">{a.codigo}<span className="block text-helper text-fg-secondary">{a.descricao}</span></span>, a.efeito, reais(a.valor), a.obrigacao, <IconButton key="remover" size="sm" title={`Remover ajuste ${a.codigo}`} className="text-danger hover:text-danger hover:bg-danger-bg" onClick={() => requestConfirm({ title: "Remover ajuste?", description: `${a.codigo} · ${a.descricao} · ${reais(a.valor)}. O ajuste será excluído do cenário, e a apuração precisará ser atualizada.`, confirmLabel: "Remover ajuste", destructive: true }, async () => { simular({ tipo: "remover-ajuste", id: a.id }); })}><Trash2 size={15} /></IconButton>] }))} />
  </BlocoFiscal><AtalhoFiscal modulo={imposto === "ICMS/IPI" ? "fiscal_icms_ipi" : "fiscal_contribuicoes"} aba={imposto === "ICMS/IPI" ? "apuracao" : "fechamento"}>Revisar apuração</AtalhoFiscal>{dialog}</div>;
  if (aba === "decisoes") return <BlocoFiscal titulo="Decisões por registro" descricao="CST, vínculo e base de crédito do cenário." acao={<AtalhoFiscal modulo="fiscal_classificacao" aba="decisoes">Revisar decisões</AtalhoFiscal>}><TabelaFiscal colunas={["Documento", "CST", "Destinação / vínculo", "Base de crédito", "Situação"]} linhas={docs.filter((d) => d.estado !== "Rejeitado").map((d) => ({ id: d.id, celulas: [`${d.tipo} ${d.numero}`, d.cst, d.destino, reais(d.credito ? d.valor : 0), <EstadoFiscal key="estado">{d.estado}</EstadoFiscal>] }))} /></BlocoFiscal>;
  const linhasDemonstrativo = [
    ["Receita da competência", totais.saidas], ["Entradas e documentos de apoio", totais.entradas], ["Base de crédito de teste", totais.creditavel],
    ...(imposto === "ICMS/IPI" ? [["ICMS de teste", totais.icms], ["IPI de teste", totais.ipi]] : [["PIS de teste", totais.pis], ["COFINS de teste", totais.cofins]]),
  ] as [string, number][];
  const demonstrativo = <TabelaFiscal colunas={["Composição demonstrativa", "Valor"]} linhas={linhasDemonstrativo.map(([nome, valor]) => ({ id: nome, celulas: [nome, reais(valor)] }))} />;
  if (aba === "demonstrativo") return <BlocoFiscal titulo={`Demonstrativo · ${imposto}`} descricao="Valores ilustrativos derivados do cenário local, incluindo os ajustes." acao={<Button size="sm" variant="secondary" onClick={() => visualizar(`Prévia do demonstrativo ${imposto}`, demonstrativo)}>Prévia para imprimir / exportar</Button>}>{demonstrativo}</BlocoFiscal>;
  const fechado = periodos.length > 0 && periodos.every((p) => p.fechado);
  const apurado = periodos.length > 0 && periodos.every((p) => p.apurado);
  const pendencias = totais.pendentes + totais.rejeitados;
  return <div className="space-y-5"><MetricasFiscais itens={[["Receita", reais(totais.saidas)], ["Créditos · base de teste", reais(totais.creditavel)], [imposto === "ICMS/IPI" ? "ICMS de teste" : "PIS + COFINS de teste", reais(imposto === "ICMS/IPI" ? totais.icms : totais.pis + totais.cofins)], ["Pendências para concluir", totais.pendentes + totais.rejeitados]]} />
    <BlocoFiscal titulo={aba === "fechamento" ? "Fechamento da competência" : "Apuração da competência"} descricao={pendencias ? "Resolva as pendências indicadas abaixo para liberar a apuração." : fechado ? "Conferência concluída. Continue para gerar os arquivos." : apurado ? "Confira os valores e feche a competência." : "Os documentos estão prontos. Atualize a apuração para continuar."} acao={!fechado && <Button size="sm" disabled={pendencias > 0 || docs.length === 0} onClick={() => simular({ tipo: apurado ? "fechar" : "apurar" })}><Calculator size={14} />{apurado ? "Fechar competência" : "Simular apuração"}</Button>}>
      <div className="mb-5 flex flex-wrap gap-4"><EstadoFiscal>{apurado ? "Apuração atualizada" : "Apuração pendente"}</EstadoFiscal><EstadoFiscal>{fechado ? "Fechado" : "Fechamento pendente"}</EstadoFiscal></div>
      <div className="mb-5"><AtalhoFiscal discreto modulo="fiscal_configuracoes" aba="parametros">Consultar parâmetros da empresa</AtalhoFiscal></div>
      <TabelaFiscal colunas={["Conferência", "Resultado", "Continuar"]} linhas={[
        { id: "documentos", celulas: ["Documentos recebidos", `${docs.length} documentos · ${totais.rejeitados} em quarentena`, totais.rejeitados > 0 ? <AtalhoFiscal key="docs" discreto modulo="fiscal_acervo" aba="quarentena">Revisar documentos</AtalhoFiscal> : "Conferido"] },
        { id: "decisoes", celulas: ["Decisões de classificação", `${totais.pendentes} pendentes`, totais.pendentes > 0 ? <AtalhoFiscal key="classificar" discreto modulo="fiscal_classificacao">Classificar</AtalhoFiscal> : "Conferido"] },
        { id: "apoio", celulas: ["Contratos, recibos e pagamentos", `${docs.filter((d) => ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo)).length} documentos de apoio`, <AtalhoFiscal key="apoio" discreto modulo="fiscal_conferencia" aba="confronto">Conferir pagamentos</AtalhoFiscal>] },
        { id: "ajustes", celulas: ["Ajustes da competência", `${ajustes.length} ajuste(s)`, <AtalhoFiscal key="ajustes" discreto modulo={imposto === "ICMS/IPI" ? "fiscal_icms_ipi" : "fiscal_contribuicoes"} aba="ajustes">Consultar ajustes</AtalhoFiscal>] },
      ]} />
    </BlocoFiscal>
    <BlocoRecolhivel titulo="Documentos por CFOP / categoria" resumo={`${docs.filter((d) => d.estado !== "Rejeitado").length} documentos`} className="bg-surface" classeDoConteudo="p-5 pt-0"><TabelaFiscal colunas={["CFOP / categoria", "Documentos", "Valor", "Detalhamento"]} linhas={Array.from(new Set(docs.filter((d) => d.estado !== "Rejeitado").map((d) => d.cfop || d.tipo))).map((grupo) => { const itens = docs.filter((d) => (d.cfop || d.tipo) === grupo && d.estado !== "Rejeitado"); return { id: grupo, celulas: [grupo, itens.length, reais(itens.reduce((v, d) => v + d.valor, 0)), <Button key="ver" variant="link" className="text-ui" onClick={() => visualizar(`Documentos · ${grupo}`, <TabelaFiscal colunas={["Documento", "Participante", "Valor", "Detalhes"]} linhas={itens.map((d) => ({ id: d.id, celulas: [`${d.tipo} ${d.numero}`, d.participante, reais(d.valor), <Button key="detalhe" variant="link" className="text-ui" onClick={() => visualizar(`${d.tipo} ${d.numero}`, <DetalheDocumento documento={d} />)}>Ver documento</Button>] }))} />)}>Ver documentos</Button>] }; })} /></BlocoRecolhivel>
    {fechado && <BlocoFiscal titulo="Próxima etapa: gerar arquivos" descricao="A competência está fechada. Escolha a obrigação em Arquivos e entregas para criar a versão de teste."><AtalhoFiscal modulo="fiscal_entregas" aba="arquivos">Continuar para geração</AtalhoFiscal></BlocoFiscal>}
  </div>;
}
