"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ListFilter } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Input } from "@/components/ui/Input";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { SlideOver } from "@/components/ui/SlideOver";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { DEFINICAO_SUGERIDA, DEFINICOES_DE_CFOP, DESTINACOES_OFERECIDAS, TIPO_ITEM, type GrupoPorCfop } from "@/lib/fiscal/sped/arquivoIcms";
import { cnpjFormatado, contagem, decimalDeCentavos, reaisDeCentavos, normalizarBusca } from "@/lib/fiscal/sped/formato";
import { normalizarDecimal } from "@/lib/fiscal/motor/decisoes";
import type { PermissaoDeEscrita } from "@/lib/fiscal/motor/escrita";
import type { ProdutoNaTela } from "@/lib/fiscal/sped/dados";
import { apagarDecisaoNoMotor, gravarDecisaoNoMotor } from "@/app/(app)/fiscal/decisoes-actions";

type Filtro = "todos" | "decidir" | "decididos" | "simples";

/** A destinação em vigor: a decidida, senão a que o arquivo trouxe (palpite do de-para por CFOP). */
const destinacaoDe = (p: ProdutoNaTela) => p.decisao?.tipoItem ?? p.tipoItem;
const decidido = (p: ProdutoNaTela) => !!p.decisao?.tipoItem;
const rotuloDoTipo = (t: string) => (t ? `${t} · ${TIPO_ITEM[t] ?? "Desconhecida"}` : "Sem destinação");
const PASSO = 100;

/**
 * A Classificação do SPED (29/10/2026), processada no Connect a partir do
 * arquivo gerado: os produtos de entrada da competência, com a destinação em
 * vigor e o ICMS em jogo. A decisão grava no motor (`classificacao_item`, que
 * vale para sempre, e `credito_icms_item`, desta competência), que é de onde o
 * gerador lê na próxima geração.
 *
 * O painel do SPED Generator tinha três blocos na mesma página (regra por
 * CFOP, lista de produtos, documentos sem nota). Aqui a lista é o centro: os
 * filtros rápidos dizem quanto falta decidir, a regra por CFOP vira um filtro
 * que se abre, e editar acontece no painel lateral, sem formulário por linha.
 */
export function PainelDeClassificacao({ raiz, cnpjEmpresa, competencia, produtos, porCfop, permissao }: {
  raiz: string;
  cnpjEmpresa: string;
  competencia: string;
  produtos: ProdutoNaTela[];
  porCfop: GrupoPorCfop[];
  permissao: PermissaoDeEscrita;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [cfop, setCfop] = useState("");
  const [verRegra, setVerRegra] = useState(false);
  const [limite, setLimite] = useState(PASSO);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);

  const contagens = useMemo(() => ({
    todos: produtos.length,
    decidir: produtos.filter((p) => !decidido(p)).length,
    decididos: produtos.filter(decidido).length,
    simples: produtos.filter((p) => p.simples).length,
  }), [produtos]);

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca);
    return produtos.filter((p) => {
      if (filtro === "decidir" && decidido(p)) return false;
      if (filtro === "decididos" && !decidido(p)) return false;
      if (filtro === "simples" && !p.simples) return false;
      if (cfop && !p.cfops.includes(cfop)) return false;
      if (!termo) return true;
      return normalizarBusca(`${p.descricao} ${p.codProd} ${p.ncm} ${p.cnpjFornecedor} ${p.cfops.join(" ")}`).includes(termo);
    });
  }, [produtos, filtro, busca, cfop]);

  const icmsVisivel = visiveis.reduce((s, p) => s + p.icms, 0);
  const produtoAberto = aberto ? produtos.find((p) => p.codItem === aberto) ?? null : null;
  const alternar = (codItem: string) => setSelecionados((s) => {
    const n = new Set(s);
    if (n.has(codItem)) n.delete(codItem); else n.add(codItem);
    return n;
  });
  const mostrados = visiveis.slice(0, limite);
  const todosMarcados = mostrados.length > 0 && mostrados.every((p) => selecionados.has(p.codItem));
  const reiniciar = () => { setLimite(PASSO); setSelecionados(new Set()); };

  return <div className="space-y-4">
    {permissao.motivo && <Aviso tom="neutro">{permissao.motivo}</Aviso>}

    <div className="flex flex-wrap items-center gap-3">
      <div className="max-w-full overflow-x-auto"><SegmentedControl<Filtro>
        className="w-max"
        label="Quais produtos"
        active={filtro}
        onChange={(f) => { setFiltro(f); reiniciar(); }}
        items={[
          { key: "todos", label: "Todos", contagem: contagens.todos },
          { key: "decidir", label: "A decidir", contagem: contagens.decidir, title: "Sem decisão gravada: vale a destinação que o de-para deu pelo CFOP." },
          { key: "decididos", label: "Decididos", contagem: contagens.decididos },
          { key: "simples", label: "Simples Nacional", contagem: contagens.simples, title: "CST do Simples (CSOSN): o crédito não é automático." },
        ]}
      /></div>
      <CampoDeBusca compact className="w-72 max-w-full" placeholder="Buscar produto, código, NCM ou CNPJ…" aria-label="Buscar produto" value={busca} onChange={(e) => { setBusca(e.target.value); reiniciar(); }} />
      <Button size="sm" variant={verRegra || cfop ? "secondary" : "ghost"} onClick={() => setVerRegra((v) => !v)} aria-expanded={verRegra}>
        <ListFilter size={14} aria-hidden /> {cfop ? `CFOP ${cfop}` : "Por CFOP"}
      </Button>
      {cfop && <Button size="sm" variant="link" onClick={() => { setCfop(""); reiniciar(); }}>Tirar o filtro de CFOP</Button>}
    </div>

    {verRegra && <RegraPorCfop grupos={porCfop} ativo={cfop} escolher={(c) => { setCfop(c === cfop ? "" : c); setVerRegra(false); reiniciar(); }} />}

    <p className="text-helper text-fg-secondary">
      {contagem(visiveis.length)} produto(s) · {reaisDeCentavos(icmsVisivel)} de ICMS · do maior valor para o menor. Clique num produto para decidir.
    </p>

    <div className="c41-tabela overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full">
        <thead>
          <tr>
            {permissao.visivel && <th className="w-10 px-3"><Checkbox aria-label="Marcar os produtos mostrados" checked={todosMarcados} disabled={!permissao.pode} onChange={() => setSelecionados((s) => {
              const n = new Set(s);
              for (const p of mostrados) if (todosMarcados) n.delete(p.codItem); else n.add(p.codItem);
              return n;
            })} /></th>}
            <th className="c41-a-esquerda px-3">Produto</th>
            <th className="hidden px-3 md:table-cell">CFOP</th>
            <th className="hidden px-3 sm:table-cell">Destinação</th>
            <th className="hidden px-3 md:table-cell">Valor</th>
            <th className="px-3">ICMS</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {mostrados.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-fg-muted">Nenhum produto neste filtro.</td></tr>}
          {mostrados.map((p) => <tr key={p.codItem} onClick={() => setAberto(p.codItem)} className="cursor-pointer border-b border-border-soft hover:bg-surface-hover">
            {permissao.visivel && <td className="px-3" onClick={(e) => e.stopPropagation()}>
              <Checkbox aria-label={`Marcar ${p.descricao || p.codProd}`} checked={selecionados.has(p.codItem)} disabled={!permissao.pode} onChange={() => alternar(p.codItem)} />
            </td>}
            <td className="c41-a-esquerda max-w-[13rem] px-3 sm:max-w-md">
              <span className="block truncate font-medium text-fg" title={p.descricao}>{p.descricao || p.codProd}</span>
              <span className="block truncate text-helper text-fg-muted">{cnpjFormatado(p.cnpjFornecedor)} · cód. {p.codProd}{p.ncm ? ` · NCM ${p.ncm}` : ""}{p.ocorrencias > 1 ? ` · ${contagem(p.ocorrencias)} notas` : ""}</span>
              {/* No celular a destinação vem embaixo do nome: a coluna dela some. */}
              <span className="mt-1 block sm:hidden"><Destinacao p={p} /></span>
            </td>
            <td className="hidden px-3 tabular-nums text-fg-secondary md:table-cell">{p.cfops.join(", ")}</td>
            <td className="hidden px-3 sm:table-cell"><Destinacao p={p} /></td>
            <td className="hidden px-3 tabular-nums md:table-cell">{reaisDeCentavos(p.valor)}</td>
            <td className="px-3 tabular-nums">
              {p.creditoIcms !== null && p.creditoIcms !== p.icms
                ? <span title={`No arquivo: ${reaisDeCentavos(p.icms)}`}>{reaisDeCentavos(p.creditoIcms)}<span className="block text-helper text-fg-muted">decidido</span></span>
                : reaisDeCentavos(p.icms)}
            </td>
            <td className="pr-3 text-fg-muted"><ChevronRight size={16} aria-hidden /></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {visiveis.length > limite && <div className="flex justify-center"><Button variant="secondary" size="sm" onClick={() => setLimite((l) => l + PASSO)}>Mostrar mais {contagem(Math.min(PASSO, visiveis.length - limite))} de {contagem(visiveis.length - limite)}</Button></div>}

    <EmLote raiz={raiz} produtos={produtos.filter((p) => selecionados.has(p.codItem))} limpar={() => setSelecionados(new Set())} />
    <EditarProduto key={aberto ?? ""} produto={produtoAberto} fechar={() => setAberto(null)} raiz={raiz} cnpjEmpresa={cnpjEmpresa} competencia={competencia} permissao={permissao} />
  </div>;
}

function Destinacao({ p }: { p: ProdutoNaTela }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5">
    <span className={decidido(p) ? "text-fg" : "text-fg-secondary"}>{rotuloDoTipo(destinacaoDe(p))}</span>
    {decidido(p) ? <Selo tom="sucesso">Decidida</Selo> : <Selo tom="neutro">Pelo CFOP</Selo>}
    {p.simples && <Selo tom="atencao">Simples</Selo>}
  </span>;
}

/** A regra em vigor por CFOP: poucas linhas, cada uma valendo muitos itens. O clique filtra a lista. */
function RegraPorCfop({ grupos, ativo, escolher }: { grupos: GrupoPorCfop[]; ativo: string; escolher: (cfop: string) => void }) {
  return <div className="rounded-lg border border-border bg-surface-2 p-3">
    <p className="mb-2 px-1 text-helper text-fg-secondary">A destinação que o de-para deu a cada CFOP neste arquivo, do maior ICMS para o menor. Escolha um CFOP para ver só os produtos dele.</p>
    <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {grupos.map((g) => <button key={`${g.cfop}-${g.tipoItem}`} type="button" onClick={() => escolher(g.cfop)} aria-pressed={ativo === g.cfop}
        className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${ativo === g.cfop ? "border-brand bg-brand-subtle" : "border-border bg-surface hover:bg-surface-hover"}`}>
        <span className="min-w-0">
          <span className="block font-semibold tabular-nums text-fg">{g.cfop}</span>
          <span className="block truncate text-helper text-fg-secondary">{rotuloDoTipo(g.tipoItem)} · {contagem(g.itens)} produto(s)</span>
        </span>
        <span className="text-right tabular-nums">
          <span className="block text-ui text-fg">{reaisDeCentavos(g.icms)}</span>
          <span className="block text-helper text-fg-muted">ICMS</span>
        </span>
      </button>)}
    </div>
  </div>;
}

function chaveDoProduto(p: ProdutoNaTela) {
  return { cnpj_emit: p.cnpjFornecedor, cod_prod: p.codProd };
}

/** A mesma destinação para vários produtos. A definição de CFOP segue a sugestão da destinação. */
function EmLote({ raiz, produtos, limpar }: { raiz: string; produtos: ProdutoNaTela[]; limpar: () => void }) {
  const [tipo, setTipo] = useState<string>("");
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const aplicar = () => iniciar(async () => {
    const definicao = DEFINICAO_SUGERIDA[tipo];
    const r = await gravarDecisaoNoMotor({ raiz, tipo: "classificacao_item", chaves: produtos.map(chaveDoProduto), valor: { tipo_item: tipo, ...(definicao ? { definicao } : {}) } });
    if (!r.ok) { toast.error(r.mensagem); return; }
    toast.success(r.mensagem);
    limpar();
    setTipo("");
    router.refresh();
  });
  return <BulkActionBar count={produtos.length} onClear={limpar}>
    <Select compact aria-label="Destinação para os marcados" className="w-56" value={tipo} onChange={(e) => setTipo(e.target.value)}>
      <option value="">Escolha a destinação…</option>
      {DESTINACOES_OFERECIDAS.map((t) => <option key={t} value={t}>{rotuloDoTipo(t)}</option>)}
    </Select>
    <Button size="sm" disabled={!tipo || pendente} onClick={aplicar}>{pendente ? "Gravando…" : "Aplicar"}</Button>
  </BulkActionBar>;
}

/** O produto aberto no painel lateral: destinação, definição do CFOP, PIS/COFINS e o crédito de ICMS do mês. */
function EditarProduto({ produto, fechar, raiz, cnpjEmpresa, competencia, permissao }: {
  produto: ProdutoNaTela | null;
  fechar: () => void;
  raiz: string;
  cnpjEmpresa: string;
  competencia: string;
  permissao: PermissaoDeEscrita;
}) {
  const [tipo, setTipo] = useState(produto ? destinacaoDe(produto) : "");
  const [definicao, setDefinicao] = useState(produto?.decisao?.definicao ?? "");
  const [pisCofins, setPisCofins] = useState<"" | "S" | "N">(produto?.decisao?.creditoPisCofins ?? "");
  const [credito, setCredito] = useState(produto?.creditoIcms !== null && produto?.creditoIcms !== undefined ? decimalDeCentavos(produto.creditoIcms) : "");
  const [observacao, setObservacao] = useState(produto?.decisao?.observacao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!produto) return <SlideOver open={false} onClose={fechar}><span /></SlideOver>;

  const trocarTipo = (t: string) => {
    setTipo(t);
    // A sugestão só preenche o que ainda está vazio: o fiscal confirma.
    if (!definicao && DEFINICAO_SUGERIDA[t]) setDefinicao(DEFINICAO_SUGERIDA[t]);
  };

  const gravar = () => iniciar(async () => {
    setErro(null);
    const valorCredito = credito.trim() ? normalizarDecimal(credito) : null;
    if (credito.trim() && valorCredito === null) { setErro("Crédito de ICMS: use números, como 1.234,56."); return; }
    // No motor, campo ausente é "não mexer"; a definição vazia ele recusa (422),
    // então ela só vai quando há uma escolhida.
    const r = await gravarDecisaoNoMotor({
      raiz, tipo: "classificacao_item", chave: chaveDoProduto(produto),
      valor: {
        tipo_item: tipo, credito_pis_cofins: pisCofins, descricao: produto.descricao.slice(0, 255), ncm: produto.ncm.slice(0, 8),
        ...(definicao ? { definicao } : {}),
        ...(observacao || produto.decisao?.observacao ? { observacao } : {}),
      },
    });
    if (!r.ok) { setErro(r.mensagem); return; }
    const chaveDoCredito = { ...chaveDoProduto(produto), competencia, cnpj_empresa: cnpjEmpresa };
    if (valorCredito !== null) {
      const c = await gravarDecisaoNoMotor({ raiz, tipo: "credito_icms_item", chave: chaveDoCredito, valor: { valor: valorCredito, valor_original: (produto.icms / 100).toFixed(2) } });
      if (!c.ok) { setErro(`A classificação foi gravada, mas o crédito não: ${c.mensagem}`); router.refresh(); return; }
    } else if (produto.creditoIcms !== null) {
      const c = await apagarDecisaoNoMotor({ raiz, tipo: "credito_icms_item", chave: chaveDoCredito });
      if (!c.ok) { setErro(`A classificação foi gravada, mas o crédito decidido não saiu: ${c.mensagem}`); router.refresh(); return; }
    }
    toast.success("Decisão gravada no motor. Entra no arquivo na próxima geração.");
    fechar();
    router.refresh();
  });

  const desabilitado = !permissao.pode || pendente;
  return <SlideOver open onClose={fechar} title={produto.descricao || produto.codProd} width="max-w-lg">
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-surface-2 p-4 text-ui">
        <div><dt className="text-helper text-fg-secondary">Fornecedor</dt><dd className="tabular-nums">{cnpjFormatado(produto.cnpjFornecedor)}</dd></div>
        <div><dt className="text-helper text-fg-secondary">Código · NCM</dt><dd>{produto.codProd}{produto.ncm ? ` · ${produto.ncm}` : ""}</dd></div>
        <div><dt className="text-helper text-fg-secondary">Valor no mês</dt><dd className="tabular-nums">{reaisDeCentavos(produto.valor)}</dd></div>
        <div><dt className="text-helper text-fg-secondary">ICMS no arquivo</dt><dd className="tabular-nums">{reaisDeCentavos(produto.icms)}</dd></div>
        <div><dt className="text-helper text-fg-secondary">CFOP · CST</dt><dd>{produto.cfops.join(", ")} · {produto.cst || "—"}{produto.simples ? " (Simples)" : ""}</dd></div>
        <div><dt className="text-helper text-fg-secondary">Notas</dt><dd className="tabular-nums">{contagem(produto.ocorrencias)}</dd></div>
      </dl>

      <RadioGroup legenda="Destinação do produto" variante="linha" valor={tipo || null} onChange={trocarTipo} disabled={desabilitado}
        opcoes={DESTINACOES_OFERECIDAS.map((t) => ({ valor: t, rotulo: rotuloDoTipo(t), descricao: t === produto.tipoItem && !decidido(produto) ? "A que o arquivo trouxe pelo CFOP" : undefined }))} />

      <div className="space-y-1.5">
        <label htmlFor="sped-definicao" className="c41-rotulo">Definição do CFOP de entrada</label>
        <Select id="sped-definicao" value={definicao} disabled={desabilitado} onChange={(e) => setDefinicao(e.target.value)}>
          <option value="">Manter a do de-para</option>
          {DEFINICOES_DE_CFOP.map((d) => <option key={d.valor} value={d.valor}>x{d.valor} · {d.rotulo}</option>)}
        </Select>
        <p className="text-helper text-fg-muted">O gerador monta o CFOP com o prefixo da operação e este final. Vale para o produto em todas as competências.</p>
      </div>

      <div className="space-y-1.5">
        <span className="c41-rotulo block">Crédito de PIS/COFINS</span>
        <SegmentedControl<"" | "S" | "N"> label="Crédito de PIS/COFINS" active={pisCofins} onChange={(v) => !desabilitado && setPisCofins(v)}
          items={[{ key: "", label: "Seguir a destinação" }, { key: "S", label: "Sim" }, { key: "N", label: "Não" }]} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sped-credito" className="c41-rotulo">Crédito de ICMS em {competencia}</label>
        <Input id="sped-credito" inputMode="decimal" placeholder={`Vazio: o do arquivo (${decimalDeCentavos(produto.icms)})`} value={credito} disabled={desabilitado} onChange={(e) => setCredito(e.target.value)} />
        <p className="text-helper text-fg-muted">Só desta competência e deste estabelecimento. Zero tira o crédito do produto.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sped-obs" className="c41-rotulo">Observação</label>
        <Textarea id="sped-obs" rows={2} maxLength={255} value={observacao} disabled={desabilitado} onChange={(e) => setObservacao(e.target.value)} />
      </div>

      {produto.decisao?.por && <p className="text-helper text-fg-muted">Última decisão por {produto.decisao.por}.</p>}
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      {permissao.motivo && <Aviso tom="neutro">{permissao.motivo}</Aviso>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={fechar}>Cancelar</Button>
        {permissao.visivel && <Button onClick={gravar} disabled={desabilitado || !tipo}>{pendente ? "Gravando…" : "Gravar decisão"}</Button>}
      </div>
    </div>
  </SlideOver>;
}
