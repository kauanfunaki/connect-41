import { describe, expect, it } from "vitest";
import { novosPorPasta, ordenarEmpresas, paginar, type EmpresaNaLista } from "./listaDeEmpresas";

const AGORA = new Date("2026-10-09T15:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

describe("o que é novo do cliente", () => {
  it("conta o que chegou depois do último visto da pasta", () => {
    const vistas = new Map([["enviados-a", dias(5)]]);
    const r = novosPorPasta(
      [
        { folderId: "enviados-a", criadoEm: dias(10) },
        { folderId: "enviados-a", criadoEm: dias(2) },
        { folderId: "enviados-a", criadoEm: dias(1) },
      ],
      vistas,
      AGORA
    );
    expect(r.get("enviados-a")).toEqual({ novos: 2, ultimo: dias(1) });
  });

  it("pasta nunca aberta: só os últimos 30 dias contam", () => {
    const r = novosPorPasta(
      [
        { folderId: "enviados-b", criadoEm: dias(45) },
        { folderId: "enviados-b", criadoEm: dias(3) },
      ],
      new Map(),
      AGORA
    );
    expect(r.get("enviados-b")?.novos).toBe(1);
  });

  it("visto depois do envio: nada novo", () => {
    expect(novosPorPasta([{ folderId: "c", criadoEm: dias(3) }], new Map([["c", dias(1)]]), AGORA).size).toBe(0);
  });
});

describe("a ordem e a página", () => {
  const empresa = (nome: string, e: Partial<EmpresaNaLista> = {}): EmpresaNaLista => ({
    id: nome,
    nome,
    cnpj: null,
    arquivos: 0,
    novos: 0,
    ultimoNovo: null,
    ultimoMovimento: null,
    ...e,
  });

  it("novidade primeiro, depois movimento recente, depois o nome", () => {
    const lista = [
      empresa("Alfa"),
      empresa("Beta", { ultimoMovimento: dias(1) }),
      empresa("Gama", { novos: 1, ultimoNovo: dias(3) }),
      empresa("Delta", { novos: 2, ultimoNovo: dias(1) }),
      empresa("Épsilon", { ultimoMovimento: dias(9) }),
    ];
    expect(ordenarEmpresas(lista, false).map((e) => e.nome)).toEqual(["Delta", "Gama", "Beta", "Épsilon", "Alfa"]);
    // Com busca, o movimento não manda: nome.
    expect(ordenarEmpresas(lista, true).map((e) => e.nome)).toEqual(["Delta", "Gama", "Alfa", "Beta", "Épsilon"]);
  });

  it("pagina e corrige página fora do intervalo", () => {
    const lista = Array.from({ length: 30 }, (_, i) => i);
    expect(paginar(lista, 1)).toMatchObject({ pagina: 1, paginas: 3, total: 30, itens: lista.slice(0, 12) });
    expect(paginar(lista, 3).itens).toEqual(lista.slice(24));
    expect(paginar(lista, 9).pagina).toBe(3);
    expect(paginar(lista, 0).pagina).toBe(1);
    expect(paginar([], 1)).toMatchObject({ pagina: 1, paginas: 1, total: 0, itens: [] });
  });
});
