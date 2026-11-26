"use client";

import { useEffect, useId, useOptimistic, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Columns3, Download, Plus, Rows3, Sigma, X } from "lucide-react";
import { useNavegarSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CampoMes } from "@/components/ui/CampoMes";
import { Checkbox } from "@/components/ui/Checkbox";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";
import { IconButton, classeDoIconButton } from "@/components/ui/IconButton";
import { ItemDoMenu, Popover } from "@/components/ui/Popover";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { normalizar } from "@/lib/buscaDeTelas";
import { configuracaoDoModelo, textoDoPeriodo, type ModeloDaTabela, type ModelosDaTela } from "@/lib/relatorios/modelosDaTabela";
import { ModelosDaTabela } from "./ModelosDaTabela";
import {
  BASES,
  DIMENSOES,
  MAXIMO_DE_NIVEIS,
  MEDIDAS,
  NOME_DA_BASE,
  ROTULO_DA_BASE,
  VISOES_PRONTAS,
  areaDoCampo,
  cabeNaColuna,
  cabeNasLinhas,
  colocarNaColuna,
  colocarNasLinhas,
  dimensoesDaBase,
  lerConfiguracao,
  medidasDaBase,
  moverLinha,
  paramsDaConfiguracao,
  podeTirar,
  tirarDaTabela,
  trocarBase,
  type Configuracao,
  type Medida,
  type Situacao,
  type Tipo,
  type VisaoPronta,
} from "@/lib/relatorios/tabelaDinamica";

type Filtros = Configuracao["filtros"];

/** Acima disto a lista de campos ganha busca. */
const COM_BUSCA = 8;

const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  todas: "Todas (sem as canceladas)",
  abertas: "Em aberto",
  vencidas: "Vencidas",
  quitadas: "Pagas ou recebidas",
};

const rotuloDoTipo = (tipo: Tipo, baixas: boolean) =>
  ({
    ambos: baixas ? "Entradas e saídas" : "A pagar e a receber",
    PAGAR: baixas ? "Só saídas" : "Só a pagar",
    RECEBER: baixas ? "Só entradas" : "Só a receber",
  })[tipo];

/**
 * O que está filtrado fica à vista, com o "x" que tira só aquele — o desenho
 * das etiquetas do `FiltrosDaTela`. Sem `aoTirar` é o valor padrão: neutra e
 * sem o "x", que não há o que tirar.
 */
function EtiquetaDoFiltro({ rotulo, valor, aoTirar }: { rotulo: string; valor: string; aoTirar?: () => void }) {
  return (
    <span
      className={`inline-flex h-7 min-w-0 items-center gap-1 rounded-full border pl-2.5 text-fs-2 text-fg ${
        aoTirar ? "border-brand/30 bg-brand-subtle pr-1" : "border-border bg-surface-2 pr-2.5"
      }`}
    >
      <span className="text-fg-muted">{rotulo}:</span>
      <span className="max-w-[220px] truncate font-medium">{valor}</span>
      {aoTirar && (
        <button
          type="button"
          onClick={aoTirar}
          aria-label={`Tirar o filtro de ${rotulo.toLowerCase()}`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </span>
  );
}

// A ficha de um campo colocado numa área, e o recuo de cada nível das linhas.
const FICHA = "flex h-8 items-center gap-0.5 rounded-md border border-border bg-surface-2 pl-2.5 pr-0.5";
const RECUO_DO_NIVEL = ["", "ml-3", "ml-6"] as const;
const TITULO_DA_AREA = "c41-rotulo mb-1.5 flex items-center gap-1.5 px-1";

/**
 * A configuração da tabela dinâmica (16/11/2026, melhoria-719): a barra de cima
 * (base, filtros, modelos e exportação), os campos da base e as áreas
 * Linhas, Colunas e Valores, como no Excel. O retorno do BPO era que os dez
 * seletores com "Aplicar" eram pouco intuitivos perto do Omie.
 *
 * Cada mudança já troca a tabela, sem recarregar (`NavegacaoSemRecarregar`). A
 * configuração continua morando no endereço, com os mesmos parâmetros: o
 * `config` que chega é o que o servidor leu de lá, e a tela não guarda cópia
 * dele — só o mostra adiantado (`useOptimistic`) enquanto a tabela nova não
 * chega. É o que evita o estado velho do filtro sem recarregar: voltar no
 * navegador ou abrir um link salvo redesenha tudo pelo endereço.
 *
 * Colocar, tirar e reordenar é por clique (e por teclado: tudo é botão).
 * Arrastar ficou de fora: o `arrasteDeBlocos` só faz a conta de uma lista
 * vertical, e levar um campo da lista para uma área pediria um arraste novo.
 */
export function ConfiguracaoDaTabela({
  config,
  empresa,
  visao,
  hoje,
  modelos,
  children,
}: {
  /** O que o servidor leu do endereço. */
  config: Configuracao;
  /** A empresa do endereço, que toda navegação daqui carrega junto. */
  empresa: string | null;
  /** A visão pronta que o endereço marca como aberta. */
  visao: string | null;
  /** "AAAA-MM-DD" de hoje em São Paulo: o período padrão sai dele. */
  hoje: string;
  /** Os modelos salvos — os da pessoa e os do setor (funcionalidade-816). */
  modelos: ModelosDaTela;
  /** A tabela, que fica ao lado dos campos em tela larga e embaixo na estreita. */
  children: React.ReactNode;
}) {
  const id = useId();
  const { ir, pendente } = useNavegarSemRecarregar();
  const [visivel, mostrar] = useOptimistic({ config, visao });
  const c = visivel.config;
  const f = c.filtros;
  const baixas = c.base === "baixas";
  const [busca, setBusca] = useState("");

  // O foco depois de reordenar ou tirar: a ficha muda de lugar (ou some) e o
  // botão que tinha o foco o perde. Vai para o mesmo botão no lugar novo — ou,
  // tirado o campo, para ele na lista de campos.
  const raizRef = useRef<HTMLDivElement>(null);
  const focoDepois = useRef<string[] | null>(null);
  useEffect(() => {
    const alvos = focoDepois.current;
    focoDepois.current = null;
    for (const alvo of alvos ?? []) {
      const botao = raizRef.current?.querySelector<HTMLButtonElement>(`[data-foco="${alvo}"]:not(:disabled)`);
      if (botao) {
        botao.focus();
        break;
      }
    }
  }, [c]);

  function navegar(url: URLSearchParams, nova: Configuracao, visaoNova: string | null, foco?: string[]) {
    focoDepois.current = foco ?? null;
    ir(`/tabela-dinamica?${url}`, () => mostrar({ config: nova, visao: visaoNova }));
  }
  /** Mudou a configuração: a tabela troca, e a visão pronta deixa de estar marcada. */
  function aplicar(nova: Configuracao, foco?: string[]) {
    if (nova === c) return;
    navegar(paramsDaConfiguracao(nova, { empresa: empresa ?? undefined }), nova, null, foco);
  }
  const filtrar = (mudanca: Partial<Filtros>) => aplicar({ ...c, filtros: { ...f, ...mudanca } });
  // O endereço da visão é o de sempre (os parâmetros dela e `visao`), para os
  // links já salvos e os que saírem daqui serem o mesmo.
  function abrirVisao(v: VisaoPronta) {
    const url = new URLSearchParams({ ...v.params, visao: v.id });
    if (empresa) url.set("empresa", empresa);
    navegar(url, lerConfiguracao(v.params, hoje), v.id);
  }
  // Aplicar um modelo é trocar o endereço pelos parâmetros dele, com o período
  // calculado hoje se for o relativo (25/11/2026, funcionalidade-816).
  function aplicarModelo(m: ModeloDaTabela) {
    const nova = configuracaoDoModelo(m, c, hoje);
    navegar(paramsDaConfiguracao(nova, { empresa: empresa ?? undefined }), nova, null);
  }

  const padrao = lerConfiguracao({}, hoje).filtros;
  const periodoMudou = f.de !== padrao.de || f.ate !== padrao.ate;
  const filtrosAtivos =
    Number(f.tipo !== "ambos") + Number(periodoMudou) + Number(!baixas && f.periodoPor !== "competencia") + Number(!baixas && f.situacao !== "todas");

  const visaoAberta = VISOES_PRONTAS.find((v) => v.id === visivel.visao);
  const exportar = `/tabela-dinamica/exportar?${paramsDaConfiguracao(c, { empresa: empresa ?? undefined })}`;

  const barra = (
    <Card className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <SegmentedControl
        label="Base da tabela"
        active={c.base}
        items={BASES.map((b) => ({ key: b, label: NOME_DA_BASE[b], title: ROTULO_DA_BASE[b] }))}
        onChange={(b) => aplicar(trocarBase(c, b))}
      />

      <FilterButton activeCount={filtrosAtivos} align="left" width={300}>
        {({ close }) => (
          <div className="space-y-3">
            <FilterButtonSection label="Tipo">
              <Select compact aria-label="Tipo" value={f.tipo} onChange={(e) => filtrar({ tipo: e.target.value as Tipo })}>
                {(["ambos", "PAGAR", "RECEBER"] as const).map((t) => (
                  <option key={t} value={t}>
                    {rotuloDoTipo(t, baixas)}
                  </option>
                ))}
              </Select>
            </FilterButtonSection>
            <div className="grid grid-cols-2 gap-2">
              <FilterButtonSection label={baixas ? "Pagas de" : "De"}>
                <CampoMes compact aria-label={baixas ? "Pagas de" : "Período de"} value={f.de ?? ""} onChange={(v) => filtrar({ de: v || null })} />
              </FilterButtonSection>
              <FilterButtonSection label="Até">
                <CampoMes compact aria-label="Período até" value={f.ate ?? ""} onChange={(v) => filtrar({ ate: v || null })} />
              </FilterButtonSection>
            </div>
            <Checkbox
              id={`${id}-sem-periodo`}
              label="Sem período"
              checked={!f.de && !f.ate}
              onChange={(e) => filtrar(e.target.checked ? { de: null, ate: null } : { de: padrao.de, ate: padrao.ate })}
            />
            {!baixas && (
              <FilterButtonSection label="Período pela">
                <Select
                  compact
                  aria-label="Período pela"
                  value={f.periodoPor}
                  onChange={(e) => filtrar({ periodoPor: e.target.value as Filtros["periodoPor"] })}
                >
                  <option value="competencia">Competência</option>
                  <option value="vencimento">Data de vencimento</option>
                </Select>
              </FilterButtonSection>
            )}
            {!baixas && (
              <FilterButtonSection label="Situação">
                <Select compact aria-label="Situação" value={f.situacao} onChange={(e) => filtrar({ situacao: e.target.value as Situacao })}>
                  {(Object.keys(ROTULO_DA_SITUACAO) as Situacao[]).map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_DA_SITUACAO[s]}
                    </option>
                  ))}
                </Select>
              </FilterButtonSection>
            )}
            {filtrosAtivos > 0 && (
              <div className="flex justify-end border-t border-border pt-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    close();
                    aplicar({ ...c, filtros: padrao });
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
        )}
      </FilterButton>

      {/* O período aparece sempre: é ele que diz de quando é a tabela. */}
      <EtiquetaDoFiltro
        rotulo="Período"
        valor={textoDoPeriodo(f)}
        aoTirar={periodoMudou ? () => filtrar({ de: padrao.de, ate: padrao.ate }) : undefined}
      />
      {f.tipo !== "ambos" && <EtiquetaDoFiltro rotulo="Tipo" valor={rotuloDoTipo(f.tipo, baixas)} aoTirar={() => filtrar({ tipo: "ambos" })} />}
      {!baixas && f.periodoPor !== "competencia" && (
        <EtiquetaDoFiltro rotulo="Período pela" valor="Data de vencimento" aoTirar={() => filtrar({ periodoPor: "competencia" })} />
      )}
      {!baixas && f.situacao !== "todas" && (
        <EtiquetaDoFiltro rotulo="Situação" valor={ROTULO_DA_SITUACAO[f.situacao]} aoTirar={() => filtrar({ situacao: "todas" })} />
      )}

      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
        {/* O menu de modelos (25/11/2026, funcionalidade-816): os da pessoa,
            os do setor e as visões prontas, que eram o menu inteiro. */}
        <ModelosDaTabela
          modelos={modelos}
          config={c}
          hoje={hoje}
          visaoAberta={visaoAberta}
          aoAbrirVisao={abrirVisao}
          aoAplicarModelo={aplicarModelo}
        />
        <Button href={exportar} download variant="secondary" size="sm" title="A tabela montada, os dados numa Tabela do Excel e os filtros usados.">
          <Download size={14} aria-hidden /> Exportar Excel
        </Button>
      </div>
    </Card>
  );

  const campos = dimensoesDaBase(c.base);
  const procurado = normalizar(busca);
  const camposVisiveis = procurado ? campos.filter((d) => normalizar(DIMENSOES[d].rotulo).includes(procurado)) : campos;
  const linhasCheias = c.linhas.length >= MAXIMO_DE_NIVEIS;

  const listaDeCampos = (
    <section aria-labelledby={`${id}-campos`} className="min-w-0">
      <h2 id={`${id}-campos`} className={TITULO_DA_AREA}>
        Campos
      </h2>
      {campos.length > COM_BUSCA && (
        <CampoDeBusca
          compact
          className="mb-1.5"
          aria-label="Buscar campo"
          placeholder="Buscar campo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      )}
      <ul className="scroll-y flex max-h-64 flex-col gap-0.5 overflow-y-auto overscroll-contain xl:max-h-none">
        {camposVisiveis.map((d) => {
          const rotulo = DIMENSOES[d].rotulo;
          const area = areaDoCampo(c, d);
          const lugar = area === "linhas" ? "nas linhas" : "nas colunas";
          return (
            <li key={d} className="flex min-h-8 items-center gap-2 rounded-md py-0.5 pl-2 pr-1 hover:bg-surface-hover">
              <span className={`min-w-0 flex-1 break-words text-ui ${area ? "font-medium text-fg" : "text-fg-secondary"}`}>{rotulo}</span>
              <Popover
                align="right"
                width={220}
                aria-label={`Onde colocar ${rotulo}`}
                trigger={({ open, toggle }) => (
                  // Um botão só nos dois estados: o foco volta para ele quando
                  // o menu fecha, mesmo que o campo tenha acabado de entrar.
                  <button
                    type="button"
                    data-foco={`campo:${d}`}
                    onClick={toggle}
                    aria-expanded={open}
                    aria-label={area ? `${rotulo} está ${lugar}: mudar de lugar ou tirar` : `Colocar ${rotulo} na tabela`}
                    className={
                      area
                        ? "inline-flex h-7 flex-shrink-0 cursor-pointer items-center gap-1 rounded-md border border-brand/30 bg-brand-subtle px-2 text-micro font-medium text-brand transition-colors hover:border-brand/60"
                        : classeDoIconButton({ size: "sm" })
                    }
                  >
                    {area ? (
                      <>
                        <Check size={12} aria-hidden />
                        {area === "linhas" ? "Linhas" : "Colunas"}
                      </>
                    ) : (
                      <Plus size={14} aria-hidden />
                    )}
                  </button>
                )}
              >
                {({ close }) => (
                  <>
                    <ItemDoMenu
                      icone={area === "linhas" ? <Check /> : <Rows3 />}
                      disabled={!cabeNasLinhas(c, d)}
                      onClick={() => {
                        close();
                        aplicar(colocarNasLinhas(c, d));
                      }}
                    >
                      {area !== "linhas" && linhasCheias ? `Em linhas (máximo de ${MAXIMO_DE_NIVEIS})` : "Em linhas"}
                    </ItemDoMenu>
                    <ItemDoMenu
                      icone={area === "coluna" ? <Check /> : <Columns3 />}
                      disabled={!cabeNaColuna(c, d)}
                      onClick={() => {
                        close();
                        aplicar(colocarNaColuna(c, d));
                      }}
                    >
                      Em colunas
                    </ItemDoMenu>
                    {area && (
                      <ItemDoMenu
                        icone={<X />}
                        disabled={!podeTirar(c, d)}
                        onClick={() => {
                          close();
                          aplicar(tirarDaTabela(c, d));
                        }}
                      >
                        Tirar da tabela
                      </ItemDoMenu>
                    )}
                    {/* O único caso em que o menu não deixa tirar: sem dizer o
                        porquê, a opção apagada parecia defeito. */}
                    {area === "linhas" && c.linhas.length === 1 && (
                      <p className="px-2 pt-1.5 text-fs-2 text-fg-muted">A tabela precisa de um campo nas linhas.</p>
                    )}
                  </>
                )}
              </Popover>
            </li>
          );
        })}
        {camposVisiveis.length === 0 && <li className="px-2 py-1.5 text-fs-2 text-fg-muted">Nada encontrado para “{busca}”.</li>}
      </ul>
    </section>
  );

  const areas = (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-labelledby={`${id}-linhas`}>
        <h2 id={`${id}-linhas`} className={TITULO_DA_AREA}>
          <Rows3 size={12} aria-hidden /> Linhas
        </h2>
        {/* Lista ordenada: a ordem é o nível, e o recuo mostra quem fica dentro de quem. */}
        <ol className="flex flex-col gap-1">
          {c.linhas.map((d, i) => {
            const rotulo = DIMENSOES[d].rotulo;
            return (
              <li key={d} className={`${FICHA} ${RECUO_DO_NIVEL[Math.min(i, RECUO_DO_NIVEL.length - 1)]}`}>
                <span aria-hidden className="mr-1 text-micro tabular-nums text-fg-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-ui font-medium text-fg" title={rotulo}>
                  {rotulo}
                </span>
                {c.linhas.length > 1 && (
                  <>
                    <IconButton
                      size="sm"
                      data-foco={`subir:${d}`}
                      disabled={i === 0}
                      aria-label={`Subir ${rotulo} nas linhas`}
                      onClick={() => aplicar(moverLinha(c, d, -1), [`subir:${d}`, `descer:${d}`])}
                    >
                      <ChevronUp size={14} aria-hidden />
                    </IconButton>
                    <IconButton
                      size="sm"
                      data-foco={`descer:${d}`}
                      disabled={i === c.linhas.length - 1}
                      aria-label={`Descer ${rotulo} nas linhas`}
                      onClick={() => aplicar(moverLinha(c, d, 1), [`descer:${d}`, `subir:${d}`])}
                    >
                      <ChevronDown size={14} aria-hidden />
                    </IconButton>
                  </>
                )}
                <IconButton
                  size="sm"
                  disabled={!podeTirar(c, d)}
                  aria-label={`Tirar ${rotulo} das linhas`}
                  onClick={() => aplicar(tirarDaTabela(c, d), [`campo:${d}`])}
                >
                  <X size={14} aria-hidden />
                </IconButton>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby={`${id}-colunas`}>
        <h2 id={`${id}-colunas`} className={TITULO_DA_AREA}>
          <Columns3 size={12} aria-hidden /> Colunas
        </h2>
        {c.coluna ? (
          <ul>
            <li className={FICHA}>
              <span className="min-w-0 flex-1 truncate text-ui font-medium text-fg" title={DIMENSOES[c.coluna].rotulo}>
                {DIMENSOES[c.coluna].rotulo}
              </span>
              <IconButton
                size="sm"
                aria-label={`Tirar ${DIMENSOES[c.coluna].rotulo} das colunas`}
                onClick={() => aplicar(tirarDaTabela(c, c.coluna!), [`campo:${c.coluna}`])}
              >
                <X size={14} aria-hidden />
              </IconButton>
            </li>
          </ul>
        ) : (
          <p className="flex h-8 items-center rounded-md border border-dashed border-border px-2.5 text-fs-2 text-fg-muted">Nenhum campo: só o total</p>
        )}
      </section>

      <section aria-labelledby={`${id}-valores`}>
        <h2 id={`${id}-valores`} className={TITULO_DA_AREA}>
          <Sigma size={12} aria-hidden /> Valores
        </h2>
        <Select compact aria-labelledby={`${id}-valores`} value={c.medida} onChange={(e) => aplicar({ ...c, medida: e.target.value as Medida })}>
          {medidasDaBase(c.base).map((m) => (
            <option key={m} value={m}>
              {MEDIDAS[m].rotulo}
            </option>
          ))}
        </Select>
      </section>
    </div>
  );

  return (
    <div ref={raizRef}>
      {barra}
      <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="grid gap-4 p-3 sm:grid-cols-2 xl:grid-cols-1">
          {listaDeCampos}
          {areas}
        </Card>
        {/* A tabela de antes fica à vista, esmaecida, até a nova chegar — o
            mesmo sinal das listas do `CascoDaTabela`, junto da barra do topo. */}
        <div aria-busy={pendente || undefined} className={`min-w-0 transition-opacity duration-150 ${pendente ? "opacity-55 delay-100" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
