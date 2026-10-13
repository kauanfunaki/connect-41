"use client";

import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";

import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { Search, FileText, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useFiscal, classeSelectFiscal } from "./ContextoFiscal";
import { PAGINAS_FISCAIS, type DocumentoTeste } from "@/lib/fiscal/previa/cenario";

export const reais = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
export const dataFiscal = (valor: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(valor));
export function EstadoFiscal({ children }: { children: string }) {
  const tom = /Erro|Rejeitado|pendências|revisão/i.test(children) ? "text-warning-fg" : /Aprovado|Classificado|Entregue|Concluída|Conciliado|Fechado/i.test(children) ? "text-success-fg" : "text-fg-secondary";
  return <span className={`inline-flex items-center justify-center text-helper font-medium ${tom}`}>{children}</span>;
}
export function BlocoFiscal({ titulo, descricao, acao, children }: { titulo: string; descricao?: string; acao?: ReactNode; children: ReactNode }) {
  return <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-card-title font-semibold text-fg">{titulo}</h2>{descricao && <p className="mt-1 text-helper text-fg-secondary">{descricao}</p>}</div>{acao}</div><div className="p-5">{children}</div></Card>;
}
export function MetricasFiscais({ itens }: { itens: [string, ReactNode, string?][] }) {
  return <div className={`mb-5 grid gap-3 sm:grid-cols-2 ${itens.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>{itens.map(([nome, valor, detalhe]) => <Card key={nome} className="p-4"><p className="text-helper text-fg-secondary">{nome}</p><p className="mt-2 text-title font-semibold text-fg">{valor}</p>{detalhe && <p className="mt-1 text-helper text-fg-muted">{detalhe}</p>}</Card>)}</div>;
}
export function TabelaFiscal({ colunas, linhas, vazio = "Nenhum item neste filtro." }: { colunas: string[]; linhas: { id: string; celulas: ReactNode[] }[]; vazio?: string }) {
  if (!linhas.length) return <EmptyState icon={<FileText />} title={vazio} description="Troque os filtros ou use as ações de teste para adicionar informações." />;
  return <div className="overflow-x-auto"><table className="w-full text-center text-ui"><thead><tr className="border-b border-border text-helper text-fg-secondary">{colunas.map((c, i) => <th key={`${c}-${i}`} scope="col" className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-medium">{c}</th>)}</tr></thead><tbody>{linhas.map((l) => <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-hover">{l.celulas.map((c, i) => <td key={i} className="px-3 py-3 text-center align-middle text-fg"><div className="flex items-center justify-center">{c}</div></td>)}</tr>)}</tbody></table></div>;
}
export function CampoFiscal({ nome, children }: { nome: string; children: ReactNode }) {
  const id = useId();
  const campo = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;
  return <div className="text-helper text-fg-secondary"><label htmlFor={id} className="mb-1.5 block">{nome}</label>{campo}</div>;
}
export function AcoesFiscais({ children }: { children: ReactNode }) { return <div className="flex flex-wrap items-center gap-2">{children}</div>; }
export function AtalhoFiscal({ modulo, aba, children, discreto = false }: { modulo: string; aba?: string; children: ReactNode; discreto?: boolean }) {
  const { modulos } = useFiscal();
  const pagina = PAGINAS_FISCAIS.find((p) => p.modulo === modulo);
  if (!pagina || !modulos.includes(modulo)) return null;
  return <Button href={`${pagina.caminho}${aba ? `?aba=${aba}` : ""}`} variant={discreto ? "link" : "secondary"} size="sm" className={discreto ? "text-ui" : undefined}>{children}<ArrowRight size={13} /></Button>;
}
export function PreviaTexto({ texto }: { texto: string }) { return <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-4 text-helper text-fg">{texto}</pre>; }
export function DetalheDocumento({ documento: d }: { documento: DocumentoTeste }) {
  return <div className="space-y-4"><div className="flex flex-wrap gap-2"><Badge variant="info">{d.tipo}</Badge><EstadoFiscal>{d.estado}</EstadoFiscal></div><dl className="grid gap-4 sm:grid-cols-2">{[["Participante", d.participante], ["Descrição", d.descricao], ["Valor", reais(d.valor)], ["Competência", d.competencia], ["CFOP / NCM", `${d.cfop || "—"} / ${d.ncm || "—"}`], ["CST", d.cst], ["Destinação", d.destino], ["Crédito de teste", d.credito ? "Permitido" : "Não aproveitado"]].map(([label, value]) => <div key={label}><dt className="text-helper text-fg-secondary">{label}</dt><dd className="mt-1 text-ui text-fg">{value}</dd></div>)}</dl>{d.motivo && <p className="text-ui text-warning-fg">{d.motivo}</p>}<PreviaTexto texto={d.xml ? `<documento-de-exemplo numero="${d.numero}" tipo="${d.tipo}">\n  <descricao>${d.descricao}</descricao>\n  <valor>${d.valor.toFixed(2)}</valor>\n</documento-de-exemplo>\n\nConteúdo demonstrativo para inspeção visual.` : "Documento de apoio de exemplo. Prévia da primeira página: contrato ou recibo, participante e valor demonstrativos."} /></div>;
}
export function ListaDocumentos({ documentos, selecionavel = false, selecionados = [], onSelecionar, acao }: { documentos: DocumentoTeste[]; selecionavel?: boolean; selecionados?: string[]; onSelecionar?: (ids: string[]) => void; acao?: (d: DocumentoTeste) => ReactNode }) {
  const { visualizar } = useFiscal();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("");
  const [tipo, setTipo] = useState("");
  const [pagina, setPagina] = useState(1);
  const filtrados = documentos.filter((d) => (!situacao || d.estado === situacao) && (!tipo || d.tipo === tipo) && `${d.numero} ${d.participante} ${d.descricao} ${d.ncm} ${d.cfop}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  const paginas = Math.max(1, Math.ceil(filtrados.length / 12));
  const atual = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((atual - 1) * 12, atual * 12);
  const marcaveis = visiveis.filter((d) => d.estado !== "Rejeitado").map((d) => d.id);
  const todos = marcaveis.length > 0 && marcaveis.every((id) => selecionados.includes(id));
  const acoes = visiveis.map((d) => acao?.(d));
  const temAcoes = acoes.some(Boolean);
  return <div>
    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_160px]">
      <Input aria-label="Buscar documentos" compact icon={<Search />} placeholder="Número, participante, produto, NCM ou CFOP" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} />
      <Select aria-label="Filtrar situação" value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(1); }} className={classeSelectFiscal}><option value="">Todas as situações</option>{["Pendente", "Classificado", "Rejeitado"].map((v) => <option key={v}>{v}</option>)}</Select>
      <Select aria-label="Filtrar tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} className={classeSelectFiscal}><option value="">Todos os tipos</option>{Array.from(new Set(documentos.map((d) => d.tipo))).map((v) => <option key={v}>{v}</option>)}</Select>
    </div>
    {selecionavel && <div className="mb-3 flex flex-wrap items-center gap-3 text-helper text-fg-secondary"><label className="flex cursor-pointer items-center gap-2"><Checkbox checked={todos} disabled={!marcaveis.length} onChange={() => onSelecionar?.(todos ? selecionados.filter((id) => !marcaveis.includes(id)) : Array.from(new Set([...selecionados, ...marcaveis])))} />Selecionar esta página</label><span>{selecionados.length} selecionado(s)</span>{selecionados.length > 0 && <Button variant="link" className="text-helper" onClick={() => onSelecionar?.([])}>Desmarcar</Button>}</div>}
    <TabelaFiscal colunas={[...(selecionavel ? ["Selecionar"] : []), "Documento", "Participante / descrição", "CFOP / NCM", "Valor", "Situação", ...(temAcoes ? ["Ação"] : [])]} linhas={visiveis.map((d, i) => ({ id: d.id, celulas: [
      ...(selecionavel ? [<Checkbox key="check" aria-label={`Selecionar ${d.tipo} ${d.numero}`} disabled={d.estado === "Rejeitado"} checked={selecionados.includes(d.id)} onChange={() => onSelecionar?.(selecionados.includes(d.id) ? selecionados.filter((id) => id !== d.id) : [...selecionados, d.id])} />] : []),
      <span key="tipo" className="whitespace-nowrap"><Button variant="link" className="text-ui" aria-label={`Ver detalhes de ${d.tipo} ${d.numero}`} onClick={() => visualizar(`${d.tipo} ${d.numero}`, <DetalheDocumento documento={d} />)}>{d.tipo} · {d.numero}</Button><span className="mt-1 block text-helper text-fg-muted">{d.sentido} · {d.estabelecimentoId}</span></span>,
      <span key="descricao" className="block min-w-40">{d.participante}<span className="mt-1 block text-helper text-fg-secondary">{d.descricao}</span></span>,
      <span key="cfop" className="text-helper">{d.cfop || "—"}<span className="block text-fg-muted">{d.ncm || "—"}</span></span>,
      <span key="valor" className="whitespace-nowrap tabular-nums">{reais(d.valor)}</span>, <EstadoFiscal key="estado">{d.estado}</EstadoFiscal>,
      ...(temAcoes ? [acoes[i] ?? "—"] : []),
    ] }))} />
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-helper text-fg-secondary"><span>{filtrados.length} documento(s) · página {atual} de {paginas}</span><AcoesFiscais><Button variant="secondary" size="xs" disabled={atual <= 1} onClick={() => setPagina(atual - 1)}>Anterior</Button><Button variant="secondary" size="xs" disabled={atual >= paginas} onClick={() => setPagina(atual + 1)}>Próxima</Button></AcoesFiscais></div>
  </div>;
}
