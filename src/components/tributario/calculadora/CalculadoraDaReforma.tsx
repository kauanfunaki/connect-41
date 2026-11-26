"use client";

// A Calculadora da reforma (19/11/2026, funcionalidade-794): a operação (data
// do fato gerador, UF, município e, de 2027 em diante, as alíquotas), os itens
// e o resultado da calculadora oficial da Receita. A mesma peça serve a equipe
// e o portal do cliente — muda a ação que responde (`consultar`) e a variante,
// que no portal leva os alvos a 44px e o aviso de simulação.
//
// Desenho de 26/11/2026 (melhoria-808, alternativa A escolhida pelo Kauan):
// a operação numa barra de uma linha, os itens numa tabela editável — uma linha
// por item — e o resultado de cada item nas colunas da própria linha. Clicar no
// ▾ da linha abre a memória de cálculo embaixo dela (`DetalheDoItem`). Abaixo
// de `lg` a tabela vira um cartão por item (o mesmo HTML, outra disposição),
// para o portal no celular.
//
// As consultas saem dos próprios eventos (trocar a data, a UF, o município,
// sair do código), e não de efeitos: cada resposta confere se ainda é a da
// última pergunta antes de entrar na tela.

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Calculator, ChevronDown, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoData } from "@/components/ui/CampoData";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { Aviso } from "@/components/ui/Aviso";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { formatarReais } from "@/lib/format";
import { DetalheDoItem, ResumoDoResultado, calculou } from "./ResultadoDaReforma";
import {
  MAXIMO_DE_ITENS,
  NOME_DO_CST,
  ROTULO_DO_ESTADO,
  anoDaData,
  classificacoesDoCodigo,
  classificacoesPorCst,
  dataValida,
  exigeAliquotasNominais,
  itemVazio,
  montarPedido,
  nomeDaUf,
  percentual,
  tipoDoCodigo,
  type AliquotasDeReferencia,
  type AliquotasDigitadas,
  type ClassificacaoParaEscolher,
  type ConsultaDaCalculadora,
  type EntradaDaCalculadora,
  type ItemCalculado,
  type ItemDigitado,
  type MunicipioDaCalculadora,
  type PerguntaDaCalculadora,
  type ProblemaDaEntrada,
  type RespostasDaCalculadora,
  type ResultadoDaCalculadora,
  type RetornoDaCalculadora,
  type UfDaCalculadora,
} from "@/lib/tributario/calculadora/regras";

type Props = {
  consultar: ConsultaDaCalculadora;
  /** AAAA-MM-DD de hoje no escritório: o padrão da data do fato gerador. */
  hoje: string;
  ufs: UfDaCalculadora[];
  classificacoesIniciais: ClassificacaoParaEscolher[];
  /** As de hoje sem UF: só a CBS (União) vem preenchida. */
  referenciasIniciais: AliquotasDeReferencia | null;
  /** "Calculadora oficial da Receita Federal, versão 1.6.1, base de 30/09/2026." */
  fonte: string;
  variante?: "equipe" | "portal";
};

const SEM_CONEXAO = "Não foi possível falar com o Connect. Confira a conexão e tente de novo.";
const ALIQUOTAS_VAZIAS: AliquotasDigitadas = { cbs: "", ibsUf: "", ibsMun: "" };

/** Alíquota de referência no campo: 0.9 → "0,9". */
const noCampo = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

type DescricaoDoCodigo = { texto: string; tom: "neutro" | "atencao" | "perigo" };

const COR_DA_DESCRICAO: Record<DescricaoDoCodigo["tom"], string> = {
  neutro: "text-fg-muted",
  atencao: "text-warning-fg",
  perigo: "font-medium text-danger",
};

/** O item é o mesmo que entrou no cálculo: senão, o resultado da linha é do cálculo anterior. */
function mesmoItem(a: ItemDigitado, b: ItemDigitado): boolean {
  return a.codigo === b.codigo && a.cClassTrib === b.cClassTrib && a.base === b.base && a.quantidade === b.quantidade && a.unidade === b.unidade;
}

/** O nome do campo do item, para a linha de problemas embaixo dele. */
const NOME_DO_CAMPO: Record<string, string> = {
  codigo: "NCM ou NBS",
  cClassTrib: "Classificação",
  base: "Base",
  quantidade: "Quantidade",
  unidade: "Unidade",
};

// A célula na tabela (de `lg` para cima) e no cartão (abaixo): no cartão cada
// célula é um bloco da grade de 12 colunas, com o rótulo visível em cima. O
// recuo lateral vem à parte: 16px na primeira e na última coluna, como a
// tabela padrão (`c41-tabela`), e 6px entre os campos.
const CELULA = "py-2 align-top max-lg:block max-lg:min-w-0 max-lg:p-0";
const MEIO = "px-1.5";
const CELULA_DE_VALOR = `${CELULA} ${MEIO} text-center tabular-nums lg:leading-8`;
// O cabeçalho da tabela padrão: 11px, caixa alta, o azul do cabeçalho.
const CABECALHO = "py-2.5 text-center text-micro font-semibold uppercase tracking-wide text-table-header-fg";
// O rótulo do campo: visível no cartão; na tabela, só para o leitor de tela (o
// cabeçalho da coluna é o rótulo de quem vê).
const ROTULO_DA_CELULA = "c41-rotulo mb-1 block lg:sr-only";

export function CalculadoraDaReforma({ consultar, hoje, ufs, classificacoesIniciais, referenciasIniciais, fonte, variante = "equipe" }: Props) {
  const portal = variante === "portal";
  const base = useId();
  const proximoId = useRef(2);
  const versoes = useRef({ classificacoes: 0, municipios: 0, referencias: 0 });
  // A ação vem por prop e muda de identidade a cada renderização do servidor:
  // as chamadas leem a última pela ref, e ela não entra em dependência nenhuma.
  const consultarRef = useRef(consultar);
  useEffect(() => {
    consultarRef.current = consultar;
  }, [consultar]);

  const [data, setData] = useState(hoje);
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [municipios, setMunicipios] = useState<MunicipioDaCalculadora[]>([]);
  const [carregandoMunicipios, setCarregandoMunicipios] = useState(false);
  const [classificacoes, setClassificacoes] = useState(classificacoesIniciais);
  const [carregandoClassificacoes, setCarregandoClassificacoes] = useState(false);
  const [referencias, setReferencias] = useState<AliquotasDeReferencia | null>(referenciasIniciais);
  const [aliquotas, setAliquotas] = useState<AliquotasDigitadas>(ALIQUOTAS_VAZIAS);
  /** As alíquotas no campo vieram da referência (e não da pessoa): a próxima referência pode trocá-las. */
  const [aliquotasDaReferencia, setAliquotasDaReferencia] = useState(false);
  const [itens, setItens] = useState<ItemDigitado[]>([itemVazio("1")]);
  const [descricoes, setDescricoes] = useState<Record<string, DescricaoDoCodigo>>({});
  /** As linhas com o detalhe aberto. Começam fechadas (regra de 08/10/2026). */
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set());
  const [problemas, setProblemas] = useState<ProblemaDaEntrada[]>([]);
  const [erroGeral, setErroGeral] = useState("");
  const [avisoDaTabela, setAvisoDaTabela] = useState("");
  const [resultado, setResultado] = useState<{ dados: ResultadoDaCalculadora; entrada: EntradaDaCalculadora } | null>(null);
  const [desatualizado, setDesatualizado] = useState(false);
  const [calculando, iniciar] = useTransition();

  const exige = exigeAliquotasNominais(data);
  const ano = anoDaData(data);
  // No portal, todo controle de 32 ou 36px (campo, seletor, data e botão) vai a
  // 44px no celular, para o dedo: uma regra só na raiz, e não uma classe em
  // cada peça (o Select e o CampoData põem a classe no invólucro, não na caixa).
  const alvos = portal ? "max-md:[&_.h-9]:h-11 max-md:[&_.h-8]:h-11" : "";
  // Os campos da barra e da tabela são os enxutos (13px); no celular voltam a
  // 16px, abaixo disso o iOS dá zoom ao focar o campo.
  const semZoomNoCelular = "max-md:[&_input]:text-input max-md:[&_button[role=combobox]]:text-input";

  async function perguntar<K extends PerguntaDaCalculadora["tipo"]>(
    pergunta: Extract<PerguntaDaCalculadora, { tipo: K }>
  ): Promise<RetornoDaCalculadora<RespostasDaCalculadora[K]>> {
    try {
      return (await consultarRef.current(pergunta)) as RetornoDaCalculadora<RespostasDaCalculadora[K]>;
    } catch {
      return { ok: false, mensagem: SEM_CONEXAO };
    }
  }

  function mudou() {
    if (resultado) setDesatualizado(true);
  }

  async function carregarClassificacoes(novaData: string) {
    const versao = ++versoes.current.classificacoes;
    setCarregandoClassificacoes(true);
    const r = await perguntar({ tipo: "classificacoes", data: novaData });
    if (versao !== versoes.current.classificacoes) return;
    setCarregandoClassificacoes(false);
    if (r.ok) {
      setClassificacoes(r.dados);
      setAvisoDaTabela("");
    } else setAvisoDaTabela(r.mensagem);
  }

  async function carregarReferencias(novaData: string, novaUf: string, novoMunicipio: string) {
    const versao = ++versoes.current.referencias;
    const r = await perguntar({ tipo: "referencias", data: novaData, uf: novaUf, municipio: novoMunicipio });
    if (versao !== versoes.current.referencias || !r.ok) return;
    setReferencias(r.dados);
    // De 2027 em diante, a referência preenche as alíquotas — se a pessoa
    // ainda não digitou as dela.
    if (exigeAliquotasNominais(novaData)) {
      const vazias = !aliquotas.cbs && !aliquotas.ibsUf && !aliquotas.ibsMun;
      if (vazias || aliquotasDaReferencia) {
        const temAlguma = r.dados.cbs !== null || r.dados.ibsUf !== null || r.dados.ibsMun !== null;
        setAliquotas(temAlguma ? { cbs: noCampo(r.dados.cbs), ibsUf: noCampo(r.dados.ibsUf), ibsMun: noCampo(r.dados.ibsMun) } : ALIQUOTAS_VAZIAS);
        setAliquotasDaReferencia(temAlguma);
      }
    }
  }

  function trocarData(nova: string) {
    setData(nova);
    mudou();
    tirarProblema(null, "data");
    if (!dataValida(nova) || nova === data) return;
    // A lista de classificações e as alíquotas de referência valem para a data.
    void carregarClassificacoes(nova);
    void carregarReferencias(nova, uf, municipio);
  }

  async function trocarUf(nova: string) {
    setUf(nova);
    setMunicipio("");
    setMunicipios([]);
    mudou();
    tirarProblema(null, "uf");
    if (!nova) return;
    const versao = ++versoes.current.municipios;
    setCarregandoMunicipios(true);
    const r = await perguntar({ tipo: "municipios", uf: nova });
    if (versao !== versoes.current.municipios) return;
    setCarregandoMunicipios(false);
    if (r.ok) setMunicipios(r.dados);
    else setAvisoDaTabela(r.mensagem);
  }

  function trocarMunicipio(novo: string) {
    setMunicipio(novo);
    mudou();
    tirarProblema(null, "municipio");
    if (dataValida(data) && novo) void carregarReferencias(data, uf, novo);
  }

  function trocarAliquota(campo: keyof AliquotasDigitadas, valor: string) {
    setAliquotas((a) => ({ ...a, [campo]: valor }));
    setAliquotasDaReferencia(false);
    mudou();
    tirarProblema(null, `aliquota${campo === "cbs" ? "Cbs" : campo === "ibsUf" ? "IbsUf" : "IbsMun"}`);
  }

  function trocarItem(id: string, parcial: Partial<ItemDigitado>) {
    setItens((lista) =>
      lista.map((it) => {
        if (it.id !== id) return it;
        const novo = { ...it, ...parcial };
        // Código completo de outro tipo: a classificação escolhida pode não
        // servir mais (a de NCM num serviço com NBS) — sai.
        if (parcial.codigo !== undefined && novo.cClassTrib) {
          const servem = classificacoesDoCodigo(classificacoes, novo.codigo);
          if (!servem.some((c) => c.codigo === novo.cClassTrib)) novo.cClassTrib = "";
        }
        return novo;
      })
    );
    mudou();
    const posicao = itens.findIndex((it) => it.id === id) + 1;
    for (const campo of Object.keys(parcial)) tirarProblema(posicao, campo);
  }

  async function descreverCodigo(id: string, codigo: string) {
    if (!tipoDoCodigo(codigo) || !dataValida(data)) {
      setDescricoes((d) => {
        const resto = { ...d };
        delete resto[id];
        return resto;
      });
      return;
    }
    const r = await perguntar({ tipo: "codigo", codigo, data });
    let descricao: DescricaoDoCodigo;
    if (!r.ok) descricao = { texto: r.mensagem, tom: "atencao" };
    else if (!r.dados) descricao = { texto: `Este ${tipoDoCodigo(codigo) === "ncm" ? "NCM" : "NBS"} não está na tabela da Receita para a data.`, tom: "perigo" };
    else
      descricao = {
        texto: r.dados.impostoSeletivo
          ? `${r.dados.descricao}. Tem Imposto Seletivo, que esta tela ainda não calcula.`
          : r.dados.descricao,
        tom: r.dados.impostoSeletivo ? "atencao" : "neutro",
      };
    setDescricoes((d) => ({ ...d, [id]: descricao }));
  }

  const focarCodigo = (id: string) => requestAnimationFrame(() => document.getElementById(`${base}-item-${id}-codigo`)?.focus());

  function adicionarItem() {
    if (itens.length >= MAXIMO_DE_ITENS) return;
    const id = String(proximoId.current++);
    setItens((lista) => [...lista, itemVazio(id)]);
    mudou();
    // O foco vai para o código do item novo, para seguir digitando.
    focarCodigo(id);
  }

  function removerItem(id: string) {
    const posicao = itens.findIndex((it) => it.id === id);
    setItens((lista) => lista.filter((it) => it.id !== id));
    setAbertos((a) => {
      const novo = new Set(a);
      novo.delete(id);
      return novo;
    });
    setProblemas([]);
    mudou();
    const vizinho = itens[posicao + 1] ?? itens[posicao - 1];
    if (vizinho) focarCodigo(vizinho.id);
  }

  function alternarDetalhe(id: string) {
    setAbertos((a) => {
      const novo = new Set(a);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  /** Enter numa linha: o código da linha seguinte, ou uma linha nova no fim — como numa planilha. */
  function irParaAProximaLinha(id: string) {
    const posicao = itens.findIndex((it) => it.id === id);
    const seguinte = itens[posicao + 1];
    if (seguinte) focarCodigo(seguinte.id);
    else adicionarItem();
  }

  function noTeclado(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.defaultPrevented || e.nativeEvent.isComposing) return;
    // Ctrl+Enter calcula de qualquer campo — com 30 itens, o botão ficou lá em cima.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      calcular();
      return;
    }
    // Na barra da operação, o Enter segue enviando (calcula). Nos campos da
    // tabela, passa para a linha seguinte. A lista da classificação trata o
    // Enter dela (e marca o evento) antes de ele chegar aqui.
    const alvo = e.target as HTMLElement;
    const linha = alvo.tagName === "INPUT" ? alvo.closest<HTMLElement>("[data-item]") : null;
    if (!linha?.dataset.item) return;
    e.preventDefault();
    irParaAProximaLinha(linha.dataset.item);
  }

  function tirarProblema(item: number | null, campo: string) {
    setProblemas((p) => (p.some((x) => x.item === item && x.campo === campo) ? p.filter((x) => !(x.item === item && x.campo === campo)) : p));
  }

  const problemaDe = (item: number | null, campo: string) => problemas.find((p) => p.item === item && p.campo === campo)?.mensagem;

  function idDoCampo(p: ProblemaDaEntrada): string {
    if (p.item === null) return `${base}-${p.campo}`;
    const it = itens[p.item - 1];
    return it ? `${base}-item-${it.id}-${p.campo}` : `${base}-itens`;
  }

  function calcular() {
    if (calculando) return;
    const entrada: EntradaDaCalculadora = { data, uf, municipio, itens, aliquotas: exige ? aliquotas : null };
    setErroGeral("");
    const conferido = montarPedido(entrada, "conferencia");
    if (!conferido.ok) {
      setProblemas(conferido.problemas);
      requestAnimationFrame(() => document.getElementById(idDoCampo(conferido.problemas[0]))?.focus());
      return;
    }
    setProblemas([]);
    iniciar(async () => {
      const r = await perguntar({ tipo: "calcular", entrada });
      if (!r.ok) {
        if (r.problemas?.length) setProblemas(r.problemas);
        setErroGeral(r.mensagem);
        return;
      }
      setResultado({ dados: r.dados, entrada });
      setDesatualizado(false);
    });
  }

  // O resultado de cada linha, pelo id do item: as linhas podem ter mudado de
  // posição (uma removida, outra nova) depois do cálculo.
  const resultadoDoItem = new Map<string, { calculado: ItemCalculado; digitado: ItemDigitado }>();
  if (resultado) {
    for (const calculado of resultado.dados.itens) {
      const digitado = resultado.entrada.itens[calculado.numero - 1];
      if (digitado) resultadoDoItem.set(digitado.id, { calculado, digitado });
    }
  }
  const operacaoMudou =
    resultado !== null &&
    (resultado.entrada.data !== data ||
      resultado.entrada.uf !== uf ||
      resultado.entrada.municipio !== municipio ||
      (exige && JSON.stringify(resultado.entrada.aliquotas) !== JSON.stringify(aliquotas)));
  const temImpostoSeletivo = resultado?.dados.itens.some((i) => i.impostoSeletivo) ?? false;
  const colunas = 11 + (temImpostoSeletivo ? 1 : 0);

  const referenciaTexto = [
    referencias?.cbs !== null && referencias?.cbs !== undefined ? `CBS ${percentual(referencias.cbs, "duasCasas")}` : null,
    referencias?.ibsUf !== null && referencias?.ibsUf !== undefined ? `IBS estadual ${percentual(referencias.ibsUf, "duasCasas")}` : null,
    referencias?.ibsMun !== null && referencias?.ibsMun !== undefined ? `IBS municipal ${percentual(referencias.ibsMun, "duasCasas")}` : null,
  ].filter((t): t is string => t !== null);
  const semReferencia = exige && referencias !== null && referencias.cbs === null && referencias.ibsUf === null && referencias.ibsMun === null;
  const problemasDaOperacao = problemas.filter((p) => p.item === null && p.campo !== "itens");
  const totalDeProblemas = problemas.length;
  const paraCorrigir = resultado ? resultado.dados.comProblema : 0;
  const linhasComProblema = new Set(problemas.filter((p) => p.item !== null).map((p) => p.item));

  return (
    <div className={`flex flex-col gap-4 ${alvos} ${semZoomNoCelular}`.trim()}>
      {portal && (
        <Aviso tom="info">
          Esta é uma simulação feita com a calculadora oficial da Receita Federal. Ela não substitui a orientação da equipe do escritório: antes de mudar
          preço, nota ou contrato, fale com a equipe.
        </Aviso>
      )}

      <form
        noValidate
        aria-label="Calculadora da reforma"
        onSubmit={(e) => {
          e.preventDefault();
          calcular();
        }}
        onKeyDown={noTeclado}
        className="flex flex-col gap-4"
      >
        {/* A operação numa barra de uma linha (quebra em telas estreitas). */}
        <Card as="section" aria-labelledby={`${base}-operacao`} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id={`${base}-operacao`} className="c41-rotulo w-full sm:w-auto">
              Operação
            </h2>
            <CampoData
              compact
              id={`${base}-data`}
              aria-label="Data do fato gerador"
              title="Data do fato gerador"
              value={data}
              onChange={trocarData}
              error={!!problemaDe(null, "data")}
              className="w-full sm:w-36"
            />
            <Select
              compact
              id={`${base}-uf`}
              aria-label="UF"
              value={uf}
              onChange={(e) => void trocarUf(e.target.value)}
              error={!!problemaDe(null, "uf")}
              aria-describedby={problemasDaOperacao.length ? `${base}-problemas-da-operacao` : undefined}
              className="w-full sm:w-52"
            >
              <option value="">Escolha a UF</option>
              {ufs.map((u) => (
                <option key={u.sigla} value={u.sigla}>
                  {u.sigla} · {nomeDaUf(u.nome)}
                </option>
              ))}
            </Select>
            <Select
              compact
              busca
              id={`${base}-municipio`}
              aria-label="Município"
              title={!uf ? "Escolha a UF primeiro." : undefined}
              value={municipio}
              onChange={(e) => trocarMunicipio(e.target.value)}
              disabled={!uf || carregandoMunicipios}
              error={!!problemaDe(null, "municipio")}
              aria-describedby={problemasDaOperacao.length ? `${base}-problemas-da-operacao` : undefined}
              className="w-full sm:w-60"
            >
              <option value="">{!uf ? "Município (escolha a UF)" : carregandoMunicipios ? "Carregando…" : "Escolha o município"}</option>
              {municipios.map((m) => (
                <option key={m.codigo} value={String(m.codigo)}>
                  {m.nome} ({m.codigo})
                </option>
              ))}
            </Select>
            <span aria-hidden className="hidden h-5 w-px bg-border lg:block" />
            {exige ? (
              <fieldset className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <legend className="sr-only">Alíquotas nominais de {ano}</legend>
                <span aria-hidden className="text-ui text-fg-secondary">
                  Alíquotas de {ano}:
                </span>
                {(
                  [
                    ["cbs", "aliquotaCbs", "CBS", "CBS"],
                    ["ibsUf", "aliquotaIbsUf", "IBS UF", "IBS estadual"],
                    ["ibsMun", "aliquotaIbsMun", "IBS mun.", "IBS municipal"],
                  ] as const
                ).map(([campo, chave, curto, rotulo]) => (
                  <span key={campo} className="flex items-center gap-1.5">
                    <label htmlFor={`${base}-${chave}`} className="text-ui text-fg-secondary" title={rotulo}>
                      <span aria-hidden>{curto}</span>
                      <span className="sr-only">{rotulo}</span>
                    </label>
                    <Input
                      compact
                      id={`${base}-${chave}`}
                      inputMode="decimal"
                      autoComplete="off"
                      suffix="%"
                      placeholder="0,00"
                      value={aliquotas[campo]}
                      onChange={(e) => trocarAliquota(campo, e.target.value)}
                      error={!!problemaDe(null, chave)}
                      aria-invalid={!!problemaDe(null, chave) || undefined}
                      aria-describedby={problemasDaOperacao.length ? `${base}-problemas-da-operacao` : undefined}
                      className="w-24"
                    />
                  </span>
                ))}
              </fieldset>
            ) : (
              dataValida(data) &&
              referenciaTexto.length > 0 && (
                <p className="min-w-0 flex-1 text-ui text-fg-secondary">
                  Alíquotas da Receita para a data:{" "}
                  {referenciaTexto.map((t, i) => (
                    <span key={t}>
                      {i > 0 && " · "}
                      <b className="font-semibold tabular-nums text-fg">{t}</b>
                    </span>
                  ))}
                  {!municipio && <span className="text-fg-muted">. Escolha UF e município para ver as do IBS.</span>}
                </p>
              )
            )}
            <Button type="submit" loading={calculando} loadingLabel="Calculando…" className="w-full sm:ml-auto sm:w-auto sm:min-w-32">
              <Calculator size={16} aria-hidden /> Calcular
            </Button>
          </div>

          {exige &&
            (semReferencia ? (
              <Aviso tom="atencao">
                A Receita ainda não publicou as alíquotas de referência de {ano}. Informe as alíquotas que quer simular: o resultado sai como simulado.
              </Aviso>
            ) : (
              aliquotasDaReferencia && <p className="text-helper text-fg-muted">Alíquotas preenchidas com as de referência da Receita para a data. Você pode mudar.</p>
            ))}

          {problemasDaOperacao.length > 0 && (
            <p id={`${base}-problemas-da-operacao`} className="text-helper font-medium text-danger">
              {problemasDaOperacao.map((p) => p.mensagem).join(" ")}
            </p>
          )}
        </Card>

        {totalDeProblemas > 0 && (
          <p className="text-helper font-medium text-danger" role="status">
            {totalDeProblemas === 1 ? "Confira o campo marcado." : `Confira os ${totalDeProblemas} campos marcados.`}
          </p>
        )}
        {erroGeral && totalDeProblemas === 0 && <Aviso>{erroGeral}</Aviso>}

        {resultado && <ResumoDoResultado resultado={resultado.dados} data={resultado.entrada.data} desatualizado={desatualizado} variante={variante} />}

        <Card as="section" aria-labelledby={`${base}-itens`} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
            <h2 id={`${base}-itens`} tabIndex={-1} className="text-card-title font-semibold text-fg outline-none">
              Itens
            </h2>
            <span className="text-ui text-fg-muted tabular-nums">
              {itens.length} de até {MAXIMO_DE_ITENS}
            </span>
            <span role="status" className="text-ui text-fg-muted">
              {calculando
                ? "Calculando…"
                : resultado && resultado.dados.itens.length > 0
                  ? `· ${resultado.dados.calculados} ${resultado.dados.calculados === 1 ? "calculado" : "calculados"}${paraCorrigir ? ` · ${paraCorrigir} para corrigir` : ""}`
                  : ""}
            </span>
            <span className="ml-auto hidden text-micro text-fg-muted lg:inline">Tab passa de campo · Enter abre a próxima linha · Ctrl+Enter calcula</span>
          </div>

          {(problemaDe(null, "itens") || avisoDaTabela) && (
            <div className="flex flex-col gap-2 px-4 pt-3">
              {problemaDe(null, "itens") && <Aviso>{problemaDe(null, "itens")}</Aviso>}
              {avisoDaTabela && <Aviso tom="atencao">{avisoDaTabela}</Aviso>}
            </div>
          )}

          <div className="lg:overflow-x-auto">
            <table className="w-full text-ui max-lg:block lg:min-w-[64rem] lg:table-fixed" aria-busy={calculando || undefined}>
              <caption className="sr-only">Itens da operação{resultado ? ", com o resultado de cada um" : ""}</caption>
              <colgroup>
                <col className="w-8" />
                <col className="w-32" />
                <col />
                <col className="w-30" />
                <col className="w-16" />
                <col className="w-15" />
                <col className="w-22" />
                <col className="w-22" />
                {temImpostoSeletivo && <col className="w-22" />}
                <col className="w-24" />
                <col className="w-26" />
                <col className="w-16" />
              </colgroup>
              <thead className="bg-table-header-bg max-lg:hidden">
                <tr>
                  <th scope="col" className={`${CABECALHO} pl-4 pr-1.5`}>
                    #
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    NCM ou NBS
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    Classificação
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    Base
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    <abbr title="Quantidade" className="no-underline">
                      Qtd
                    </abbr>
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    <abbr title="Unidade" className="no-underline">
                      Un
                    </abbr>
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    CBS
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    IBS
                  </th>
                  {temImpostoSeletivo && (
                    <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                      <abbr title="Imposto Seletivo" className="no-underline">
                        IS
                      </abbr>
                    </th>
                  )}
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    Total
                  </th>
                  <th scope="col" className={`${CABECALHO} ${MEIO}`}>
                    Situação
                  </th>
                  <th scope="col" className={`${CABECALHO} pl-1.5 pr-4`}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              {itens.map((it, i) => {
                const doCalculo = resultadoDoItem.get(it.id) ?? null;
                return (
                  <LinhaDoItem
                    key={it.id}
                    idBase={`${base}-item-${it.id}`}
                    numero={i + 1}
                    item={it}
                    classificacoes={classificacoes}
                    carregandoClassificacoes={carregandoClassificacoes}
                    descricao={descricoes[it.id] ?? null}
                    problemas={problemas.filter((p) => p.item === i + 1)}
                    comProblema={linhasComProblema.has(i + 1)}
                    calculado={doCalculo?.calculado ?? null}
                    mudouDepois={doCalculo !== null && (operacaoMudou || !mesmoItem(doCalculo.digitado, it))}
                    temCalculo={resultado !== null}
                    temImpostoSeletivo={temImpostoSeletivo}
                    colunas={colunas}
                    aberto={abertos.has(it.id)}
                    podeRemover={itens.length > 1}
                    calculando={calculando}
                    portal={portal}
                    onChange={(parcial) => trocarItem(it.id, parcial)}
                    onSairDoCodigo={() => void descreverCodigo(it.id, it.codigo)}
                    onAlternarDetalhe={() => alternarDetalhe(it.id)}
                    onRemover={() => removerItem(it.id)}
                  />
                );
              })}
              {resultado && resultado.dados.itens.length > 0 && (
                <tfoot className="border-t border-border-strong bg-surface-hover/50 font-semibold max-lg:hidden">
                  <tr>
                    <td />
                    <td colSpan={2} className="px-1.5 py-2.5 text-left text-fg">
                      Total {resultado.dados.calculados === 1 ? "do item calculado" : `dos ${resultado.dados.calculados} calculados`}
                    </td>
                    <td className="px-1.5 py-2.5 text-center tabular-nums">{formatarReais(resultado.dados.totais.base)}</td>
                    <td />
                    <td />
                    <td className="px-1.5 py-2.5 text-center tabular-nums">{formatarReais(resultado.dados.totais.cbs)}</td>
                    <td className="px-1.5 py-2.5 text-center tabular-nums">{formatarReais(resultado.dados.totais.ibs)}</td>
                    {temImpostoSeletivo && <td className="px-1.5 py-2.5 text-center tabular-nums">{formatarReais(resultado.dados.totais.impostoSeletivo)}</td>}
                    <td className="px-1.5 py-2.5 text-center tabular-nums text-brand">{formatarReais(resultado.dados.totais.total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5">
            <Button type="button" variant="secondary" size="sm" onClick={adicionarItem} disabled={itens.length >= MAXIMO_DE_ITENS}>
              <Plus size={14} aria-hidden /> Adicionar item
            </Button>
            <p className="min-w-0 flex-1 text-ui text-fg-muted">
              {itens.length >= MAXIMO_DE_ITENS
                ? `Até ${MAXIMO_DE_ITENS} itens por cálculo: para mais, divida em duas contas.`
                : !resultado
                  ? "Preencha os itens e clique em “Calcular”: o resultado de cada um aparece na própria linha."
                  : "Clique no ▾ da linha para ver a memória de cálculo do item."}
              {portal && " Se não souber qual classificação escolher, pergunte à equipe do escritório."}
            </p>
          </div>
        </Card>

        <NotaDeFonte className="mt-0" icone={<Info size={12} aria-hidden />}>
          {fonte}
          {resultado && resultado.dados.itens.length > 0 ? " Os totais somam só os itens calculados." : ""}
        </NotaDeFonte>
      </form>
    </div>
  );
}

function LinhaDoItem({
  idBase,
  numero,
  item,
  classificacoes,
  carregandoClassificacoes,
  descricao,
  problemas,
  comProblema,
  calculado,
  mudouDepois,
  temCalculo,
  temImpostoSeletivo,
  colunas,
  aberto,
  podeRemover,
  calculando,
  portal,
  onChange,
  onSairDoCodigo,
  onAlternarDetalhe,
  onRemover,
}: {
  idBase: string;
  numero: number;
  item: ItemDigitado;
  classificacoes: ClassificacaoParaEscolher[];
  carregandoClassificacoes: boolean;
  descricao: DescricaoDoCodigo | null;
  /** Os problemas da conferência neste item, campo a campo. */
  problemas: ProblemaDaEntrada[];
  comProblema: boolean;
  /** O resultado do item no último cálculo, se ele entrou nele. */
  calculado: ItemCalculado | null;
  mudouDepois: boolean;
  /** Já houve um cálculo: as colunas de resultado aparecem também no cartão. */
  temCalculo: boolean;
  temImpostoSeletivo: boolean;
  colunas: number;
  aberto: boolean;
  podeRemover: boolean;
  calculando: boolean;
  portal: boolean;
  onChange: (parcial: Partial<ItemDigitado>) => void;
  onSairDoCodigo: () => void;
  onAlternarDetalhe: () => void;
  onRemover: () => void;
}) {
  const opcoes = classificacoesDoCodigo(classificacoes, item.codigo);
  const escolhida = classificacoes.find((c) => c.codigo === item.cClassTrib) ?? null;
  const tipo = tipoDoCodigo(item.codigo);
  const problemaDe = (campo: string) => problemas.some((p) => p.campo === campo);
  const idDosProblemas = `${idBase}-problemas`;
  const idDoDetalhe = `${idBase}-detalhe`;
  const descritoPor = problemas.length ? idDosProblemas : undefined;
  const fezConta = calculado ? calculou(calculado) : false;
  const estado = calculado ? ROTULO_DO_ESTADO[calculado.estado] : null;
  // O erro da Receita na linha, embaixo da classificação; o texto inteiro fica no detalhe.
  // "Sem cálculo da Receita" não é erro de quem digitou: vai em cinza, sem marcar a linha.
  const erroNaLinha =
    calculado && estado && !fezConta && !mudouDepois ? { texto: calculado.erros[0]?.titulo ?? estado.explicacao, perigo: estado.tom === "perigo" } : null;
  const marcada = comProblema || erroNaLinha?.perigo === true;

  // O que vai embaixo do código: a descrição da Receita; sem ela, o tipo.
  const sobCodigo = descricao
    ? { texto: descricao.texto, classe: COR_DA_DESCRICAO[descricao.tom] }
    : tipo
      ? { texto: tipo === "ncm" ? "NCM: produto." : "NBS: serviço.", classe: "text-fg-muted" }
      : null;
  const sobClassificacao = erroNaLinha
    ? { texto: erroNaLinha.texto, classe: erroNaLinha.perigo ? "font-medium text-danger" : "text-fg-muted" }
    : escolhida
      ? { texto: escolhida.tratamento || NOME_DO_CST[escolhida.cst] || `CST ${escolhida.cst}`, classe: "text-fg-muted" }
      : carregandoClassificacoes
        ? { texto: "Atualizando a lista para a data…", classe: "text-fg-muted" }
        : null;

  const valor = (v: number | null | undefined) => (calculado && fezConta ? formatarReais(v) : "—");
  const corDoValor = mudouDepois || calculando ? "text-fg-muted" : "text-fg";
  // No cartão, as colunas de resultado só aparecem depois do primeiro cálculo.
  const celulaDeResultado = `${CELULA_DE_VALOR} ${temCalculo ? (temImpostoSeletivo ? "max-lg:col-span-3" : "max-lg:col-span-4") : "max-lg:hidden"}`;
  const alvoDoBotao = portal ? "max-md:h-11 max-md:w-11" : "";

  return (
    <tbody
      className={`border-t border-border max-lg:mx-3 max-lg:my-3 max-lg:block max-lg:overflow-hidden max-lg:rounded-lg max-lg:border ${
        marcada ? "bg-danger/5" : aberto ? "lg:bg-surface-hover/40" : ""
      }`}
    >
      <tr data-item={item.id} className="max-lg:grid max-lg:grid-cols-12 max-lg:gap-x-3 max-lg:gap-y-2.5 max-lg:p-3">
        <td className={`${CELULA} pl-4 pr-1.5 text-center tabular-nums text-fg-muted lg:leading-8 max-lg:order-first max-lg:col-span-5 max-lg:text-left max-lg:font-semibold max-lg:text-fg`}>
          <span className="lg:hidden">Item </span>
          {numero}
        </td>

        <td className={`${CELULA} ${MEIO} max-lg:col-span-12`}>
          <label htmlFor={`${idBase}-codigo`} className={ROTULO_DA_CELULA}>
            NCM ou NBS<span className="sr-only"> do item {numero}</span>
          </label>
          <Input
            compact
            id={`${idBase}-codigo`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="1006.30.21"
            title={portal ? "O código do produto (NCM) ou do serviço (NBS), como na nota." : "8 dígitos para NCM, 9 para NBS."}
            value={item.codigo}
            onChange={(e) => onChange({ codigo: e.target.value })}
            onBlur={onSairDoCodigo}
            error={problemaDe("codigo")}
            aria-invalid={problemaDe("codigo") || undefined}
            aria-describedby={descritoPor}
          />
          {sobCodigo && (
            <p className={`mt-1 text-micro lg:truncate ${sobCodigo.classe}`} title={sobCodigo.texto} aria-live="polite">
              {sobCodigo.texto}
            </p>
          )}
        </td>

        <td className={`${CELULA} ${MEIO} max-lg:col-span-12`}>
          <label htmlFor={`${idBase}-cClassTrib`} className={ROTULO_DA_CELULA}>
            {portal ? "Classificação tributária" : "Classificação (cClassTrib)"}
            <span className="sr-only"> do item {numero}</span>
          </label>
          <Select
            compact
            busca
            id={`${idBase}-cClassTrib`}
            title={escolhida ? `${escolhida.codigo} ${escolhida.descricao}` : undefined}
            value={item.cClassTrib}
            onChange={(e) => onChange({ cClassTrib: e.target.value })}
            error={problemaDe("cClassTrib")}
            aria-describedby={descritoPor}
          >
            <option value="">Escolha a classificação</option>
            {classificacoesPorCst(opcoes).map((g) => (
              <optgroup key={g.cst} label={g.rotulo}>
                {g.itens.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} {c.descricao}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          {sobClassificacao && (
            <p className={`mt-1 text-micro lg:truncate ${sobClassificacao.classe}`} title={sobClassificacao.texto}>
              {sobClassificacao.texto}
            </p>
          )}
        </td>

        <td className={`${CELULA} ${MEIO} max-lg:col-span-5`}>
          <label htmlFor={`${idBase}-base`} className={ROTULO_DA_CELULA}>
            Base de cálculo<span className="sr-only"> do item {numero}</span>
          </label>
          <Input
            compact
            id={`${idBase}-base`}
            inputMode="decimal"
            autoComplete="off"
            prefix="R$"
            placeholder="0,00"
            value={item.base}
            onChange={(e) => onChange({ base: e.target.value })}
            error={problemaDe("base")}
            aria-invalid={problemaDe("base") || undefined}
            aria-describedby={descritoPor}
          />
        </td>

        <td className={`${CELULA} ${MEIO} max-lg:col-span-4`}>
          <label htmlFor={`${idBase}-quantidade`} className={ROTULO_DA_CELULA}>
            Quantidade<span className="sr-only"> do item {numero}</span>
          </label>
          <Input
            compact
            id={`${idBase}-quantidade`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Opcional"
            value={item.quantidade}
            onChange={(e) => onChange({ quantidade: e.target.value })}
            error={problemaDe("quantidade")}
            aria-invalid={problemaDe("quantidade") || undefined}
            aria-describedby={descritoPor}
            className="text-center max-lg:text-left"
          />
        </td>

        <td className={`${CELULA} ${MEIO} max-lg:col-span-3`}>
          <label htmlFor={`${idBase}-unidade`} className={ROTULO_DA_CELULA}>
            Unidade<span className="sr-only"> do item {numero}</span>
          </label>
          <Input
            compact
            id={`${idBase}-unidade`}
            autoComplete="off"
            placeholder="UN"
            maxLength={6}
            value={item.unidade}
            onChange={(e) => onChange({ unidade: e.target.value.toUpperCase() })}
            error={problemaDe("unidade")}
            aria-invalid={problemaDe("unidade") || undefined}
            aria-describedby={descritoPor}
            className="text-center max-lg:text-left"
          />
        </td>

        <td className={`${celulaDeResultado} ${corDoValor}`}>
          <span className={ROTULO_DA_CELULA}>CBS</span>
          {valor(calculado?.cbs?.valor)}
        </td>
        <td className={`${celulaDeResultado} ${corDoValor}`}>
          <span className={ROTULO_DA_CELULA}>IBS</span>
          {valor(calculado?.ibs)}
        </td>
        {temImpostoSeletivo && (
          <td className={`${celulaDeResultado} ${corDoValor}`}>
            <span className={ROTULO_DA_CELULA}>Imposto Seletivo</span>
            {valor(calculado?.impostoSeletivo?.valor)}
          </td>
        )}
        <td className={`${celulaDeResultado} font-semibold ${corDoValor}`}>
          <span className={ROTULO_DA_CELULA}>Total</span>
          {valor(calculado?.total)}
        </td>

        <td className={`${CELULA} ${MEIO} text-center lg:leading-8 max-lg:order-first max-lg:col-span-4 max-lg:flex max-lg:items-center max-lg:justify-end`}>
          <span className="sr-only lg:hidden">Situação: </span>
          {comProblema ? (
            <Selo tom="perigo">Corrigir</Selo>
          ) : calculado && mudouDepois ? (
            <span title="O item ou a operação mudou depois do cálculo.">
              <Selo tom="neutro">Recalcular</Selo>
            </span>
          ) : calculado && estado ? (
            <span title={estado.rotulo === estado.curto ? estado.explicacao : `${estado.rotulo}. ${estado.explicacao}`}>
              <Selo tom={estado.tom}>{estado.curto}</Selo>
            </span>
          ) : (
            <span className="text-fg-muted max-lg:hidden" aria-label="Ainda não calculado">
              —
            </span>
          )}
        </td>

        <td className={`${CELULA} pl-1.5 pr-4 max-lg:order-first max-lg:col-span-3`}>
          <div className="flex items-center justify-end gap-1 lg:justify-center">
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              onClick={onAlternarDetalhe}
              aria-expanded={aberto}
              aria-controls={aberto ? idDoDetalhe : undefined}
              aria-label={aberto ? `Fechar o detalhe do item ${numero}` : `Ver o detalhe e a memória de cálculo do item ${numero}`}
              title={aberto ? "Fechar o detalhe" : "Ver o detalhe e a memória de cálculo"}
              className={alvoDoBotao}
            >
              <ChevronDown size={16} aria-hidden className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
            </IconButton>
            {podeRemover && (
              <IconButton
                type="button"
                size="sm"
                variant="ghost"
                onClick={onRemover}
                aria-label={`Remover o item ${numero}`}
                title="Remover item"
                className={alvoDoBotao}
              >
                <Trash2 size={15} aria-hidden />
              </IconButton>
            )}
          </div>
        </td>
      </tr>

      {problemas.length > 0 && (
        <tr className="max-lg:block">
          <td colSpan={colunas} className="px-4 pb-2.5 max-lg:block max-lg:px-3 max-lg:pb-3">
            <p id={idDosProblemas} className="text-helper font-medium text-danger">
              {problemas.map((p) => `${NOME_DO_CAMPO[p.campo] ?? p.campo}: ${p.mensagem}`).join(" · ")}
            </p>
          </td>
        </tr>
      )}

      {aberto && (
        <tr id={idDoDetalhe} className="max-lg:block">
          <td colSpan={colunas} className="border-t border-border bg-surface-hover/40 px-4 py-3 max-lg:block max-lg:px-3">
            <DetalheDoItem
              numero={numero}
              digitado={item}
              classificacao={escolhida}
              descricaoDoCodigo={descricao && descricao.tom !== "perigo" ? descricao.texto : null}
              item={calculado}
              mudouDepois={mudouDepois}
              variante={portal ? "portal" : "equipe"}
            />
          </td>
        </tr>
      )}
    </tbody>
  );
}
