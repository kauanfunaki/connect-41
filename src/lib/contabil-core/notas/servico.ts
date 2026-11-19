// Notas fiscais (Bloco C, Fase C1, 18/11/2026): as partes puras de `NotaService`
// (`src/domain/notas/service.py`) e da validação `NotaFiscalCreate` (`src/schemas/notas.py`), sem banco.
//
// - A identidade da nota (`dedup_key`) é a do original byte a byte: a NF-e pela chave de acesso; a NFS-e e
//   a NF-e sem chave por emitente, número, série, valor (2 casas, meio para par) e emissão em UTC, no
//   formato do `datetime.isoformat()` do Python. A carga (C4) copia o `dedup_key` gravado, e uma nota já
//   importada no Contábil Core continua reconhecida aqui.
// - A procedência sai do que o leitor encontrou, não do caminho: XML com assinatura que confere é
//   `xml_assinado`; XML autorizado cuja assinatura não fecha entra como `xml_nao_verificado`, com o motivo;
//   PDF e imagem, lidos por IA, são `ocr`.
// - As recusas têm as frases do original. As do pydantic, que o original devolvia em inglês e em várias
//   linhas ("1 validation error for NotaFiscalCreate…"), viram frases em português; as dos validadores
//   próprios ("Chave de acesso deve ter 44 dígitos.", "CNPJ inválido — …") são as mesmas.
// - Quem grava, lê o banco e chama os leitores é `servidor/notas.ts`.

import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { len, strip } from "@/lib/revisao-contabil/motor/py";
import { compara, dec, decimal, ehZero, NAO_FINITO, reescala, texto, type Dec } from "../motor/decimal";
import { digitoUnicode } from "../motor/unicodePy";
import type { NotaLida, OrigemNota, TipoNota } from "./tipos";

export type StatusNota = "pendente" | "associada" | "cancelada";

export const TIPOS_DE_NOTA: readonly TipoNota[] = ["nfe", "nfse"];
export const STATUS_DE_NOTA: readonly StatusNota[] = ["pendente", "associada", "cancelada"];
export const ORIGENS_DE_NOTA: readonly OrigemNota[] = ["xml_assinado", "xml_nao_verificado", "ocr"];

// ─── Frases do original ─────────────────────────────────────────────────────

export const NOTA_JA_CADASTRADA = "Esta nota fiscal já foi cadastrada nesta empresa.";
export const NOTA_NAO_ENCONTRADA = "Nota fiscal não encontrada.";
export const NOTA_CANCELADA_NAO_ASSOCIA = "Nota cancelada não pode ser associada.";
export const NOTA_JA_ASSOCIADA = "Esta nota já está associada a uma transação. Desassocie primeiro.";
export const TRANSACAO_NAO_ENCONTRADA = "Transação não encontrada nesta empresa.";
export const NOTA_NAO_ASSOCIADA = "Nota não está associada a nenhuma transação.";
export const CHAVE_COM_44 = "Chave de acesso deve conter exatamente 44 dígitos.";
export const EMPRESA_DO_CONTEXTO = "empresa do contexto não encontrada.";
export const ZIP_SEM_XML = "ZIP não contém nenhum arquivo .xml.";

/** Recusa do serviço. `codigo` decide o status da rota (404, 409 ou 422, como o original). */
export type CodigoErroNota = "NAO_ENCONTRADA" | "CONFLITO" | "INVALIDA";
export type RecusaNota = { ok: false; erro: string; codigo: CodigoErroNota };
export type ResultadoNota<T> = { ok: true; valor: T } | RecusaNota;

const recusa = (erro: string, codigo: CodigoErroNota): RecusaNota => ({ ok: false, erro, codigo });

// ─── Texto, dígitos e CNPJ ──────────────────────────────────────────────────

const DIGITO = /\p{Nd}/u;

/** `re.sub(r"\D", "", valor or "")`: os dígitos de qualquer escrita, como estão. */
export function somenteDigitos(valor: string | null | undefined): string {
  let saida = "";
  for (const c of valor ?? "") if (DIGITO.test(c)) saida += c;
  return saida;
}

/** `src/core/cnpj.formatar`: "00.000.000/0000-00" com 14 dígitos; senão, o texto como veio. */
export function formatarCnpj(valor: string): string {
  const d = Array.from(somenteDigitos(valor));
  if (d.length !== 14) return valor;
  const s = (a: number, b: number) => d.slice(a, b).join("");
  return `${s(0, 2)}.${s(2, 5)}.${s(5, 8)}/${s(8, 12)}-${s(12, 14)}`;
}

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function dv(digitos: number[], pesos: number[]): number {
  const resto = digitos.reduce((s, d, i) => s + d * pesos[i], 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** `src/core/cnpj.valido`: 14 dígitos, não repetidos, com os verificadores certos. */
export function cnpjValido(valor: string): boolean {
  const d = Array.from(somenteDigitos(valor)).map((c) => digitoUnicode(c) ?? 0);
  if (d.length !== 14 || d.every((x) => x === d[0])) return false;
  return d[12] === dv(d.slice(0, 12), PESOS_DV1) && d[13] === dv(d.slice(0, 13), PESOS_DV2);
}

/** `normalizar_cnpj` (`src/schemas/types.py`): o CNPJ formatado, ou a recusa do validador. */
function normalizarCnpj(valor: unknown): { ok: true; valor: string } | { ok: false; erro: string } {
  if (typeof valor !== "string") return { ok: false, erro: "CNPJ deve ser texto." };
  const d = somenteDigitos(strip(valor));
  if (len(d) !== 14) return { ok: false, erro: "CNPJ deve ter 14 dígitos." };
  if (!cnpjValido(d)) return { ok: false, erro: "CNPJ inválido — dígitos verificadores não conferem." };
  return { ok: true, valor: formatarCnpj(d) };
}

// ─── Instante da emissão ────────────────────────────────────────────────────

/** A emissão: o instante (UTC, em milissegundos para o banco) e o `isoformat()` em UTC do original. */
export type Emissao = { utc: Date; iso: string };

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?(Z|z|[+-]\d{2}(?::?\d{2}(?::?\d{2})?)?)?$/;
const d2 = (n: number) => String(n).padStart(2, "0");

/**
 * Data e hora ISO 8601 → a emissão, como o pydantic e o `_data_utc` do original: sem fuso, vale como
 * UTC; com fuso, convertida. Só a data vale como meia-noite. `null` quando não é data válida ou cai
 * fora do que o banco guarda (anos 1000 a 9999).
 */
export function emissaoDaNota(textoIso: string): Emissao | null {
  const m = ISO.exec(textoIso.trim());
  if (!m) return null;
  const [ano, mes, diaDoMes] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [hora, minuto, segundo] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  const micro = Number((m[7] ?? "").slice(0, 6).padEnd(6, "0"));
  if (hora > 23 || minuto > 59 || segundo > 59) return null;
  let deslocamento = 0;
  const fuso = m[8];
  if (fuso && fuso.toUpperCase() !== "Z") {
    const n = fuso.slice(1).replace(/:/g, "");
    const [h, mi, s] = [Number(n.slice(0, 2)), Number(n.slice(2, 4) || 0), Number(n.slice(4, 6) || 0)];
    if (h > 23 || mi > 59 || s > 59) return null;
    deslocamento = (fuso[0] === "-" ? -1 : 1) * ((h * 60 + mi) * 60 + s) * 1000;
  }
  // `setUTCFullYear` porque o `Date.UTC` leva os anos 0 a 99 para 1900.
  const local = new Date(0);
  local.setUTCFullYear(ano, mes - 1, diaDoMes);
  if (local.getUTCFullYear() !== ano || local.getUTCMonth() !== mes - 1 || local.getUTCDate() !== diaDoMes) return null;
  local.setUTCHours(hora, minuto, segundo, 0);
  const t = new Date(local.getTime() - deslocamento);
  if (t.getUTCFullYear() < 1000 || t.getUTCFullYear() > 9999) return null;
  const iso =
    `${String(t.getUTCFullYear()).padStart(4, "0")}-${d2(t.getUTCMonth() + 1)}-${d2(t.getUTCDate())}` +
    `T${d2(t.getUTCHours())}:${d2(t.getUTCMinutes())}:${d2(t.getUTCSeconds())}` +
    `${micro ? `.${String(micro).padStart(6, "0")}` : ""}+00:00`;
  return { utc: new Date(t.getTime() + Math.floor(micro / 1000)), iso };
}

// ─── Validação (`NotaFiscalCreate`) ─────────────────────────────────────────

/** O que chega para criar a nota: do leitor (importação) ou do corpo JSON (cadastro à mão). */
export type CamposDaNota = {
  tipo: unknown;
  numero: unknown;
  serie?: unknown;
  cnpjEmitente: unknown;
  nomeEmitente?: unknown;
  cnpjDestinatario?: unknown;
  valor: unknown;
  dataEmissao: unknown;
  chaveAcesso?: unknown;
  observacao?: unknown;
  origem?: unknown;
  assinaturaMotivo?: unknown;
};

/** A nota validada como o `NotaFiscalCreate` a deixa. */
export type NotaValidada = {
  tipo: TipoNota;
  numero: string;
  serie: string | null;
  cnpjEmitente: string;
  nomeEmitente: string | null;
  cnpjDestinatario: string | null;
  valor: Dec;
  emissao: Emissao;
  chaveAcesso: string | null;
  observacao: string | null;
  origem: OrigemNota;
  assinaturaMotivo: string | null;
};

/** O que o serviço grava (a linha de `core_notas_fiscais`, menos tenant, empresa, status e transação). */
export type NotaParaGravar = NotaValidada & { dedupKey: string };

type Validacao<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** `str | None` com `max_length` (em caracteres, como o `len()` do Python). */
function textoOpcional(v: unknown, maximo: number, erroLongo: string): Validacao<string | null> {
  if (v === null || v === undefined) return { ok: true, valor: null };
  if (typeof v !== "string") return { ok: false, erro: "Texto inválido." };
  if (len(v) > maximo) return { ok: false, erro: erroLongo };
  return { ok: true, valor: v };
}

/** `valor: Decimal = Field(gt=0)`: o número do leitor (Dec) ou do JSON (número ou texto). */
function valorDaNota(v: unknown): Validacao<Dec> {
  let d: Dec | typeof NAO_FINITO | null = null;
  if (typeof v === "object" && v !== null && "coeficiente" in v) d = v as Dec;
  else if (typeof v === "number") d = Number.isFinite(v) ? decimal(String(v)) : NAO_FINITO;
  else if (typeof v === "string") d = decimal(v);
  if (d === null) return { ok: false, erro: "O valor da nota não é um número." };
  if (d === NAO_FINITO) return { ok: false, erro: "O valor da nota tem de ser um número finito." };
  if (ehZero(d) || d.negativo) return { ok: false, erro: "O valor da nota deve ser maior que zero." };
  return { ok: true, valor: d };
}

/** O validador `valida_chave_acesso` (antes da conferência de tamanho): os 44 dígitos ou a recusa. */
function chaveDaNota(v: unknown): Validacao<string | null> {
  if (v === null || v === undefined) return { ok: true, valor: null };
  const digitos = Array.from(typeof v === "string" ? v : String(v)).filter((c) => DIGITO.test(c)).join("");
  if (len(digitos) !== 44) return { ok: false, erro: "Chave de acesso deve ter 44 dígitos." };
  return { ok: true, valor: digitos };
}

/**
 * `NotaFiscalCreate`: os validadores e as restrições de cada campo, na ordem dos campos (a primeira
 * recusa é a que volta). Depois, o que o banco do Connect não guarda (valor acima de `Decimal(15,2)`),
 * que no original virava erro 500 na gravação.
 */
export function validarNota(c: CamposDaNota): Validacao<NotaValidada> {
  if (typeof c.tipo !== "string") return { ok: false, erro: "tipo deve ser 'nfe' ou 'nfse'." };
  const tipo = strip(c.tipo).toLowerCase();
  if (tipo !== "nfe" && tipo !== "nfse") return { ok: false, erro: "tipo deve ser 'nfe' ou 'nfse'." };
  if (typeof c.numero !== "string" || len(c.numero) < 1) return { ok: false, erro: "Informe o número da nota." };
  if (len(c.numero) > 50) return { ok: false, erro: "O número da nota passa de 50 caracteres." };
  const serie = textoOpcional(c.serie, 10, "A série da nota passa de 10 caracteres.");
  if (!serie.ok) return serie;
  const emitente = normalizarCnpj(c.cnpjEmitente);
  if (!emitente.ok) return emitente;
  const nome = textoOpcional(c.nomeEmitente, 300, "O nome do emitente passa de 300 caracteres.");
  if (!nome.ok) return nome;
  let destinatario: string | null = null;
  if (c.cnpjDestinatario !== null && c.cnpjDestinatario !== undefined) {
    const d = normalizarCnpj(c.cnpjDestinatario);
    if (!d.ok) return d;
    destinatario = d.valor;
  }
  const valor = valorDaNota(c.valor);
  if (!valor.ok) return valor;
  const emissao = typeof c.dataEmissao === "string" ? emissaoDaNota(c.dataEmissao) : null;
  if (!emissao) return { ok: false, erro: "Data de emissão inválida." };
  const chave = chaveDaNota(c.chaveAcesso);
  if (!chave.ok) return chave;
  const observacao = textoOpcional(c.observacao, 500, "A observação passa de 500 caracteres.");
  if (!observacao.ok) return observacao;
  let origem: OrigemNota = "xml_assinado";
  if (c.origem !== undefined) {
    const o = typeof c.origem === "string" ? strip(c.origem).toLowerCase() : "";
    if (!(ORIGENS_DE_NOTA as readonly string[]).includes(o)) {
      return { ok: false, erro: "origem deve ser 'xml_assinado', 'xml_nao_verificado' ou 'ocr'." };
    }
    origem = o as OrigemNota;
  }
  const motivo = textoOpcional(c.assinaturaMotivo, 200, "O motivo da assinatura não conferida passa de 200 caracteres.");
  if (!motivo.ok) return motivo;
  // Decimal(15,2): até 13 dígitos inteiros depois de arredondar para os centavos.
  if (compara(reescala(valor.valor, -2), dec("9999999999999.99")) > 0) return { ok: false, erro: "O valor da nota passa do limite aceito." };
  return {
    ok: true,
    valor: {
      tipo,
      numero: c.numero,
      serie: serie.valor,
      cnpjEmitente: emitente.valor,
      nomeEmitente: nome.valor,
      cnpjDestinatario: destinatario,
      valor: valor.valor,
      emissao,
      chaveAcesso: chave.valor,
      observacao: observacao.valor,
      origem,
      assinaturaMotivo: motivo.valor,
    },
  };
}

// ─── Identidade (`dedup_key`) ───────────────────────────────────────────────

/** `_normalizar_chave_acesso`: os 44 dígitos (`\d`, de qualquer escrita), ou a recusa. */
export function normalizarChaveAcesso(chave: string | null): Validacao<string | null> {
  if (chave === null) return { ok: true, valor: null };
  const digitos = somenteDigitos(chave);
  if (len(digitos) !== 44) return { ok: false, erro: CHAVE_COM_44 };
  return { ok: true, valor: digitos };
}

/** `str(Decimal(str(valor)).quantize(Decimal("0.01")))`: duas casas, meio para par. */
export const valorDaIdentidade = (valor: Dec): string => texto(reescala(valor, -2));

/** `_calcular_identidade_nota`: o SHA-256 da identidade da nota, em hexadecimal. */
export function dedupKey(n: Pick<NotaValidada, "tipo" | "cnpjEmitente" | "numero" | "serie" | "valor" | "emissao">, chave: string | null): string {
  const composta = (prefixo: string) =>
    [prefixo, somenteDigitos(n.cnpjEmitente), strip(n.numero), strip(n.serie ?? ""), valorDaIdentidade(n.valor), n.emissao.iso].join("|");
  let origem: string;
  if (n.tipo === "nfe") origem = chave ? `nfe|${chave}` : composta("nfe-sem-chave"); // cadastro manual legado sem chave: ainda idempotente
  else origem = composta("nfse");
  return createHash("sha256").update(origem, "utf8").digest("hex");
}

/** `criar` antes de gravar: valida, normaliza a chave e calcula a identidade. */
export function notaParaGravar(c: CamposDaNota): Validacao<NotaParaGravar> {
  const v = validarNota(c);
  if (!v.ok) return v;
  const chave = normalizarChaveAcesso(v.valor.chaveAcesso);
  if (!chave.ok) return chave;
  return { ok: true, valor: { ...v.valor, chaveAcesso: chave.valor, dedupKey: dedupKey(v.valor, chave.valor) } };
}

// ─── Importação ─────────────────────────────────────────────────────────────

/** Por onde a nota chegou: o leitor de XML ou o leitor visual (PDF e imagem). */
export type ViaDaNota = "xml" | "visual";

/** `importar_xml` × `importar_visual`: a procedência pelo que a leitura encontrou. */
export function origemDaLeitura(nota: Pick<NotaLida, "assinaturaNaoVerificada">, via: ViaDaNota): OrigemNota {
  if (via === "visual") return "ocr";
  return nota.assinaturaNaoVerificada ? "xml_nao_verificado" : "xml_assinado";
}

/**
 * A conferência do CNPJ da empresa em `_importar_parseada`: a nota precisa ter a empresa como emitente
 * ou destinatário. A recusa diz QUAIS CNPJs, para quem enviou saber se errou a empresa na tela ou se o
 * cadastro está errado (saídas opostas), e aponta a nota de outra FILIAL da mesma empresa (mesma raiz,
 * outro estabelecimento), que o contador costuma achar que é "da empresa".
 */
export function conferirEmpresaDaNota(
  cnpjEmpresa: string | null,
  nota: Pick<NotaLida, "cnpjEmitente" | "cnpjDestinatario">,
  nomeArquivo: string,
): string | null {
  if (cnpjEmpresa === null) return `${nomeArquivo}: ${EMPRESA_DO_CONTEXTO}`;
  const empresa = somenteDigitos(cnpjEmpresa);
  const envolvidos = new Set([somenteDigitos(nota.cnpjEmitente), somenteDigitos(nota.cnpjDestinatario)]);
  if (envolvidos.has(empresa)) return null;
  const raiz = Array.from(empresa).slice(0, 8).join("");
  const mesmaRaiz = [...envolvidos].some((c) => c && Array.from(c).slice(0, 8).join("") === raiz && c !== empresa);
  let detalhe =
    `a empresa selecionada é ${formatarCnpj(empresa) || "—"}, e a nota ` +
    `vai de ${nota.cnpjEmitente || "—"} para ${nota.cnpjDestinatario || "—"}`;
  if (mesmaRaiz) detalhe += " — mesma raiz de CNPJ, outro estabelecimento. Importe pela empresa daquela filial";
  return `${nomeArquivo}: CNPJ da empresa não consta como emitente nem destinatário: ${detalhe}.`;
}

/** O que o leitor devolveu: a nota, ou a recusa com a frase do leitor (`ValueError`, `VisualParseError`). */
export type LeituraDaNota = { ok: true; nota: NotaLida } | { ok: false; erro: string };

/**
 * `_importar_parseada` até a gravação: a recusa do leitor, a conferência da empresa e a validação do
 * `NotaFiscalCreate`. Devolve a nota pronta para gravar, ou a linha de erro ("arquivo.xml: frase").
 * A duplicidade (`dedup_key` ou chave já na empresa) é decidida na gravação.
 */
export function prepararImportacao(p: {
  nomeArquivo: string;
  via: ViaDaNota;
  leitura: LeituraDaNota;
  cnpjEmpresa: string | null;
}): { ok: true; nota: NotaParaGravar } | { ok: false; erro: string } {
  if (!p.leitura.ok) return { ok: false, erro: `${p.nomeArquivo}: ${p.leitura.erro}` };
  const n = p.leitura.nota;
  const empresa = conferirEmpresaDaNota(p.cnpjEmpresa, n, p.nomeArquivo);
  if (empresa) return { ok: false, erro: empresa };
  const r = notaParaGravar({
    tipo: n.tipo,
    numero: n.numero,
    serie: n.serie,
    cnpjEmitente: n.cnpjEmitente,
    nomeEmitente: n.nomeEmitente,
    cnpjDestinatario: n.cnpjDestinatario,
    valor: n.valor,
    dataEmissao: n.dataEmissao,
    chaveAcesso: n.chaveAcesso,
    observacao: n.observacao,
    origem: origemDaLeitura(n, p.via),
    assinaturaMotivo: n.assinaturaNaoVerificada,
  });
  if (!r.ok) return { ok: false, erro: `${p.nomeArquivo}: ${r.erro}` };
  return { ok: true, nota: r.valor };
}

/** O resultado de uma importação (`ImportXmlResult`), com os ids das notas gravadas. */
export type ResultadoDaImportacao = { importadas: number; duplicadas: number; erros: string[]; notas: string[] };

/** A frase do resumo, como a resposta da rota do original. */
export const resumoDaImportacao = (r: Pick<ResultadoDaImportacao, "importadas" | "duplicadas">) =>
  `${r.importadas} nota(s) importada(s), ${r.duplicadas} duplicada(s) ignorada(s).`;

/**
 * Por onde vai o arquivo, pela extensão, como a rota do original: `.zip` abre e importa cada XML;
 * `.pdf`, `.png`, `.jpg` e `.jpeg` vão para o leitor visual (o tipo de mídia sai da extensão: jpeg para
 * `.jpg`/`.jpeg`, png para o resto); todo o resto é lido como XML (o leitor recusa o que não for).
 */
export function caminhoDoArquivo(nome: string): { via: "zip" } | { via: "xml" } | { via: "visual"; pdf: true } | { via: "visual"; pdf: false; tipoMime: "image/jpeg" | "image/png" } {
  const minusculo = nome.toLowerCase();
  if (minusculo.endsWith(".zip")) return { via: "zip" };
  if (minusculo.endsWith(".pdf")) return { via: "visual", pdf: true };
  if (minusculo.endsWith(".jpg") || minusculo.endsWith(".jpeg")) return { via: "visual", pdf: false, tipoMime: "image/jpeg" };
  if (minusculo.endsWith(".png")) return { via: "visual", pdf: false, tipoMime: "image/png" };
  return { via: "xml" };
}

// ─── ZIP (`importar_zip`) ───────────────────────────────────────────────────

const MAX_ZIP_ENTRADAS = 1_000;
const MAX_ZIP_DESCOMPACTADO = 100 * 1024 * 1024;
const MAX_ZIP_RAZAO_COMPRESSAO = 100;
export const MAX_XML_BYTES = 10 * 1024 * 1024;

type EntradaDoZip = { nome: string; tamanho: number; comprimido: number };

/** `_validar_zip`: os limites contra arquivo bomba, sobre o diretório central, antes de descompactar. */
export function validarZip(entradas: readonly EntradaDoZip[]): string | null {
  if (entradas.length > MAX_ZIP_ENTRADAS) return `ZIP excede o limite de ${MAX_ZIP_ENTRADAS} entradas.`;
  if (entradas.reduce((s, e) => s + e.tamanho, 0) > MAX_ZIP_DESCOMPACTADO) return "ZIP excede o limite total descompactado de 100 MiB.";
  for (const e of entradas) {
    if (e.tamanho > MAX_XML_BYTES && e.nome.toLowerCase().endsWith(".xml")) return `${e.nome}: XML excede o limite de 10 MiB.`;
    if (e.tamanho && (e.comprimido === 0 || e.tamanho / e.comprimido > MAX_ZIP_RAZAO_COMPRESSAO)) return `${e.nome}: razão de compressão insegura.`;
  }
  return null;
}

/** Um XML de dentro do ZIP: os bytes, ou o erro de leitura daquela entrada (sem o nome na frente). */
export type XmlDoZip = { nome: string; conteudo: Uint8Array } | { nome: string; erro: string };

/**
 * `importar_zip` até a leitura de cada XML: abre o ZIP, confere os limites e devolve, na ordem do
 * diretório central, os `.xml` (pelo nome, sem diferenciar maiúscula). `erro` é a linha que vai para a
 * lista de erros, e nada mais é importado.
 */
export function xmlsDoZip(conteudo: Uint8Array): { ok: true; xmls: XmlDoZip[] } | { ok: false; erro: string } {
  const entradas: EntradaDoZip[] = [];
  try {
    unzipSync(conteudo, {
      filter: (f) => {
        entradas.push({ nome: f.name, tamanho: f.originalSize, comprimido: f.size });
        return false;
      },
    });
  } catch {
    return { ok: false, erro: "Arquivo ZIP inválido: o arquivo não é um ZIP ou está corrompido." };
  }
  const limite = validarZip(entradas);
  if (limite) return { ok: false, erro: limite };
  const ehXml = (nome: string) => nome.toLowerCase().endsWith(".xml");
  if (!entradas.some((e) => ehXml(e.nome))) return { ok: false, erro: ZIP_SEM_XML };
  let lidos: Record<string, Uint8Array> = {};
  let falha: string | null = null;
  try {
    lidos = unzipSync(conteudo, { filter: (f) => ehXml(f.name) });
  } catch (e) {
    falha = e instanceof Error ? e.message : "erro";
  }
  return {
    ok: true,
    xmls: entradas
      .filter((e) => ehXml(e.nome))
      .map((e): XmlDoZip => {
        const bytes = lidos[e.nome];
        if (falha !== null || !bytes) return { nome: e.nome, erro: `erro ao ler arquivo do ZIP: ${falha ?? "entrada ilegível"}` };
        if (bytes.length > MAX_XML_BYTES) return { nome: e.nome, erro: "XML excede o limite de 10 MiB." };
        return { nome: e.nome, conteudo: bytes };
      }),
  };
}

// ─── Associação, desassociação e cancelamento ───────────────────────────────

export type EstadoDaNota = { status: string; transacaoId: string | null };

/** `associar_transacao`, depois de achar a nota: cancelada, já associada, transação de fora. */
export function conferirAssociacao(nota: EstadoDaNota, transacaoEncontrada: boolean): RecusaNota | null {
  if (nota.status === "cancelada") return recusa(NOTA_CANCELADA_NAO_ASSOCIA, "INVALIDA");
  if (nota.transacaoId) return recusa(NOTA_JA_ASSOCIADA, "CONFLITO");
  if (!transacaoEncontrada) return recusa(TRANSACAO_NAO_ENCONTRADA, "NAO_ENCONTRADA");
  return null;
}

/** `desassociar_transacao`: só a nota associada. */
export function conferirDesassociacao(nota: EstadoDaNota): RecusaNota | null {
  return nota.status === "associada" ? null : recusa(NOTA_NAO_ASSOCIADA, "INVALIDA");
}

/** O estado depois de cada operação (o cancelamento não tem recusa e solta a transação). */
export const DEPOIS = {
  associar: (transacaoId: string): EstadoDaNota => ({ status: "associada", transacaoId }),
  desassociar: (): EstadoDaNota => ({ status: "pendente", transacaoId: null }),
  cancelar: (): EstadoDaNota => ({ status: "cancelada", transacaoId: null }),
};

// ─── Lista ──────────────────────────────────────────────────────────────────

/** Os filtros da lista, como chegam (`listar`). Texto vazio é o mesmo que não filtrar. */
export type FiltrosDaLista = {
  tipo?: string | null;
  status?: string | null;
  numero?: string | null;
  chaveAcesso?: string | null;
  cnpj?: string | null;
  emitente?: string | null;
  dataDe?: Date | null;
  dataAte?: Date | null;
};

/**
 * O que a consulta procura, já normalizado como o `listar` do original: número e emitente aparados;
 * a chave pelos dígitos; o CNPJ com 14 dígitos casa exato com o formato gravado (emitente ou
 * destinatário), e o trecho parcial casa como foi digitado (aparado).
 */
export type BuscaDaLista = {
  tipo: string | null;
  status: string | null;
  numeroContem: string | null;
  chaveContem: string | null;
  cnpjIgual: string | null;
  cnpjContem: string | null;
  emitenteContem: string | null;
  dataDe: Date | null;
  dataAte: Date | null;
};

export function buscaDaLista(f: FiltrosDaLista): BuscaDaLista {
  const b: BuscaDaLista = {
    tipo: f.tipo || null,
    status: f.status || null,
    numeroContem: f.numero ? strip(f.numero) : null,
    chaveContem: null,
    cnpjIgual: null,
    cnpjContem: null,
    emitenteContem: f.emitente ? strip(f.emitente) : null,
    dataDe: f.dataDe ?? null,
    dataAte: f.dataAte ?? null,
  };
  if (f.chaveAcesso) {
    const d = somenteDigitos(f.chaveAcesso);
    if (d) b.chaveContem = d;
  }
  if (f.cnpj) {
    const d = somenteDigitos(f.cnpj);
    if (len(d) === 14) b.cnpjIgual = formatarCnpj(d);
    else b.cnpjContem = strip(f.cnpj);
  }
  return b;
}

/** Página e tamanho, como os `Query` do original (página ≥ 1, de 1 a 200 por página). */
export const POR_PAGINA_PADRAO = 50;
export const POR_PAGINA_MAXIMO = 200;
