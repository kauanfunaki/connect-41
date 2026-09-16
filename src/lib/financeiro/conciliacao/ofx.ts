// Leitura de extrato OFX. Função pura: recebe os bytes, devolve o extrato ou um
// erro legível — nunca lança, porque o arquivo vem do internet banking do
// cliente e "malformado" é o caso comum, não a exceção.
//
// ─── As duas famílias do formato ─────────────────────────────────────────────
//
// - **OFX 1.x (SGML)**: cabeçalho em linhas `CHAVE:VALOR` e tags de valor sem
//   fechamento (`<TRNAMT>-10.00` e segue a próxima tag). É o que a maioria dos
//   bancos brasileiros exporta.
// - **OFX 2.x (XML)**: `<?xml ...?>` + `<?OFX ...?>` e toda tag fechada.
//
// Um só leitor serve os dois: tag aberta **com texto** depois dela é valor;
// tag aberta sem texto é agregado. O fechamento de um valor (`</TRNAMT>` no XML)
// é ignorado, e o de um agregado fecha também o que ficou aberto dentro dele —
// que é como um valor vazio do SGML (`<MEMO>` seguido de `<NAME>`) se parece.
//
// ─── Charset ─────────────────────────────────────────────────────────────────
//
// Banco brasileiro declara `CHARSET:1252` e manda latin1 — ler como UTF-8 vira
// "TARIFA MANUTEN��O". Mas também há quem declare 1252 e mande UTF-8. A regra:
// se os bytes formam UTF-8 válido **com** algum caractere acima de ASCII, é
// UTF-8, seja o que for que o cabeçalho diga (texto latin1 com acento quase
// nunca forma UTF-8 válido por acaso); senão vale o cabeçalho, e o padrão do
// SGML sem charset é 1252.

import { createHash } from "node:crypto";
import { dataValida } from "../periodo";

export type TransacaoOfx = {
  /** FITID do banco, ou gerado — ver `idDeterministico`. */
  fitId: string;
  /** `true` quando o arquivo não trouxe FITID e o id foi gerado. */
  fitIdGerado: boolean;
  tipo: string | null;
  /** "AAAA-MM-DD" — o dia civil do lançamento no banco. */
  dataKey: string;
  /** Com sinal: crédito positivo, débito negativo. */
  centavos: number;
  memo: string | null;
  nome: string | null;
  cheque: string | null;
};

export type ExtratoOfx = {
  bancoId: string | null;
  agencia: string | null;
  contaId: string;
  tipoDaConta: string | null;
  inicioKey: string | null;
  fimKey: string | null;
  saldo: { centavos: number; dataKey: string | null } | null;
  transacoes: TransacaoOfx[];
  /** Transações de valor zero descartadas — não movem dinheiro nem casam com nada. */
  zeradas: number;
  charset: "utf-8" | "windows-1252";
};

export type LeituraOfx = { ok: true; extrato: ExtratoOfx } | { ok: false; erro: string };

// ─── Bytes → texto ───────────────────────────────────────────────────────────

function temAcimaDeAscii(bytes: Uint8Array): boolean {
  for (const b of bytes) if (b > 0x7f) return true;
  return false;
}

function utf8Estrito(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** O charset declarado: `CHARSET:`/`ENCODING:` do SGML ou `encoding=` do XML. */
function charsetDeclarado(inicio: string): "utf-8" | "windows-1252" | null {
  const xml = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(inicio);
  if (xml) return /utf-?8/i.test(xml[1]!) ? "utf-8" : "windows-1252";
  if (/^\s*ENCODING\s*:\s*UTF-?8/im.test(inicio)) return "utf-8";
  const cs = /^\s*CHARSET\s*:\s*(\S+)/im.exec(inicio);
  if (cs) return /utf-?8/i.test(cs[1]!) ? "utf-8" : "windows-1252";
  if (/<\?xml/i.test(inicio)) return "utf-8";
  return null;
}

export function decodificarOfx(bytes: Uint8Array): { texto: string; charset: "utf-8" | "windows-1252" } {
  // O cabeçalho é ASCII nos dois formatos: ler os primeiros bytes em latin1
  // não erra nada que importe para achar a declaração.
  const inicio = new TextDecoder("windows-1252").decode(bytes.subarray(0, 1024));
  if (temAcimaDeAscii(bytes)) {
    const utf8 = utf8Estrito(bytes);
    if (utf8 !== null) return { texto: utf8, charset: "utf-8" };
    return { texto: new TextDecoder("windows-1252").decode(bytes), charset: "windows-1252" };
  }
  // Só ASCII: qualquer decodificação dá o mesmo texto; o rótulo é informativo.
  const declarado = charsetDeclarado(inicio) ?? "windows-1252";
  return { texto: new TextDecoder("windows-1252").decode(bytes), charset: declarado };
}

// ─── Valores ─────────────────────────────────────────────────────────────────

/**
 * Data OFX (`AAAAMMDD[hhmmss[.xxx]][[-3:BRT]]`) para o dia civil.
 *
 * Usa a data **como escrita**, sem aplicar o fuso do colchete: o banco diz em
 * que dia lançou, e converter `20260910000000[-3:BRT]` para UTC e de volta é
 * como um débito de meia-noite escorrega para o dia anterior.
 */
export function dataDoOfx(texto: string | null | undefined): string | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})/.exec(texto ?? "");
  if (!m) return null;
  return dataValida(`${m[1]}-${m[2]}-${m[3]}`);
}

/**
 * Valor OFX para centavos com sinal. `null` quando ilegível.
 *
 * O padrão é ponto decimal, mas há banco que exporta com vírgula e até com
 * separador de milhar. O último separador é o decimal. Casas além da segunda
 * só passam se forem zero (`-150.000`): arredondar em silêncio seria inventar
 * centavo.
 */
export function centavosDoOfx(texto: string | null | undefined): number | null {
  let t = (texto ?? "").replace(/\s/g, "");
  let sinal = 1;
  if (t.startsWith("-")) {
    sinal = -1;
    t = t.slice(1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  if (t === "") return null;

  const ultimo = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  let inteira = t;
  let decimal = "";
  if (ultimo >= 0) {
    const sufixo = t.slice(ultimo + 1);
    const semMilhar = t.slice(0, ultimo).replace(/[.,]/g, "");
    // "1.234" com um só separador e três dígitos depois é ambíguo; no OFX o
    // ponto é decimal, então só é milhar se houver outro separador antes.
    inteira = semMilhar;
    decimal = sufixo;
  }
  if (!/^\d*$/.test(inteira) || !/^\d*$/.test(decimal) || (inteira === "" && decimal === "")) return null;
  if (decimal.length > 2) {
    if (!/^0+$/.test(decimal.slice(2))) return null;
    decimal = decimal.slice(0, 2);
  }
  const centavos = Number(inteira || "0") * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos)) return null;
  return sinal * centavos;
}

/** Tipos que, pela especificação, são saída de dinheiro. */
const TIPOS_DE_DEBITO = new Set(["DEBIT", "CHECK", "FEE", "SRVCHG", "PAYMENT", "DIRECTDEBIT", "ATM", "CASH"]);

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function textoLimpo(bruto: string): string {
  return bruto
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e.startsWith("#")) return String.fromCharCode(Number(e.slice(1)));
      return ENTIDADES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function opcional(v: string | undefined, max: number): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t.slice(0, max);
}

// ─── Árvore ──────────────────────────────────────────────────────────────────

type Quadro = { tag: string; campos: Map<string, string> };

/** Normaliza texto para compor o id gerado: sem espaço duplo nem caixa. */
function chaveDeTexto(t: string | null): string {
  return (t ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Id para transação sem FITID.
 *
 * Hash de data + valor + memo + nome + **ordinal entre as idênticas**: a 1ª, 2ª,
 * 3ª transação com os mesmos data, valor e texto no arquivo. Ordinal, e não a
 * posição absoluta, para reimportar um período que se sobrepõe a outro (o
 * extrato de 1 a 30 depois o de 15 a 45) dar o mesmo id às linhas repetidas.
 *
 * A limitação, que não tem como ser resolvida sem o FITID: se o banco exportar
 * duas tarifas idênticas no mesmo dia num arquivo e só uma delas no outro, a
 * reimportação reconhece a primeira e trata a segunda como nova — e vice-versa
 * se a ordem mudar. É o banco que precisa mandar FITID; a tela avisa quando não
 * mandou.
 */
function idDeterministico(t: { dataKey: string; centavos: number; memo: string | null; nome: string | null }, ordinal: number) {
  const base = [t.dataKey, t.centavos, chaveDeTexto(t.memo), chaveDeTexto(t.nome), ordinal].join("|");
  return `GERADO-${createHash("sha256").update(base).digest("hex").slice(0, 40)}`;
}

/**
 * Lê um extrato OFX de conta corrente ou poupança.
 *
 * Recusa, com mensagem: arquivo que não é OFX, extrato de cartão (é outro
 * agregado, fora desta fatia), mais de uma conta no mesmo arquivo, conta sem
 * ACCTID, transação com data ou valor ilegível (diz qual).
 */
export function lerOfx(bytes: Uint8Array): LeituraOfx {
  if (bytes.length === 0) return { ok: false, erro: "O arquivo está vazio." };

  const { texto, charset } = decodificarOfx(bytes);
  const inicioOfx = texto.search(/<OFX>/i);
  if (inicioOfx < 0) return { ok: false, erro: "Este arquivo não é um extrato OFX — não há a tag <OFX>." };

  const corpo = texto.slice(inicioOfx);
  const re = /<(\/?)([A-Za-z0-9._]+)\s*>([^<]*)/g;

  const pilha: Quadro[] = [];
  const contas: Map<string, string>[] = [];
  const listas: Map<string, string>[] = [];
  const saldos: Map<string, string>[] = [];
  const brutas: Map<string, string>[] = [];
  let temCartao = false;

  function fechar(q: Quadro) {
    switch (q.tag) {
      case "STMTTRN":
        brutas.push(q.campos);
        break;
      case "BANKACCTFROM":
        contas.push(q.campos);
        break;
      case "CCACCTFROM":
        temCartao = true;
        break;
      case "BANKTRANLIST":
        listas.push(q.campos);
        break;
      case "LEDGERBAL":
        saldos.push(q.campos);
        break;
    }
  }

  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo)) !== null) {
    const fechamento = m[1] === "/";
    const tag = m[2]!.toUpperCase();
    const valor = textoLimpo(m[3] ?? "");

    if (!fechamento) {
      if (valor !== "") {
        const topo = pilha[pilha.length - 1];
        if (topo && !topo.campos.has(tag)) topo.campos.set(tag, valor);
      } else {
        pilha.push({ tag, campos: new Map() });
      }
      continue;
    }

    // Fechamento: desempilha até achar o agregado. Quadros abertos no caminho
    // eram valores vazios do SGML — os campos que "entraram" neles pertencem
    // ao pai, e sobem sem sobrescrever o que o pai já tem.
    const idx = pilha.map((q) => q.tag).lastIndexOf(tag);
    if (idx < 0) continue; // fechamento de valor (XML) ou tag solta
    while (pilha.length - 1 > idx) {
      const solto = pilha.pop()!;
      const pai = pilha[pilha.length - 1]!;
      for (const [k, v] of solto.campos) if (!pai.campos.has(k)) pai.campos.set(k, v);
    }
    fechar(pilha.pop()!);
  }
  // SGML truncado: o que ficou aberto ainda conta, do mais interno para fora.
  while (pilha.length > 0) fechar(pilha.pop()!);

  if (contas.length === 0) {
    if (temCartao) return { ok: false, erro: "Este é um extrato de cartão de crédito. A conciliação lê só conta corrente e poupança." };
    return { ok: false, erro: "O arquivo não identifica a conta bancária (falta o bloco BANKACCTFROM)." };
  }
  const contaIds = new Set(contas.map((c) => (c.get("ACCTID") ?? "").replace(/\D/g, "").replace(/^0+/, "")));
  if (contaIds.size > 1) return { ok: false, erro: "O arquivo traz extratos de mais de uma conta. Exporte uma conta por arquivo." };
  const conta = contas[0]!;
  const contaId = (conta.get("ACCTID") ?? "").trim();
  if (contaId === "") return { ok: false, erro: "O arquivo não informa o número da conta (ACCTID)." };

  const transacoes: TransacaoOfx[] = [];
  const ordinais = new Map<string, number>();
  const fitIdsVistos = new Map<string, number>();
  let zeradas = 0;

  for (let i = 0; i < brutas.length; i++) {
    const c = brutas[i]!;
    const n = i + 1;
    const dataKey = dataDoOfx(c.get("DTPOSTED")) ?? dataDoOfx(c.get("DTUSER"));
    if (!dataKey) return { ok: false, erro: `Transação ${n}: data ilegível (${c.get("DTPOSTED") ?? "vazia"}).` };
    let centavos = centavosDoOfx(c.get("TRNAMT"));
    if (centavos === null) return { ok: false, erro: `Transação ${n}: valor ilegível (${c.get("TRNAMT") ?? "vazio"}).` };
    if (centavos === 0) {
      zeradas++;
      continue;
    }
    const tipo = opcional(c.get("TRNTYPE"), 20)?.toUpperCase() ?? null;
    // Há banco que manda débito com valor positivo e deixa o sinal no tipo.
    if (centavos > 0 && tipo && TIPOS_DE_DEBITO.has(tipo)) centavos = -centavos;

    const memo = opcional(c.get("MEMO"), 255);
    const nome = opcional(c.get("NAME") ?? c.get("PAYEE"), 180);
    const base = { dataKey, centavos, memo, nome };

    let fitId = opcional(c.get("FITID"), 200);
    let fitIdGerado = false;
    if (!fitId) {
      const chave = [dataKey, centavos, chaveDeTexto(memo), chaveDeTexto(nome)].join("|");
      const ordinal = (ordinais.get(chave) ?? 0) + 1;
      ordinais.set(chave, ordinal);
      fitId = idDeterministico(base, ordinal);
      fitIdGerado = true;
    } else {
      // FITID repetido dentro do mesmo arquivo acontece (banco que numera por
      // dia). Sem sufixo a segunda linha seria contada como "já importada".
      const vezes = (fitIdsVistos.get(fitId) ?? 0) + 1;
      fitIdsVistos.set(fitId, vezes);
      if (vezes > 1) fitId = `${fitId}#${vezes}`;
    }

    transacoes.push({
      fitId,
      fitIdGerado,
      tipo,
      dataKey,
      centavos,
      memo,
      nome,
      cheque: opcional(c.get("CHECKNUM"), 30),
    });
  }

  const lista = listas[0];
  const bruto = saldos[saldos.length - 1];
  let saldo: ExtratoOfx["saldo"] = null;
  if (bruto?.get("BALAMT") !== undefined) {
    const centavos = centavosDoOfx(bruto.get("BALAMT"));
    if (centavos === null) return { ok: false, erro: `Saldo do extrato ilegível (${bruto.get("BALAMT")}).` };
    saldo = { centavos, dataKey: dataDoOfx(bruto.get("DTASOF")) };
  }

  return {
    ok: true,
    extrato: {
      bancoId: opcional(conta.get("BANKID"), 20),
      agencia: opcional(conta.get("BRANCHID"), 20),
      contaId,
      tipoDaConta: opcional(conta.get("ACCTTYPE"), 20),
      inicioKey: dataDoOfx(lista?.get("DTSTART")),
      fimKey: dataDoOfx(lista?.get("DTEND")),
      saldo,
      transacoes,
      zeradas,
      charset,
    },
  };
}
