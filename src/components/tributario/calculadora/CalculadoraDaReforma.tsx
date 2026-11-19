"use client";

// A Calculadora da reforma (19/11/2026, funcionalidade-794): a operação (data
// do fato gerador, UF, município e, de 2027 em diante, as alíquotas), os itens
// e o resultado da calculadora oficial da Receita. A mesma peça serve a equipe
// e o portal do cliente — muda a ação que responde (`consultar`) e a variante,
// que no portal leva os alvos a 44px e o aviso de simulação.
//
// As consultas saem dos próprios eventos (trocar a data, a UF, o município,
// sair do código), e não de efeitos: cada resposta confere se ainda é a da
// última pergunta antes de entrar na tela.

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Aviso } from "@/components/ui/Aviso";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { ResultadoDaReforma } from "./ResultadoDaReforma";
import {
  MAXIMO_DE_ITENS,
  anoDaData,
  classificacoesDoCodigo,
  classificacoesPorCst,
  dataValida,
  exigeAliquotasNominais,
  itemVazio,
  montarPedido,
  percentual,
  resumoDaClassificacao,
  tipoDoCodigo,
  type AliquotasDeReferencia,
  type AliquotasDigitadas,
  type ClassificacaoParaEscolher,
  type ConsultaDaCalculadora,
  type EntradaDaCalculadora,
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
  const [problemas, setProblemas] = useState<ProblemaDaEntrada[]>([]);
  const [erroGeral, setErroGeral] = useState("");
  const [avisoDaTabela, setAvisoDaTabela] = useState("");
  const [resultado, setResultado] = useState<{ dados: ResultadoDaCalculadora; entrada: EntradaDaCalculadora } | null>(null);
  const [desatualizado, setDesatualizado] = useState(false);
  const [calculando, iniciar] = useTransition();
  const resultadoRef = useRef<HTMLElement>(null);

  const exige = exigeAliquotasNominais(data);
  const ano = anoDaData(data);
  // No portal, todo controle de 36px (campo, seletor, data e botão) vai a 44px
  // no celular, para o dedo: uma regra só na raiz, e não uma classe em cada peça
  // (o Select e o CampoData põem a classe no invólucro, não na caixa).
  const alvos = portal ? "max-md:[&_.h-9]:h-11" : "";

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

  function adicionarItem() {
    if (itens.length >= MAXIMO_DE_ITENS) return;
    const id = String(proximoId.current++);
    setItens((lista) => [...lista, itemVazio(id)]);
    mudou();
    // O foco vai para o código do item novo, para seguir digitando.
    requestAnimationFrame(() => document.getElementById(`${base}-item-${id}-codigo`)?.focus());
  }

  function removerItem(id: string) {
    const posicao = itens.findIndex((it) => it.id === id);
    setItens((lista) => lista.filter((it) => it.id !== id));
    setProblemas([]);
    mudou();
    const vizinho = itens[posicao + 1] ?? itens[posicao - 1];
    if (vizinho) requestAnimationFrame(() => document.getElementById(`${base}-item-${vizinho.id}-codigo`)?.focus());
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
      requestAnimationFrame(() => resultadoRef.current?.focus());
    });
  }

  const referenciaTexto = [
    referencias?.cbs !== null && referencias?.cbs !== undefined ? `CBS ${percentual(referencias.cbs)}` : null,
    referencias?.ibsUf !== null && referencias?.ibsUf !== undefined ? `IBS estadual ${percentual(referencias.ibsUf)}` : null,
    referencias?.ibsMun !== null && referencias?.ibsMun !== undefined ? `IBS municipal ${percentual(referencias.ibsMun)}` : null,
  ].filter(Boolean);
  const semReferencia = exige && referencias !== null && referencias.cbs === null && referencias.ibsUf === null && referencias.ibsMun === null;
  const totalDeProblemas = problemas.length;

  return (
    <div className={`flex flex-col gap-5 ${alvos}`.trim()}>
      {portal && (
        <Aviso tom="info">
          Esta é uma simulação feita com a calculadora oficial da Receita Federal. Ela não substitui a orientação da equipe do escritório: antes de mudar
          preço, nota ou contrato, fale com a equipe.
        </Aviso>
      )}

      <form
        noValidate
        aria-label="Dados da operação"
        onSubmit={(e) => {
          e.preventDefault();
          calcular();
        }}
        className="flex flex-col gap-5"
      >
        <Card as="section" className="p-4 sm:p-5" aria-labelledby={`${base}-operacao`}>
          <h2 id={`${base}-operacao`} className="mb-4 text-section font-semibold text-fg">
            Operação
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,14rem)_minmax(0,1fr)]">
            <CampoForm label="Data do fato gerador" htmlFor={`${base}-data`} required error={problemaDe(null, "data")}>
              <CampoData id={`${base}-data`} value={data} onChange={trocarData} error={!!problemaDe(null, "data")} />
            </CampoForm>
            <CampoForm label="UF" htmlFor={`${base}-uf`} required error={problemaDe(null, "uf")}>
              <Select id={`${base}-uf`} value={uf} onChange={(e) => void trocarUf(e.target.value)} error={!!problemaDe(null, "uf")}>
                <option value="">Escolha a UF</option>
                {ufs.map((u) => (
                  <option key={u.sigla} value={u.sigla}>
                    {u.sigla} — {u.nome.charAt(0)}
                    {u.nome.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm
              label="Município"
              htmlFor={`${base}-municipio`}
              required
              error={problemaDe(null, "municipio")}
              helper={!uf ? "Escolha a UF primeiro." : carregandoMunicipios ? "Carregando os municípios…" : undefined}
            >
              <Select
                id={`${base}-municipio`}
                value={municipio}
                onChange={(e) => trocarMunicipio(e.target.value)}
                disabled={!uf || carregandoMunicipios}
                busca
                error={!!problemaDe(null, "municipio")}
               
              >
                <option value="">{carregandoMunicipios ? "Carregando…" : "Escolha o município"}</option>
                {municipios.map((m) => (
                  <option key={m.codigo} value={String(m.codigo)}>
                    {m.nome} ({m.codigo})
                  </option>
                ))}
              </Select>
            </CampoForm>
          </div>

          {exige ? (
            <fieldset className="mt-5 border-t border-border pt-4">
              <legend className="sr-only">Alíquotas nominais</legend>
              <p className="mb-3 text-label font-medium text-fg">Alíquotas nominais de {ano}</p>
              {semReferencia ? (
                <Aviso tom="atencao" className="mb-3">
                  A Receita ainda não publicou as alíquotas de referência de {ano}. Informe as alíquotas que quer simular: o resultado sai como simulado.
                </Aviso>
              ) : (
                aliquotasDaReferencia && (
                  <p className="mb-3 text-helper text-fg-muted">Preenchidas com as alíquotas de referência da Receita para a data. Você pode mudar.</p>
                )
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(
                  [
                    ["cbs", "aliquotaCbs", "CBS"],
                    ["ibsUf", "aliquotaIbsUf", "IBS estadual"],
                    ["ibsMun", "aliquotaIbsMun", "IBS municipal"],
                  ] as const
                ).map(([campo, chave, rotulo]) => (
                  <CampoForm key={campo} label={rotulo} htmlFor={`${base}-${chave}`} required error={problemaDe(null, chave)}>
                    <Input
                      id={`${base}-${chave}`}
                      inputMode="decimal"
                      autoComplete="off"
                      suffix="%"
                      placeholder="0,00"
                      value={aliquotas[campo]}
                      onChange={(e) => trocarAliquota(campo, e.target.value)}
                      error={!!problemaDe(null, chave)}
                     
                    />
                  </CampoForm>
                ))}
              </div>
            </fieldset>
          ) : (
            dataValida(data) &&
            referenciaTexto.length > 0 && (
              <NotaDeFonte className="mt-4">
                Até 31/12/2026 a calculadora usa as alíquotas que a Receita publicou para a data: {referenciaTexto.join(", ")}
                {!municipio ? ". Escolha UF e município para ver as do IBS." : "."}
              </NotaDeFonte>
            )
          )}
        </Card>

        <Card as="section" className="p-4 sm:p-5" aria-labelledby={`${base}-itens`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id={`${base}-itens`} tabIndex={-1} className="text-section font-semibold text-fg">
              Itens
            </h2>
            <span className="text-ui text-fg-muted tabular-nums">
              {itens.length} de até {MAXIMO_DE_ITENS}
            </span>
          </div>
          {problemaDe(null, "itens") && (
            <Aviso className="mb-3">{problemaDe(null, "itens")}</Aviso>
          )}
          {avisoDaTabela && (
            <Aviso tom="atencao" className="mb-3">
              {avisoDaTabela}
            </Aviso>
          )}
          <ol className="flex flex-col gap-3">
            {itens.map((it, i) => (
              <LinhaDoItem
                key={it.id}
                idBase={`${base}-item-${it.id}`}
                numero={i + 1}
                item={it}
                classificacoes={classificacoes}
                carregandoClassificacoes={carregandoClassificacoes}
                descricao={descricoes[it.id] ?? null}
                problemaDe={(campo) => problemaDe(i + 1, campo)}
                podeRemover={itens.length > 1}
                portal={portal}
                onChange={(parcial) => trocarItem(it.id, parcial)}
                onSairDoCodigo={() => void descreverCodigo(it.id, it.codigo)}
                onRemover={() => removerItem(it.id)}
              />
            ))}
          </ol>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="secondary" onClick={adicionarItem} disabled={itens.length >= MAXIMO_DE_ITENS}>
              <Plus size={16} aria-hidden /> Adicionar item
            </Button>
            <Button type="submit" loading={calculando} loadingLabel="Calculando…" className="sm:min-w-36">
              <Calculator size={16} aria-hidden /> Calcular
            </Button>
          </div>
          {totalDeProblemas > 0 && (
            <p className="mt-3 text-helper font-medium text-danger" role="status">
              {totalDeProblemas === 1 ? "Confira o campo marcado." : `Confira os ${totalDeProblemas} campos marcados.`}
            </p>
          )}
          {erroGeral && totalDeProblemas === 0 && <Aviso className="mt-3">{erroGeral}</Aviso>}
        </Card>
      </form>

      {resultado && (
        <ResultadoDaReforma
          ref={resultadoRef}
          resultado={resultado.dados}
          entrada={resultado.entrada}
          classificacoes={classificacoes}
          desatualizado={desatualizado}
          fonte={fonte}
          variante={variante}
        />
      )}
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
  problemaDe,
  podeRemover,
  portal,
  onChange,
  onSairDoCodigo,
  onRemover,
}: {
  idBase: string;
  numero: number;
  item: ItemDigitado;
  classificacoes: ClassificacaoParaEscolher[];
  carregandoClassificacoes: boolean;
  descricao: DescricaoDoCodigo | null;
  problemaDe: (campo: string) => string | undefined;
  podeRemover: boolean;
  portal: boolean;
  onChange: (parcial: Partial<ItemDigitado>) => void;
  onSairDoCodigo: () => void;
  onRemover: () => void;
}) {
  const opcoes = classificacoesDoCodigo(classificacoes, item.codigo);
  const escolhida = classificacoes.find((c) => c.codigo === item.cClassTrib) ?? null;
  const tipo = tipoDoCodigo(item.codigo);
  const ajudaDoCodigo =
    descricao && !problemaDe("codigo")
      ? undefined
      : tipo === "ncm"
        ? "NCM: produto."
        : tipo === "nbs"
          ? "NBS: serviço."
          : portal
            ? "O código do produto (NCM) ou do serviço (NBS), como na nota."
            : "8 dígitos para NCM, 9 para NBS.";
  const ajudaDaClassificacao = escolhida
    ? resumoDaClassificacao(escolhida)
    : carregandoClassificacoes
      ? "Atualizando a lista para a data…"
      : portal
        ? "Se não souber qual escolher, pergunte à equipe do escritório."
        : undefined;
  return (
    <li className="rounded-lg border border-border p-3 sm:p-4" aria-label={`Item ${numero}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-label font-semibold text-fg">Item {numero}</span>
        {podeRemover && (
          <IconButton type="button" variant="ghost" onClick={onRemover} aria-label={`Remover o item ${numero}`} title="Remover item" className={portal ? "max-md:h-11 max-md:w-11" : ""}>
            <Trash2 size={16} aria-hidden />
          </IconButton>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
        <CampoForm
          label="NCM ou NBS"
          htmlFor={`${idBase}-codigo`}
          className="sm:col-span-4 lg:col-span-3"
          error={problemaDe("codigo")}
          helper={ajudaDoCodigo}
        >
          <Input
            id={`${idBase}-codigo`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="1006.30.21"
            value={item.codigo}
            onChange={(e) => onChange({ codigo: e.target.value })}
            onBlur={onSairDoCodigo}
            error={!!problemaDe("codigo")}
           
          />
        </CampoForm>
        <CampoForm
          label={portal ? "Classificação tributária" : "Classificação tributária (cClassTrib)"}
          htmlFor={`${idBase}-cClassTrib`}
          required
          className="sm:col-span-8 lg:col-span-9"
          error={problemaDe("cClassTrib")}
          helper={ajudaDaClassificacao}
        >
          <Select
            id={`${idBase}-cClassTrib`}
            value={item.cClassTrib}
            onChange={(e) => onChange({ cClassTrib: e.target.value })}
            busca
            error={!!problemaDe("cClassTrib")}
           
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
        </CampoForm>
        {descricao && !problemaDe("codigo") && (
          <p
            className={`-mt-2 text-helper sm:col-span-12 ${descricao.tom === "perigo" ? "font-medium text-danger" : descricao.tom === "atencao" ? "text-warning-fg" : "text-fg-muted"}`}
            aria-live="polite"
          >
            {descricao.texto}
          </p>
        )}
        <CampoForm label="Base de cálculo" htmlFor={`${idBase}-base`} required className="sm:col-span-5 lg:col-span-4" error={problemaDe("base")}>
          <Input
            id={`${idBase}-base`}
            inputMode="decimal"
            autoComplete="off"
            prefix="R$"
            placeholder="0,00"
            value={item.base}
            onChange={(e) => onChange({ base: e.target.value })}
            error={!!problemaDe("base")}
           
          />
        </CampoForm>
        <CampoForm label="Quantidade" htmlFor={`${idBase}-quantidade`} className="sm:col-span-4 lg:col-span-3" error={problemaDe("quantidade")}>
          <Input
            id={`${idBase}-quantidade`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Opcional"
            value={item.quantidade}
            onChange={(e) => onChange({ quantidade: e.target.value })}
            error={!!problemaDe("quantidade")}
           
          />
        </CampoForm>
        <CampoForm label="Unidade" htmlFor={`${idBase}-unidade`} className="sm:col-span-3 lg:col-span-2" error={problemaDe("unidade")}>
          <Input
            id={`${idBase}-unidade`}
            autoComplete="off"
            placeholder="UN"
            maxLength={6}
            value={item.unidade}
            onChange={(e) => onChange({ unidade: e.target.value.toUpperCase() })}
            error={!!problemaDe("unidade")}
           
          />
        </CampoForm>
      </div>
    </li>
  );
}
