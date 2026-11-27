import { describe, expect, it } from "vitest";
import { aIntegralizar, capitalDaFoto, fotoDosSocios, lerDadosSocietarios, lerFoto, lerReais, mudancasEntre, type SocioNaFoto } from "./quadro";

// Os dados societários da ficha e o quadro por data (melhoria-892, 27/11/2026).
// Dados inventados.

const dec = (n: number) => ({ toNumber: () => n });

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("valores em reais", () => {
  it("lê com e sem separador de milhar", () => {
    expect(lerReais("10.000,00")).toBe(10000);
    expect(lerReais("R$ 1.234,56")).toBe(1234.56);
    expect(lerReais("10000")).toBe(10000);
    expect(lerReais("10000.5")).toBe(10000.5);
    expect(lerReais("1.000.000")).toBe(1000000);
    expect(lerReais("")).toBeNull();
    expect(lerReais("dez mil")).toBeUndefined();
  });
  it("a integralizar", () => {
    expect(aIntegralizar(10000, 2500)).toBe(7500);
    expect(aIntegralizar(10000, null)).toBeNull();
  });
});

describe("o formulário dos dados societários", () => {
  it("lê tudo, com o NIRE e o CPF só com números", () => {
    const r = lerDadosSocietarios(
      form({
        nire: "41.2.0876543-2",
        juntaRegistradoEm: "2026-11-20",
        objetoSocial: "Serviços de contabilidade.",
        capitalSocial: "10.000,00",
        capitalIntegralizado: "10.000,00",
        responsavelLegalNome: "João Souza",
        responsavelLegalCpf: "123.456.789-09",
        responsavelLegalCargo: "Administrador",
        responsavelLegalEmail: "Joao@Exemplo.com",
      })
    );
    expect(r).toMatchObject({
      ok: true,
      dados: { nire: "41208765432", objetoSocial: "Serviços de contabilidade.", capitalSocial: 10000, responsavelLegalCpf: "12345678909", responsavelLegalEmail: "joao@exemplo.com", responsavelLegalRg: null },
    });
    if (r.ok) expect(r.dados.juntaRegistradoEm?.toISOString()).toBe("2026-11-20T12:00:00.000Z");
  });
  it("vazio vira nulo", () => {
    expect(lerDadosSocietarios(form({}))).toEqual({
      ok: true,
      dados: {
        nire: null,
        juntaRegistradoEm: null,
        objetoSocial: null,
        capitalSocial: null,
        capitalIntegralizado: null,
        responsavelLegalNome: null,
        responsavelLegalCpf: null,
        responsavelLegalRg: null,
        responsavelLegalCargo: null,
        responsavelLegalEmail: null,
      },
    });
  });
  it("recusa integralizado maior que o social, CPF inválido, valor que não é número e e-mail torto", () => {
    expect(lerDadosSocietarios(form({ capitalSocial: "1.000,00", capitalIntegralizado: "2.000,00" }))).toMatchObject({ ok: false, erro: expect.stringContaining("integralizado") });
    expect(lerDadosSocietarios(form({ responsavelLegalCpf: "111.111.111-11" }))).toMatchObject({ ok: false, erro: expect.stringContaining("CPF") });
    expect(lerDadosSocietarios(form({ capitalSocial: "dez mil" }))).toMatchObject({ ok: false, erro: expect.stringContaining("Capital social") });
    expect(lerDadosSocietarios(form({ responsavelLegalEmail: "joao@" }))).toMatchObject({ ok: false, erro: expect.stringContaining("e-mail") });
    expect(lerDadosSocietarios(form({ nire: "123" }))).toMatchObject({ ok: false, erro: expect.stringContaining("NIRE") });
    expect(lerDadosSocietarios(form({ juntaRegistradoEm: "2026-02-30" }))).toMatchObject({ ok: false });
  });
});

describe("a foto do quadro", () => {
  const banco = [
    { name: "Ana Lima", document: "98765432100", qualification: "Sócio", administrator: false, sharePercent: dec(40), quotas: 4000, capitalAmount: dec(4000), exitDate: null },
    { name: "João Souza", document: "12345678909", qualification: "Sócio-Administrador", administrator: true, sharePercent: dec(60), quotas: 6000, capitalAmount: dec(6000), exitDate: null },
    { name: "Pedro Saiu", document: "11144477735", qualification: "Sócio", administrator: false, sharePercent: null, quotas: null, capitalAmount: null, exitDate: new Date("2026-01-01") },
  ];

  it("só quem está na sociedade, administradores primeiro", () => {
    const f = fotoDosSocios(banco);
    expect(f.map((s) => s.nome)).toEqual(["João Souza", "Ana Lima"]);
    expect(f[0]).toEqual({ nome: "João Souza", documento: "12345678909", qualificacao: "Sócio-Administrador", administrador: true, percentual: 60, quotas: 6000, capital: 6000 });
  });
  it("capital: o da ficha, ou a soma dos sócios", () => {
    const f = fotoDosSocios(banco);
    expect(capitalDaFoto(50000, f)).toBe(50000);
    expect(capitalDaFoto(null, f)).toBe(10000);
    expect(capitalDaFoto(null, [{ ...f[0]!, capital: null }])).toBeNull();
  });
  it("lê o JSON guardado sem confiar no formato", () => {
    expect(lerFoto([{ nome: "A", administrador: true, quotas: 10 }, { semNome: 1 }, "x", null])).toEqual([
      { nome: "A", documento: null, qualificacao: null, administrador: true, percentual: null, quotas: 10, capital: null },
    ]);
    expect(lerFoto({ nao: "lista" })).toEqual([]);
  });
  it("o que mudou de uma foto para a outra", () => {
    const s = (nome: string, doc: string | null, quotas: number): SocioNaFoto => ({ nome, documento: doc, qualificacao: null, administrador: false, percentual: null, quotas, capital: null });
    expect(mudancasEntre([s("A", "1", 10), s("B", "2", 10), s("Sem Doc", null, 5)], [s("A", "1", 10), s("B", "2", 20), s("C", "3", 5), s("sem doc", null, 5)])).toEqual([
      { tipo: "mudou", nome: "B" },
      { tipo: "entrou", nome: "C" },
    ]);
    expect(mudancasEntre([s("A", "1", 10)], [])).toEqual([{ tipo: "saiu", nome: "A" }]);
  });
});
