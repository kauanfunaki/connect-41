// A revisão manual da conciliação (Bloco B, Fase B3, 12/11/2026): as partes puras de
// `src/domain/conciliacao_bancaria/revisao.py`, sem banco. O serviço que lê e grava fica em
// `servidor/revisao.ts`; os tipos da tela, em `revisaoTipos.ts`.
//
// O que o banco guarda (`snapshot`, `relatorio`, as evidências dos vínculos) tem as MESMAS chaves e
// valores do original: snake_case, como o `model_dump(mode="json")` do pydantic. Por isso os tipos
// `…Py` daqui são em snake_case, e as funções `…ParaTela` fazem a conversão para a tela.
//
// O `_hash` do original é `sha256(json.dumps(dados, ensure_ascii=False, sort_keys=True,
// separators=(",", ":")))`, e o `extrato_hash`, o `revisao_hash` e os `hashes_apoio` da carga têm de
// continuar valendo: `jsonDumps` reproduz o `json.dumps` byte a byte (chaves por ponto de código,
// acentos sem escape, `"`, `\` e controles escapados como o Python).
//
// Cada função devolve a recusa do original (mesma frase, mesma ordem de conferência) ou o resultado.
// Os ids novos vêm de um gerador recebido por parâmetro, para o teste-gabarito ser determinístico.

import { createHash } from "node:crypto";
import { cmp } from "../motor/unicodePy";
import { corta } from "@/lib/revisao-contabil/motor/py";
import { compara, dec, ehZero, modulo, reescala, somaTodos, subtrai, texto, oposto, type Dec } from "../motor/decimal";
import type { RazaoApoio, RazaoConta } from "./razaoTipos";
import type { RelatorioConciliacaoJson } from "./relatorio";
import type {
  CodigoErroRevisao,
  EstadoVinculo,
  FonteRevisao,
  ItemVinculo,
  LinhaExtratoRevisao,
  LinhaRazaoRevisao,
  NaturezaRazao,
  NovoVinculo,
  Revisao,
  ResumoRevisao,
  TipoFonteRevisao,
  VinculoRevisao,
} from "./revisaoTipos";

// ─── Resultado e limites ────────────────────────────────────────────────────

/** A recusa: a frase do original e, quando a tela trata de um jeito próprio, o código. */
export type RecusaRevisao = { ok: false; erro: string; codigo?: CodigoErroRevisao };
export type ResultadoRevisao<T> = { ok: true; valor: T } | RecusaRevisao;

/** `ValidationError` (422) do original. */
const invalido = (erro: string, codigo?: CodigoErroRevisao): RecusaRevisao => (codigo ? { ok: false, erro, codigo } : { ok: false, erro });
/** `ConflictError` (409) do original. */
const conflito = (erro: string, codigo: CodigoErroRevisao = "CONFLITO"): RecusaRevisao => ({ ok: false, erro, codigo });

/** `conciliacao_revisao_max_linhas`, `conciliacao_revisao_max_fontes` (`core/config.py`) e `MAX_VALOR_VINCULO`. */
export type LimitesDaRevisao = { maxLinhas: number; maxFontes: number; maxValor: Dec };

export const LIMITES_DA_REVISAO: LimitesDaRevisao = {
  maxLinhas: 20_000,
  maxFontes: 32,
  // Mesma capacidade das colunas Decimal(15, 2), sem arredondamento silencioso.
  maxValor: dec("9999999999999.99"),
};

export const VERSAO_DESATUALIZADA = "Outra pessoa alterou esta revisão. Atualize a tela antes de continuar.";
export const FONTE_ALTERADA =
  "O extrato de origem mudou. Abra uma nova revisão com os documentos atuais; esta conferência permanece disponível como histórico.";
export const AVISO_FONTE_ALTERADA =
  "O extrato ou a conta de origem mudou desde esta conferência. Os vínculos permanecem como histórico; envie os arquivos atuais para uma nova revisão antes de confirmar outras relações.";
export const REVISAO_NAO_ENCONTRADA = "Revisão de conciliação não encontrada nesta empresa.";
export const RESPONSAVEL_PADRAO = "Usuário da conferência";

// ─── O `json.dumps` do Python e o `_hash` ───────────────────────────────────

/** O JSON que o original passa ao `_hash`: dicionários, listas, textos, inteiros, booleanos e `None`. */
export type JsonPy = null | boolean | number | string | readonly JsonPy[] | { readonly [chave: string]: JsonPy };

const ESCAPES: Record<string, string> = {
  '"': '\\"',
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
};

/** Texto em JSON com `ensure_ascii=False`: acento e emoji ficam como estão; só `"`, `\` e os controles são escapados. */
function textoJson(s: string): string {
  let out = '"';
  for (const c of s) {
    const e = ESCAPES[c];
    if (e) out += e;
    else if (c < " ") out += "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
    else out += c;
  }
  return out + '"';
}

/** `json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"))`. */
export function jsonDumps(v: JsonPy): string {
  if (v === null) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") {
    // O original só tem inteiros aqui (a `ordem`); dinheiro vai sempre como texto.
    if (!Number.isSafeInteger(v)) throw new Error(`Número fora do que o hash aceita: ${v}`);
    return String(v);
  }
  if (typeof v === "string") return textoJson(v);
  if (Array.isArray(v)) return "[" + v.map(jsonDumps).join(",") + "]";
  const objeto = v as { readonly [chave: string]: JsonPy };
  const chaves = Object.keys(objeto).sort(cmp);
  return (
    "{" +
    chaves
      .map((k) => {
        const x = objeto[k];
        if (x === undefined) throw new Error(`Chave sem valor no hash: ${k}`);
        return textoJson(k) + ":" + jsonDumps(x);
      })
      .join(",") +
    "}"
  );
}

/** `_hash`: SHA-256 (hexadecimal) do `json.dumps` em UTF-8. */
export function hashJson(v: JsonPy): string {
  return createHash("sha256").update(jsonDumps(v), "utf8").digest("hex");
}

/** `_moeda`: `str(Decimal(valor).quantize(Decimal("0.01")))`, meio para par, com o "-0.00" do Python. */
export function moeda(valor: Dec): string {
  return texto(reescala(valor, -2));
}

/** `max(a, b)` do Python: fica com o primeiro, a não ser que o segundo seja maior. */
function maior(a: Dec, b: Dec): Dec {
  return compara(b, a) > 0 ? b : a;
}

const ZERO = dec("0");

// ─── O snapshot, como o banco o guarda ──────────────────────────────────────

/** `FonteRevisao.model_dump(mode="json")` */
export type FontePy = {
  id: string;
  nome_arquivo: string;
  tipo: TipoFonteRevisao;
  cnpj: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
};

/** `LinhaRevisao.model_dump(mode="json")`: o dinheiro é o texto do `Decimal`. */
export type LinhaRazaoPy = {
  id: string;
  fonte_id: string;
  tipo_fonte: TipoFonteRevisao;
  referencia_id: string | null;
  data: string;
  conta_codigo: string;
  conta_classificacao: string;
  conta_descricao: string;
  historico: string;
  lote: string;
  contrapartida: string;
  documento: string | null;
  favorecido: string | null;
  valor_debito: string;
  valor_credito: string;
};

/** `LinhaExtratoRevisao.model_dump(mode="json")`: valor com sinal (entrada +, saída −). */
export type LinhaExtratoPy = {
  transacao_id: string;
  data: string;
  valor: string;
  historico: string;
  documento: string | null;
  favorecido: string | null;
};

export type SnapshotPy = {
  fontes: FontePy[];
  linhas_razao: LinhaRazaoPy[];
  extrato: LinhaExtratoPy[];
  hashes_apoio: string[];
  avisos: string[];
};

/** `ItemVinculo.model_dump(mode="json")`, como fica em `razao_itens` do vínculo. */
export type ItemVinculoPy = { linha_id: string; dc: NaturezaRazao };

/** O relatório como o pydantic o serializa (snake_case; `conciliados_por_tipo` é um objeto). */
export type RelatorioPy = { [chave: string]: JsonPy };

// ─── Identidade das linhas e evidência do extrato ───────────────────────────

const FORA_DA_IDENTIDADE = new Set(["id", "fonte_id", "referencia_id", "tipo_fonte"]);

/** `_identidade_linha`: a linha sem os ids, com o dinheiro em centavos ("100.00"). */
export function identidadeDaLinha(linha: LinhaRazaoPy): { [chave: string]: JsonPy } {
  const identidade: { [chave: string]: JsonPy } = {};
  for (const [k, v] of Object.entries(linha)) if (!FORA_DA_IDENTIDADE.has(k)) identidade[k] = v;
  for (const campo of ["valor_debito", "valor_credito"] as const) identidade[campo] = moeda(dec(linha[campo]));
  return identidade;
}

/** A transação do extrato como a revisão a lê (`Transacao`). */
export type TransacaoDaRevisao = {
  id: string;
  /** "AAAA-MM-DD" */
  data: string;
  /** Sempre positivo, com a escala da coluna (2 casas): o sinal está em `dc`. */
  valor: Dec;
  dc: string;
  historico: string;
  saldoApos: Dec | null;
  ordem: number | null;
  importacaoId: string | null;
  /** Quando o lote (`ExtratoImportacao.created_at`) chegou, em ISO 8601 de largura fixa; nulo sem lote. */
  loteEm: string | null;
};

/** O UUID como o Python o compara (pelo inteiro): os 32 dígitos hexadecimais em minúsculas. */
function chaveDoUuid(id: string): string {
  return id.toLowerCase().replace(/-/g, "");
}

function porUuid(a: string, b: string): number {
  const x = chaveDoUuid(a);
  const y = chaveDoUuid(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * `ordenar_como_o_extrato` (`extrato/ordenacao.py`): data, o lote (o sem lote primeiro), `ordem`
 * (a vazia por último) e o id. A B2 ordena sem o lote porque `conciliar_razao_extrato` também
 * ordena sem ele (`ORDER BY data, ordem`); a revisão lê o extrato pela ordem do papel do banco.
 */
export function ordemComoOExtrato(a: TransacaoDaRevisao, b: TransacaoDaRevisao): number {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  if (a.loteEm !== b.loteEm) {
    if (a.loteEm === null) return -1;
    if (b.loteEm === null) return 1;
    return a.loteEm < b.loteEm ? -1 : 1;
  }
  if (a.ordem !== b.ordem) {
    if (a.ordem === null) return 1;
    if (b.ordem === null) return -1;
    return a.ordem - b.ordem;
  }
  return porUuid(a.id, b.id);
}

/** Um item de `_evidencia_extrato`. */
export type EvidenciaPy = {
  transacao_id: string;
  data: string;
  valor: string;
  dc: string;
  historico: string;
  saldo_apos: string | null;
  ordem: number | null;
  importacao_id: string | null;
};

/**
 * `_evidencia_extrato`: o documento bancário, sem status nem `updated_at` (que mudam durante o NEO
 * sem mudar o extrato), em ordem de id.
 */
export function evidenciaDoExtrato(transacoes: readonly TransacaoDaRevisao[]): EvidenciaPy[] {
  return [...transacoes]
    .sort((a, b) => porUuid(a.id, b.id))
    .map((t) => ({
      transacao_id: t.id,
      data: t.data,
      valor: moeda(t.valor),
      dc: t.dc,
      historico: t.historico,
      saldo_apos: t.saldoApos !== null ? moeda(t.saldoApos) : null,
      ordem: t.ordem,
      importacao_id: t.importacaoId,
    }));
}

// ─── Conferências ───────────────────────────────────────────────────────────

/** `_conferir_valores`: nenhum valor passa da capacidade das colunas. */
export function conferirValores(valores: Iterable<Dec>, limites: LimitesDaRevisao = LIMITES_DA_REVISAO): RecusaRevisao | null {
  for (const v of valores) {
    if (compara(modulo(v), limites.maxValor) > 0) return invalido("Há valores acima do limite monetário da conferência.");
  }
  return null;
}

/** `_conferir_tamanho`: lançamentos e arquivos de razão numa revisão. */
export function conferirTamanho(quantidade: number, fontes = 1, limites: LimitesDaRevisao = LIMITES_DA_REVISAO): RecusaRevisao | null {
  if (quantidade > limites.maxLinhas) {
    return invalido(`A revisão aceita até ${limites.maxLinhas} lançamentos. Divida a conferência em períodos menores.`);
  }
  if (fontes > limites.maxFontes) {
    return invalido(
      `A revisão aceita até ${limites.maxFontes} arquivos de razão. Organize as contas de apoio em um único Excel ou inicie outra revisão.`,
    );
  }
  return null;
}

/** `re.sub(r"\D", "", texto)`: o `\d` do Python é qualquer dígito decimal Unicode. */
function soDigitos(s: string): string {
  return s.replace(/\P{Nd}/gu, "");
}

/** `_conferir_empresa`: o CNPJ do razão é o da empresa; sem CNPJ, a pessoa confirma. */
export function conferirEmpresa(
  cnpj: string | null,
  empresa: { cnpj: string; razaoSocial: string },
  confirmar: boolean,
): RecusaRevisao | null {
  const lido = soDigitos(cnpj ?? "");
  if (lido && lido !== soDigitos(empresa.cnpj)) return invalido("O razão enviado pertence a outra empresa.");
  if (!lido && !confirmar) {
    return invalido(
      `O razão não informa CNPJ. Confirme explicitamente que o arquivo pertence a ${empresa.razaoSocial} antes de salvar a conferência.`,
      "CONFIRMAR_EMPRESA",
    );
  }
  return null;
}

/** `_exigir_fontes`: só se confirma relação enquanto o extrato e a conta são os da criação. */
export function exigirFontes(fontesValidas: boolean): RecusaRevisao | null {
  return fontesValidas ? null : conflito(FONTE_ALTERADA, "FONTE_ALTERADA");
}

// ─── Criação ────────────────────────────────────────────────────────────────

/** A primeira conferência de `criar`, antes de conciliar: o tamanho e os valores do razão do banco. */
export function conferirRazaoDoBanco(razao: RazaoConta, limites: LimitesDaRevisao = LIMITES_DA_REVISAO): RecusaRevisao | null {
  return conferirTamanho(razao.lancamentos.length, 1, limites) ?? conferirValores(razao.lancamentos.map((l) => l.valor), limites);
}

/** A segunda, depois de ler o extrato do período: razão e extrato juntos, e os valores do extrato. */
export function conferirExtratoDaRevisao(
  razao: RazaoConta,
  transacoes: readonly TransacaoDaRevisao[],
  limites: LimitesDaRevisao = LIMITES_DA_REVISAO,
): RecusaRevisao | null {
  return (
    conferirTamanho(razao.lancamentos.length + transacoes.length, 1, limites) ?? conferirValores(transacoes.map((t) => t.valor), limites)
  );
}

/**
 * O `extrato_hash` (a evidência do extrato) e o `revisao_hash` (a identidade da revisão: os dois
 * arquivos e o extrato). A mesma combinação viva na mesma conta bancária devolve a revisão existente.
 */
export function hashesDaRevisao(
  hashArquivo: string,
  hashSispag: string | null,
  transacoes: readonly TransacaoDaRevisao[],
): { extratoHash: string; revisaoHash: string } {
  const extratoHash = hashJson(evidenciaDoExtrato(transacoes));
  return { extratoHash, revisaoHash: hashJson({ razao: hashArquivo, sispag: hashSispag, extrato: extratoHash }) };
}

export const AVISO_SEM_CNPJ = "Razão do banco sem CNPJ: empresa confirmada pelo usuário na criação da revisão.";

/**
 * O snapshot de uma revisão nova: a fonte (o razão do banco), as linhas do razão (com `referencia_id`
 * "r0", "r1"… e o valor separado em débito e crédito), o extrato na ordem do papel com o sinal e o
 * aviso de razão sem CNPJ. `transacoes` já vem em `ordemComoOExtrato`.
 */
export function snapshotDaRevisao(
  razao: RazaoConta,
  nomeArquivo: string,
  transacoes: readonly TransacaoDaRevisao[],
  novoId: () => string,
): SnapshotPy {
  const fonte: FontePy = {
    id: novoId(),
    nome_arquivo: corta(nomeArquivo, 255),
    tipo: "RAZAO_BANCO",
    cnpj: razao.cnpj ? razao.cnpj : null,
    periodo_inicio: razao.periodoInicio,
    periodo_fim: razao.periodoFim,
  };
  const linhas = razao.lancamentos.map(
    (l, i): LinhaRazaoPy => ({
      id: novoId(),
      fonte_id: fonte.id,
      tipo_fonte: fonte.tipo,
      referencia_id: `r${i}`,
      data: l.data,
      conta_codigo: razao.contaCodigo,
      conta_classificacao: razao.contaClassificacao,
      conta_descricao: razao.contaDescricao,
      historico: l.historico,
      lote: l.lote,
      contrapartida: l.contrapartida,
      documento: null,
      favorecido: null,
      valor_debito: texto(maior(l.valor, ZERO)),
      valor_credito: texto(maior(oposto(l.valor), ZERO)),
    }),
  );
  const extrato = transacoes.map(
    (t): LinhaExtratoPy => ({
      transacao_id: t.id,
      data: t.data,
      // `t.valor * (1 if t.dc == "C" else -1)`: o produto troca o sinal até do zero ("-0.00").
      valor: texto(t.dc === "C" ? t.valor : { ...t.valor, negativo: !t.valor.negativo }),
      historico: t.historico,
      documento: null,
      favorecido: null,
    }),
  );
  return { fontes: [fonte], linhas_razao: linhas, extrato, hashes_apoio: [], avisos: razao.cnpj ? [] : [AVISO_SEM_CNPJ] };
}

// ─── Razão de apoio ─────────────────────────────────────────────────────────

/**
 * `adicionar_apoio` depois de conferir as fontes e a empresa: o tamanho acumulado, os valores, e as
 * três recusas de repetição (o mesmo arquivo, a conta do banco, lançamentos já enviados), nessa ordem.
 * Devolve o snapshot novo (o recebido não é alterado) e o que vai para a auditoria.
 */
export function incorporarApoio(e: {
  revisao: { periodoInicio: string; periodoFim: string; snapshot: SnapshotPy };
  razao: RazaoApoio;
  nomeArquivo: string;
  novoId: () => string;
  limites?: LimitesDaRevisao;
}): ResultadoRevisao<{ snapshot: SnapshotPy; linhas: number; hash: string }> {
  const { revisao, razao, nomeArquivo } = e;
  const limites = e.limites ?? LIMITES_DA_REVISAO;
  const atual = revisao.snapshot;
  const tamanho = conferirTamanho(
    atual.linhas_razao.length + atual.extrato.length + razao.linhas.length,
    atual.fontes.length + 1,
    limites,
  );
  if (tamanho) return tamanho;
  const valores = conferirValores(
    razao.linhas.flatMap((l) => [l.valorDebito, l.valorCredito]),
    limites,
  );
  if (valores) return valores;

  const fonte: FontePy = {
    id: e.novoId(),
    nome_arquivo: corta(nomeArquivo, 255),
    tipo: "RAZAO_APOIO",
    cnpj: razao.cnpj ? razao.cnpj : null,
    periodo_inicio: razao.periodoInicio,
    periodo_fim: razao.periodoFim,
  };
  const linhas = razao.linhas.map(
    (l): LinhaRazaoPy => ({
      id: e.novoId(),
      fonte_id: fonte.id,
      tipo_fonte: fonte.tipo,
      referencia_id: null,
      data: l.data,
      conta_codigo: l.contaCodigo,
      conta_classificacao: l.contaClassificacao,
      conta_descricao: l.contaDescricao,
      historico: l.historico,
      lote: l.lote,
      contrapartida: l.contrapartida,
      documento: l.documento,
      favorecido: l.favorecido,
      valor_debito: texto(l.valorDebito),
      valor_credito: texto(l.valorCredito),
    }),
  );
  const identidade = hashJson(linhas.map(identidadeDaLinha));
  if (atual.hashes_apoio.includes(identidade)) return conflito("Este razão de apoio já está disponível nesta revisão.");
  const contasBanco = new Set(atual.linhas_razao.filter((l) => l.tipo_fonte === "RAZAO_BANCO").map((l) => l.conta_classificacao));
  if (linhas.some((l) => contasBanco.has(l.conta_classificacao))) {
    return invalido(
      "O razão do banco já está nesta revisão. Envie somente as outras contas usadas como apoio, como FGTS a Recolher ou impostos.",
    );
  }
  const anteriores = new Set(atual.linhas_razao.filter((l) => l.tipo_fonte === "RAZAO_APOIO").map((l) => hashJson(identidadeDaLinha(l))));
  if (linhas.some((l) => anteriores.has(hashJson(identidadeDaLinha(l))))) {
    return invalido(
      "Há lançamentos idênticos em um razão de apoio já enviado. Envie um arquivo complementar sem repetir esses lançamentos.",
    );
  }
  const snapshot: SnapshotPy = structuredClone(atual);
  snapshot.fontes.push(fonte);
  snapshot.linhas_razao.push(...linhas);
  snapshot.hashes_apoio.push(identidade);
  // As frases usam o nome inteiro do arquivo; a fonte guarda só os 255 primeiros caracteres.
  if (!razao.cnpj) snapshot.avisos.push(`${nomeArquivo}: razão sem CNPJ; empresa confirmada pelo usuário.`);
  if (razao.linhas.some((l) => l.data < revisao.periodoInicio || l.data > revisao.periodoFim)) {
    snapshot.avisos.push(
      `${nomeArquivo}: há lançamentos fora do período bancário; podem representar provisões anteriores. Confira as competências antes de confirmar a relação.`,
    );
  }
  return { ok: true, valor: { snapshot, linhas: linhas.length, hash: identidade } };
}

// ─── Vínculos ───────────────────────────────────────────────────────────────

/** Um vínculo já gravado, no que a validação de um novo precisa. */
export type VinculoGravado = { estado: string; extrato_ids: readonly string[]; razao_itens: readonly ItemVinculoPy[] };

export type VinculoValidado = {
  extratoIds: string[];
  razaoItens: ItemVinculoPy[];
  totalExtrato: Dec;
  totalRazao: Dec;
  /** Razão − extrato: diferença sem observação é recusada. */
  diferenca: Dec;
  observacao: string;
};

/**
 * `criar_vinculo` depois de `_exigir_fontes`: a versão, a seleção (cada lançamento uma vez, todos da
 * revisão, nenhum num vínculo ativo), o sentido do extrato, a origem e a natureza do razão, os valores
 * e a diferença, nessa ordem. `dados` já passou por `novoVinculoSchema` (ids canônicos, observação aparada).
 */
export function validarVinculo(e: {
  versaoAtual: number;
  snapshot: SnapshotPy;
  vinculos: readonly VinculoGravado[];
  dados: NovoVinculo;
  limites?: LimitesDaRevisao;
}): ResultadoRevisao<VinculoValidado> {
  const { snapshot, dados } = e;
  const limites = e.limites ?? LIMITES_DA_REVISAO;
  if (e.versaoAtual !== dados.versao) return conflito("A revisão foi alterada. Atualize a tela.");
  const idsE = [...dados.extratoIds];
  const idsR = dados.razaoItens.map((i) => i.linhaId);
  if (new Set(idsE).size !== idsE.length || new Set(idsR).size !== idsR.length) {
    return invalido("Selecione cada lançamento uma única vez.");
  }
  const extrato = new Map(snapshot.extrato.map((l) => [l.transacao_id, l]));
  const razao = new Map(snapshot.linhas_razao.map((l) => [l.id, l]));
  if (idsE.some((i) => !extrato.has(i)) || idsR.some((i) => !razao.has(i))) {
    return invalido("Há lançamentos que não pertencem a esta revisão.");
  }
  const usadosE = new Set<string>();
  const usadosR = new Set<string>();
  for (const v of e.vinculos) {
    if (v.estado !== "ATIVO") continue;
    for (const i of v.extrato_ids) usadosE.add(i);
    for (const i of v.razao_itens) usadosR.add(String(i.linha_id));
  }
  if (idsE.some((i) => usadosE.has(i)) || idsR.some((i) => usadosR.has(i))) {
    return conflito(
      "Um lançamento selecionado já participa de uma conferência ativa. Desfaça o vínculo anterior antes de reutilizá-lo.",
    );
  }
  const valoresE = idsE.map((i) => dec(extrato.get(i)!.valor));
  const sentidos = new Set(valoresE.map((v) => (compara(v, ZERO) > 0 ? 1 : -1)));
  if (sentidos.size !== 1 || valoresE.some((v) => ehZero(v))) {
    return invalido("Selecione entradas ou saídas bancárias, sem misturá-las.");
  }
  const tipos = new Set(idsR.map((i) => razao.get(i)!.tipo_fonte));
  if (tipos.size !== 1) {
    return invalido(
      "Use o razão do banco ou razões de apoio no mesmo vínculo. Misturar os dois pode contar duas vezes a mesma operação.",
    );
  }
  const naturezas = new Set(dados.razaoItens.map((i) => i.dc));
  if (naturezas.size !== 1) {
    return invalido(
      "Selecione apenas débitos ou apenas créditos do razão no vínculo. Provisionamento e baixa devem ser conferidos separadamente.",
    );
  }
  if (tipos.has("RAZAO_BANCO")) {
    const esperado = compara(valoresE[0], ZERO) > 0 ? "D" : "C";
    if (!naturezas.has(esperado)) return invalido("A natureza do razão do banco não corresponde ao extrato.");
  }
  const valoresR = dados.razaoItens.map((i) => {
    const linha = razao.get(i.linhaId)!;
    return dec(i.dc === "D" ? linha.valor_debito : linha.valor_credito);
  });
  if (valoresR.some((v) => compara(v, ZERO) <= 0)) return invalido("Há uma linha sem valor na natureza D/C escolhida.");
  const totalExtrato = somaTodos(valoresE.map(modulo));
  const totalRazao = somaTodos(valoresR);
  const diferenca = subtrai(totalRazao, totalExtrato);
  const valores = conferirValores([totalExtrato, totalRazao, diferenca], limites);
  if (valores) return valores;
  if (!ehZero(diferenca) && !dados.observacao) {
    return invalido(
      "Os valores têm diferença. Registre uma observação para salvar a conferência com essa diferença visível.",
    );
  }
  return {
    ok: true,
    valor: {
      extratoIds: idsE,
      razaoItens: dados.razaoItens.map((i) => ({ linha_id: i.linhaId, dc: i.dc })),
      totalExtrato,
      totalRazao,
      diferenca,
      observacao: dados.observacao,
    },
  };
}

/** `desfazer`: o vínculo existe nesta revisão e ainda está ativo. Desfazer vale mesmo com a fonte alterada. */
export function conferirDesfazer(vinculo: { estado: string } | null): RecusaRevisao | null {
  if (!vinculo) return { ok: false, erro: "Vínculo não encontrado nesta revisão.", codigo: "NAO_ENCONTRADA" };
  if (vinculo.estado !== "ATIVO") return conflito("Esta conferência já foi desfeita.");
  return null;
}

// ─── Relatório: snake_case (banco) ↔ camelCase (tela) ───────────────────────

const paraSnake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const paraCamel = (k: string) => k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());

function trocarChaves(v: unknown, f: (k: string) => string): unknown {
  if (Array.isArray(v)) return v.map((x) => trocarChaves(x, f));
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [f(k), trocarChaves(x, f)]));
  return v;
}

/**
 * O relatório da B2 (`relatorioParaJson`, camelCase) como o pydantic o grava (`model_dump(mode="json")`):
 * chaves em snake_case e `conciliados_por_tipo` como objeto, na ordem dos pares.
 */
export function relatorioParaPython(r: RelatorioConciliacaoJson): RelatorioPy {
  const { conciliadosPorTipo, ...resto } = r;
  return {
    ...(trocarChaves(resto, paraSnake) as RelatorioPy),
    conciliados_por_tipo: Object.fromEntries(conciliadosPorTipo),
  };
}

/**
 * O caminho de volta, para a tela. A ordem de `conciliados_por_tipo` é a das chaves no objeto: o
 * tipo JSON do MySQL guarda as chaves ordenadas (pelo tamanho e depois pelos bytes), e não na ordem
 * do `Counter` como o `json` do PostgreSQL.
 */
export function relatorioDoPython(r: RelatorioPy): RelatorioConciliacaoJson {
  const { conciliados_por_tipo: porTipo, ...resto } = r;
  return {
    ...(trocarChaves(resto, paraCamel) as Omit<RelatorioConciliacaoJson, "conciliadosPorTipo">),
    conciliadosPorTipo: Object.entries((porTipo ?? {}) as Record<string, number>),
  };
}

// ─── Snapshot e vínculos para a tela ────────────────────────────────────────

export function fonteParaTela(f: FontePy): FonteRevisao {
  return { id: f.id, nomeArquivo: f.nome_arquivo, tipo: f.tipo, cnpj: f.cnpj, periodoInicio: f.periodo_inicio, periodoFim: f.periodo_fim };
}

export function linhaRazaoParaTela(l: LinhaRazaoPy): LinhaRazaoRevisao {
  return {
    id: l.id,
    fonteId: l.fonte_id,
    tipoFonte: l.tipo_fonte,
    referenciaId: l.referencia_id,
    data: l.data,
    contaCodigo: l.conta_codigo,
    contaClassificacao: l.conta_classificacao,
    contaDescricao: l.conta_descricao,
    historico: l.historico,
    lote: l.lote,
    contrapartida: l.contrapartida,
    documento: l.documento,
    favorecido: l.favorecido,
    valorDebito: l.valor_debito,
    valorCredito: l.valor_credito,
  };
}

export function linhaExtratoParaTela(l: LinhaExtratoPy): LinhaExtratoRevisao {
  return { transacaoId: l.transacao_id, data: l.data, valor: l.valor, historico: l.historico, documento: l.documento, favorecido: l.favorecido };
}

/** Um vínculo como o banco o devolve: o dinheiro já é o texto com 2 casas ("350.00"). */
export type VinculoParaTela = {
  id: string;
  extratoIds: readonly string[];
  razaoItens: readonly ItemVinculoPy[];
  totalExtrato: string;
  totalRazao: string;
  diferenca: string;
  observacao: string;
  estado: EstadoVinculo;
  responsavel: string;
  criadoEm: string;
  desfeitoPor: string | null;
  desfeitoEm: string | null;
  motivoDesfazer: string | null;
};

export function vinculoParaTela(v: VinculoParaTela): VinculoRevisao {
  return {
    ...v,
    extratoIds: [...v.extratoIds],
    razaoItens: v.razaoItens.map((i): ItemVinculo => ({ linhaId: i.linha_id, dc: i.dc })),
  };
}

/**
 * `obter`: o resumo, o relatório e o snapshot da criação, os vínculos e os avisos. Com a fonte
 * alterada, a revisão vira histórico, com um aviso a mais.
 */
export function revisaoParaTela(
  resumo: ResumoRevisao,
  relatorio: RelatorioPy,
  snapshot: SnapshotPy,
  vinculos: readonly VinculoParaTela[],
  fontesValidas: boolean,
): Revisao {
  const avisos = [...(snapshot.avisos ?? [])];
  if (!fontesValidas) avisos.push(AVISO_FONTE_ALTERADA);
  return {
    ...resumo,
    relatorio: relatorioDoPython(relatorio),
    fontes: snapshot.fontes.map(fonteParaTela),
    linhasRazao: snapshot.linhas_razao.map(linhaRazaoParaTela),
    extrato: snapshot.extrato.map(linhaExtratoParaTela),
    vinculos: vinculos.map(vinculoParaTela),
    avisos,
    fontesValidas,
  };
}

