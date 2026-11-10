// Porte do caminho OFX de `src/domain/extrato/identidade.py` do Contábil Core: o extrato enviado é
// mesmo da conta escolhida? Arquivo trocado é erro comum de escritório, e importar o extrato de uma
// conta na outra contamina as duas.
//
// Três estados:
// - DIVERGENTE: o arquivo diz outro banco, outra agência ou outra conta (ou traz mais de uma conta). Recusa.
// - CONFIRMAR: o arquivo não diz tudo (ou o dígito não pôde ser conferido). Só importa com a
//   confirmação explícita de quem envia.
// - COMPATIVEL: banco, agência e conta conferem.
//
// O PDF e a planilha (cabeçalho do documento) entram com os leitores da Fase 4.

import { combinante, split } from "./unicodePy";

export type Identidade = { banco: string | null; agencia: string | null; conta: string | null; multiplasContas: boolean };
export type EstadoIdentidade = "DIVERGENTE" | "CONFIRMAR" | "COMPATIVEL";
export type ContaCadastrada = { bancoSigla: string; agencia: string; numero: string; digito: string | null };

/** Siglas aceitas por banco (o `SIGLAS` de cada adaptador em `extrato/bancos`). */
export const SIGLAS_DOS_BANCOS: Readonly<Record<string, readonly string[]>> = {
  bb: ["BB", "BANCO DO BRASIL", "001"],
  bbc: ["BBC", "BBCDIGITAL"],
  bradesco: ["BRADESCO", "237"],
  c6: ["C6", "C6BANK", "336"],
  caixa: ["CAIXA", "CEF", "104"],
  cora: ["CORA", "403"],
  cresol: ["CRESOL", "133"],
  daycoval: ["DAYCOVAL", "707"],
  fitbank: ["FITBANK", "OMIE", "OMIE.CASH", "450"],
  grafeno: ["GRAFENO", "384", "310"],
  inter: ["INTER", "077"],
  itau: ["ITAU", "ITAÚ", "341"],
  iugu: ["IUGU", "401"],
  mercadopago: ["MERCADOPAGO", "MERCADO PAGO", "323"],
  nubank: ["NUBANK", "NU", "260"],
  safra: ["SAFRA", "422"],
  santander: ["SANTANDER", "033"],
  sicoob: ["SICOOB", "756"],
  sicredi: ["SICREDI", "748"],
  stone: ["STONE", "197"],
  unicred: ["UNICRED", "136"],
  viacredi: ["VIACREDI", "TRANSPOCRED", "AILOS", "085"],
};

/** Maiúsculas, sem acento e com espaços colapsados (`normalizar` do original). */
export function normalizar(texto: string): string {
  let sem = "";
  for (const c of texto.toUpperCase().normalize("NFKD")) if (!combinante(c)) sem += c;
  return split(sem).join(" ");
}

const soDigitos = (t: string) => /^[0-9]+$/.test(t);

/** O banco na forma canônica: "341", "ITAU" e "Itaú" viram "itau". Banco desconhecido volta normalizado. */
export function bancoCanonico(valor: string): string {
  let texto = normalizar(valor);
  if (soDigitos(texto)) texto = String(Number(texto));
  for (const [nome, siglas] of Object.entries(SIGLAS_DOS_BANCOS)) {
    const aliases = new Set(siglas.map((s) => (soDigitos(s) ? String(Number(s)) : normalizar(s))));
    if (aliases.has(texto)) return nome;
  }
  return texto;
}

function tag(texto: string, nome: string): string | null {
  const m = new RegExp(`<${nome}>\\s*([^<\\r\\n]+)`, "i").exec(texto);
  return m ? m[1].trim() : null;
}

/** Banco, agência e conta declarados no `<BANKACCTFROM>` do OFX. */
export function identidadeDoOfx(conteudo: string): Identidade {
  const r: Identidade = { banco: null, agencia: null, conta: null, multiplasContas: false };
  if (!conteudo.toUpperCase().includes("<BANKACCTFROM>")) return r;
  const blocos = [...conteudo.matchAll(/<BANKACCTFROM>([\s\S]*?)(?:<\/BANKACCTFROM>|<BANKTRANLIST>)/gi)].map((m) => m[1]);
  const identidades = new Map<string, [string | null, string | null, string | null]>();
  for (const b of blocos) {
    const t: [string | null, string | null, string | null] = [tag(b, "BANKID"), tag(b, "BRANCHID"), tag(b, "ACCTID")];
    identidades.set(JSON.stringify(t), t);
  }
  if (identidades.size > 1) r.multiplasContas = true;
  const primeira = identidades.values().next().value;
  if (primeira) [r.banco, r.agencia, r.conta] = primeira;
  return r;
}

const CONTA_RE = /\b(?:CONTA(?: CORRENTE)?|C\/C)\s*[:;]?\s*([\d.]+(?:-[\dX])?)/g;
const AGENCIA_RE = /\b(?:AGENCIA|AG\.)\s*[:;]?\s*([\d.]+(?:-[\dX])?)/g;
const BANCOS_NO_TEXTO: [string, string][] = [
  ["BANCO DO BRASIL", "BB"], ["ITAU", "ITAU"], ["BRADESCO", "BRADESCO"], ["SICREDI", "SICREDI"], ["SICOOB", "SICOOB"],
  ["SANTANDER", "SANTANDER"], ["GRAFENO", "GRAFENO"], ["CAIXA ECONOMICA", "CAIXA"], ["NUBANK", "NUBANK"],
];
// Corta o cabeçalho no início da tabela, para não tomar uma contraparte como titular.
const INICIO_DA_TABELA = /^\s*(?:Data\s*$|\d{2}[./-]\d{2}(?:[./-]\d{2,4})?\b)/im;

/**
 * O caminho do PDF de `extrair`: o topo de cada página (até 230 pontos ou 32% da altura), cortado
 * no início da tabela. O original lê esse topo com o PyMuPDF; aqui vem do mesmo texto que os
 * leitores usam, recortado na mesma altura (as linhas podem sair agrupadas de outro jeito, mas o que
 * se procura são os rótulos "Agência", "Conta" e o nome do banco).
 */
export function identidadeDoPdf(topos: readonly string[]): Identidade {
  const cabecalhos: string[] = [];
  const contas = new Set<string>();
  for (const topo of topos) {
    const m = INICIO_DA_TABELA.exec(topo);
    const trecho = m ? topo.slice(0, m.index) : topo;
    cabecalhos.push(trecho);
    for (const c of normalizar(trecho).matchAll(CONTA_RE)) contas.add(numero(c[1]));
  }
  return identidadeDoTexto(cabecalhos.join("\n"), contas.size > 1);
}

/**
 * O caminho da planilha de `extrair`: as linhas de cada folha antes do cabeçalho da tabela (até 80),
 * ou, no CSV, o texto antes da linha que começa com "data;" (até 3000 caracteres). Aqui vale a
 * folha que o leitor do extrato lê, a primeira (o original olhava todas).
 */
export function identidadeDaPlanilha(linhas: readonly (readonly string[])[] | null, textoCsv: string | null): Identidade {
  if (textoCsv !== null) {
    const m = /^\s*data[;,\t]/im.exec(textoCsv);
    return identidadeDoTexto([...(m ? textoCsv.slice(0, m.index) : textoCsv)].slice(0, 3000).join(""), false);
  }
  const antes: string[] = [];
  for (const celulas of (linhas ?? []).slice(0, 80)) {
    const chave = normalizar(celulas.join(" "));
    if (chave.includes("DATA") && ["VALOR", "DEBITO", "CREDITO"].some((c) => chave.includes(c))) break;
    antes.push(celulas.join(" "));
  }
  return identidadeDoTexto(antes.join("\n"), false);
}

function identidadeDoTexto(bruto: string, multiplas: boolean): Identidade {
  const r: Identidade = { banco: null, agencia: null, conta: null, multiplasContas: multiplas };
  const texto = normalizar(bruto);
  const agencias = [...texto.matchAll(AGENCIA_RE)].map((m) => m[1]);
  const todasContas = [...texto.matchAll(CONTA_RE)].map((m) => m[1]);
  r.agencia = agencias[0] ?? null;
  r.conta = todasContas[0] ?? null;
  r.multiplasContas ||= new Set(todasContas.map((c) => numero(c))).size > 1 || new Set(agencias.map((a) => numero(a.split("-")[0]))).size > 1;
  const encontrados = new Set(BANCOS_NO_TEXTO.filter(([rotulo]) => new RegExp(`\\b${rotulo}\\b`).test(texto)).map(([, sigla]) => sigla));
  r.multiplasContas ||= encontrados.size > 1;
  if (encontrados.size === 1) r.banco = [...encontrados][0];
  return r;
}

/** Só os dígitos (e X de dígito verificador), sem zeros à esquerda: "0001.234-X" → "1234X". */
export function numero(valor: string | null | undefined): string {
  const t = normalizar((valor ?? "").replace(/[^\dXx]/g, "")).replace(/^0+/, "");
  return t || "0";
}

function particao(t: string): [string, string] {
  const i = t.indexOf("-");
  return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i + 1)];
}

export type Conferencia = { estado: EstadoIdentidade; identidade: Identidade; mensagens: string[] };

/** Confronta a identidade do arquivo com a conta cadastrada. */
export function conferirIdentidade(identidade: Identidade, conta: ContaCadastrada): Conferencia {
  const divergencias: string[] = [];
  let digitoVerificado = true;
  if (identidade.multiplasContas) divergencias.push("O arquivo contém mais de uma conta bancária.");
  if (identidade.banco && bancoCanonico(identidade.banco) !== bancoCanonico(conta.bancoSigla)) {
    divergencias.push(`Banco do arquivo: ${identidade.banco}; cadastrado: ${conta.bancoSigla}.`);
  }
  if (identidade.agencia && numero(identidade.agencia.split("-")[0]) !== numero(conta.agencia.split("-")[0])) {
    divergencias.push(`Agência do arquivo: ${identidade.agencia}; cadastrada: ${conta.agencia}.`);
  }
  if (identidade.conta) {
    const [num, digito] = particao(identidade.conta);
    const [cadastrado, dvDoNumero] = particao(conta.numero);
    const dv = conta.digito || dvDoNumero;
    let compativel = numero(num) === numero(cadastrado);
    if (!digito && dv) {
      compativel ||= numero(num) === numero(cadastrado + dv);
      digitoVerificado = numero(num) === numero(cadastrado + dv);
    }
    if (!compativel || (digito && dv && numero(digito) !== numero(dv))) {
      divergencias.push(`Conta do arquivo: ${identidade.conta}; cadastrada: ${conta.numero}-${dv}.`);
    }
  }
  const completo = Boolean(identidade.banco && identidade.agencia && identidade.conta);
  const estado: EstadoIdentidade = divergencias.length ? "DIVERGENTE" : completo && digitoVerificado ? "COMPATIVEL" : "CONFIRMAR";
  return { estado, identidade, mensagens: divergencias };
}
