"use client";

import { Handshake, Landmark, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useFiscal } from "./ContextoFiscal";
import { AcoesFiscais, AtalhoFiscal, BlocoFiscal, EstadoFiscal, MetricasFiscais, TabelaFiscal, reais } from "./Compartilhados";
import { documentosDoContexto, mesmoEscopo, totaisDoContexto } from "@/lib/fiscal/previa/cenario";
import { FormParametrosFiscal } from "./Apuracoes";

export function ConfiguracoesFiscal({ aba }: { aba: string }) {
  const { cenario } = useFiscal();
  if (aba === "parametros") return <FormParametrosFiscal />;
  return <BlocoFiscal titulo="Regras fiscais" descricao="Consulte o tratamento por CFOP e sua fonte. As regras são definidas no código de processamento do SPED e não podem ser editadas aqui. Os dados abaixo são demonstrativos e não representam orientação tributária."><TabelaFiscal colunas={["CFOP", "Tratamento", "Fonte / procedência"]} linhas={cenario.regras.map((r) => ({ id: r.id, celulas: [r.cfop, r.destino, r.fonte] }))} /></BlocoFiscal>;
}

export function ConferenciaFiscal({ aba }: { aba: string }) {
  const { cenario, simular, visualizar } = useFiscal();
  const docs = documentosDoContexto(cenario).filter((d) => d.estado !== "Rejeitado");
  const totais = totaisDoContexto(cenario);
  const confrontos = cenario.confrontos.filter((c) => mesmoEscopo(c.contexto, cenario.contexto));
  if (aba === "confronto") return <BlocoFiscal titulo="Pagamentos × documentos" descricao="Monte um confronto fictício e teste a conciliação dos pagamentos sem nota." acao={<Button size="sm" onClick={() => simular({ tipo: "confrontar" })}>Simular confronto</Button>}><TabelaFiscal colunas={["Participante", "Documento de apoio", "Pagamento", "Situação", "Ações"]} linhas={confrontos.map((c) => { const d = cenario.documentos.find((d) => d.id === c.documentoId); return { id: c.id, celulas: [d?.participante ?? "Exemplo", `${d?.tipo ?? "Documento"} ${d?.numero ?? ""}`, reais(c.valor), <EstadoFiscal key="estado">{c.estado}</EstadoFiscal>, <Button key="conciliar" variant="secondary" size="xs" disabled={c.estado === "Conciliado"} onClick={() => simular({ tipo: "conciliar", id: c.id })}>Conciliar de teste</Button>] }; })} /></BlocoFiscal>;
  const relatorio = <TabelaFiscal colunas={["Documento", "Participante", "Valor", "Situação"]} linhas={docs.map((d) => ({ id: d.id, celulas: [`${d.tipo} ${d.numero}`, d.participante, reais(d.valor), <EstadoFiscal key="estado">{d.estado !== "Classificado" ? "Decisão pendente" : "Pronto para conferência"}</EstadoFiscal>] }))} />;
  return <div className="space-y-5"><MetricasFiscais itens={[
    { rotulo: "Faturamento", valor: reais(totais.saidas), icone: <TrendingUp /> },
    { rotulo: "Entradas", valor: reais(totais.entradas), icone: <TrendingDown /> },
    { rotulo: "PIS + COFINS · teste", valor: reais(totais.pis + totais.cofins), icone: <Landmark /> },
    { rotulo: "Pagamentos conciliados", valor: confrontos.filter((c) => c.estado === "Conciliado").length, icone: <Handshake />, href: "/fiscal/conferencia?aba=confronto" },
  ]} /><BlocoFiscal titulo="Prévia de fechamento financeiro" descricao="Conferência demonstrativa do faturamento, das entradas e dos documentos de apoio." acao={<Button size="sm" variant="secondary" onClick={() => visualizar("Prévia financeira para exportar", relatorio)}>Prévia do relatório</Button>}><TabelaFiscal colunas={["Conferência", "Resultado"]} linhas={[
    { id: "nfs", celulas: ["NFS-e recebidas", docs.filter((d) => d.tipo === "NFS-e").length] }, { id: "cte", celulas: ["Fretes CT-e", reais(docs.filter((d) => d.tipo === "CT-e").reduce((v, d) => v + d.valor, 0))] }, { id: "apoio", celulas: ["Contratos, recibos, RPA e faturas", reais(docs.filter((d) => ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo)).reduce((v, d) => v + d.valor, 0))] },
  ]} /><div className="mt-5"><AcoesFiscais><AtalhoFiscal modulo="fiscal_conferencia" aba="confronto">Confrontar pagamentos</AtalhoFiscal><AtalhoFiscal modulo="fiscal_contribuicoes" aba="fechamento">Revisar fechamento fiscal</AtalhoFiscal></AcoesFiscais></div></BlocoFiscal></div>;
}
