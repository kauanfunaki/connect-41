// A importação do plano de contas em lote, sem banco (Fase 3b, 10/11/2026): porte da parte pura de
// `PlanoContaService.importar_lote` (`src/domain/plano_contas/service.py`) e da validação de
// `PlanoContaCreate` (`src/schemas/plano_contas.py`) do Contábil Core original.
//
// O servidor (`servidor/importacaoPlano.ts`) lê do banco as faixas, as contas vivas, as contas com
// lançamento e o próximo número; esta função decide tudo o mais, na mesma ordem do original, e
// devolve o que gravar. A ordem importa porque é a ordem da lista de erros que a tela mostra:
// 1) cada linha da planilha: código, descrição, tipo (ou a faixa da empresa) e a validação;
// 2) cada código novo, na ordem da planilha: conta existente é atualizada; nova passa pelo nível
//    máximo e pela conferência dos ancestrais (no plano ou no próprio lote);
// 3) criação em ordem de profundidade, com a numeração automática do `conta_numero`;
// 4) hierarquia: o pai é ligado e vira sintética ("S"), mesmo quando veio depois do filho.

import { strip } from "../extrato/py";
import { cmp, digitoUnicode } from "../motor/unicodePy";
import type { LinhaDoPlano } from "./planilhaDoPlano";

/** Erro que, no original, não era tratado (a tela recebia um erro 500). */
export class ErroDoLote extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDoLote";
  }
}

export const NIVEL_MAXIMO = 5;

export const TIPOS_VALIDOS = ["ativo", "passivo", "patrimonio_liquido", "receita", "despesa", "custo", "resultado"] as const;

/** Versão do pydantic do original: entra no link de cada erro de validação. */
const VERSAO_PYDANTIC = "2.14";

export type ContaDoPlano = { contaNumero: number | null; codigo: string; descricao: string; tipo: string; tipoSa: string };
export type ContaExistente = ContaDoPlano & { id: string };
export type FaixaDoPlano = { tipo: string; codigoDe: string; codigoAte: string };
export type ErroDeLinha = { linha: number; codigo: string | null; erro: string };
export type ContaNova = ContaDoPlano & { linha: number; paiCodigo: string | null };
export type MudancaDeConta = { id: string; codigo: string; antes: ContaDoPlano; depois: ContaDoPlano };

export type EntradaDoLote = {
  linhas: readonly LinhaDoPlano[];
  faixas: readonly FaixaDoPlano[];
  /** As contas vivas da empresa. */
  existentes: readonly ContaExistente[];
  /** Ids das contas com lançamento: nelas a reimportação não muda tipo nem S/A. */
  movimentadas: ReadonlySet<string>;
  /** `_proximo_conta_numero`: o maior número da empresa (inclusive de conta excluída) mais um. */
  proximoNumero: number;
  /** A gravação de uma conta nova que falharia (no original, o savepoint de cada conta). */
  falhaAoCriar?: (conta: ContaDoPlano) => string | null;
};

export type PlanoDoLote = {
  importadas: number;
  atualizadas: number;
  duplicadas: number;
  erros: ErroDeLinha[];
  /** As contas a criar, na ordem de criação (pais antes dos filhos), com o pai e o S/A finais. */
  novas: ContaNova[];
  /** As contas existentes cujo estado final mudou (atualização e/ou promoção a sintética). */
  alteradas: MudancaDeConta[];
  /** As que o original registrava como "atualizada_via_importacao" (estado depois da atualização). */
  atualizacoes: MudancaDeConta[];
};

// ─── Python ─────────────────────────────────────────────────────────────────

const NAO_IMPRIMIVEL = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u;
const hex = (n: number, tamanho: number) => n.toString(16).padStart(tamanho, "0");

/** `repr(str)` do Python. */
export function reprPy(s: string): string {
  const aspa = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = aspa;
  for (const c of s) {
    const cp = c.codePointAt(0)!;
    if (c === aspa || c === "\\") out += "\\" + c;
    else if (c === "\t") out += "\\t";
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else if (cp < 0x20 || cp === 0x7f) out += "\\x" + hex(cp, 2);
    else if (cp < 0x7f || !NAO_IMPRIMIVEL.test(c)) out += c;
    else if (cp <= 0xff) out += "\\x" + hex(cp, 2);
    else if (cp <= 0xffff) out += "\\u" + hex(cp, 4);
    else out += "\\U" + hex(cp, 8);
  }
  return out + aspa;
}

/** Troca os dígitos decimais de qualquer escrita pelos ASCII, como `int()` e `float()` fazem. */
function digitosAscii(s: string): string {
  let out = "";
  for (const c of s) {
    const d = c.charCodeAt(0) < 0x80 ? null : digitoUnicode(c);
    out += d === null ? c : String(d);
  }
  return out;
}

/** `int(texto)` do Python (base 10), ou `null` onde ele levantaria ValueError. */
function intPy(texto: string): bigint | null {
  const t = digitosAscii(strip(texto));
  const m = /^([+-]?)(\d(?:_?\d)*)$/.exec(t);
  if (!m) return null;
  const v = BigInt(m[2].replaceAll("_", ""));
  return m[1] === "-" ? -v : v;
}

/** `float(texto)` do Python, ou `null` onde ele levantaria ValueError. */
function floatPy(texto: string): number | null {
  const t = digitosAscii(strip(texto));
  const especial = /^([+-]?)(inf|infinity|nan)$/i.exec(t);
  if (especial) {
    const v = especial[2].toLowerCase() === "nan" ? NaN : Infinity;
    return especial[1] === "-" ? -v : v;
  }
  if (!/^[+-]?(?:(?:\d(?:_?\d)*)?\.\d(?:_?\d)*|\d(?:_?\d)*\.?)(?:[eE][+-]?\d(?:_?\d)*)?$/.test(t)) return null;
  return Number(t.replaceAll("_", ""));
}

/** `int(float(texto))`: NaN é ValueError (ignorado pela importação); infinito é OverflowError. */
function numeroDaConta(texto: string): number | null {
  const f = floatPy(texto);
  if (f === null || Number.isNaN(f)) return null;
  if (!Number.isFinite(f)) throw new ErroDoLote("cannot convert float infinity to integer");
  return Math.trunc(f) + 0; // + 0 tira o -0
}

/** `codigo_para_tupla`: "3.10" > "3.9" como número, não como texto. `null` onde o `int()` falharia. */
export function codigoParaTupla(codigo: string): bigint[] | null {
  const partes = codigo.split(".").map(intPy);
  return partes.some((p) => p === null) ? null : (partes as bigint[]);
}

function cmpTupla(a: readonly bigint[], b: readonly bigint[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

type FaixaComparavel = { tipo: string; de: bigint[]; ate: bigint[] };

function faixaComparavel(f: FaixaDoPlano): FaixaComparavel {
  const de = codigoParaTupla(f.codigoDe);
  const ate = codigoParaTupla(f.codigoAte);
  if (!de || !ate) throw new ErroDoLote(`Faixa de classificação inválida: ${f.codigoDe} a ${f.codigoAte}.`);
  return { tipo: f.tipo, de, ate };
}

/** `_classificar_por_faixa`: o tipo da primeira faixa que contém o código. */
export function classificarPorFaixa(codigo: string, faixas: readonly FaixaDoPlano[]): string | null {
  return classificar(codigo, faixas.map(faixaComparavel));
}

function classificar(codigo: string, faixas: readonly FaixaComparavel[]): string | null {
  const t = codigoParaTupla(codigo);
  if (!t) return null;
  for (const f of faixas) if (cmpTupla(f.de, t) <= 0 && cmpTupla(t, f.ate) <= 0) return f.tipo;
  return null;
}

// ─── PlanoContaCreate ─────────────────────────────────────────────────────

type ErroDeCampo = { campo: string; tipo: string; mensagem: string; entrada: string };

/**
 * O `repr` da entrada como o pydantic-core mostra: acima de 50 BYTES em UTF-8, fica com os 25 primeiros
 * e os 24 últimos, sem partir caractere (o começo recua e o fim avança até a borda).
 */
function reprCortado(entrada: string): string {
  const r = reprPy(entrada);
  const bytes = new TextEncoder().encode(r);
  if (bytes.length <= 50) return r;
  const meio = (i: number) => i > 0 && i < bytes.length && (bytes[i] & 0xc0) === 0x80;
  let inicio = 25;
  while (meio(inicio)) inicio--;
  let fim = bytes.length - 24;
  while (meio(fim)) fim++;
  const texto = new TextDecoder();
  return `${texto.decode(bytes.slice(0, inicio))}...${texto.decode(bytes.slice(fim))}`;
}

/** `str(ValidationError)` do pydantic 2. */
function textoDoPydantic(erros: readonly ErroDeCampo[]): string {
  const linhas = [`${erros.length} validation error${erros.length === 1 ? "" : "s"} for PlanoContaCreate`];
  for (const e of erros) {
    const valor = reprCortado(e.entrada);
    linhas.push(
      e.campo,
      `  ${e.mensagem} [type=${e.tipo}, input_value=${valor}, input_type=str]`,
      `    For further information visit https://errors.pydantic.dev/${VERSAO_PYDANTIC}/v/${e.tipo}`,
    );
  }
  return linhas.join("\n");
}

const tamanho = (s: string) => [...s].length;
const ALIASES_TIPO: Record<string, string> = { pl: "patrimonio_liquido" };

/** `PlanoContaCreate(...)`: a conta normalizada, ou o texto do erro que o original mostrava. */
export function validarConta(e: ContaDoPlano): { conta: ContaDoPlano } | { erro: string } {
  const erros: ErroDeCampo[] = [];
  const valorErro = (campo: string, mensagem: string, entrada: string) =>
    erros.push({ campo, tipo: "value_error", mensagem: `Value error, ${mensagem}`, entrada });

  const codigo = strip(e.codigo);
  if (!/^\p{Nd}+(?:\.\p{Nd}+)*$/u.test(codigo)) {
    valorErro("codigo", "Código inválido. Use dígitos separados por ponto. Ex: 1, 1.1, 4.2.01", e.codigo);
  } else if (tamanho(codigo) > 30) {
    erros.push({ campo: "codigo", tipo: "string_too_long", mensagem: "String should have at most 30 characters", entrada: codigo });
  }

  const descricao = strip(e.descricao);
  if (tamanho(descricao) < 2) {
    erros.push({ campo: "descricao", tipo: "string_too_short", mensagem: "String should have at least 2 characters", entrada: descricao });
  } else if (tamanho(descricao) > 300) {
    erros.push({ campo: "descricao", tipo: "string_too_long", mensagem: "String should have at most 300 characters", entrada: descricao });
  }

  const tipoBruto = strip(e.tipo).toLowerCase();
  const tipo = ALIASES_TIPO[tipoBruto] ?? tipoBruto;
  if (!(TIPOS_VALIDOS as readonly string[]).includes(tipo)) {
    valorErro("tipo", `Tipo inválido. Opções: (${TIPOS_VALIDOS.map((t) => `'${t}'`).join(", ")})`, e.tipo);
  }

  const tipoSa = strip(e.tipoSa).toUpperCase();
  if (tipoSa !== "S" && tipoSa !== "A") valorErro("tipo_sa", "tipo_sa deve ser 'S' (Sintética) ou 'A' (Analítica).", e.tipoSa);

  if (erros.length) return { erro: textoDoPydantic(erros) };
  return { conta: { contaNumero: e.contaNumero, codigo, descricao, tipo, tipoSa } };
}

// ─── importar_lote ────────────────────────────────────────────────────────

const TIPO_AUSENTE =
  'Tipo ausente e código não corresponde a nenhuma faixa de classificação configurada. Inclua a coluna "Tipo" na planilha, informe manualmente após importar, ou configure as faixas de classificação da empresa.';

/** `sorted(..., key=lambda v: (v.count("."), v))`: pais antes dos filhos. */
const pontos = (s: string) => s.split(".").length - 1;
const porProfundidade = (a: string, b: string) => pontos(a) - pontos(b) || cmp(a, b);

const copia = (c: ContaDoPlano): ContaDoPlano => ({
  contaNumero: c.contaNumero,
  codigo: c.codigo,
  descricao: c.descricao,
  tipo: c.tipo,
  tipoSa: c.tipoSa,
});

const iguais = (a: ContaDoPlano, b: ContaDoPlano) =>
  a.contaNumero === b.contaNumero && a.descricao === b.descricao && a.tipo === b.tipo && a.tipoSa === b.tipoSa;

/** `importar_lote` sem o banco: o que criar, o que alterar, e os números e erros da tela. */
export function planejarLote(entrada: EntradaDoLote): PlanoDoLote {
  const faixas = entrada.faixas.map(faixaComparavel);
  let importadas = 0;
  let atualizadas = 0;
  let duplicadas = 0;
  const erros: ErroDeLinha[] = [];

  // 1) As linhas da planilha.
  const candidatos = new Map<string, { conta: ContaDoPlano; linha: number }>();
  for (const row of entrada.linhas) {
    const linha = row.linha;
    const codigo = strip(row.codigo);
    const descricao = strip(row.descricao);
    let tipo = strip(row.tipo).toLowerCase();
    const tipoSa = strip(row.tipo_sa || "A").toUpperCase();
    const bruto = row.conta_numero ?? "";
    const contaNumero = bruto ? numeroDaConta(bruto) : null;

    if (!codigo) {
      erros.push({ linha, codigo: null, erro: "Código ausente." });
      continue;
    }
    if (!descricao) {
      erros.push({ linha, codigo, erro: "Descrição ausente." });
      continue;
    }
    if (!tipo) {
      // Nunca adivinhar o tipo contábil: só as faixas configuradas pela própria empresa valem.
      const inferido = classificar(codigo, faixas);
      if (inferido === null) {
        erros.push({ linha, codigo, erro: TIPO_AUSENTE });
        continue;
      }
      tipo = inferido;
    }
    const validada = validarConta({ contaNumero, codigo, descricao, tipo, tipoSa });
    if ("erro" in validada) {
      erros.push({ linha, codigo, erro: validada.erro });
      continue;
    }
    if (candidatos.has(codigo)) {
      duplicadas++;
      continue;
    }
    candidatos.set(codigo, { conta: validada.conta, linha });
  }

  // 2) Existentes são atualizadas; novas conferem nível e ancestrais (nenhuma filha vira raiz por engano).
  const existentes = new Map<string, ContaExistente>();
  for (const c of entrada.existentes) existentes.set(c.codigo, c);
  const estado = new Map<string, ContaDoPlano>();
  for (const c of existentes.values()) estado.set(c.id, copia(c));
  const atualizacoes: MudancaDeConta[] = [];
  const validos = new Map<string, { conta: ContaDoPlano; linha: number }>();
  const disponiveis = new Set([...existentes.keys(), ...candidatos.keys()]);
  for (const [codigo, item] of candidatos) {
    const existente = existentes.get(codigo);
    if (existente) {
      const atual = estado.get(existente.id)!;
      const antes = copia(atual);
      const d = item.conta;
      let mudou = false;
      let aviso: string | null = null;
      if (d.contaNumero !== null && d.contaNumero !== atual.contaNumero) {
        atual.contaNumero = d.contaNumero;
        mudou = true;
      }
      if (d.descricao !== atual.descricao) {
        atual.descricao = d.descricao;
        mudou = true;
      }
      if (d.tipo !== atual.tipo || d.tipoSa !== atual.tipoSa) {
        // Mudar a natureza de conta movimentada corromperia DRE e balancete já fechados.
        if (entrada.movimentadas.has(existente.id)) {
          aviso =
            `Tipo/S-A da planilha (${d.tipo}/${d.tipoSa}) divergem do cadastrado (${atual.tipo}/${atual.tipoSa}), ` +
            "mas não foram alterados: a conta já tem movimentação contábil.";
        } else {
          atual.tipo = d.tipo;
          atual.tipoSa = d.tipoSa;
          mudou = true;
        }
      }
      if (mudou) {
        atualizadas++;
        atualizacoes.push({ id: existente.id, codigo, antes, depois: copia(atual) });
      } else duplicadas++;
      if (aviso) erros.push({ linha: item.linha, codigo, erro: aviso });
      continue;
    }
    const partes = codigo.split(".");
    if (partes.length > NIVEL_MAXIMO) {
      erros.push({ linha: item.linha, codigo, erro: `Nível máximo de hierarquia excedido (${NIVEL_MAXIMO}).` });
      continue;
    }
    const ancestrais = partes.slice(1).map((_, i) => partes.slice(0, i + 1).join("."));
    const ausente = ancestrais.find((a) => !disponiveis.has(a));
    if (ausente) {
      erros.push({ linha: item.linha, codigo, erro: `Conta ancestral '${ausente}' não encontrada no plano ou no lote.` });
      continue;
    }
    validos.set(codigo, item);
  }

  // 3) Criação, em ordem de profundidade; o número automático é gasto mesmo se a gravação falhar.
  let proximo = entrada.proximoNumero;
  const criadas = new Map<string, ContaNova>();
  for (const codigo of [...validos.keys()].sort(porProfundidade)) {
    const { conta, linha } = validos.get(codigo)!;
    let numero = conta.contaNumero;
    if (numero === null) numero = proximo++;
    const nova: ContaNova = { ...copia(conta), contaNumero: numero, linha, paiCodigo: null };
    const falha = entrada.falhaAoCriar?.(nova) ?? null;
    if (falha !== null) {
      erros.push({ linha, codigo, erro: falha });
      continue;
    }
    criadas.set(codigo, nova);
    importadas++;
  }

  // 4) Hierarquia: todas as contas já existem, então o pai que veio depois do filho também serve.
  const todas = new Set([...existentes.keys(), ...criadas.keys()]);
  for (const codigo of [...criadas.keys()].sort(porProfundidade)) {
    if (!codigo.includes(".")) continue;
    const paiCodigo = codigo.slice(0, codigo.lastIndexOf("."));
    if (!todas.has(paiCodigo)) {
      // O pai falhou ao gravar: a filha sai também, em vez de virar raiz.
      erros.push({ linha: validos.get(codigo)!.linha, codigo, erro: "Conta pai não pôde ser importada; hierarquia não foi criada." });
      criadas.delete(codigo);
      todas.delete(codigo);
      importadas--;
      continue;
    }
    criadas.get(codigo)!.paiCodigo = paiCodigo;
    const paiNovo = criadas.get(paiCodigo);
    if (paiNovo) paiNovo.tipoSa = "S";
    else estado.get(existentes.get(paiCodigo)!.id)!.tipoSa = "S";
  }

  const alteradas: MudancaDeConta[] = [];
  for (const c of existentes.values()) {
    const depois = estado.get(c.id)!;
    if (!iguais(c, depois)) alteradas.push({ id: c.id, codigo: c.codigo, antes: copia(c), depois: copia(depois) });
  }
  return { importadas, atualizadas, duplicadas, erros, novas: [...criadas.values()], alteradas, atualizacoes };
}
