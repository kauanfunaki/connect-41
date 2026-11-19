import "server-only";

// O cliente HTTP da calculadora da Receita (19/11/2026, funcionalidade-794):
// o serviço interno de infra/calculadora-rtc, no endereço de
// CALCULADORA_RTC_URL. Sem a variável, toda chamada volta "nao-configurada" e
// a tela mostra o aviso, em vez de quebrar.
//
// As tabelas abertas (UF, municípios, classificações, alíquotas de referência)
// mudam só quando o serviço ganha versão nova: ficam uma hora na memória do
// processo, para a tela não refazer a mesma consulta a cada troca de campo.
// O cálculo nunca fica guardado.

import { randomUUID } from "node:crypto";
import { dataBR } from "@/lib/datas/calendario";
import {
  MENSAGEM_DA_FALHA,
  MENSAGEM_DA_FALHA_NO_PORTAL,
  baseDaCalculadora,
  descricaoDaNomenclatura,
  lerAliquotaDeReferencia,
  lerPergunta,
  lerResposta,
  montarPedido,
  resumirClassificacoes,
  resumirMunicipios,
  resumirUfs,
  soDigitos,
  tipoDoCodigo,
  type AliquotasDeReferencia,
  type ClassificacaoParaEscolher,
  type FalhaDoServico,
  type RetornoDaCalculadora,
  type MunicipioDaCalculadora,
  type PedidoDaCalculadora,
  type ResultadoDaCalculadora,
  type TipoDeCodigo,
  type UfDaCalculadora,
} from "./regras";

/** Consulta das tabelas: rápida, a base é local ao serviço. */
const TEMPO_DA_CONSULTA_MS = 8_000;
/** O cálculo de até 50 itens leva menos de 1 s no serviço; a folga cobre a primeira chamada depois de subir. */
const TEMPO_DO_CALCULO_MS = 20_000;
const VALIDADE_DA_MEMORIA_MS = 60 * 60 * 1000;

export type Resposta<T> = { ok: true; dados: T } | { ok: false; falha: FalhaDoServico | "nao-encontrado"; status?: number };

export function calculadoraConfigurada(): boolean {
  return baseDaCalculadora(process.env.CALCULADORA_RTC_URL) !== null;
}

async function chamar(
  caminho: string,
  { metodo = "GET", corpo, tempoMs = TEMPO_DA_CONSULTA_MS }: { metodo?: "GET" | "POST"; corpo?: unknown; tempoMs?: number } = {}
): Promise<{ ok: true; status: number; json: unknown; simulado: boolean } | { ok: false; falha: FalhaDoServico | "nao-encontrado"; status?: number }> {
  const base = baseDaCalculadora(process.env.CALCULADORA_RTC_URL);
  if (!base) return { ok: false, falha: "nao-configurada" };
  let r: Response;
  try {
    r = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: corpo !== undefined ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(tempoMs),
    });
  } catch (err) {
    const nome = err instanceof Error ? err.name : "";
    if (nome === "TimeoutError" || nome === "AbortError") return { ok: false, falha: "tempo-esgotado" };
    console.error("[calculadora-rtc] sem resposta", caminho, err instanceof Error ? err.message : err);
    return { ok: false, falha: "fora-do-ar" };
  }
  if (r.status === 404) return { ok: false, falha: "nao-encontrado", status: 404 };
  // 422 é resposta de negócio (erro da operação inteira, com a lista de erros);
  // 5xx e o resto é o serviço com problema.
  if (!r.ok && r.status !== 422) {
    console.error("[calculadora-rtc] status", r.status, caminho);
    return { ok: false, falha: r.status >= 500 ? "fora-do-ar" : "resposta-invalida", status: r.status };
  }
  try {
    const json = (await r.json()) as unknown;
    return { ok: true, status: r.status, json, simulado: r.headers.has("x-warning-dados-simulados") };
  } catch {
    return { ok: false, falha: "resposta-invalida", status: r.status };
  }
}

const memoria = new Map<string, { ate: number; valor: unknown }>();

async function consultarGuardado<T>(chave: string, caminho: string, ler: (json: unknown) => T): Promise<Resposta<T>> {
  const agora = Date.now();
  const guardado = memoria.get(chave);
  if (guardado && guardado.ate > agora) return { ok: true, dados: guardado.valor as T };
  const r = await chamar(caminho);
  if (!r.ok) return r;
  const dados = ler(r.json);
  memoria.set(chave, { ate: agora + VALIDADE_DA_MEMORIA_MS, valor: dados });
  return { ok: true, dados };
}

const DADOS = "/calculadora/dados-abertos";

export type VersaoDaCalculadora = { app: string; base: string; dataDaBase: string | null };

/** A versão do serviço e da base — vai no rodapé do resultado, para saber de que tabela saiu a conta. */
export function versaoDaCalculadora(): Promise<Resposta<VersaoDaCalculadora>> {
  return consultarGuardado("versao", `${DADOS}/versao`, (j) => {
    const v = (j ?? {}) as Record<string, unknown>;
    return {
      app: typeof v.versaoApp === "string" ? v.versaoApp : "—",
      base: typeof v.versaoDb === "string" ? v.versaoDb : "—",
      dataDaBase: typeof v.dataVersaoDb === "string" ? v.dataVersaoDb : null,
    };
  });
}

export function ufsDaCalculadora(): Promise<Resposta<UfDaCalculadora[]>> {
  return consultarGuardado("ufs", `${DADOS}/ufs`, resumirUfs);
}

export function municipiosDaUf(uf: string): Promise<Resposta<MunicipioDaCalculadora[]>> {
  const sigla = uf.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(sigla)) return Promise.resolve({ ok: true, dados: [] });
  return consultarGuardado(`municipios:${sigla}`, `${DADOS}/ufs/municipios?siglaUf=${sigla}`, resumirMunicipios);
}

export function classificacoesDaData(data: string): Promise<Resposta<ClassificacaoParaEscolher[]>> {
  return consultarGuardado(`classificacoes:${data}`, `${DADOS}/classificacoes-tributarias/cbs-ibs?data=${encodeURIComponent(data)}`, resumirClassificacoes);
}

/**
 * As alíquotas de referência da data: União (CBS), UF e município (IBS). A
 * Receita só cadastrou 2026; de 2027 em diante a consulta volta 404 e cada
 * uma fica `null` — a tela pede que a pessoa informe.
 */
export async function aliquotasDeReferencia(data: string, codigoUf: number | null, codigoMunicipio: number | null): Promise<Resposta<AliquotasDeReferencia>> {
  const d = encodeURIComponent(data);
  const uma = async (chave: string, caminho: string): Promise<Resposta<number | null>> => {
    const r = await consultarGuardado(chave, caminho, lerAliquotaDeReferencia);
    return !r.ok && r.falha === "nao-encontrado" ? { ok: true, dados: null } : r;
  };
  const [cbs, ibsUf, ibsMun] = await Promise.all([
    uma(`aliq-uniao:${data}`, `${DADOS}/aliquota-uniao?data=${d}`),
    codigoUf ? uma(`aliq-uf:${codigoUf}:${data}`, `${DADOS}/aliquota-uf?codigoUf=${codigoUf}&data=${d}`) : Promise.resolve({ ok: true as const, dados: null }),
    codigoMunicipio
      ? uma(`aliq-mun:${codigoMunicipio}:${data}`, `${DADOS}/aliquota-municipio?codigoMunicipio=${codigoMunicipio}&data=${d}`)
      : Promise.resolve({ ok: true as const, dados: null }),
  ]);
  for (const r of [cbs, ibsUf, ibsMun]) if (!r.ok) return r;
  return { ok: true, dados: { cbs: cbs.ok ? cbs.dados : null, ibsUf: ibsUf.ok ? ibsUf.dados : null, ibsMun: ibsMun.ok ? ibsMun.dados : null } };
}

/** A descrição de um NCM ou NBS na data; `null` quando a Receita não conhece o código. */
export async function descreverCodigo(tipo: TipoDeCodigo, codigo: string, data: string): Promise<Resposta<{ descricao: string; impostoSeletivo: boolean } | null>> {
  const digitos = soDigitos(codigo);
  const caminho = `${DADOS}/${tipo}?${tipo}=${digitos}&data=${encodeURIComponent(data)}`;
  const r = await consultarGuardado(`${tipo}:${digitos}:${data}`, caminho, descricaoDaNomenclatura);
  return !r.ok && r.falha === "nao-encontrado" ? { ok: true, dados: null } : r;
}

/** O cálculo com erro por item. Nunca guardado. */
export async function calcularNaReceita(pedido: PedidoDaCalculadora): Promise<Resposta<ResultadoDaCalculadora>> {
  const r = await chamar("/calculadora/observabilidade/regime-geral", { metodo: "POST", corpo: pedido, tempoMs: TEMPO_DO_CALCULO_MS });
  if (!r.ok) return r.falha === "nao-encontrado" ? { ok: false, falha: "resposta-invalida", status: 404 } : r;
  const resultado = lerResposta(r.json);
  if (resultado.itens.length === 0 && resultado.errosDaOperacao.length === 0) return { ok: false, falha: "resposta-invalida", status: r.status };
  // O cabeçalho também marca o simulado; vale qualquer um dos dois.
  return { ok: true, dados: r.simulado ? { ...resultado, simulado: resultado.simulado || resultado.calculados > 0 } : resultado };
}

export type DadosIniciais = {
  ufs: UfDaCalculadora[];
  classificacoes: ClassificacaoParaEscolher[];
  referencias: AliquotasDeReferencia | null;
  /** A frase do rodapé do resultado: de que versão e de que base saiu a conta. */
  fonte: string;
};

/**
 * O que a tela precisa para abrir: UFs, as classificações de hoje, a CBS de
 * referência e a versão. Sem UF e classificações não há o que escolher, e a
 * tela mostra o aviso da falha; referência e versão são extras.
 */
export async function dadosIniciaisDaCalculadora(hoje: string): Promise<{ ok: true; dados: DadosIniciais } | { ok: false; falha: FalhaDoServico }> {
  if (!calculadoraConfigurada()) return { ok: false, falha: "nao-configurada" };
  const [ufs, classificacoes, referencias, versao] = await Promise.all([
    ufsDaCalculadora(),
    classificacoesDaData(hoje),
    aliquotasDeReferencia(hoje, null, null),
    versaoDaCalculadora(),
  ]);
  if (!ufs.ok) return { ok: false, falha: ufs.falha === "nao-encontrado" ? "resposta-invalida" : ufs.falha };
  if (!classificacoes.ok) return { ok: false, falha: classificacoes.falha === "nao-encontrado" ? "resposta-invalida" : classificacoes.falha };
  const v = versao.ok ? versao.dados : null;
  const dataDaBase = v?.dataDaBase ? dataBR(v.dataDaBase) : null;
  const fonte = v
    ? `Calculado pela calculadora oficial da Receita Federal, versão ${v.app}, base ${v.base}${dataDaBase ? ` de ${dataDaBase}` : ""}.`
    : "Calculado pela calculadora oficial da Receita Federal.";
  return { ok: true, dados: { ufs: ufs.dados, classificacoes: classificacoes.dados, referencias: referencias.ok ? referencias.dados : null, fonte } };
}

/**
 * Responde a pergunta da tela, depois que a ação conferiu o acesso. A entrada
 * do navegador passa de novo por `lerPergunta` e, no cálculo, por
 * `montarPedido`: o servidor não confia no que a tela já conferiu. No portal,
 * a falha do serviço vem nas palavras do cliente.
 */
export async function responderPergunta(bruto: unknown, publico: "equipe" | "portal" = "equipe"): Promise<RetornoDaCalculadora<unknown>> {
  const mensagens = publico === "portal" ? MENSAGEM_DA_FALHA_NO_PORTAL : MENSAGEM_DA_FALHA;
  function retorno<T>(r: Resposta<T>): RetornoDaCalculadora<T> {
    if (r.ok) return r;
    return { ok: false, mensagem: mensagens[r.falha === "nao-encontrado" ? "resposta-invalida" : r.falha] };
  }
  const p = lerPergunta(bruto);
  if (!p) return { ok: false, mensagem: "Confira os dados e tente de novo." };
  switch (p.tipo) {
    case "classificacoes":
      return retorno(await classificacoesDaData(p.data));
    case "municipios":
      return retorno(await municipiosDaUf(p.uf));
    case "referencias": {
      const ufs = await ufsDaCalculadora();
      const codigoUf = ufs.ok ? (ufs.dados.find((u) => u.sigla === p.uf.toUpperCase())?.codigo ?? null) : null;
      const municipio = /^\d{7}$/.test(soDigitos(p.municipio)) ? Number(soDigitos(p.municipio)) : null;
      return retorno(await aliquotasDeReferencia(p.data, codigoUf, municipio));
    }
    case "codigo": {
      const tipo = tipoDoCodigo(p.codigo);
      return tipo ? retorno(await descreverCodigo(tipo, p.codigo, p.data)) : { ok: true, dados: null };
    }
    case "calcular": {
      const montado = montarPedido(p.entrada, randomUUID());
      if (!montado.ok) return { ok: false, mensagem: "Confira os campos marcados.", problemas: montado.problemas };
      return retorno(await calcularNaReceita(montado.pedido));
    }
  }
}
