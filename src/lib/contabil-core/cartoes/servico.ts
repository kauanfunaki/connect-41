// Cartões de crédito (Bloco C, Fase C3, 23/11/2026): as partes puras de `CartaoService`
// (`src/domain/cartoes/service.py`), de `DistribuicaoService` (`src/domain/cartoes/distribuicao.py`) e dos
// esquemas (`src/schemas/cartoes.py`), sem banco.
//
// - Validação dos corpos (`CartaoCreate`, `CartaoUpdate`, `FaturaCreate`, `FaturaUpdate`,
//   `LancamentoCreate`, `AssociarTransacaoFaturaRequest`, os três da distribuição e o
//   `FaturaDocumentoConfirmar`), com as recusas do original; as do pydantic, que lá saíam em inglês, viram
//   frases em português. Depois, o que a coluna não guarda (texto mais longo, valor acima de
//   `Decimal(15,2)`), que no original virava erro 500 na gravação.
// - A identidade da compra importada (`_identificador_compra` e o `uuid5` da fatura): o mesmo CSV ou PDF
//   reenviado não duplica, e o id é o do original byte a byte (a carga C4 copia os ids).
// - O CSV como o `csv.DictReader` do Python o lê (`lerCsv`), e cada linha como `importar_csv` a trata.
// - A distribuição da fatura sobre a transação que a pagou: o hash da classificação bancária (`_hash`, o
//   `repr` do Python, para o hash gravado pelo original continuar valendo), o histórico de cada componente,
//   a vista (`obter`) e as conferências de salvar, aplicar, desfazer e confirmar documento.
// - Quem lê o banco, grava, trava e chama o NEO é `servidor/cartoes.ts` e `servidor/faturas.ts`.

import { createHash } from "node:crypto";
import { len, strip } from "@/lib/revisao-contabil/motor/py";
import { reprPy } from "../cadastro/loteDoPlano";
import { compara, dec, decimal, ehZero, fixo, NAO_FINITO, reescala, soma, somaTodos, subtrai, texto as textoDec, type Dec } from "../motor/decimal";
import { casefold } from "../motor/unicodePy";
import { inteiro as inteiroPy, re } from "../extrato/py";
import { dataDoCampo, decimalDoCampo, isoUtc } from "../comprovantes/servico";

// ─── Frases e códigos do original ───────────────────────────────────────────

export const CARTAO_NAO_ENCONTRADO = "Cartão não encontrado.";
export const FATURA_NAO_ENCONTRADA = "Fatura não encontrada.";
export const LANCAMENTO_NAO_ENCONTRADO = "Lançamento não encontrado.";
export const DOCUMENTO_NAO_ENCONTRADO = "Documento não encontrado nesta fatura.";
export const CONTA_NAO_ENCONTRADA = "Conta contábil não encontrada para esta empresa.";
export const TRANSACAO_NAO_ENCONTRADA = "Transação não encontrada para esta empresa.";

/** Recusa do serviço. `codigo` decide o status da rota: 404 (`NotFoundError`), 409 (`ConflictError`) ou 422 (`ValidationError`). */
export type CodigoErroCartao = "NAO_ENCONTRADA" | "CONFLITO" | "INVALIDA";
export type RecusaCartao = { ok: false; erro: string; codigo: CodigoErroCartao };
export type ResultadoCartao<T> = { ok: true; valor: T } | RecusaCartao;

export const recusa = (erro: string, codigo: CodigoErroCartao): RecusaCartao => ({ ok: false, erro, codigo });
export const naoEncontrado = (erro: string) => recusa(erro, "NAO_ENCONTRADA");
export const conflito = (erro: string) => recusa(erro, "CONFLITO");
export const invalida = (erro: string) => recusa(erro, "INVALIDA");

type Validacao<T> = { ok: true; valor: T } | { ok: false; erro: string };

// ─── Ajudantes ──────────────────────────────────────────────────────────────

export const BANDEIRAS = ["visa", "mastercard", "elo", "amex", "hipercard", "outros"] as const;
export const STATUS_FATURA = ["aberta", "fechada", "paga"] as const;
export type StatusFatura = (typeof STATUS_FATURA)[number];

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const ZERO = dec("0");
const LIMITE_DO_BANCO = dec("9999999999999.99");

/** O UUID do pydantic: com ou sem hífens, em minúsculas e com hífens. `null` se não for UUID. */
export function lerUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = strip(v);
  if (!UUID.test(t)) return null;
  const h = t.replace(/-/g, "").toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** `int` do pydantic (modo leniente): inteiro do JSON, ou texto de inteiro. Booleano não vale. */
function inteiro(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) return Number(v.trim());
  return null;
}

/** `Decimal(15,2)`: até 13 dígitos inteiros depois de arredondar para os centavos. */
export const passaDoBanco = (d: Dec) => compara(reescala(d, -2), LIMITE_DO_BANCO) > 0 || compara(reescala(d, -2), { ...LIMITE_DO_BANCO, negativo: true }) < 0;

/** `_valor_monetario`: `quantize(Decimal("0.01"))`, meio para par. */
export const valorMonetario = (d: Dec): Dec => reescala(d, -2);

/** O dinheiro como o Python o mostra (`str(Decimal)`). */
export const str = (d: Dec): string => textoDec(d);

/** `uuid.uuid5(namespace, nome)`. */
export function uuid5(namespace: string, nome: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(Buffer.from(nome, "utf8")).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Infinito e NaN, que o `Decimal` aceita e o `dec` do porte não representa. */
export function naoFinito(t: string): "nan" | "+inf" | "-inf" | null {
  const s = strip(t).toLowerCase();
  const m = /^([+-]?)(inf|infinity|s?nan\d*)$/.exec(s);
  if (!m) return null;
  if (m[2].includes("nan")) return "nan";
  return m[1] === "-" ? "-inf" : "+inf";
}

// ─── Validação: cartão ──────────────────────────────────────────────────────

export type CartaoValidado = {
  nome: string;
  bandeira: string;
  ultimosDigitos: string | null;
  diaFechamento: number;
  diaVencimento: number;
  limite: Dec | null;
};

function textoEntre(v: unknown, campo: string, min: number, max: number): Validacao<string> {
  if (typeof v !== "string") return { ok: false, erro: `${campo} deve ser texto.` };
  if (len(v) < min) return { ok: false, erro: `${campo} deve ter ao menos ${min} caractere${min > 1 ? "s" : ""}.` };
  if (len(v) > max) return { ok: false, erro: `${campo} passa de ${max} caracteres.` };
  return { ok: true, valor: v };
}

function dia(v: unknown, campo: string): Validacao<number> {
  const n = inteiro(v);
  if (n === null) return { ok: false, erro: `${campo} deve ser um número inteiro.` };
  if (n < 1 || n > 28) return { ok: false, erro: `${campo} deve estar entre 1 e 28.` };
  return { ok: true, valor: n };
}

function limiteDoCartao(v: unknown, naoNegativo: boolean): Validacao<Dec | null> {
  if (v === null || v === undefined) return { ok: true, valor: null };
  const d = decimalDoCampo(v, "O limite");
  if (!d.ok) return d;
  if (naoNegativo && d.valor.negativo && !ehZero(d.valor)) return { ok: false, erro: "O limite não pode ser negativo." };
  if (passaDoBanco(d.valor)) return { ok: false, erro: "O limite passa do valor aceito." };
  return d;
}

/** `str.isdigit()` em cada caractere (inclui dígitos de outras escritas, como o Python). */
const soDigitosPy = (t: string) => t.length > 0 && [...t].every((c) => /\p{Nd}/u.test(c));

/** `CartaoCreate` */
export function validarCartao(c: Record<string, unknown>): Validacao<CartaoValidado> {
  const nome = textoEntre(c.nome, "O nome", 2, 200);
  if (!nome.ok) return nome;
  if (typeof c.bandeira !== "string") return { ok: false, erro: "Informe a bandeira." };
  const bandeira = strip(c.bandeira).toLowerCase();
  if (!(BANDEIRAS as readonly string[]).includes(bandeira)) return { ok: false, erro: `Bandeira inválida. Opções: ${BANDEIRAS.join(", ")}.` };
  let ultimosDigitos: string | null = null;
  if (c.ultimosDigitos !== null && c.ultimosDigitos !== undefined) {
    if (typeof c.ultimosDigitos !== "string") return { ok: false, erro: "Os últimos dígitos devem ser texto." };
    const v = strip(c.ultimosDigitos);
    if (!soDigitosPy(v) || len(v) !== 4) return { ok: false, erro: "ultimos_digitos deve ter exatamente 4 dígitos numéricos." };
    ultimosDigitos = v;
  }
  const fechamento = dia(c.diaFechamento, "O dia de fechamento");
  if (!fechamento.ok) return fechamento;
  const vencimento = dia(c.diaVencimento, "O dia de vencimento");
  if (!vencimento.ok) return vencimento;
  const limite = limiteDoCartao(c.limite, true);
  if (!limite.ok) return limite;
  return { ok: true, valor: { nome: nome.valor, bandeira, ultimosDigitos, diaFechamento: fechamento.valor, diaVencimento: vencimento.valor, limite: limite.valor } };
}

export type AtualizacaoDoCartao = { nome?: string; diaFechamento?: number; diaVencimento?: number; limite?: Dec; ativo?: boolean };

/**
 * `CartaoUpdate`: só o que veio (e não é nulo) muda, como em `atualizar_cartao`. O limite aqui NÃO tem o
 * `ge=0` do cadastro (como no original): um limite negativo passa.
 */
export function validarAtualizacaoDoCartao(c: Record<string, unknown>): Validacao<AtualizacaoDoCartao> {
  const r: AtualizacaoDoCartao = {};
  if (c.nome !== null && c.nome !== undefined) {
    const nome = textoEntre(c.nome, "O nome", 2, 200);
    if (!nome.ok) return nome;
    r.nome = nome.valor;
  }
  for (const [campo, nome] of [
    ["diaFechamento", "O dia de fechamento"],
    ["diaVencimento", "O dia de vencimento"],
  ] as const) {
    if (c[campo] === null || c[campo] === undefined) continue;
    const d = dia(c[campo], nome);
    if (!d.ok) return d;
    r[campo] = d.valor;
  }
  const limite = limiteDoCartao(c.limite, false);
  if (!limite.ok) return limite;
  if (limite.valor) r.limite = limite.valor;
  if (c.ativo !== null && c.ativo !== undefined) {
    if (typeof c.ativo !== "boolean") return { ok: false, erro: "ativo deve ser verdadeiro ou falso." };
    r.ativo = c.ativo;
  }
  return { ok: true, valor: r };
}

// ─── Validação: fatura ──────────────────────────────────────────────────────

const COMPETENCIA = re("(\\d{4})-(\\d{2})");

/** `normalizar_competencia`: "AAAA-MM", aparado, ano diferente de zero e mês de 01 a 12. */
export function lerCompetencia(v: unknown): Validacao<string> {
  if (typeof v !== "string") return { ok: false, erro: "Competência deve ser texto." };
  const t = strip(v);
  const m = COMPETENCIA.fullmatch(t);
  if (!m || inteiroPy(m[1]!) === 0 || inteiroPy(m[2]!) < 1 || inteiroPy(m[2]!) > 12) {
    return { ok: false, erro: "Competência deve estar no formato AAAA-MM, com mês entre 01 e 12." };
  }
  return { ok: true, valor: t };
}

function observacao(v: unknown): Validacao<string | null> {
  if (v === null || v === undefined) return { ok: true, valor: null };
  if (typeof v !== "string") return { ok: false, erro: "A observação deve ser texto." };
  if (len(v) > 500) return { ok: false, erro: "A observação passa de 500 caracteres." };
  return { ok: true, valor: v };
}

export type FaturaValidada = { competencia: string; dataFechamento: Date | null; dataVencimento: Date | null; observacao: string | null };

/** `FaturaCreate` */
export function validarFatura(c: Record<string, unknown>): Validacao<FaturaValidada> {
  const competencia = lerCompetencia(c.competencia);
  if (!competencia.ok) return competencia;
  const fechamento = dataDoCampo(c.dataFechamento, "Data de fechamento");
  if (!fechamento.ok) return fechamento;
  const vencimento = dataDoCampo(c.dataVencimento, "Data de vencimento");
  if (!vencimento.ok) return vencimento;
  const obs = observacao(c.observacao);
  if (!obs.ok) return obs;
  return { ok: true, valor: { competencia: competencia.valor, dataFechamento: fechamento.valor, dataVencimento: vencimento.valor, observacao: obs.valor } };
}

export type AtualizacaoDaFatura = { status: StatusFatura | null; dataVencimento: Date | null; observacao: string | null };

/** `FaturaUpdate`: nulo é "não mudar". */
export function validarAtualizacaoDaFatura(c: Record<string, unknown>): Validacao<AtualizacaoDaFatura> {
  let status: StatusFatura | null = null;
  if (c.status !== null && c.status !== undefined) {
    if (typeof c.status !== "string" || !(STATUS_FATURA as readonly string[]).includes(c.status)) {
      return { ok: false, erro: `Status inválido. Opções: ${STATUS_FATURA.join(", ")}.` };
    }
    status = c.status as StatusFatura;
  }
  const vencimento = dataDoCampo(c.dataVencimento, "Data de vencimento");
  if (!vencimento.ok) return vencimento;
  const obs = observacao(c.observacao);
  if (!obs.ok) return obs;
  return { ok: true, valor: { status, dataVencimento: vencimento.valor, observacao: obs.valor } };
}

/**
 * `atualizar_fatura`, depois de achar a fatura: a paga não reabre, e só a associação de uma transação a
 * deixa paga. Note-se que "status nulo" numa fatura paga também é recusado, como no original
 * (`data.status != "paga"` é verdadeiro para `None`).
 */
export function conferirAtualizacaoDaFatura(atual: StatusFatura, novo: StatusFatura | null): RecusaCartao | null {
  if (atual === "paga" && novo !== "paga") return invalida("Faturas pagas não podem ser reabertas.");
  if (atual !== "paga" && novo === "paga") return invalida("Uma fatura só pode ser paga pela associação de uma transação válida.");
  return null;
}

// ─── Validação: lançamento ──────────────────────────────────────────────────

export type LancamentoValidado = {
  dataCompra: Date;
  descricao: string;
  valor: Dec;
  contaId: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
};

function parcela(v: unknown, nome: string): Validacao<number | null> {
  if (v === null || v === undefined) return { ok: true, valor: null };
  const n = inteiro(v);
  if (n === null) return { ok: false, erro: `${nome} deve ser um número inteiro.` };
  if (n < 1) return { ok: false, erro: `${nome} deve ser 1 ou mais.` };
  if (n > 2_147_483_647) return { ok: false, erro: `${nome} passa do limite aceito.` };
  return { ok: true, valor: n };
}

/** `LancamentoCreate` */
export function validarLancamento(c: Record<string, unknown>): Validacao<LancamentoValidado> {
  if (c.dataCompra === null || c.dataCompra === undefined) return { ok: false, erro: "Informe a data da compra." };
  const data = dataDoCampo(c.dataCompra, "Data da compra");
  if (!data.ok) return data;
  const descricao = textoEntre(c.descricao, "A descrição", 1, 500);
  if (!descricao.ok) return descricao;
  if (c.valor === null || c.valor === undefined) return { ok: false, erro: "Informe o valor." };
  const valor = decimalDoCampo(c.valor, "O valor");
  if (!valor.ok) return valor;
  if (ehZero(valor.valor) || valor.valor.negativo) return { ok: false, erro: "O valor deve ser maior que zero." };
  let contaId: string | null = null;
  if (c.contaId !== null && c.contaId !== undefined) {
    contaId = lerUuid(c.contaId);
    if (!contaId) return { ok: false, erro: "Conta contábil inválida." };
  }
  const atual = parcela(c.parcelaAtual, "A parcela atual");
  if (!atual.ok) return atual;
  const total = parcela(c.parcelaTotal, "O total de parcelas");
  if (!total.ok) return total;
  if (passaDoBanco(valor.valor)) return { ok: false, erro: "O valor passa do limite aceito." };
  return { ok: true, valor: { dataCompra: data.valor!, descricao: descricao.valor, valor: valor.valor, contaId, parcelaAtual: atual.valor, parcelaTotal: total.valor } };
}

// ─── Fatura: totais e conferências ──────────────────────────────────────────

/** `associar_transacao`, depois de achar a fatura, a transação e a outra fatura que ela já quitou. */
export function conferirAssociacao(
  fatura: { transacaoId: string | null },
  transacao: { dc: string; valor: Dec } | null,
  outraFatura: boolean,
  valorTotal: Dec,
): RecusaCartao | null {
  if (fatura.transacaoId !== null) return conflito("Esta fatura já possui uma transação de pagamento.");
  if (!transacao) return naoEncontrado(TRANSACAO_NAO_ENCONTRADA);
  if (outraFatura) return conflito("Esta transação já quitou outra fatura.");
  if (transacao.dc !== "D") return invalida("O pagamento da fatura deve ser uma transação de débito.");
  if (compara(valorMonetario(transacao.valor), valorMonetario(valorTotal)) !== 0) {
    return invalida(`O valor da transação deve ser igual ao total da fatura (${fixo(valorTotal, 2)}).`);
  }
  return null;
}

// ─── A identidade da compra importada ───────────────────────────────────────

const CAMPOS_DE_ID = ["id", "identificador", "transaction_id", "transactionid", "purchase_id", "reference", "referencia"];

const ESPACOS_PY = new RegExp("[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+", "gu");

/** `_identificador_compra`: o id externo da linha, ou data (UTC), descrição normalizada e valor. */
export function identificadorDaCompra(linha: ReadonlyMap<string, string>, dataCompra: Date, descricao: string, valor: Dec): string {
  let externo: string | null = null;
  for (const campo of CAMPOS_DE_ID) {
    const v = strip(linha.get(campo) ?? "");
    if (v) {
      externo = v;
      break;
    }
  }
  let base: string;
  if (externo) base = `externo:${externo}`;
  else {
    const normalizada = strip(casefold(descricao).replace(ESPACOS_PY, " "));
    base = [isoUtc(dataCompra), normalizada, str(valorMonetario(valor))].join("|");
  }
  return createHash("sha256").update(base, "utf8").digest("hex");
}

// ─── O CSV (`csv.DictReader` do Python) ─────────────────────────────────────

/** `csv.Error`: o original deixava escapar (erro 500); aqui o arquivo é recusado com a frase. */
export class CsvInvalido extends Error {}

const LIMITE_DO_CAMPO = 131_072;

/** `csv.reader` com o dialeto `excel` sobre `io.StringIO(texto)` (as linhas quebram só em "\n"). */
export function lerCsv(texto: string): string[][] {
  const linhas = texto.split(/(?<=\n)/);
  const registros: string[][] = [];
  type Estado = "inicio_registro" | "inicio_campo" | "campo" | "entre_aspas" | "aspa_entre_aspas" | "fim_de_linha";
  let estado: Estado = "inicio_registro";
  let campos: string[] = [];
  let campo = "";
  let tamanho = 0;
  const salvar = () => {
    campos.push(campo);
    campo = "";
    tamanho = 0;
  };
  const somar = (c: string) => {
    if (tamanho >= LIMITE_DO_CAMPO) throw new CsvInvalido(`Uma célula passa de ${LIMITE_DO_CAMPO} caracteres.`);
    campo += c;
    tamanho++;
  };
  const FIM = "";
  const processar = (c: string) => {
    const quebra = c === "\n" || c === "\r";
    switch (estado) {
      case "inicio_registro":
        if (c === FIM) return;
        if (quebra) {
          estado = "fim_de_linha";
          return;
        }
        estado = "inicio_campo";
      // segue como início de campo
      case "inicio_campo":
        if (quebra || c === FIM) {
          salvar();
          estado = c === FIM ? "inicio_registro" : "fim_de_linha";
        } else if (c === '"') estado = "entre_aspas";
        else if (c === ",") salvar();
        else {
          somar(c);
          estado = "campo";
        }
        return;
      case "campo":
        if (quebra || c === FIM) {
          salvar();
          estado = c === FIM ? "inicio_registro" : "fim_de_linha";
        } else if (c === ",") {
          salvar();
          estado = "inicio_campo";
        } else somar(c);
        return;
      case "entre_aspas":
        if (c === FIM) return;
        if (c === '"') estado = "aspa_entre_aspas";
        else somar(c);
        return;
      case "aspa_entre_aspas":
        if (c === '"') {
          somar(c);
          estado = "entre_aspas";
        } else if (c === ",") {
          salvar();
          estado = "inicio_campo";
        } else if (quebra || c === FIM) {
          salvar();
          estado = c === FIM ? "inicio_registro" : "fim_de_linha";
        } else {
          somar(c);
          estado = "campo";
        }
        return;
      case "fim_de_linha":
        if (quebra) return;
        if (c === FIM) {
          estado = "inicio_registro";
          return;
        }
        throw new CsvInvalido("O CSV tem uma quebra de linha no meio de uma célula sem aspas. Salve o arquivo de novo como CSV e reenvie.");
    }
  };
  let i = 0;
  while (i < linhas.length) {
    do {
      if (i >= linhas.length) {
        // Fim do arquivo no meio de um registro: o original (não estrito) salva o campo e devolve.
        if (tamanho !== 0 || (estado as Estado) === "entre_aspas") {
          salvar();
          registros.push(campos);
        }
        return registros;
      }
      for (const c of linhas[i]) processar(c);
      processar(FIM);
      i++;
    } while (estado !== "inicio_registro");
    registros.push(campos);
    campos = [];
  }
  return registros;
}

/**
 * `csv.DictReader`: a primeira linha é o cabeçalho; as linhas vazias são puladas; a coluna a mais vai para a
 * chave `None` (que `importar_csv` descarta). A coluna a menos fica `None` no original, e o `.strip()` em
 * `None` derrubava a importação inteira (erro 500): aqui o arquivo é recusado com a frase.
 * Cada linha vira o `row_lower` de `importar_csv` (chaves em minúsculas e aparadas, valores aparados).
 */
export function linhasDoCsv(texto: string): Map<string, string>[] {
  const registros = lerCsv(texto);
  if (!registros.length) return [];
  const cabecalho = registros[0];
  const saida: Map<string, string>[] = [];
  let n = 1;
  for (const r of registros.slice(1)) {
    if (!r.length) continue;
    n++;
    if (r.length < cabecalho.length) {
      throw new CsvInvalido(`A linha ${n} tem menos colunas que o cabeçalho. Confira o arquivo e reenvie.`);
    }
    const linha = new Map<string, string>();
    cabecalho.forEach((chave, k) => {
      if (chave) linha.set(strip(chave.toLowerCase()), strip(r[k]));
    });
    saida.push(linha);
  }
  return saida;
}

// ─── Data e valor do CSV (`_parse_data` e `_parse_valor` do serviço) ────────

const DIA = "(3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])";
const MES = "(1[0-2]|0[1-9]|[1-9])";
const FORMATOS: { padrao: ReturnType<typeof re>; ordem: ("d" | "m" | "Y" | "y")[] }[] = [
  { padrao: re(`${DIA}/${MES}/(\\d\\d\\d\\d)`, "i"), ordem: ["d", "m", "Y"] },
  { padrao: re(`(\\d\\d\\d\\d)-${MES}-${DIA}`, "i"), ordem: ["Y", "m", "d"] },
  { padrao: re(`${DIA}-${MES}-(\\d\\d\\d\\d)`, "i"), ordem: ["d", "m", "Y"] },
  { padrao: re(`${DIA}/${MES}/(\\d\\d)`, "i"), ordem: ["d", "m", "y"] },
  { padrao: re(`(\\d\\d\\d\\d)/${MES}/${DIA}`, "i"), ordem: ["Y", "m", "d"] },
];

/** `_parse_data` do serviço: o `strptime` de cada formato, na ordem, à meia-noite UTC. */
export function lerDataDoCsv(s: string): Date | null {
  for (const f of FORMATOS) {
    const m = f.padrao.match(s);
    if (!m || m.fim !== s.length) continue;
    const v: Record<string, number> = {};
    f.ordem.forEach((k, j) => (v[k] = inteiroPy(m[j + 1]!)));
    const ano = v.Y ?? (v.y <= 68 ? 2000 + v.y : 1900 + v.y);
    if (ano < 1) continue;
    const d = new Date(Date.UTC(ano, v.m - 1, v.d));
    if (ano < 100) d.setUTCFullYear(ano);
    if (d.getUTCMonth() !== v.m - 1 || d.getUTCDate() !== v.d) continue;
    return d;
  }
  return null;
}

/** `_parse_valor` do serviço: separadores brasileiros (1.234,56) e americanos (1,234.56). */
export function textoDoValorDoCsv(entrada: string): string {
  let s = strip(entrada.replaceAll(" ", "").replaceAll("R$", ""));
  if (s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replaceAll(".", "").replace(/,/g, ".");
  else s = s.replaceAll(",", "");
  return s;
}

// ─── Importar (CSV e PDF) ───────────────────────────────────────────────────

/** Um lançamento a gravar, com o id do original (`uuid5(fatura, identificador)`). */
export type LancamentoNovo = {
  id: string;
  dataCompra: Date;
  descricao: string;
  valor: Dec;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
};

export type ResultadoDaImportacao = { importados: number; duplicados: number; erros: string[]; novos: LancamentoNovo[] };

/** O valor de uma linha: o `Decimal` do texto, ou a recusa da linha (o original mostrava a exceção do Python). */
type ValorDaLinha = { ok: true; valor: Dec } | { ok: false; erro: string };

/** As frases do porte no lugar da exceção crua do `decimal` (`[<class 'decimal.ConversionSyntax'>]`). */
export const VALOR_ILEGIVEL_NA_LINHA = (bruto: string) => `valor ilegível (${bruto}).`;
export const VALOR_NAO_FINITO = "valor inválido (não é um número finito).";
export const VALOR_ACIMA_DO_LIMITE = "o valor passa do limite aceito.";
export const DESCRICAO_LONGA = "a descrição passa de 500 caracteres.";
export const COMPRA_REMOVIDA = "esta compra já esteve nesta fatura e foi removida; cadastre-a à mão se for outra compra.";

/**
 * As conferências de cada compra, comuns ao CSV e ao PDF: valor positivo e finito, a identidade (duplicada
 * no banco ou no arquivo), e o que a coluna não guarda. `removidos` são os ids que já existiram na fatura e
 * foram excluídos: o original tentava gravar de novo o mesmo id e a importação inteira caía (erro 500).
 */
function conferirCompra(
  prefixo: string,
  valor: ValorDaLinha,
  brutoDoValor: string,
  dados: { dataCompra: Date; descricao: string; linha: ReadonlyMap<string, string>; parcelaAtual: number | null; parcelaTotal: number | null },
  faturaId: string,
  vistos: { existentes: ReadonlySet<string>; removidos: ReadonlySet<string>; noArquivo: Set<string> },
  r: ResultadoDaImportacao,
): void {
  if (!valor.ok) {
    r.erros.push(`${prefixo}: ${valor.erro}`);
    return;
  }
  if (ehZero(valor.valor) || valor.valor.negativo) {
    r.erros.push(`${prefixo}: valor deve ser positivo (${brutoDoValor}).`);
    return;
  }
  const id = uuid5(faturaId, identificadorDaCompra(dados.linha, dados.dataCompra, dados.descricao, valor.valor));
  if (vistos.existentes.has(id) || vistos.noArquivo.has(id)) {
    r.duplicados++;
    return;
  }
  if (passaDoBanco(valor.valor)) {
    r.erros.push(`${prefixo}: ${VALOR_ACIMA_DO_LIMITE}`);
    return;
  }
  if (len(dados.descricao) > 500) {
    r.erros.push(`${prefixo}: ${DESCRICAO_LONGA}`);
    return;
  }
  if (vistos.removidos.has(id)) {
    r.erros.push(`${prefixo}: ${COMPRA_REMOVIDA}`);
    return;
  }
  vistos.noArquivo.add(id);
  r.novos.push({ id, dataCompra: dados.dataCompra, descricao: dados.descricao, valor: valor.valor, parcelaAtual: dados.parcelaAtual, parcelaTotal: dados.parcelaTotal });
  r.importados++;
}

/** O valor de um texto do `Decimal`: o infinito positivo passava no `<= 0` e caía no `quantize`. */
function valorDoTexto(t: string): ValorDaLinha {
  const nf = naoFinito(t);
  if (nf === "-inf") return { ok: true, valor: { negativo: true, coeficiente: BigInt(1), expoente: 0 } };
  if (nf) return { ok: false, erro: VALOR_NAO_FINITO };
  const d = decimal(t);
  if (d === null || d === NAO_FINITO) return { ok: false, erro: VALOR_ILEGIVEL_NA_LINHA(t) };
  // `quantize(Decimal("0.01"))` com 28 dígitos de precisão: acima disso, `InvalidOperation`.
  if (d.coeficiente.toString().length + d.expoente + 2 > 28 && !ehZero(d)) return { ok: false, erro: VALOR_NAO_FINITO };
  return { ok: true, valor: d };
}

/** `importar_csv` sobre as linhas lidas. Linha com erro é relatada sem perder as boas. */
export function importarLinhasDoCsv(
  linhas: readonly ReadonlyMap<string, string>[],
  faturaId: string,
  existentes: ReadonlySet<string>,
  removidos: ReadonlySet<string> = new Set(),
): ResultadoDaImportacao {
  const r: ResultadoDaImportacao = { importados: 0, duplicados: 0, erros: [], novos: [] };
  const vistos = { existentes, removidos, noArquivo: new Set<string>() };
  linhas.forEach((linha, k) => {
    const n = k + 2;
    const primeiro = (...chaves: string[]) => strip(chaves.map((c) => linha.get(c) ?? "").find((v) => v !== "") ?? "");
    const dataBruta = primeiro("data_compra", "data", "date");
    if (!dataBruta) {
      r.erros.push(`Linha ${n}: campo 'data_compra' ausente.`);
      return;
    }
    const dataCompra = lerDataDoCsv(dataBruta);
    if (!dataCompra) {
      r.erros.push(`Linha ${n}: Data inválida: '${dataBruta}'. Use dd/mm/yyyy ou yyyy-mm-dd.`);
      return;
    }
    const descricao = primeiro("descricao", "description", "historico");
    if (!descricao) {
      r.erros.push(`Linha ${n}: campo 'descricao' ausente.`);
      return;
    }
    const valorBruto = primeiro("valor", "value", "amount");
    if (!valorBruto) {
      r.erros.push(`Linha ${n}: campo 'valor' ausente.`);
      return;
    }
    conferirCompra(`Linha ${n}`, valorDoTexto(textoDoValorDoCsv(valorBruto)), valorBruto, { dataCompra, descricao, linha, parcelaAtual: null, parcelaTotal: null }, faturaId, vistos, r);
  });
  return r;
}

/** Um lançamento lido do PDF (`LancamentoPDF`), como o leitor o devolve. */
export type LancamentoDoPdf = { dataCompra: string; descricao: string; valor: string; parcelaAtual: number | null; parcelaTotal: number | null };

/** `importar_lancamentos_pdf`: a mesma identidade do CSV, sem id externo. */
export function importarLancamentosDoPdf(
  lidos: readonly LancamentoDoPdf[],
  faturaId: string,
  existentes: ReadonlySet<string>,
  removidos: ReadonlySet<string> = new Set(),
): ResultadoDaImportacao {
  const r: ResultadoDaImportacao = { importados: 0, duplicados: 0, erros: [], novos: [] };
  const vistos = { existentes, removidos, noArquivo: new Set<string>() };
  lidos.forEach((item, k) => {
    const dataCompra = new Date(`${item.dataCompra}T00:00:00.000Z`);
    const [ano] = item.dataCompra.split("-").map(Number);
    if (ano < 100) dataCompra.setUTCFullYear(ano);
    conferirCompra(`Lançamento ${k + 1}`, valorDoTexto(item.valor), item.valor, { dataCompra, descricao: item.descricao, linha: new Map(), parcelaAtual: item.parcelaAtual, parcelaTotal: item.parcelaTotal }, faturaId, vistos, r);
  });
  return r;
}

// ─── Distribuição: o hash da classificação bancária ─────────────────────────

export type PagamentoDaFatura = { id: string; valor: Dec; data: string; dc: string; status: string; agenciaId: string; historico: string };
export type PartidaDoPagamento = { id: string; contaId: string; valor: Dec; historico: string | null; dc: string };

/**
 * `_hash`: o SHA-256 do `repr` da tupla (pagamento, partidas vivas por id), como o Python. O mesmo texto
 * byte a byte: o hash que o original gravou na aplicação continua conferindo depois da carga (C4).
 */
export function hashDaClassificacao(partidas: readonly PartidaDoPagamento[], pagamento: PagamentoDaFatura | null): string {
  let material = "None";
  if (pagamento) {
    const lista = partidas.map((p) => `(${[p.id, p.contaId, str(p.valor)].map(reprPy).join(", ")}, ${p.historico === null ? "None" : reprPy(p.historico)}, ${reprPy(p.dc)})`);
    material = `(${[pagamento.id, str(pagamento.valor), pagamento.data, pagamento.dc, pagamento.status, pagamento.agenciaId].map(reprPy).join(", ")}, [${lista.join(", ")}])`;
  }
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/** `_historico`: "Fatura 2026-04 · Compra 2026-03-01 · <histórico do componente>". */
export const historicoDoComponente = (competencia: string, dataCompra: string, historico: string) => `Fatura ${competencia} · Compra ${dataCompra} · ${historico}`;

// ─── Distribuição: os componentes ───────────────────────────────────────────

/** Um componente como o original guarda (`NeoComponenteInput.model_dump(mode="json")`). */
export type ComponenteGuardado = { conta_id: string; historico: string; valor: string };
export type Distribuicoes = Record<string, ComponenteGuardado[]>;

/** `NeoComponenteInput`: conta, histórico (aparado, 2 a 500) e valor positivo com até 2 casas. */
export function validarComponente(c: unknown): Validacao<{ contaId: string; historico: string; valor: Dec }> {
  if (typeof c !== "object" || c === null || Array.isArray(c)) return { ok: false, erro: "Componente inválido." };
  const o = c as Record<string, unknown>;
  const contaId = lerUuid(o.conta_id ?? o.contaId);
  if (!contaId) return { ok: false, erro: "Conta contábil inválida." };
  const h = o.historico;
  if (typeof h !== "string") return { ok: false, erro: "O histórico deve ser texto." };
  const historico = strip(h);
  if (len(historico) < 2 || len(historico) > 500) return { ok: false, erro: "Cada componente precisa de um histórico de 2 a 500 caracteres." };
  if (o.valor === null || o.valor === undefined) return { ok: false, erro: "Informe o valor." };
  const valor = decimalDoCampo(o.valor, "O valor");
  if (!valor.ok) return { ok: false, erro: "Informe um valor positivo com no maximo dois decimais." };
  if (ehZero(valor.valor) || valor.valor.negativo || valor.valor.expoente < -2) return { ok: false, erro: "Informe um valor positivo com no maximo dois decimais." };
  return { ok: true, valor: { contaId, historico, valor: valor.valor } };
}

/** O componente validado como o `model_dump(mode="json")` o guarda (o valor como o `str` do `Decimal`). */
export const guardado = (c: { contaId: string; historico: string; valor: Dec }): ComponenteGuardado => ({ conta_id: c.contaId, historico: c.historico, valor: str(c.valor) });

function versao(v: unknown): Validacao<number> {
  const n = inteiro(v);
  if (n === null || n < 0 || n > 2_147_483_646) return { ok: false, erro: "Versão inválida. Atualize a tela." };
  return { ok: true, valor: n };
}

function motivo(v: unknown): Validacao<string> {
  if (typeof v !== "string" || len(v) < 1) return { ok: false, erro: "Informe o motivo." };
  if (len(v) > 300) return { ok: false, erro: "O motivo passa de 300 caracteres." };
  if (!strip(v)) return { ok: false, erro: "Informe o motivo." };
  return { ok: true, valor: strip(v) };
}

/** `FaturaDistribuicaoSalvar`: a versão e os componentes de cada gasto (até 20 mil gastos). */
export function validarSalvarDistribuicao(c: Record<string, unknown>): Validacao<{ versao: number; distribuicoes: Distribuicoes }> {
  const v = versao(c.versao);
  if (!v.ok) return v;
  const d = c.distribuicoes;
  if (typeof d !== "object" || d === null || Array.isArray(d)) return { ok: false, erro: "Informe a distribuição." };
  const entradas = Object.entries(d as Record<string, unknown>);
  if (entradas.length > 20_000) return { ok: false, erro: "Limite de 20 mil gastos por fatura excedido." };
  const saida: Distribuicoes = {};
  for (const [chave, partes] of entradas) {
    const id = lerUuid(chave);
    if (!id) return { ok: false, erro: "Gasto inválido na distribuição." };
    if (!Array.isArray(partes)) return { ok: false, erro: "Os componentes de um gasto devem ser uma lista." };
    const lista: ComponenteGuardado[] = [];
    for (const p of partes) {
      const comp = validarComponente(p);
      if (!comp.ok) return comp;
      lista.push(guardado(comp.valor));
    }
    // Duas chaves que são o mesmo UUID (com e sem hífen): a última vale, como no dict do pydantic.
    saida[id] = lista;
  }
  return { ok: true, valor: { versao: v.valor, distribuicoes: saida } };
}

/** `FaturaDistribuicaoAplicar` */
export function validarAplicarDistribuicao(c: Record<string, unknown>): Validacao<{ versao: number; classificacaoHash: string; motivo: string }> {
  const v = versao(c.versao);
  if (!v.ok) return v;
  const h = c.classificacaoHash;
  if (typeof h !== "string" || len(h) !== 64) return { ok: false, erro: "A classificação bancária mudou. Atualize a tela." };
  const m = motivo(c.motivo);
  if (!m.ok) return m;
  return { ok: true, valor: { versao: v.valor, classificacaoHash: h, motivo: m.valor } };
}

/** `FaturaDistribuicaoDesfazer` */
export function validarDesfazerDistribuicao(c: Record<string, unknown>): Validacao<{ versao: number; motivo: string; preservarAtual: boolean }> {
  const v = versao(c.versao);
  if (!v.ok) return v;
  const m = motivo(c.motivo);
  if (!m.ok) return m;
  const p = c.preservarClassificacaoAtual;
  if (p !== undefined && p !== null && typeof p !== "boolean") return { ok: false, erro: "preservar_classificacao_atual deve ser verdadeiro ou falso." };
  return { ok: true, valor: { versao: v.valor, motivo: m.valor, preservarAtual: p === true } };
}

/** `ItemFaturaRevisado` */
export type ItemRevisado = { data: string; descricao: string; valor: string; referencia: string };
export type ConfirmacaoDoDocumento = { versao: number; principal: boolean; substituir: boolean; pendenciasResolvidas: boolean; total: string; itens: ItemRevisado[] };

function booleano(v: unknown, nome: string, padrao: boolean | null): Validacao<boolean> {
  if (v === undefined || v === null) return padrao === null ? { ok: false, erro: `Informe ${nome}.` } : { ok: true, valor: padrao };
  if (typeof v !== "boolean") return { ok: false, erro: `${nome} deve ser verdadeiro ou falso.` };
  return { ok: true, valor: v };
}

/** `FaturaDocumentoConfirmar` (com `ItemFaturaRevisado`). */
export function validarConfirmacao(c: Record<string, unknown>): Validacao<ConfirmacaoDoDocumento> {
  const v = versao(c.versao);
  if (!v.ok) return v;
  const principal = booleano(c.principal, "principal", null);
  if (!principal.ok) return principal;
  const substituir = booleano(c.substituir, "substituir", false);
  if (!substituir.ok) return substituir;
  const pendencias = booleano(c.pendenciasResolvidas, "pendencias_resolvidas", false);
  if (!pendencias.ok) return pendencias;
  let total = "0";
  if (c.total !== undefined) {
    if (typeof c.total !== "string" || len(c.total) > 30) return { ok: false, erro: "Informe o total da fatura (até 30 caracteres)." };
    total = c.total;
  }
  const itens: ItemRevisado[] = [];
  if (c.itens !== undefined) {
    if (!Array.isArray(c.itens)) return { ok: false, erro: "Os itens devem ser uma lista." };
    if (c.itens.length > 20_000) return { ok: false, erro: "O documento deve conter de 1 a 20 mil itens." };
    for (const [k, bruto] of c.itens.entries()) {
      const i = (typeof bruto === "object" && bruto !== null ? bruto : {}) as Record<string, unknown>;
      const ref = i.referencia ?? "";
      if (
        typeof i.data !== "string" || len(i.data) !== 10 ||
        typeof i.descricao !== "string" || len(i.descricao) < 1 || len(i.descricao) > 500 ||
        typeof i.valor !== "string" || len(i.valor) > 30 ||
        typeof ref !== "string" || len(ref) > 100
      ) {
        return { ok: false, erro: `Revise data, descrição e valor do item ${k + 1}.` };
      }
      itens.push({ data: i.data, descricao: i.descricao, valor: i.valor, referencia: ref });
    }
  }
  return { ok: true, valor: { versao: v.valor, principal: principal.valor, substituir: substituir.valor, pendenciasResolvidas: pendencias.valor, total, itens } };
}

/** O `model_dump(mode="json")` da confirmação, como o original grava em `resultado.revisao`. */
export const revisaoGuardada = (d: ConfirmacaoDoDocumento) => ({
  versao: d.versao,
  principal: d.principal,
  substituir: d.substituir,
  pendencias_resolvidas: d.pendenciasResolvidas,
  total: d.total,
  itens: d.itens.map((i) => ({ data: i.data, descricao: i.descricao, valor: i.valor, referencia: i.referencia })),
});

// ─── Distribuição: a vista e as conferências ────────────────────────────────

/** Um gasto vivo da fatura, na ordem de `_itens` (data da compra, id). */
export type GastoDaFatura = { id: string; dataCompra: string; descricao: string; valor: Dec };

/** A linha de `fatura_distribuicoes`. */
export type EstadoDaDistribuicao = { versao: number; distribuicoes: Distribuicoes; aplicacao: AplicacaoGuardada | null };
export type AplicacaoGuardada = { antes: { componentes: ComponenteGuardado[] } | null; transacao_id: string; hash: string };

export type DocumentoDaFatura = { id: string; nome: string; status: string; resultado: unknown; erro: string | null; atualizadoEm: Date; temArquivo: boolean };

/** `leitura_expirada`: a leitura "processando" há mais que o prazo da imagem (300 s) mais 60 s. */
export const SEGUNDOS_DA_LEITURA = 300;
export function leituraExpirada(d: { status: string; atualizadoEm: Date }, agora: Date = new Date()): boolean {
  return d.status === "processando" && (agora.getTime() - d.atualizadoEm.getTime()) / 1000 > SEGUNDOS_DA_LEITURA + 60;
}
export const LEITURA_INTERROMPIDA = "A leitura foi interrompida; tente novamente.";

/** O que `obter` devolve (as chaves em camelCase; os valores com as do original). */
export type VistaDaDistribuicao = {
  versao: number;
  itens: { id: string; data: string; descricao: string; valor: string }[];
  distribuicoes: Distribuicoes;
  gastosAlterados: boolean;
  total: string;
  distribuido: string;
  restante: string;
  classificacaoHash: string;
  pagamentoId: string | null;
  aplicacao: "APLICADA" | "DESATUALIZADA" | null;
  documentos: { id: string; nome: string; status: string; resultado: unknown; erro: string | null; temArquivo: boolean }[];
};

/** `obter`, sobre o que já foi lido. */
export function vistaDaDistribuicao(
  estado: EstadoDaDistribuicao | null,
  itens: readonly GastoDaFatura[],
  hashAtual: string,
  pagamentoId: string | null,
  documentos: readonly DocumentoDaFatura[],
  agora: Date = new Date(),
): VistaDaDistribuicao {
  const todas = estado ? estado.distribuicoes : {};
  const ids = new Set(itens.map((i) => i.id));
  const gastosAlterados = Object.keys(todas).some((id) => !ids.has(id));
  const distribuicoes: Distribuicoes = {};
  for (const [id, partes] of Object.entries(todas)) if (ids.has(id)) distribuicoes[id] = partes;
  const total = somaTodos([ZERO, ...itens.map((i) => i.valor)]);
  const distribuido = somaTodos([ZERO, ...Object.values(distribuicoes).flat().map((c) => dec(c.valor))]);
  return {
    versao: estado ? estado.versao : 0,
    itens: itens.map((i) => ({ id: i.id, data: i.dataCompra, descricao: i.descricao, valor: str(i.valor) })),
    distribuicoes,
    gastosAlterados,
    total: str(total),
    distribuido: str(distribuido),
    restante: str(subtrai(total, distribuido)),
    classificacaoHash: hashAtual,
    pagamentoId,
    aplicacao: estado && estado.aplicacao ? (estado.aplicacao.hash !== hashAtual ? "DESATUALIZADA" : "APLICADA") : null,
    documentos: documentos.map((d) => {
      const expirada = leituraExpirada(d, agora);
      return { id: d.id, nome: d.nome, status: expirada ? "falhou" : d.status, resultado: d.resultado, erro: expirada ? LEITURA_INTERROMPIDA : d.erro, temArquivo: d.temArquivo };
    }),
  };
}

/**
 * `salvar`, antes das contas: a distribuição aplicada não muda, o gasto tem de ser desta fatura, até 20 mil
 * componentes, e nenhum gasto recebe mais que o próprio valor. Devolve as contas a conferir.
 */
export function conferirSalvar(estado: EstadoDaDistribuicao, itens: readonly GastoDaFatura[], distribuicoes: Distribuicoes): RecusaCartao | { contas: Set<string> } {
  if (estado.aplicacao) return conflito("Desfaça a aplicação antes de alterar a distribuição.");
  const porId = new Map(itens.map((i) => [i.id, i]));
  if (Object.keys(distribuicoes).some((id) => !porId.has(id))) return invalida("Há gastos que não pertencem a esta fatura.");
  if (Object.values(distribuicoes).reduce((n, p) => n + p.length, 0) > 20_000) return invalida("Limite de 20 mil componentes por fatura excedido.");
  const contas = new Set<string>();
  for (const [id, partes] of Object.entries(distribuicoes)) {
    const item = porId.get(id)!;
    if (compara(somaTodos([ZERO, ...partes.map((c) => dec(c.valor))]), item.valor) > 0) return invalida(`A distribuição excede o valor de ${item.descricao}.`);
    for (const c of partes) contas.add(c.conta_id);
  }
  return { contas };
}

export const CONTAS_INVALIDAS = "Escolha contas analíticas desta empresa, não excluídas.";

/** Os componentes que vão ao NEO na aplicação: o gasto inteiro distribuído, com o histórico da fatura. */
export type ComponenteParaAplicar = { contaId: string; valor: Dec; historico: string };

/**
 * `aplicar`, antes de tocar no NEO: não aplicada, os gastos não mudaram, o pagamento é um débito vigente
 * associado, a classificação bancária é a que a tela viu, os gastos fecham o pagamento e cada gasto está
 * todo distribuído, sem histórico longo demais.
 */
export function conferirAplicar(
  estado: EstadoDaDistribuicao,
  itens: readonly GastoDaFatura[],
  competencia: string,
  pagamento: PagamentoDaFatura | null,
  hashAtual: string,
  hashVisto: string,
): RecusaCartao | { componentes: ComponenteParaAplicar[] } {
  if (estado.aplicacao) return conflito("Esta distribuição já foi aplicada. Desfaça antes de reaplicar.");
  const ids = new Set(itens.map((i) => i.id));
  if (Object.keys(estado.distribuicoes).some((id) => !ids.has(id))) return conflito("Os gastos mudaram. Revise e salve a distribuição antes de aplicar.");
  if (!pagamento || pagamento.dc !== "D" || !["pendente", "processada"].includes(pagamento.status)) {
    return invalida("Associe um pagamento bancário de saída vigente à fatura.");
  }
  if (hashAtual !== hashVisto) return conflito("A classificação bancária mudou. Atualize a tela.");
  if (!itens.length || compara(somaTodos(itens.map((i) => i.valor)), pagamento.valor) !== 0) {
    return invalida("Os gastos devem fechar exatamente o pagamento bancário.");
  }
  const componentes: ComponenteParaAplicar[] = [];
  for (const item of itens) {
    const partes = estado.distribuicoes[item.id] ?? [];
    if (compara(somaTodos([ZERO, ...partes.map((p) => dec(p.valor))]), item.valor) !== 0) return invalida(`Distribua integralmente o gasto ${item.descricao}.`);
    const historicos = partes.map((p) => historicoDoComponente(competencia, item.dataCompra, p.historico));
    if (historicos.some((h) => len(h) > 500)) {
      return invalida("O histórico contábil de um componente ficou muito longo. Edite-o antes de aplicar; o gasto original será preservado.");
    }
    partes.forEach((p, k) => componentes.push({ contaId: p.conta_id, valor: dec(p.valor), historico: historicos[k] }));
  }
  return { componentes };
}

/** `desfazer`, antes de mexer: há aplicação; e, se a classificação mudou no NEO, só com "preservar". */
export function conferirDesfazer(estado: EstadoDaDistribuicao, hashAtual: string, preservarAtual: boolean): RecusaCartao | { restaurar: boolean } {
  if (!estado.aplicacao) return conflito("Não há distribuição aplicada para desfazer.");
  if (estado.aplicacao.hash !== hashAtual && !preservarAtual) {
    return conflito("A classificação mudou no NEO. Confirme preservar a classificação atual para encerrar este controle.");
  }
  return { restaurar: estado.aplicacao.hash === hashAtual };
}

/**
 * `confirmar_documento`, depois de achar o documento: o status permitido (principal: "revisar" ou
 * "complementar"; complementar: "revisar" ou "falhou"), a versão, e, para a fonte principal, a fatura não
 * paga, as pendências resolvidas, os itens e a substituição confirmada.
 */
export function conferirConfirmacao(
  documento: { status: string },
  estado: EstadoDaDistribuicao,
  fatura: { status: string },
  dados: ConfirmacaoDoDocumento,
  haGastos: boolean,
  validar: (itens: ItemRevisado[], total: string) => ItemRevisado[],
): RecusaCartao | { itens: ItemRevisado[] | null } {
  const permitidos = dados.principal ? ["revisar", "complementar"] : ["revisar", "falhou"];
  if (!permitidos.includes(documento.status)) return conflito("O documento não está aguardando revisão.");
  if (estado.versao !== dados.versao) return conflito("A fatura mudou. Atualize a revisão.");
  if (!dados.principal) return { itens: null };
  if (estado.aplicacao || fatura.status === "paga") {
    return conflito("Não altere os gastos de uma fatura paga. O documento pode ser mantido como complementar.");
  }
  if (!dados.pendenciasResolvidas) return invalida("Confira e resolva as pendências da leitura antes de confirmar.");
  const itens = validar(dados.itens, dados.total);
  if (haGastos && !dados.substituir) return conflito("Já existem gastos. Confirme substituir a fonte principal, sem somar documentos.");
  return { itens };
}

/** O id de cada gasto confirmado (`uuid5(documento, "<versão>:<n>")`). */
export const idDoGastoConfirmado = (documentoId: string, versao: number, n: number) => uuid5(documentoId, `${versao}:${n}`);

/** `nome.replace("\\", "/").rsplit("/", 1)[-1][:255]` */
export function nomeDoDocumento(nome: string): string {
  const partes = nome.replaceAll("\\", "/").split("/");
  return [...partes[partes.length - 1]].slice(0, 255).join("");
}

/** `soma` exposto para quem monta a lista de faturas (o total é derivado dos lançamentos vivos). */
export const somar = (valores: readonly Dec[]): Dec => valores.reduce((s, v) => soma(s, v), ZERO);

// ─── Remover o cartão e anexar o documento ──────────────────────────────────

/**
 * `remover_cartao`, depois de achar o cartão: nenhuma distribuição aplicada em fatura dele (qualquer fatura,
 * mesmo excluída) e nenhuma fatura viva "aberta" ou "fechada".
 */
export function conferirRemocaoDoCartao(distribuicaoAplicada: boolean, faturasEmAberto: number): RecusaCartao | null {
  if (distribuicaoAplicada) return conflito("Desfaça as distribuições contábeis antes de remover o cartão.");
  if (faturasEmAberto > 0) return conflito(`Cartão possui ${faturasEmAberto} fatura(s) em aberto. Quite-as antes de remover.`);
  return null;
}

export const MAX_BYTES_DO_DOCUMENTO = 25 * 1024 * 1024;
export const MAX_DOCUMENTOS_DA_FATURA = 32;
export const MAX_BYTES_DA_FATURA = 100 * 1024 * 1024;

/** O arquivo é PDF ("%PDF" no começo) de até 25 MiB? (`adicionar_documento` e `ler_documento`). */
export const pdfAceito = (conteudo: Uint8Array): boolean =>
  conteudo.length >= 4 && conteudo[0] === 0x25 && conteudo[1] === 0x50 && conteudo[2] === 0x44 && conteudo[3] === 0x46 && conteudo.length <= MAX_BYTES_DO_DOCUMENTO;

/**
 * `adicionar_documento`, depois de achar a fatura: PDF de até 25 MiB, o mesmo arquivo (SHA-256) ainda não
 * anexado à fatura, até 32 documentos e 100 MiB somados. `existentes` são os documentos da fatura.
 */
export function conferirNovoDocumento(
  conteudo: { pdf: boolean; tamanho: number },
  sha256: string,
  existentes: readonly { hashArquivo: string; tamanho: number }[],
): RecusaCartao | null {
  if (!conteudo.pdf || conteudo.tamanho > MAX_BYTES_DO_DOCUMENTO) return invalida("Envie um PDF de até 25 MiB.");
  if (existentes.some((d) => d.hashArquivo === sha256)) return conflito("Este documento já está anexado. Consulte a leitura existente.");
  const somados = existentes.reduce((n, d) => n + d.tamanho, 0);
  if (existentes.length >= MAX_DOCUMENTOS_DA_FATURA || somados + conteudo.tamanho > MAX_BYTES_DA_FATURA) return invalida("Limite de documentos da fatura atingido.");
  return null;
}
