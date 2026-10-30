"use client";

import { Checkbox } from "@/components/ui/Checkbox";

import { Fragment, cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode, type Ref } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FileText, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao } from "@/components/shared/ListaResponsiva";
import { formatarNumero } from "@/lib/format";
import { useFiscal } from "./ContextoFiscal";
import { PAGINAS_FISCAIS, type DocumentoTeste } from "@/lib/fiscal/previa/cenario";

export const reais = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
export const dataFiscal = (valor: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(valor));

/**
 * A situação de cada item da prévia no `Selo` do Connect (15/10/2026): era
 * texto colorido solto. Os mesmos grupos de antes — erro e o que pede
 * revisão em âmbar (o erro de execução em vermelho), o concluído em verde, o
 * que está na fila em azul; cancelada e o resto em cinza.
 */
export function tomDoEstadoFiscal(estado: string): TomDoSelo {
  if (/^Erro/i.test(estado)) return "perigo";
  if (/Rejeitado|pendências|revisão/i.test(estado)) return "atencao";
  if (/Aprovado|Classificado|Entregue|Concluída|Conciliado|Fechado/i.test(estado)) return "sucesso";
  if (/Na fila|Executando/i.test(estado)) return "marca";
  return "neutro";
}
export function EstadoFiscal({ children }: { children: string }) {
  return <Selo tom={tomDoEstadoFiscal(children)}>{children}</Selo>;
}
export function BlocoFiscal({ titulo, descricao, acao, children }: { titulo: string; descricao?: string; acao?: ReactNode; children: ReactNode }) {
  return <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-card-title font-semibold text-fg">{titulo}</h2>{descricao && <p className="mt-1 text-helper text-fg-secondary">{descricao}</p>}</div>{acao}</div><div className="p-5">{children}</div></Card>;
}

export type MetricaFiscal = {
  rotulo: string;
  valor: number | string;
  icone: ReactNode;
  detalhe?: string;
  /** Atalho para o recorte que o número conta, quando ele existe. */
  href?: string;
  /** Classe de cor, como na `FaixaDeTotais` (`text-warning-fg`, `text-danger`). */
  tom?: string;
};
/**
 * Os números do topo na `FaixaDeTotais` (15/10/2026): eram cartões montados à
 * mão, sem ícone, sem o primeiro em azul cheio e sem atalho para o recorte.
 */
export function MetricasFiscais({ itens }: { itens: MetricaFiscal[] }) {
  return <FaixaDeTotais itens={itens.map((i) => ({ rotulo: i.rotulo, valor: typeof i.valor === "number" ? formatarNumero(i.valor, 0) : i.valor, icone: i.icone, detalhe: i.detalhe, href: i.href, tom: i.tom }))} />;
}

/**
 * A tabela da prévia na tabela padrão do Connect (`.c41-tabela`, 15/10/2026):
 * cabeçalho em caixa alta com fundo, casco com sombra e o fio azul na linha.
 * Era uma tabela própria, que só existia aqui. No celular, cada linha vira um
 * cartão: a primeira coluna no topo, as outras com o rótulo do cabeçalho — a
 * tabela rolava de lado.
 *
 * Texto à esquerda e números à direita (26/10/2026); tudo era centralizado.
 * A coluna é numérica quando todas as células preenchidas são números ou
 * valores (R$, %, `tabular-nums`).
 */
const NUMERICO = /^[-+]?(R\$\s?)?[-+]?[\d.,]+\s?%?$/;
function celulaNumerica(c: ReactNode): boolean {
  if (typeof c === "number") return true;
  if (typeof c === "string") return NUMERICO.test(c.trim());
  return isValidElement<{ className?: string }>(c) && /\btabular-nums\b/.test(c.props.className ?? "");
}
/** Quantas linhas a tabela desenha de cada vez; o resto vem pelo "Mostrar mais". */
const LOTE_DA_TABELA = 200;
export function TabelaFiscal({ colunas, linhas: todas, vazio = "Nenhum item neste filtro.", descricaoVazio = "Troque os filtros ou use as ações de teste para adicionar informações." }: { colunas: string[]; linhas: { id: string; celulas: ReactNode[] }[]; vazio?: string; descricaoVazio?: string }) {
  // De 200 em 200 (auditoria de UX, 30/10/2026): a conferência dos pagamentos
  // cortava em 200 linhas de uma fila de até 2000, e da 201ª em diante não
  // havia como ver nem decidir.
  const [quantas, setQuantas] = useState(LOTE_DA_TABELA);
  if (!todas.length) return <EmptyState icon={<FileText />} title={vazio} description={descricaoVazio} />;
  const linhas = todas.slice(0, quantas);
  const faltam = todas.length - linhas.length;
  const resto = colunas.slice(1);
  const numerica = colunas.map((_, i) => { const preenchidas = linhas.map((l) => l.celulas[i]).filter((c) => c !== null && c !== undefined && c !== "" && c !== "—"); return preenchidas.length > 0 && preenchidas.every(celulaNumerica); });
  return <>
    <CartoesNoCelular>
      {linhas.map((l) => <Cartao key={l.id}>
        <TopoDoCartao nome={l.celulas[0]} />
        {resto.length > 0 && <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-ui">
          {resto.map((c, i) => <Fragment key={`${c}-${i}`}><dt className="text-fg-muted">{c}</dt><dd className="min-w-0 break-words text-fg">{l.celulas[i + 1]}</dd></Fragment>)}
        </dl>}
      </Cartao>)}
    </CartoesNoCelular>
    <TabelaNoDesktop padrao>
      <table className="w-full">
        <thead><tr>{colunas.map((c, i) => <th key={`${c}-${i}`} scope="col" className={`px-3 align-middle ${numerica[i] ? "text-right" : "text-left"}`}>{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l) => <tr key={l.id} className="border-b border-border-soft">{l.celulas.map((c, i) => <td key={i} className={`px-3 align-middle text-fg ${numerica[i] ? "text-right tabular-nums" : "text-left"}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </TabelaNoDesktop>
    {faltam > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-helper text-fg-muted tabular-nums" aria-live="polite">Mostrando {formatarNumero(linhas.length, 0)} de {formatarNumero(todas.length, 0)} linhas.</p>
      <Button variant="secondary" size="sm" onClick={() => setQuantas((n) => n + LOTE_DA_TABELA)}>Mostrar mais {formatarNumero(Math.min(LOTE_DA_TABELA, faltam), 0)}</Button>
    </div>}
  </>;
}
/** O rótulo do campo é o do `CampoForm` (15/10/2026); era um <label> à mão. O `erro` vai para a mensagem do `CampoForm`, não para o rótulo (26/10/2026). */
export function CampoFiscal({ nome, children, className, erro }: { nome: string; children: ReactNode; className?: string; erro?: string }) {
  const id = useId();
  const campo = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children;
  return <CampoForm label={nome} htmlFor={id} className={className} error={erro}>{campo}</CampoForm>;
}
export function AcoesFiscais({ children }: { children: ReactNode }) { return <div className="flex flex-wrap items-center gap-2">{children}</div>; }
/** As etapas da extração (`step_types` do motor) em português; a tela mostrava `first_mile` e `last_mile` (26/10/2026). */
export const ETAPAS_DA_EXTRACAO = { first_mile: "Primeira etapa da extração", last_mile: "Última etapa da extração" } as const;
/** `filtros` vai junto na URL — o recorte da lista de destino (`grupo`, `estado`). */
export function AtalhoFiscal({ modulo, aba, filtros, children, discreto = false }: { modulo: string; aba?: string; filtros?: Record<string, string>; children: ReactNode; discreto?: boolean }) {
  const { modulos } = useFiscal();
  const pagina = PAGINAS_FISCAIS.find((p) => p.modulo === modulo);
  if (!pagina || !modulos.includes(modulo)) return null;
  const query = new URLSearchParams({ ...(aba ? { aba } : {}), ...filtros }).toString();
  return <Button href={`${pagina.caminho}${query ? `?${query}` : ""}`} variant={discreto ? "link" : "secondary"} size="sm" className={discreto ? "text-ui" : undefined}>{children}<ArrowRight size={13} /></Button>;
}
export function PreviaTexto({ texto, ref }: { texto: string; ref?: Ref<HTMLPreElement> }) { return <pre ref={ref} className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-4 text-helper text-fg">{texto}</pre>; }
export function DetalheDocumento({ documento: d }: { documento: DocumentoTeste }) {
  return <div className="space-y-4"><div className="flex flex-wrap gap-2"><Badge variant="info">{d.tipo}</Badge><EstadoFiscal>{d.estado}</EstadoFiscal></div><dl className="grid gap-4 sm:grid-cols-2">{[["Participante", d.participante], ["Descrição", d.descricao], ["Valor", reais(d.valor)], ["Competência", d.competencia], ["CFOP / NCM", `${d.cfop || "—"} / ${d.ncm || "—"}`], ["CST", d.cst], ["Destinação", d.destino], ["Crédito de teste", d.credito ? "Permitido" : "Não aproveitado"]].map(([label, value]) => <div key={label}><dt className="text-helper text-fg-secondary">{label}</dt><dd className="mt-1 text-ui text-fg">{value}</dd></div>)}</dl>{d.motivo && <p className="text-ui text-warning-fg">{d.motivo}</p>}<PreviaTexto texto={d.xml ? `<documento-de-exemplo numero="${d.numero}" tipo="${d.tipo}">\n  <descricao>${d.descricao}</descricao>\n  <valor>${d.valor.toFixed(2)}</valor>\n</documento-de-exemplo>\n\nConteúdo demonstrativo para inspeção visual.` : "Documento de apoio de exemplo. Prévia da primeira página: contrato ou recibo, participante e valor demonstrativos."} /></div>;
}

const POR_PAGINA = 12;
const SITUACOES = ["Pendente", "Classificado", "Rejeitado"];

/**
 * A lista de documentos no casco das listas do Connect (15/10/2026): contagem
 * à esquerda; busca, "Filtros" e as ações da lista à direita; a paginação do
 * app embaixo. A situação e o tipo eram duas listas numa fileira acima da
 * tabela, e a contagem com um "Anterior / Próxima" feito à mão, embaixo.
 *
 * Os filtros e a página moram na URL (`situacao`, `tipo`, `pagina` e os de
 * `filtrosExtras`), como nas outras telas; a busca filtra enquanto se digita.
 */
export function ListaDocumentos({ documentos, selecionavel = false, selecionados = [], onSelecionar, acao, acoes, filtrosExtras = [] }: { documentos: DocumentoTeste[]; selecionavel?: boolean; selecionados?: string[]; onSelecionar?: (ids: string[]) => void; acao?: (d: DocumentoTeste) => ReactNode; acoes?: ReactNode; filtrosExtras?: CampoDeFiltro[] }) {
  const { visualizar } = useFiscal();
  const id = useId();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState("");
  const situacao = params.get("situacao") ?? "";
  const tipo = params.get("tipo") ?? "";
  const termo = busca.toLocaleLowerCase("pt-BR");
  const filtrados = documentos.filter((d) => (!situacao || d.estado === situacao) && (!tipo || d.tipo === tipo) && `${d.numero} ${d.participante} ${d.descricao} ${d.ncm} ${d.cfop}`.toLocaleLowerCase("pt-BR").includes(termo));
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const atual = Math.min(Math.max(1, Number(params.get("pagina")) || 1), paginas);
  const visiveis = filtrados.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);
  const marcaveis = visiveis.filter((d) => d.estado !== "Rejeitado").map((d) => d.id);
  const todos = marcaveis.length > 0 && marcaveis.every((id) => selecionados.includes(id));
  const acoesDaLinha = visiveis.map((d) => acao?.(d));
  const temAcoes = acoesDaLinha.some(Boolean);
  const hrefDaPagina = (n: number) => {
    const q = new URLSearchParams(params.toString());
    if (n > 1) q.set("pagina", String(n)); else q.delete("pagina");
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const campos: CampoDeFiltro[] = [
    ...filtrosExtras,
    { chave: "situacao", rotulo: "Situação", vazioLabel: "Todas", opcoes: SITUACOES.map((v) => ({ value: v, label: v })) },
    { chave: "tipo", rotulo: "Tipo", vazioLabel: "Todos", opcoes: Array.from(new Set(documentos.map((d) => d.tipo))).map((v) => ({ value: v, label: v })) },
  ];
  return <>
    <CascoDaTabela
      contagem={contarItens(filtrados.length, "documento", "documentos")}
      busca={<CampoDeBusca compact aria-label="Buscar documentos" placeholder="Número, participante, produto, NCM ou CFOP" className="w-80 max-w-full" value={busca} onChange={(e) => {
        setBusca(e.target.value);
        // Busca nova começa na primeira página, como fazia o "Anterior / Próxima".
        if (params.get("pagina")) window.history.replaceState(null, "", hrefDaPagina(1));
      }} />}
      filtros={<FiltrosDaTela naBarra campos={campos} />}
      acoes={acoes}
    >
      {selecionavel && <div className="c41-faixa-colunas mb-2 flex flex-wrap items-center gap-3 text-ui text-fg-secondary">
        <Checkbox id={`${id}-pagina`} label="Selecionar esta página" checked={todos} disabled={!marcaveis.length} onChange={() => onSelecionar?.(todos ? selecionados.filter((id) => !marcaveis.includes(id)) : Array.from(new Set([...selecionados, ...marcaveis])))} />
        <span className="tabular-nums">{selecionados.length} selecionado(s)</span>
        {/* Botão, e não texto com cara de link (15/10/2026). */}
        {selecionados.length > 0 && <Button variant="ghost" size="xs" onClick={() => onSelecionar?.([])}>Desmarcar</Button>}
      </div>}
      <TabelaFiscal colunas={[...(selecionavel ? ["Selecionar"] : []), "Documento", "Participante / descrição", "CFOP / NCM", "Valor", "Situação", ...(temAcoes ? ["Ação"] : [])]} linhas={visiveis.map((d, i) => ({ id: d.id, celulas: [
        ...(selecionavel ? [<Checkbox key="check" aria-label={`Selecionar ${d.tipo} ${d.numero}`} disabled={d.estado === "Rejeitado"} checked={selecionados.includes(d.id)} onChange={() => onSelecionar?.(selecionados.includes(d.id) ? selecionados.filter((id) => id !== d.id) : [...selecionados, d.id])} />] : []),
        <span key="tipo" className="whitespace-nowrap"><Button variant="link" className="text-ui" aria-label={`Ver detalhes de ${d.tipo} ${d.numero}`} onClick={() => visualizar(`${d.tipo} ${d.numero}`, <DetalheDocumento documento={d} />)}>{d.tipo} · {d.numero}</Button><span className="mt-1 block text-helper text-fg-muted">{d.sentido} · {d.estabelecimentoId}</span></span>,
        <span key="descricao" className="block min-w-40">{d.participante}<span className="mt-1 block text-helper text-fg-secondary">{d.descricao}</span></span>,
        <span key="cfop" className="text-helper">{d.cfop || "—"}<span className="block text-fg-muted">{d.ncm || "—"}</span></span>,
        <span key="valor" className="whitespace-nowrap tabular-nums">{reais(d.valor)}</span>, <EstadoFiscal key="estado">{d.estado}</EstadoFiscal>,
        ...(temAcoes ? [acoesDaLinha[i] ?? "—"] : []),
      ] }))} />
    </CascoDaTabela>
    <Pagination page={atual} totalPages={paginas} buildHref={hrefDaPagina} total={filtrados.length} rotulo="documentos" />
  </>;
}
