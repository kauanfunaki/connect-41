import { describe, expect, it } from "vitest";
import {
  CONTAS_POR_PAGINA,
  fatiasDaPagina,
  funisDaConsulta,
  funisDaUrl,
  funisNaConsulta,
  paginaDaUrl,
  temFunil,
  totalDePaginas,
  whereDaSituacao,
  whereDoFunil,
  whereDosFunis,
  diaDaChave,
} from "./paginaDeContas";

// O que se testa (13/11/2026): a lista de Contas a pagar e a receber passou a
// ser paginada no servidor, e os funis das colunas a filtrar pela URL. A
// página é uma janela sobre partes em sequência (em "todas", as em aberto e
// depois o histórico) e pode atravessar a divisa; o funil vira `where` sem
// brigar com o recorte, e nada que venha da URL vira "tudo".

const HOJE = "2026-11-13";
const dia = (key: string) => new Date(`${key}T00:00:00-03:00`);

describe("a página da URL", () => {
  it("lê o número, e qualquer coisa estranha é a 1", () => {
    expect(paginaDaUrl("3")).toBe(3);
    expect(paginaDaUrl(["2", "9"])).toBe(2);
    for (const ruim of [undefined, "", "0", "-2", "1.5", "abc", "1e400"]) expect(paginaDaUrl(ruim), String(ruim)).toBe(1);
  });

  it("conta as páginas, com ao menos uma para a lista vazia", () => {
    expect(CONTAS_POR_PAGINA).toBe(50);
    expect(totalDePaginas(0)).toBe(1);
    expect(totalDePaginas(50)).toBe(1);
    expect(totalDePaginas(51)).toBe(2);
    expect(totalDePaginas(1000, 100)).toBe(10);
  });
});

describe("fatiasDaPagina — a janela sobre as partes da lista", () => {
  it("uma parte: skip e take da página", () => {
    expect(fatiasDaPagina([120], 1, 50)).toEqual([{ parte: 0, skip: 0, take: 50 }]);
    expect(fatiasDaPagina([120], 3, 50)).toEqual([{ parte: 0, skip: 100, take: 20 }]);
  });

  it("atravessa a divisa: o fim das em aberto e o começo do histórico na mesma página", () => {
    // 70 em aberto e 200 no histórico: a página 2 tem as 20 últimas abertas e as 30 primeiras do histórico.
    expect(fatiasDaPagina([70, 200], 2, 50)).toEqual([
      { parte: 0, skip: 50, take: 20 },
      { parte: 1, skip: 0, take: 30 },
    ]);
  });

  it("depois da divisa, só o histórico, com o skip descontado das em aberto", () => {
    expect(fatiasDaPagina([70, 200], 3, 50)).toEqual([{ parte: 1, skip: 30, take: 50 }]);
  });

  it("parte vazia não entra, e página além do fim não busca nada", () => {
    expect(fatiasDaPagina([0, 30], 1, 50)).toEqual([{ parte: 1, skip: 0, take: 30 }]);
    expect(fatiasDaPagina([70, 200], 7, 50)).toEqual([]);
    expect(fatiasDaPagina([], 1, 50)).toEqual([]);
  });

  it("as páginas, juntas, cobrem a lista uma vez, sem repetir nem pular", () => {
    const contagens = [37, 0, 101];
    const vistos: string[] = [];
    for (let p = 1; p <= totalDePaginas(138, 25); p++) {
      for (const f of fatiasDaPagina(contagens, p, 25)) {
        for (let i = 0; i < f.take; i++) vistos.push(`${f.parte}:${f.skip + i}`);
      }
    }
    expect(vistos).toHaveLength(138);
    expect(new Set(vistos).size).toBe(138);
  });
});

describe("os funis lidos da URL", () => {
  it("um valor ou vários, sem repetição", () => {
    expect(funisDaUrl({ contraparte: "f1", categoria: ["c1", "c1", "c2"], empresa: "x", pagina: "2" })).toEqual({
      contraparte: ["f1"],
      categoria: ["c1", "c2"],
    });
  });

  it("o vazio (sem categoria) é um valor, como em Empresas", () => {
    expect(funisDaUrl({ categoria: "" })).toEqual({ categoria: [""] });
  });

  it("data e situação só no formato delas; valor inválido não vira 'sem filtro'", () => {
    expect(funisDaUrl({ vencimento: ["2026-11-10", "10/11/2026"], situacao: ["vencida", "qualquer"] })).toEqual({
      vencimento: ["2026-11-10"],
      situacao: ["vencida"],
    });
    // Nada válido: o funil fica, vazio — e o `where` dele não casa nada.
    const funis = funisDaUrl({ situacao: "qualquer" });
    expect(funis).toEqual({ situacao: [] });
    expect(temFunil(funis)).toBe(true);
    expect(whereDosFunis(funis, HOJE)).toEqual([{ id: { in: [] } }]);
  });

  it("um teto por funil: a URL montada à mão não vira uma consulta sem fim", () => {
    const muitos = Array.from({ length: 900 }, (_, i) => `c${i}`);
    expect(funisDaUrl({ categoria: muitos }).categoria).toHaveLength(500);
  });

  it("ida e volta pela URL", () => {
    const q = new URLSearchParams();
    funisNaConsulta({ categoria: ["", "c2"], situacao: ["paga"] }, q);
    expect(q.toString()).toBe("categoria=&categoria=c2&situacao=paga");
    expect(funisDaConsulta(q)).toEqual({ categoria: ["", "c2"], situacao: ["paga"] });
    expect(temFunil(funisDaConsulta(new URLSearchParams("empresa=todas&pagina=3")))).toBe(false);
  });
});

describe("o where de cada funil", () => {
  it("vencimento: o dia inteiro em São Paulo, de cada data escolhida", () => {
    expect(whereDoFunil("vencimento", ["2026-11-10", "2026-11-30"], HOJE)).toEqual({
      OR: [
        { dueDate: { gte: dia("2026-11-10"), lt: dia("2026-11-11") } },
        { dueDate: { gte: dia("2026-11-30"), lt: dia("2026-12-01") } },
      ],
    });
  });

  it("contraparte: pelos ids; o vazio não casa nada (toda conta tem uma)", () => {
    expect(whereDoFunil("contraparte", ["f1", "f2"], HOJE)).toEqual({ counterpartyId: { in: ["f1", "f2"] } });
    expect(whereDoFunil("contraparte", [""], HOJE)).toEqual({ id: { in: [] } });
  });

  it("categoria, centro e projeto: os ids e, com o vazio, o que não tem", () => {
    expect(whereDoFunil("categoria", ["c1"], HOJE)).toEqual({ categoryId: { in: ["c1"] } });
    expect(whereDoFunil("centro", [""], HOJE)).toEqual({ costCenterId: null });
    expect(whereDoFunil("projeto", ["p1", ""], HOJE)).toEqual({ OR: [{ projectId: { in: ["p1"] } }, { projectId: null }] });
  });

  it("situação: as regras de `situacaoDaConta`, com renegociada e perda pelo motivo", () => {
    const abertas = { paidAt: null, status: { notIn: ["CANCELADO", "PAGO"] } };
    expect(whereDaSituacao("vencida", HOJE)).toEqual({ ...abertas, dueDate: { lt: dia(HOJE) } });
    expect(whereDaSituacao("hoje", HOJE)).toEqual({ ...abertas, dueDate: { gte: dia(HOJE), lt: dia("2026-11-14") } });
    expect(whereDaSituacao("avencer", HOJE)).toEqual({ ...abertas, dueDate: { gte: dia("2026-11-14") } });
    expect(whereDaSituacao("paga", HOJE)).toEqual({ status: { not: "CANCELADO" }, OR: [{ status: "PAGO" }, { paidAt: { not: null } }] });
    expect(whereDaSituacao("cancelada", HOJE)).toEqual({ status: "CANCELADO", OR: [{ closeReason: null }, { closeReason: "CANCELADO" }] });
    expect(whereDaSituacao("renegociada", HOJE)).toEqual({ closeReason: "RENEGOCIADO" });
    expect(whereDaSituacao("perda", HOJE)).toEqual({ closeReason: "PERDA" });
  });

  it("cada funil num item do AND, e a cascata deixa o da própria coluna de fora", () => {
    const funis = { contraparte: ["f1"], categoria: ["c1"] };
    expect(whereDosFunis(funis, HOJE)).toEqual([{ counterpartyId: { in: ["f1"] } }, { categoryId: { in: ["c1"] } }]);
    expect(whereDosFunis(funis, HOJE, "categoria")).toEqual([{ counterpartyId: { in: ["f1"] } }]);
    expect(whereDosFunis({}, HOJE)).toEqual([]);
  });
});

describe("diaDaChave", () => {
  it("mostra a data como o resto do app", () => {
    expect(diaDaChave("2026-11-03")).toBe("03/11/2026");
    expect(diaDaChave("lixo")).toBe("lixo");
  });
});
