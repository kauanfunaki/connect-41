"use client";

import { Select } from "@/components/ui/Select";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFiscal, classeSelectFiscal } from "./ContextoFiscal";
import { AcoesFiscais, AtalhoFiscal, BlocoFiscal, CampoFiscal, EstadoFiscal, MetricasFiscais, TabelaFiscal, reais } from "./Compartilhados";
import { documentosDoContexto, mesmoEscopo, totaisDoContexto, type Cenario } from "@/lib/fiscal/previa/cenario";
import { FormParametrosFiscal } from "./Apuracoes";

function FormEmpresaFiscal() {
  const { cenario, simular } = useFiscal();
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
  const [nome, setNome] = useState(empresa.nome);
  const [regime, setRegime] = useState(empresa.regime);
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); simular({ tipo: "empresa", nome, regime }); }}><CampoFiscal nome="Nome da empresa fictícia"><Input required value={nome} onChange={(e) => setNome(e.target.value)} /></CampoFiscal><CampoFiscal nome="Regime de teste"><Select className={classeSelectFiscal} value={regime} onChange={(e) => setRegime(e.target.value)}>{["Lucro real", "Lucro presumido", "Simples nacional"].map((r) => <option key={r}>{r}</option>)}</Select></CampoFiscal><Button type="submit">Salvar cadastro de teste</Button></form>;
}
function FormRegraFiscal({ regra: inicial }: { regra: Cenario["regras"][number] }) {
  const { simular } = useFiscal();
  const [regra, setRegra] = useState(inicial);
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); simular({ tipo: "regra", regra }); }}><div className="grid gap-4 sm:grid-cols-2">{([["cfop", "CFOP"], ["destino", "Destinação"], ["debito", "Conta de débito"], ["credito", "Conta de crédito"], ["historico", "Histórico contábil"], ["fonte", "Fonte / procedência"]] as const).map(([campo, nome]) => <CampoFiscal key={campo} nome={nome}><Input required value={regra[campo]} onChange={(e) => setRegra({ ...regra, [campo]: e.target.value })} /></CampoFiscal>)}</div><p className="text-helper text-fg-secondary">As regras são compartilhadas entre as empresas fictícias. Alterar sinaliza os arquivos para revisão.</p><Button type="submit">Salvar regra de teste</Button></form>;
}

export function ConfiguracoesFiscal({ aba }: { aba: string }) {
  const { cenario, visualizar } = useFiscal();
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId)!;
  if (aba === "parametros") return <FormParametrosFiscal />;
  if (aba === "empresas") return <div className="space-y-5"><BlocoFiscal titulo={empresa.nome} descricao={`Regime demonstrativo: ${empresa.regime}`} acao={<Button size="sm" onClick={() => visualizar("Editar empresa de teste", <FormEmpresaFiscal />)}>Editar empresa</Button>}><TabelaFiscal colunas={["Estabelecimento", "UF", "CNPJ demonstrativo", "Competências"]} linhas={empresa.estabelecimentos.map((e) => ({ id: e.id, celulas: [e.nome, e.uf, e.cnpj, "09/2026 e 10/2026"] }))} /></BlocoFiscal><p className="text-helper text-fg-secondary">Troque a empresa no filtro acima para explorar os três cenários. Os cadastros são exclusivamente fictícios.</p></div>;
  return <BlocoFiscal titulo={aba === "cfop" ? "De-para CFOP → tratamento fiscal" : "Regras fiscais e suas fontes"} descricao="Regras demonstrativas compartilhadas pelo cenário; não representam orientação tributária."><TabelaFiscal colunas={["CFOP", "Tratamento", "Fonte / procedência", "Ações"]} linhas={cenario.regras.map((r) => ({ id: r.id, celulas: [r.cfop, r.destino, r.fonte, <Button key="editar" size="xs" variant="secondary" onClick={() => visualizar(`Regra de exemplo · ${r.cfop}`, <FormRegraFiscal regra={r} />)}>Editar regra / fonte</Button>] }))} /></BlocoFiscal>;
}

export function ConferenciaFiscal({ aba }: { aba: string }) {
  const { cenario, simular, visualizar } = useFiscal();
  const docs = documentosDoContexto(cenario).filter((d) => d.estado !== "Rejeitado");
  const totais = totaisDoContexto(cenario);
  const confrontos = cenario.confrontos.filter((c) => mesmoEscopo(c.contexto, cenario.contexto));
  const lancamentos = docs.map((d) => ({ documento: d, regra: cenario.regras.find((r) => r.cfop === d.cfop) }));
  if (aba === "depara") return <BlocoFiscal titulo="De-para contábil" descricao="Vincule o tratamento fiscal às contas e ao histórico de teste."><TabelaFiscal colunas={["CFOP", "Débito", "Crédito", "Histórico", "Ações"]} linhas={cenario.regras.map((r) => ({ id: r.id, celulas: [r.cfop, r.debito, r.credito, r.historico, <Button key="editar" variant="secondary" size="xs" onClick={() => visualizar(`De-para · ${r.cfop}`, <FormRegraFiscal regra={r} />)}>Editar vínculo</Button>] }))} /></BlocoFiscal>;
  if (aba === "confronto") return <BlocoFiscal titulo="Pagamentos × documentos" descricao="Monte um confronto fictício e teste a conciliação dos pagamentos sem nota." acao={<Button size="sm" onClick={() => simular({ tipo: "confrontar" })}>Simular confronto</Button>}><TabelaFiscal colunas={["Participante", "Documento de apoio", "Pagamento", "Situação", "Ações"]} linhas={confrontos.map((c) => { const d = cenario.documentos.find((d) => d.id === c.documentoId); return { id: c.id, celulas: [d?.participante ?? "Exemplo", `${d?.tipo ?? "Documento"} ${d?.numero ?? ""}`, reais(c.valor), <EstadoFiscal key="estado">{c.estado}</EstadoFiscal>, <Button key="conciliar" variant="secondary" size="xs" disabled={c.estado === "Conciliado"} onClick={() => simular({ tipo: "conciliar", id: c.id })}>Conciliar de teste</Button>] }; })} /></BlocoFiscal>;
  const relatorio = <TabelaFiscal colunas={["Documento", "Participante", "Débito / crédito", "Valor", "Situação"]} linhas={lancamentos.map(({ documento: d, regra }) => ({ id: d.id, celulas: [`${d.tipo} ${d.numero}`, d.participante, regra ? `${regra.debito} / ${regra.credito}` : "Fora do de-para", reais(d.valor), <EstadoFiscal key="estado">{d.estado !== "Classificado" ? "Decisão pendente" : regra ? "Pronto para conferência" : "Vínculo pendente"}</EstadoFiscal>] }))} />;
  if (aba === "lancamentos") return <BlocoFiscal titulo="Relatório de lançamentos" descricao="Prévia de entradas e saídas, com pendências de vínculo." acao={<Button size="sm" variant="secondary" onClick={() => visualizar("Prévia da exportação contábil", relatorio)}>Gerar prévia / exportar</Button>}>{relatorio}</BlocoFiscal>;
  return <div className="space-y-5"><MetricasFiscais itens={[["Faturamento", reais(totais.saidas)], ["Entradas", reais(totais.entradas)], ["PIS + COFINS · teste", reais(totais.pis + totais.cofins)], ["Pagamentos conciliados", confrontos.filter((c) => c.estado === "Conciliado").length]]} /><BlocoFiscal titulo="Prévia de fechamento financeiro" descricao="Conferência demonstrativa do faturamento, das entradas e dos documentos de apoio." acao={<Button size="sm" variant="secondary" onClick={() => visualizar("Prévia financeira para exportar", relatorio)}>Prévia do relatório</Button>}><TabelaFiscal colunas={["Conferência", "Resultado"]} linhas={[
    { id: "nfs", celulas: ["NFS-e recebidas", docs.filter((d) => d.tipo === "NFS-e").length] }, { id: "cte", celulas: ["Fretes CT-e", reais(docs.filter((d) => d.tipo === "CT-e").reduce((v, d) => v + d.valor, 0))] }, { id: "apoio", celulas: ["Contratos, recibos, RPA e faturas", reais(docs.filter((d) => ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo)).reduce((v, d) => v + d.valor, 0))] }, { id: "fora", celulas: ["Fora do de-para contábil", lancamentos.filter((l) => !l.regra).length] },
  ]} /><div className="mt-5"><AcoesFiscais><AtalhoFiscal modulo="fiscal_conferencia" aba="confronto">Confrontar pagamentos</AtalhoFiscal><AtalhoFiscal modulo="fiscal_contribuicoes" aba="fechamento">Revisar fechamento fiscal</AtalhoFiscal></AcoesFiscais></div></BlocoFiscal></div>;
}
