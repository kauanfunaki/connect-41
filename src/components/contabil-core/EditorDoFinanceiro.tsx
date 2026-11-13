"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, Lightbulb } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { dataBr, moedaDoRelatorio as moeda, plural } from "@/lib/contabil-core/conciliacao/telaDaConciliacao";
import { alternar, informado, paginaDe } from "@/lib/contabil-core/conciliacao/telaDaRevisao";
import {
  NOMES_DAS_FONTES,
  PARES_DE_COMPARACAO,
  SUGESTOES_POR_PAGINA,
  TAMANHO_DA_PAGINA_FINANCEIRO,
  TODAS,
  TODOS_OS_TIPOS_DE_COMPARACAO,
  alternarSugestao,
  bloqueioDaSugestao,
  categoriasDe,
  comparacaoValida,
  filtrarLinhas,
  indiceDasLinhas,
  itensUsados,
  loteDeSugestoes,
  nomeDaComparacao,
  novoVinculoFinanceiro,
  paginaDaLinha,
  podeRegistrarFinanceiro,
  rotuloDaCategoria,
  semValor,
  situacaoDaSelecao,
  sugestoesDaResposta,
  type FiltroDoPainel,
  type SugestaoNaTela,
} from "@/lib/contabil-core/conciliacao/telaDoFinanceiro";
import type { AnaliseFinanceiro, LinhaFinanceiroJson, NovoVinculoFinanceiro, Sentido, SugestoesEmLote, TipoComparacao } from "@/lib/contabil-core/conciliacao/financeiroTipos";

// Os dois painéis da conferência do financeiro (Bloco B, Fase B4, 12/11/2026): porte do
// `FinanceiroEditor.tsx` e do `FinanceiroSugestoes.tsx` do Contábil Core. À esquerda, o documento base
// (os relatórios do financeiro ou o Razão da conta banco); à direita, a origem escolhida. Trocar a
// origem não apaga documentos nem conferências: só limpa a seleção em andamento.
//
// A seleção vale para a versão da análise e a comparação em que foi feita: registrar, recarregar por
// conflito ou trocar a comparação a zera, mas os filtros ficam para continuar o trabalho. Os totais
// são decimais exatos; o servidor confere tudo de novo ao registrar.

type Props = {
  empresaId: string;
  analise: AnaliseFinanceiro;
  comparacao: TipoComparacao;
  onComparacao: (tipo: TipoComparacao) => void;
  ocupado: boolean;
  /** Sem "agir", os painéis só consultam: sem sugestões, seleção nem registro. */
  podeAgir: boolean;
  onRegistrar: (vinculo: NovoVinculoFinanceiro) => void;
  /** Uma conferência por sugestão marcada, gravadas juntas pela API. */
  onRegistrarSugestoes: (lote: SugestoesEmLote) => void;
};

type Selecao = {
  chave: string;
  financeiro: Set<string>;
  comparacao: Set<string>;
  marcadas: SugestaoNaTela[];
  observacao: string;
  /** A linha de cada lado que a última sugestão marcada pôs em foco (e um contador do pedido). */
  foco: { financeiro?: string; comparacao?: string; pedido: number };
};

const selecaoVazia = (chave: string, pedido = 0): Selecao => ({ chave, financeiro: new Set(), comparacao: new Set(), marcadas: [], observacao: "", foco: { pedido } });

type Filtros = {
  /** A base e a comparação em que os filtros de cada lado foram escolhidos. */
  base: string;
  tipo: TipoComparacao;
  fonteBase: string;
  categoria: string;
  buscaBase: string;
  fonteOrigem: string;
  buscaOrigem: string;
  natureza: string;
  data: string;
  mostrarVinculados: boolean;
};

export function EditorDoFinanceiro({ empresaId, analise, comparacao, onComparacao, ocupado, podeAgir, onRegistrar, onRegistrarSugestoes }: Props) {
  const base = useId();
  const { base: documentoBase, origem } = PARES_DE_COMPARACAO[comparacao];
  const valida = comparacaoValida(analise, comparacao);
  const areaRef = useRef<HTMLDivElement>(null);

  // ─── Seleção (zera ao mudar a versão ou a comparação) ───
  const chaveDaSelecao = `${analise.versao}|${comparacao}`;
  const [selecaoGuardada, setSelecao] = useState<Selecao>(() => selecaoVazia(chaveDaSelecao));
  const selecao = selecaoGuardada.chave === chaveDaSelecao ? selecaoGuardada : selecaoVazia(chaveDaSelecao, selecaoGuardada.foco.pedido);
  const mudarSelecao = (f: (s: Selecao) => Selecao) => setSelecao((s) => f(s.chave === chaveDaSelecao ? s : selecaoVazia(chaveDaSelecao, s.foco.pedido)));

  // ─── Filtros (os de cada lado voltam ao padrão quando o documento daquele lado muda) ───
  const [filtrosGuardados, setFiltros] = useState<Filtros>({
    base: documentoBase,
    tipo: comparacao,
    fonteBase: TODAS,
    categoria: TODAS,
    buscaBase: "",
    fonteOrigem: TODAS,
    buscaOrigem: "",
    natureza: TODAS,
    data: "",
    mostrarVinculados: false,
  });
  const ajustados = (f: Filtros): Filtros => ({
    ...f,
    ...(f.base !== documentoBase ? { base: documentoBase, fonteBase: TODAS, categoria: TODAS, buscaBase: "" } : {}),
    ...(f.tipo !== comparacao ? { tipo: comparacao, fonteOrigem: TODAS, buscaOrigem: "" } : {}),
  });
  const filtros = ajustados(filtrosGuardados);
  const mudarFiltros = (parcial: Partial<Filtros>) => setFiltros((f) => ({ ...ajustados(f), ...parcial }));
  const limpar = () => mudarSelecao((s) => selecaoVazia(s.chave, s.foco.pedido));

  // ─── Linhas ───
  const usados = useMemo(() => itensUsados(analise.vinculos, comparacao), [analise.vinculos, comparacao]);
  const linhasBase = useMemo(() => analise.linhas.filter((l) => l.tipoFonte === documentoBase), [analise.linhas, documentoBase]);
  const linhasOrigem = useMemo(() => analise.linhas.filter((l) => l.tipoFonte === origem), [analise.linhas, origem]);
  const indice = useMemo(() => indiceDasLinhas(analise.linhas), [analise.linhas]);
  const nomesDasFontes = useMemo(() => new Map(analise.fontes.map((f) => [f.id, f.nomeArquivo])), [analise.fontes]);
  const sentidoDaLinha = useMemo(() => new Map(analise.linhas.map((l) => [l.id, l.sentido])), [analise.linhas]);
  const categorias = useMemo(() => categoriasDe(linhasBase), [linhasBase]);

  const filtroBase: FiltroDoPainel = {
    mostrarVinculados: filtros.mostrarVinculados,
    fonte: filtros.fonteBase,
    natureza: filtros.natureza,
    data: filtros.data,
    categoria: filtros.categoria,
    busca: filtros.buscaBase,
  };
  const filtroOrigem: FiltroDoPainel = { ...filtroBase, fonte: filtros.fonteOrigem, categoria: TODAS, busca: filtros.buscaOrigem };
  const filtradasBase = filtrarLinhas(linhasBase, usados.financeiro, indice, filtroBase);
  const filtradasOrigem = filtrarLinhas(linhasOrigem, usados.comparacao, indice, filtroOrigem);

  const escolhidasBase = linhasBase.filter((l) => selecao.financeiro.has(l.id));
  const escolhidasOrigem = linhasOrigem.filter((l) => selecao.comparacao.has(l.id));
  const sentidoEscolhido: Sentido | undefined = escolhidasBase[0]?.sentido ?? escolhidasOrigem[0]?.sentido;
  const sit = situacaoDaSelecao({
    financeiro: escolhidasBase,
    comparacao: escolhidasOrigem,
    marcadas: selecao.marcadas,
    periodoInicio: analise.periodoInicio,
    periodoFim: analise.periodoFim,
  });
  const registravel = podeRegistrarFinanceiro({
    ocupado,
    comparacaoValida: valida,
    qtdFinanceiro: selecao.financeiro.size,
    qtdComparacao: selecao.comparacao.size,
    situacao: sit,
    observacao: selecao.observacao,
  });

  // Marcar uma sugestão leva a tela até a conferência (a área recebe o foco).
  useEffect(() => {
    if (!selecao.foco.pedido) return;
    areaRef.current?.focus({ preventScroll: true });
    areaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selecao.foco.pedido]);

  function marcarSugestao(s: SugestaoNaTela) {
    const novas = alternarSugestao(selecao.marcadas, s);
    const adicionada = novas.length > selecao.marcadas.length;
    // Os filtros saem do caminho: a sugestão pode estar em outro arquivo, data ou natureza.
    mudarFiltros({ fonteBase: TODAS, fonteOrigem: TODAS, natureza: TODAS, data: "", categoria: TODAS, buscaBase: "", buscaOrigem: "" });
    mudarSelecao((atual) => ({
      ...atual,
      marcadas: novas,
      financeiro: new Set(novas.flatMap((x) => x.financeiroIds)),
      comparacao: new Set(novas.flatMap((x) => x.comparacaoIds)),
      foco: adicionada ? { financeiro: s.financeiroIds[0], comparacao: s.comparacaoIds[0], pedido: atual.foco.pedido + 1 } : atual.foco,
    }));
  }

  /** Mexer à mão numa linha transforma a seleção numa composição manual única. */
  function alternarManual(lado: "financeiro" | "comparacao", id: string) {
    mudarSelecao((s) => ({ ...s, marcadas: [], foco: { pedido: s.foco.pedido }, [lado]: alternar(s[lado], id) }));
  }

  function registrar() {
    if (selecao.marcadas.length) onRegistrarSugestoes(loteDeSugestoes(analise.versao, selecao.marcadas, selecao.observacao));
    else onRegistrar(novoVinculoFinanceiro(analise, selecao.financeiro, selecao.comparacao, selecao.observacao));
  }

  const opcoesDeArquivo = (tipo: string) => analise.fontes.filter((f) => f.tipo === tipo);
  const nomeBase = NOMES_DAS_FONTES[documentoBase];
  const nomeOrigem = NOMES_DAS_FONTES[origem];
  const qtdMarcadas = selecao.marcadas.length;

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${base}-titulo`}>
      <h2 id={`${base}-titulo`} className="text-base font-semibold">
        {nomeDaComparacao(comparacao)}
      </h2>

      {podeAgir && valida && (
        <SugestoesDoFinanceiro
          key={`${analise.id}|${analise.versao}|${comparacao}`}
          empresaId={empresaId}
          analise={analise}
          tipo={comparacao}
          ocupado={ocupado}
          marcadas={selecao.marcadas}
          bloqueio={(s) => bloqueioDaSugestao(s, selecao.marcadas, (id) => sentidoDaLinha.get(id))}
          onAlternar={marcarSugestao}
        />
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3" role="group" aria-labelledby={`${base}-filtros`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${base}-filtros`} className="text-sm font-semibold">
            {podeAgir ? "Selecionar composição manual" : "Consultar os movimentos"}
          </h3>
          <Checkbox
            id={`${base}-vinculados`}
            checked={filtros.mostrarVinculados}
            onChange={(e) => mudarFiltros({ mostrarVinculados: e.target.checked })}
            label="Mostrar movimentos já conferidos"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <CampoForm label="Comparação" htmlFor={`${base}-comparacao`}>
            <Select id={`${base}-comparacao`} compact value={comparacao} disabled={ocupado} onChange={(e) => onComparacao(e.target.value as TipoComparacao)}>
              {TODOS_OS_TIPOS_DE_COMPARACAO.map((t) => (
                <option key={t} value={t}>
                  {nomeDaComparacao(t)}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label={`Arquivos de ${nomeBase}`} htmlFor={`${base}-fonte-base`}>
            <Select
              id={`${base}-fonte-base`}
              compact
              value={filtros.fonteBase}
              disabled={ocupado}
              onChange={(e) => {
                mudarFiltros({ fonteBase: e.target.value });
                limpar();
              }}
            >
              <option value={TODAS}>Todos os arquivos</option>
              {opcoesDeArquivo(documentoBase).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nomeArquivo}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label={`Arquivos de ${nomeOrigem}`} htmlFor={`${base}-fonte-origem`}>
            <Select
              id={`${base}-fonte-origem`}
              compact
              value={filtros.fonteOrigem}
              disabled={ocupado}
              onChange={(e) => {
                mudarFiltros({ fonteOrigem: e.target.value });
                limpar();
              }}
            >
              <option value={TODAS}>Todos os arquivos</option>
              {opcoesDeArquivo(origem).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nomeArquivo}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Natureza do movimento" htmlFor={`${base}-natureza`}>
            <Select
              id={`${base}-natureza`}
              compact
              value={filtros.natureza}
              disabled={ocupado}
              onChange={(e) => {
                mudarFiltros({ natureza: e.target.value });
                limpar();
              }}
            >
              <option value={TODAS}>Entradas e saídas</option>
              <option value="ENTRADA">Só entradas</option>
              <option value="SAIDA">Só saídas</option>
            </Select>
          </CampoForm>
          <CampoForm label="Data dos movimentos" htmlFor={`${base}-data`}>
            <div className="flex items-center gap-2">
              <CampoData id={`${base}-data`} compact value={filtros.data} disabled={ocupado} onChange={(v) => mudarFiltros({ data: v })} />
              {filtros.data && (
                <Button type="button" size="xs" variant="ghost" onClick={() => mudarFiltros({ data: "" })}>
                  Todas
                </Button>
              )}
            </div>
          </CampoForm>
          <CampoForm label={documentoBase === "RAZAO" ? "Conta contábil do Razão" : "Categoria do financeiro"} htmlFor={`${base}-categoria`}>
            <Select id={`${base}-categoria`} compact value={filtros.categoria} disabled={ocupado} onChange={(e) => mudarFiltros({ categoria: e.target.value })}>
              <option value={TODAS}>Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </CampoForm>
        </div>
        <p className="text-micro text-fg-muted">
          Entradas e saídas não se misturam na mesma composição. Cada par de documentos é conferido de forma independente: o mesmo movimento pode ser
          conferido com o Extrato e com o SISPAG.
        </p>
        <p className="text-micro text-fg-muted" aria-live="polite">
          {usados.financeiro.size + usados.comparacao.size === 0
            ? `Nenhum movimento conferido ainda em ${nomeDaComparacao(comparacao)}.`
            : `${plural(usados.financeiro.size, "movimento", "movimentos")} de ${nomeBase} e ${usados.comparacao.size} da comparação já conferidos; ficam bloqueados nesta comparação.`}
        </p>
        {(documentoBase === "RAZAO" || origem === "RAZAO") && (
          <p className="text-micro text-fg-muted">Razão da conta banco: débitos são entradas; créditos são saídas. Não envie Razão de provisões aqui.</p>
        )}
        {!valida && (
          <Aviso tom="atencao">
            O extrato mudou depois que a análise foi salva. A consulta continua disponível, mas conferências com o Extrato estão bloqueadas: abra uma
            análise nova para conferir com o extrato atual. SISPAG e Razão seguem liberados.
          </Aviso>
        )}
      </div>

      <div ref={areaRef} tabIndex={-1} aria-label="Movimentos para a conferência" className="scroll-mt-4 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {qtdMarcadas > 0 && (
          <p role="status" className="mb-3 rounded-md border border-brand bg-brand/8 p-3 text-sm">
            {qtdMarcadas === 1 ? "Sugestão selecionada" : `${qtdMarcadas} sugestões selecionadas`}: os movimentos estão marcados nas listas abaixo, na
            página da última marcada. Confira antes de confirmar; cada sugestão vira uma conferência própria, todas juntas ou nenhuma. Mexer num movimento à
            mão transforma a seleção numa composição manual única.
          </p>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          <PainelDeLinhas
            titulo={nomeBase}
            linhas={filtradasBase}
            chaveDaLista={JSON.stringify([filtroBase, analise.versao])}
            selecionados={selecao.financeiro}
            usados={usados.financeiro}
            sentidoEscolhido={sentidoEscolhido}
            busca={filtros.buscaBase}
            onBusca={(v) => mudarFiltros({ buscaBase: v })}
            bloqueado={ocupado || !valida || !podeAgir}
            escolhivel={podeAgir}
            nomesDasFontes={nomesDasFontes}
            foco={selecao.foco.financeiro ? { id: selecao.foco.financeiro, pedido: selecao.foco.pedido } : undefined}
            onAlternar={(id) => alternarManual("financeiro", id)}
          />
          <PainelDeLinhas
            titulo={nomeOrigem}
            linhas={filtradasOrigem}
            chaveDaLista={JSON.stringify([filtroOrigem, analise.versao, comparacao])}
            selecionados={selecao.comparacao}
            usados={usados.comparacao}
            sentidoEscolhido={sentidoEscolhido}
            busca={filtros.buscaOrigem}
            onBusca={(v) => mudarFiltros({ buscaOrigem: v })}
            bloqueado={ocupado || !valida || !podeAgir}
            escolhivel={podeAgir}
            nomesDasFontes={nomesDasFontes}
            foco={selecao.foco.comparacao ? { id: selecao.foco.comparacao, pedido: selecao.foco.pedido } : undefined}
            onAlternar={(id) => alternarManual("comparacao", id)}
          />
        </div>
      </div>

      {podeAgir && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3" role="group" aria-label="Resumo da seleção">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3" aria-live="polite">
            <div>
              <dt className="text-micro text-fg-muted">
                {nomeBase} ({selecao.financeiro.size})
              </dt>
              <dd className="tabular-nums font-semibold">{moeda(sit.totais.totalFinanceiro)}</dd>
            </div>
            <div>
              <dt className="text-micro text-fg-muted">
                {nomeOrigem} ({selecao.comparacao.size})
              </dt>
              <dd className="tabular-nums font-semibold">{moeda(sit.totais.totalComparacao)}</dd>
            </div>
            <div>
              <dt className="text-micro text-fg-muted">Comparação − {documentoBase === "RAZAO" ? "Razão" : "financeiro"}</dt>
              <dd className={`tabular-nums font-semibold ${sit.totais.temDiferenca ? "text-warning-fg" : "text-success-fg"}`}>{moeda(sit.totais.diferenca)}</dd>
            </div>
          </dl>
          <p className="text-micro text-fg-muted">Os valores dos documentos são comparados, não somados entre si. A seleção inclui itens marcados em outras páginas e filtros.</p>
          {!sit.totais.mesmoSentido && (
            <p role="alert" className="text-sm text-warning-fg">
              Escolha só entradas ou só saídas numa composição.
            </p>
          )}
          {sit.datasDiferentes && (
            <p className="text-micro text-warning-fg">
              {qtdMarcadas ? "Há sugestão marcada com datas diferentes entre os documentos." : "Os movimentos escolhidos têm datas diferentes."} Explique a
              relação, mesmo quando os valores fecham.
            </p>
          )}
          {sit.foraDoPeriodo && (
            <p className="text-micro text-warning-fg">Há movimentos fora do período desta análise. Justifique o uso deles, mesmo com datas e valores iguais.</p>
          )}
          <CampoForm
            label={sit.precisaJustificativa ? "Justificativa da diferença de valor, data ou período" : "Observação da conferência (opcional)"}
            htmlFor={`${base}-observacao`}
            required={sit.precisaJustificativa}
          >
            <Textarea
              id={`${base}-observacao`}
              rows={2}
              maxLength={2000}
              value={selecao.observacao}
              disabled={ocupado}
              placeholder="O critério da conferência. Categorias não criam regras de classificação."
              onChange={(e) => {
                const observacao = e.target.value;
                mudarSelecao((s) => ({ ...s, observacao }));
              }}
            />
          </CampoForm>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={limpar}>
              Limpar seleção
            </Button>
            <Button type="button" disabled={!registravel} loading={ocupado} loadingLabel="Registrando…" onClick={registrar}>
              <CheckCircle2 size={14} aria-hidden />
              {qtdMarcadas > 1 ? `Confirmar ${qtdMarcadas} sugestões conferidas` : qtdMarcadas ? "Confirmar sugestão conferida" : "Registrar conferência manual"}
            </Button>
          </div>
          <p className="text-micro text-fg-muted">A soma fechar ajuda a conferir, mas não prova o vínculo: confirmar a relação é de quem registra.</p>
        </div>
      )}
    </section>
  );
}

// ─── Um painel de movimentos ──────────────────────────────────────────────

function PainelDeLinhas({
  titulo,
  linhas,
  chaveDaLista,
  selecionados,
  usados,
  sentidoEscolhido,
  busca,
  onBusca,
  bloqueado,
  escolhivel,
  nomesDasFontes,
  foco,
  onAlternar,
}: {
  titulo: string;
  linhas: LinhaFinanceiroJson[];
  /** Os filtros desta lista: mudando, a página volta à primeira. */
  chaveDaLista: string;
  selecionados: ReadonlySet<string>;
  usados: ReadonlySet<string>;
  sentidoEscolhido?: Sentido;
  busca: string;
  onBusca: (v: string) => void;
  bloqueado: boolean;
  /** Sem "agir", a caixa de marcar nem aparece. */
  escolhivel: boolean;
  nomesDasFontes: ReadonlyMap<string, string>;
  foco?: { id: string; pedido: number };
  onAlternar: (id: string) => void;
}) {
  const base = useId();
  const listaRef = useRef<HTMLUListElement>(null);
  const [vista, setVista] = useState({ chave: chaveDaLista, pagina: 0, pedido: 0 });
  let paginaPedida = vista.chave === chaveDaLista ? vista.pagina : 0;
  // A sugestão recém-marcada: a lista vai para a página dela (uma vez por pedido).
  if (foco && foco.pedido !== vista.pedido) {
    paginaPedida = paginaDaLinha(linhas, foco.id) ?? paginaPedida;
    setVista({ chave: chaveDaLista, pagina: paginaPedida, pedido: foco.pedido });
  }
  const pag = paginaDe(linhas, paginaPedida, TAMANHO_DA_PAGINA_FINANCEIRO);
  const irPara = (p: number) => setVista((v) => ({ ...v, chave: chaveDaLista, pagina: p }));

  useEffect(() => {
    const lista = listaRef.current;
    const alvo = lista?.querySelector<HTMLElement>('[data-foco="true"]');
    if (lista && alvo) lista.scrollTop += alvo.getBoundingClientRect().top - lista.getBoundingClientRect().top;
  }, [foco?.pedido, pag.pagina]);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3" aria-labelledby={`${base}-titulo`}>
      <h3 id={`${base}-titulo`} className="text-sm font-medium">
        {titulo}
      </h3>
      <Input
        type="search"
        compact
        aria-label={`Buscar em ${titulo}`}
        placeholder="Nome, histórico, documento, categoria ou valor"
        value={busca}
        onChange={(e) => onBusca(e.target.value)}
      />
      <ul ref={listaRef} className="flex h-[440px] min-h-0 flex-col gap-2 overflow-y-auto pr-1" aria-label={`Movimentos de ${titulo}`}>
        {pag.itens.map((l) => {
          const usado = usados.has(l.id);
          const escolhido = selecionados.has(l.id);
          const naturezaDiferente = !!sentidoEscolhido && sentidoEscolhido !== l.sentido;
          const zerado = semValor(l);
          const travado = bloqueado || usado || naturezaDiferente || zerado;
          const id = `${base}-${l.id}`;
          const conteudo = (
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap justify-between gap-2">
                <span className="tabular-nums font-medium">
                  {dataBr(l.data)} · {l.sentido === "ENTRADA" ? "Entrada" : "Saída"}
                </span>
                <span className={`tabular-nums whitespace-nowrap font-semibold ${l.sentido === "ENTRADA" ? "text-success-fg" : "text-danger"}`}>{moeda(l.valor)}</span>
              </span>
              <span className="break-words font-medium">{informado(l.historico)}</span>
              <span className="text-micro text-fg-muted break-words">
                Favorecido: {informado(l.favorecido)} · Documento: {informado(l.documento)}
                {l.parcela ? ` · Parcela: ${l.parcela}` : ""}
              </span>
              {l.documentoFavorecido && <span className="text-micro text-fg-muted break-words">CNPJ/CPF do favorecido: {l.documentoFavorecido}</span>}
              {l.categoria && (
                <span className="text-micro break-words">
                  {rotuloDaCategoria(l.tipoFonte)}: {l.categoria}
                </span>
              )}
              <span className="text-micro text-fg-muted break-words">Banco: {informado(l.banco)}</span>
              {l.observacao && <span className="text-micro text-fg-muted break-words">{l.observacao}</span>}
              <span className="text-micro text-fg-muted break-words">
                {nomesDasFontes.get(l.fonteId) ?? "Arquivo não informado"} · {l.referencia}
              </span>
              {usado && (
                <span>
                  <Selo tom="neutro">Já conferido nesta comparação</Selo>
                </span>
              )}
              {escolhivel && naturezaDiferente && !usado && <span className="text-micro text-warning-fg">Uma composição tem só entradas ou só saídas.</span>}
              {escolhivel && zerado && !usado && <span className="text-micro text-warning-fg">Movimento sem valor não compõe uma relação.</span>}
            </span>
          );
          return (
            <li key={l.id} data-foco={foco?.id === l.id}>
              {escolhivel ? (
                <label
                  htmlFor={id}
                  className={`flex gap-3 rounded-md border p-3 text-sm ${escolhido ? "border-brand bg-brand/8" : "border-border"} ${travado ? "opacity-60" : "cursor-pointer hover:bg-surface-hover"}`}
                >
                  <span className="flex h-5 shrink-0 items-center">
                    <Checkbox id={id} checked={escolhido} disabled={travado} onChange={() => onAlternar(l.id)} />
                  </span>
                  {conteudo}
                </label>
              ) : (
                <div className="flex gap-3 rounded-md border border-border p-3 text-sm">{conteudo}</div>
              )}
            </li>
          );
        })}
        {linhas.length === 0 && <li className="py-8 text-center text-sm text-fg-muted">Nenhum movimento com estes filtros. Confira também os arquivos enviados.</li>}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-fg-muted">
        <span>
          {plural(linhas.length, "movimento", "movimentos")} · Página {pag.pagina + 1} de {pag.paginas}
        </span>
        <div className="flex gap-1" role="group" aria-label={`Páginas: ${titulo}`}>
          <Button type="button" size="xs" variant="secondary" disabled={pag.pagina === 0} onClick={() => irPara(pag.pagina - 1)}>
            Anterior
          </Button>
          <Button type="button" size="xs" variant="secondary" disabled={pag.pagina + 1 >= pag.paginas} onClick={() => irPara(pag.pagina + 1)}>
            Próxima
          </Button>
        </div>
      </div>
    </section>
  );
}

// ─── Sugestões ────────────────────────────────────────────────────────────

type Carga = { carregando: true } | { carregando: false; erro: string } | { carregando: false; erro: null; itens: SugestaoNaTela[]; avisos: string[] };

/**
 * As sugestões não são vínculos: só marcam os movimentos para a pessoa conferir. Busca de novo a cada
 * versão e comparação (a chave do componente, no editor) e no "Tentar de novo".
 */
function SugestoesDoFinanceiro({
  empresaId,
  analise,
  tipo,
  ocupado,
  marcadas,
  bloqueio,
  onAlternar,
}: {
  empresaId: string;
  analise: AnaliseFinanceiro;
  tipo: TipoComparacao;
  ocupado: boolean;
  marcadas: readonly SugestaoNaTela[];
  bloqueio: (s: SugestaoNaTela) => string | null;
  onAlternar: (s: SugestaoNaTela) => void;
}) {
  const [tentativa, setTentativa] = useState(0);
  const [carga, setCarga] = useState<{ tentativa: number; carga: Carga }>({ tentativa: 0, carga: { carregando: true } });
  const [pagina, setPagina] = useState(0);
  const atual: Carga = carga.tentativa === tentativa ? carga.carga : { carregando: true };

  useEffect(() => {
    let vale = true;
    const q = new URLSearchParams({ empresa: empresaId, tipo });
    void fetch(`/api/contabil-core/conciliacao/financeiro/${analise.id}/sugestoes?${q}`, { cache: "no-store" })
      .then(async (resp) => {
        const corpo = (await resp.json().catch(() => null)) as { sugestoes?: unknown; error?: string } | null;
        if (!vale) return;
        if (!resp.ok || !corpo) return setCarga({ tentativa, carga: { carregando: false, erro: corpo?.error ?? "Não deu para procurar as sugestões." } });
        const r = sugestoesDaResposta(corpo.sugestoes);
        setCarga({ tentativa, carga: { carregando: false, erro: null, itens: r.itens, avisos: r.avisos } });
      })
      .catch(() => {
        if (vale) setCarga({ tentativa, carga: { carregando: false, erro: "Não deu para falar com o servidor." } });
      });
    return () => {
      vale = false;
    };
  }, [empresaId, analise.id, tipo, tentativa]);

  const idsMarcados = new Set(marcadas.map((s) => s.id));
  const linhas = useMemo(() => new Map(analise.linhas.map((l) => [l.id, l])), [analise.linhas]);
  const itens = !atual.carregando && atual.erro === null ? atual.itens : [];
  const pag = paginaDe(itens, pagina, SUGESTOES_POR_PAGINA);
  const nomeBase = PARES_DE_COMPARACAO[tipo].base === "RAZAO" ? "do Razão" : "do financeiro";
  const resumo = (id: string) => {
    const l = linhas.get(id);
    return l ? `${dataBr(l.data)} · ${l.historico} · ${moeda(l.valor)}` : "Movimento não encontrado";
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <Accordion
        abertoInicial
        classeDoCabecalho="w-full text-left text-sm font-semibold"
        titulo={
          <span className="flex items-center gap-2">
            <Lightbulb size={14} aria-hidden /> Sugestões para conferência ({atual.carregando ? "…" : itens.length})
            {marcadas.length ? ` · ${plural(marcadas.length, "marcada", "marcadas")}` : ""}
          </span>
        }
      >
        <div className="mt-3 flex flex-col gap-3" aria-busy={atual.carregando}>
          <p className="text-micro text-fg-muted">
            Sugestões não são conferências confirmadas. Confira os documentos antes de registrar. Dá para marcar várias; cada uma vira uma conferência própria.
          </p>
          {atual.carregando && <p className="text-sm text-fg-muted">Procurando correspondências…</p>}
          {!atual.carregando && atual.erro !== null && (
            <div className="flex flex-wrap items-center gap-2">
              <Aviso>{atual.erro}</Aviso>
              <Button type="button" size="sm" variant="secondary" onClick={() => setTentativa((n) => n + 1)}>
                Tentar de novo
              </Button>
            </div>
          )}
          {!atual.carregando && atual.erro === null && atual.avisos.length > 0 && (
            <Aviso tom="atencao">
              <ul className="list-disc pl-4">
                {atual.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Aviso>
          )}
          {!atual.carregando && atual.erro === null && itens.length === 0 && <p className="text-sm">Nenhuma relação clara encontrada. Use a seleção manual abaixo.</p>}
          <ul className="flex flex-col gap-2">
            {pag.itens.map((s) => {
              const marcada = idsMarcados.has(s.id);
              const motivo = bloqueio(s);
              return (
                <li
                  key={s.id}
                  className={`flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:justify-between ${marcada ? "border-brand bg-brand/8" : "border-border"}`}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      {s.motivo}
                      {s.ambigua && <Selo tom="atencao">Ambígua</Selo>}
                    </p>
                    <p className="text-micro text-fg-muted">
                      {plural(s.financeiroIds.length, "item", "itens")} {nomeBase} ↔ {plural(s.comparacaoIds.length, "item", "itens")} da comparação
                    </p>
                    <p className="text-micro text-fg-muted break-words">
                      {[...s.financeiroIds.slice(0, 2), ...s.comparacaoIds.slice(0, 2)].map(resumo).join(" ↔ ")}
                    </p>
                    {s.financeiroIds.length + s.comparacaoIds.length > 4 && (
                      <p className="text-micro text-fg-muted">A composição inteira é marcada nas listas ao conferir.</p>
                    )}
                    {s.alertas.map((a) => (
                      <p key={a} className="text-micro text-warning-fg">
                        {a}
                      </p>
                    ))}
                    {motivo && <p className="text-micro text-fg-muted">{motivo}</p>}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={marcada ? "primary" : "secondary"}
                    aria-pressed={marcada}
                    disabled={ocupado || !!motivo}
                    onClick={() => onAlternar(s)}
                    className="shrink-0"
                  >
                    {marcada ? "Desmarcar sugestão" : "Conferir sugestão"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {itens.length > SUGESTOES_POR_PAGINA && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-fg-muted">
              <span>
                Página {pag.pagina + 1} de {pag.paginas}
              </span>
              <div className="flex gap-1" role="group" aria-label="Páginas das sugestões">
                <Button type="button" size="xs" variant="secondary" disabled={pag.pagina === 0} onClick={() => setPagina(pag.pagina - 1)}>
                  Anterior
                </Button>
                <Button type="button" size="xs" variant="secondary" disabled={pag.pagina + 1 >= pag.paginas} onClick={() => setPagina(pag.pagina + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </Accordion>
    </div>
  );
}
