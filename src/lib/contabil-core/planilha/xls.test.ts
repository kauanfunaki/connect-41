// Gabarito do leitor de .xls (scripts/contabil-core/gabarito_xls.py): o que o xlrd 2.0 lê de cada
// planilha inventada, célula a célula, e os erros que ele lança nos arquivos inválidos.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ehFormatoData, ErroXls, lerXls, xldateComoTupla, type CelulaXls, type LivroXls } from "./xls";

type ValorPy = string | number | { $f: string };
type ResultadoPy =
  | { erro: { tipo: string; mensagem: string } }
  | {
      datemode: 0 | 1;
      folhas: { nome: string; nrows: number; ncols: number; linhas: [number, ValorPy][][] }[];
    };

const pasta = join(__dirname, "gabarito");
const TIPOS = ["vazio", "texto", "numero", "data", "booleano", "erro", "branco"];

function floatPy(t: string): number {
  if (t === "nan") return NaN;
  if (t === "inf") return Infinity;
  if (t === "-inf") return -Infinity;
  return Number(t);
}

/** Converte o gabarito do Python para o formato do porte (float vira número, com -0.0 e nan). */
function celulaEsperada([ctype, valor]: [number, ValorPy]): CelulaXls {
  const v = typeof valor === "object" ? floatPy(valor.$f) : valor;
  return { tipo: TIPOS[ctype] as CelulaXls["tipo"], valor: v };
}

/** Lê com o porte e devolve no mesmo formato do gabarito (erro com nome e mensagem). */
function lerComoPy(bytes: Uint8Array): { erro: { tipo: string; mensagem: string } } | LivroXls {
  try {
    return lerXls(bytes);
  } catch (e) {
    if (!(e instanceof ErroXls)) throw e;
    return { erro: { tipo: e.name, mensagem: e.message } };
  }
}

function conferir(obtido: ReturnType<typeof lerComoPy>, esperado: ResultadoPy) {
  if ("erro" in esperado) {
    expect(obtido).toEqual({ erro: esperado.erro });
    return;
  }
  if ("erro" in obtido) throw new Error(`porte falhou e o xlrd não: ${obtido.erro.tipo}: ${obtido.erro.mensagem}`);
  expect(obtido.datemode).toBe(esperado.datemode);
  expect(obtido.folhas.map((f) => f.nome)).toEqual(esperado.folhas.map((f) => f.nome));
  esperado.folhas.forEach((fe, i) => {
    const linhas = obtido.folhas[i].linhas;
    expect(linhas.length).toBe(fe.nrows);
    linhas.forEach((l) => expect(l.length).toBe(fe.ncols));
    // toEqual usa Object.is: -0.0 e nan precisam bater exatamente.
    expect(linhas).toEqual(fe.linhas.map((l) => l.map(celulaEsperada)));
  });
}

const arquivos = readdirSync(pasta)
  .filter((n) => n.startsWith("xls-") && n.endsWith(".xls"))
  .map((n) => n.slice(0, -4));
const ler = (nome: string) => new Uint8Array(readFileSync(join(pasta, nome + ".xls")));

describe("xlrd: planilhas do gabarito", () => {
  it("tem os casos gerados", () => expect(arquivos.length).toBeGreaterThan(20));
  for (const nome of arquivos) {
    it(nome, () => {
      const esperado: ResultadoPy = JSON.parse(readFileSync(join(pasta, nome + ".json"), "utf8"));
      conferir(lerComoPy(ler(nome)), esperado);
    });
  }
});

type Extras = {
  fuzz: { base: string; trocas: [number, number][]; corte: number; resultado: ResultadoPy }[];
  xldate: ({ valor: { $f: string }; datemode: number } & ({ tupla: number[] } | { erro: { tipo: string; mensagem: string } }))[];
  formatos: [string, boolean][];
};
const extras: Extras = JSON.parse(readFileSync(join(pasta, "xls-extras.json"), "utf8"));

describe("xlrd: arquivos corrompidos (bytes trocados e cortes)", () => {
  const bases = new Map<string, Uint8Array>();
  extras.fuzz.forEach((caso, i) => {
    it(`${caso.base} #${i}`, () => {
      if (!bases.has(caso.base)) bases.set(caso.base, ler(caso.base));
      const bytes = bases.get(caso.base)!.slice();
      for (const [pos, b] of caso.trocas) bytes[pos] = b;
      conferir(lerComoPy(bytes.subarray(0, caso.corte)), caso.resultado);
    });
  });
});

describe("xlrd: xldate_as_tuple", () => {
  it.each(extras.xldate.map((c) => [`${c.valor.$f} (datemode ${c.datemode})`, c] as const))("%s", (_, c) => {
    const executar = () => xldateComoTupla(floatPy(c.valor.$f), c.datemode as 0 | 1);
    if ("tupla" in c) expect(executar()).toEqual(c.tupla);
    else {
      let erro: unknown;
      try {
        executar();
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(Error);
      expect({ tipo: (erro as Error).name, mensagem: (erro as Error).message }).toEqual(c.erro);
    }
  });
});

describe("xlrd: is_date_format_string", () => {
  it.each(extras.formatos)("%s", (formato, ehData) => {
    expect(ehFormatoData(formato)).toBe(ehData);
  });
});

// Onde o xlrd travaria ou alocaria milhões de células, o porte para antes (LimiteXls).
describe("limites contra arquivo malicioso", () => {
  const registro = (codigo: number, dados: number[]) => [codigo & 0xff, codigo >> 8, dados.length & 0xff, dados.length >> 8, ...dados];
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const i32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const bof = (tipo: number) => registro(0x0809, [...u16(0x0600), ...u16(tipo), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const eof = registro(0x000a, []);
  /** Livro BIFF8 solto com uma folha; `globais` vai antes do BOUNDSHEET. */
  function livro(globais: number[], celulas: number[]): Uint8Array {
    const tamGlobais = bof(5).length + globais.length + 4 + 9 + eof.length;
    const bs = registro(0x0085, [...i32(tamGlobais), 0, 0, 1, 0, 0x41]);
    return new Uint8Array([...bof(5), ...globais, ...bs, ...eof, ...bof(0x10), ...celulas, ...eof]);
  }
  const numero = (r: number, c: number) => registro(0x0203, [...u16(r), ...u16(c), 0, 0, 0, 0, 0, 0, 0, 0, 0xf0, 0x3f]);

  it("uma célula em IV65536 (16 milhões de células vazias no xlrd)", () => {
    const bytes = livro([], numero(65535, 255));
    expect(() => lerXls(bytes)).toThrow(expect.objectContaining({ name: "LimiteXls" }));
  });

  it("a mesma célula num canto razoável passa", () => {
    const folha = lerXls(livro([], numero(99, 9))).folhas[0];
    expect([folha.nome, folha.linhas.length, folha.linhas[0].length, folha.linhas[99][9]]).toEqual([
      "A",
      100,
      10,
      { tipo: "numero", valor: 1 },
    ]);
  });

  it("SST que volta para trás (fonético negativo): o xlrd não terminaria", () => {
    const sst = registro(0x00fc, [...i32(1e9), ...i32(1e9), ...u16(0), 0x04, ...i32(-7)]);
    expect(() => lerXls(livro(sst, []))).toThrow(expect.objectContaining({ name: "LimiteXls" }));
  });
});

describe("xlrd: uso no leitor de extrato", () => {
  it("datas viram tupla com o datemode do livro", () => {
    const livro = lerXls(ler("xls-xlwt-folhas"));
    const datas = livro.folhas[3].linhas.map((l) => xldateComoTupla(l[0].valor as number, livro.datemode));
    expect(livro.folhas[3].linhas.every((l) => l[0].tipo === "data")).toBe(true);
    expect(datas).toEqual([
      [1900, 3, 1, 0, 0, 0],
      [1904, 1, 2, 0, 0, 0],
      [2026, 12, 31, 23, 59, 59],
      [0, 0, 0, 12, 0, 0],
      [9999, 12, 31, 0, 0, 0],
    ]);
  });

  it("aceita Buffer do Node (com deslocamento dentro do ArrayBuffer)", () => {
    const buffer = readFileSync(join(pasta, "xls-biff8-celulas.xls"));
    const deslocado = Buffer.concat([Buffer.from([1, 2, 3]), buffer]).subarray(3);
    expect(lerXls(deslocado)).toEqual(lerXls(ler("xls-biff8-celulas")));
  });
});
