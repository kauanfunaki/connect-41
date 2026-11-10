import { describe, expect, it } from "vitest";
import {
  agruparPrazos,
  estaAtrasado,
  listaDePrazos,
  prazoDaGuia,
  prazoDaObrigacao,
  type ObrigacaoParaAgenda,
  type PrazoBruto,
  type PrazoDaAgenda,
} from "./prazosDaAgendaRegras";

// As fontes novas da Agenda (10/11/2026): a data legal das obrigações, com o
// risco de multa, e o vencimento das guias; e como os prazos se juntam.

const HOJE = "2026-11-10"; // terça-feira
const SEM_FERIADO = new Set<string>();

function obrigacao(extra: Partial<ObrigacaoParaAgenda> = {}): ObrigacaoParaAgenda {
  return {
    id: "o1",
    dataLegal: "2026-11-12",
    prazoInterno: "2026-11-09",
    modelo: "DCTFWeb",
    setor: "fiscal",
    empresa: "Padaria Exemplo Ltda",
    pipelineId: "p1",
    itemId: "i1",
    ...extra,
  };
}

describe("a obrigação na Agenda", () => {
  it("vai no dia da data legal, abre a atividade e diz o prazo interno", () => {
    const p = prazoDaObrigacao(obrigacao(), HOJE, SEM_FERIADO);
    expect(p).toMatchObject({
      chave: "obrigacao-o1",
      dia: "2026-11-12",
      tipo: "obrigacao",
      titulo: "DCTFWeb",
      setor: "fiscal",
      href: "/kanban/p1/itens/i1",
      grupo: "DCTFWeb",
    });
    expect(p.detalhe).toBe("Padaria Exemplo Ltda · prazo interno 09/11");
  });

  it("risco de multa pela régua do aviso: a dois dias úteis da data legal, no dia e logo depois", () => {
    expect(prazoDaObrigacao(obrigacao({ dataLegal: "2026-11-12" }), HOJE, SEM_FERIADO).riscoDeMulta).toBe(true);
    expect(prazoDaObrigacao(obrigacao({ dataLegal: HOJE }), HOJE, SEM_FERIADO).riscoDeMulta).toBe(true);
    expect(prazoDaObrigacao(obrigacao({ dataLegal: "2026-11-06" }), HOJE, SEM_FERIADO).riscoDeMulta).toBe(true);
    // Longe da data legal: sem risco ainda.
    expect(prazoDaObrigacao(obrigacao({ dataLegal: "2026-11-24" }), HOJE, SEM_FERIADO).riscoDeMulta).toBe(false);
  });

  it("o feriado do escritório conta: dois dias úteis pulam o feriado", () => {
    // 11/11 feriado: até 13/11 são dois dias úteis (12 e 13).
    expect(prazoDaObrigacao(obrigacao({ dataLegal: "2026-11-13" }), HOJE, new Set(["2026-11-11"])).riscoDeMulta).toBe(true);
    expect(prazoDaObrigacao(obrigacao({ dataLegal: "2026-11-13" }), HOJE, SEM_FERIADO).riscoDeMulta).toBe(false);
  });

  it("data legal que passou é atrasada", () => {
    expect(prazoDaObrigacao(obrigacao({ dataLegal: "2026-10-01" }), HOJE, SEM_FERIADO)).toMatchObject({ atrasada: true, riscoDeMulta: false });
    expect(prazoDaObrigacao(obrigacao({ dataLegal: "2026-11-12" }), HOJE, SEM_FERIADO).atrasada).toBe(false);
  });
});

describe("a guia na Agenda", () => {
  const guia = {
    id: "g1",
    descricao: "DAS do Simples Nacional · 09/2026",
    vencimento: "2026-11-20",
    validoAte: "2026-11-30",
    centavos: 128450,
    empresa: "Estúdio Exemplo Ltda",
    setor: "fiscal",
  };

  it("vai no vencimento, com a empresa e o valor, e abre Guias do mês", () => {
    const p = prazoDaGuia(guia, HOJE)!;
    expect(p).toMatchObject({ dia: "2026-11-20", tipo: "guia", titulo: guia.descricao, href: "/autorizacoes/guias?mes=2026-11", grupo: "DAS do Simples Nacional" });
    expect(p.detalhe).toContain("Estúdio Exemplo Ltda");
    expect(p.detalhe).toContain("1.284,50");
    expect(p.atrasada).toBe(false);
  });

  it("sem vencimento (DCTFWeb, parcela), vai no válido até; sem data nenhuma, não entra", () => {
    expect(prazoDaGuia({ ...guia, vencimento: null }, HOJE)?.dia).toBe("2026-11-30");
    expect(prazoDaGuia({ ...guia, vencimento: null, validoAte: null }, HOJE)).toBeNull();
  });

  it("atrasada pela regra de Vencida: passou o último dia que o banco aceita", () => {
    expect(prazoDaGuia({ ...guia, vencimento: "2026-11-05", validoAte: "2026-11-12" }, HOJE)?.atrasada).toBe(false);
    expect(prazoDaGuia({ ...guia, vencimento: "2026-11-05", validoAte: "2026-11-09" }, HOJE)?.atrasada).toBe(true);
    expect(prazoDaGuia({ ...guia, vencimento: "2026-11-05", validoAte: null }, HOJE)?.atrasada).toBe(true);
  });
});

describe("juntar os prazos do dia", () => {
  const ob = (id: string, empresa: string, extra: Partial<ObrigacaoParaAgenda> = {}) =>
    prazoDaObrigacao(obrigacao({ id, empresa, ...extra }), HOJE, SEM_FERIADO);

  it("seis obrigações do mesmo modelo no dia viram “DCTFWeb · 6 empresas”, com os itens para o “Ver as 6”", () => {
    const brutos = ["A", "B", "C", "D", "E", "F"].map((e, i) => ob(`o${i}`, `Empresa ${e}`));
    const [junto, ...resto] = agruparPrazos(brutos);
    expect(resto).toEqual([]);
    expect(junto).toMatchObject({ titulo: "DCTFWeb", detalhe: "6 empresas", quantos: 6, fonte: "obrigacoes", href: "/kanban", riscoDeMulta: true });
    expect(junto.itens).toHaveLength(6);
    expect(junto.itens![0]).toMatchObject({ quantos: 1, fonte: "obrigacoes", href: "/kanban/p1/itens/i1" });
  });

  it("modelos diferentes no mesmo dia não se juntam; até dois do mesmo, também não", () => {
    const brutos = [ob("o1", "A"), ob("o2", "B"), ob("o3", "C", { modelo: "EFD-Contribuições" })];
    const saida = agruparPrazos(brutos);
    expect(saida).toHaveLength(3);
    expect(saida.every((p) => p.quantos === 1 && !p.itens)).toBe(true);
  });

  it("atrasada só quando todos estão; risco de multa quando algum tem", () => {
    const tarefa = (id: string, atrasada: boolean): PrazoBruto => ({
      chave: id,
      dia: "2026-11-09",
      tipo: "tarefa",
      titulo: `Tarefa ${id}`,
      setor: "contabil",
      href: `/kanban/x/itens/${id}`,
      atrasada,
    });
    expect(agruparPrazos([tarefa("a", true), tarefa("b", true), tarefa("c", true)])[0]).toMatchObject({ titulo: "3 atividades", atrasada: true });
    expect(agruparPrazos([tarefa("a", true), tarefa("b", false), tarefa("c", true)])[0].atrasada).toBeUndefined();
  });

  it("contas juntam sempre, com o valor somado e sem os itens (o caminho é a tela das contas)", () => {
    const conta = (id: string, centavos: number): PrazoBruto => ({ chave: id, dia: HOJE, tipo: "conta-pagar", titulo: "Conta a pagar", setor: "bpo", href: "/pagar", centavos });
    const [junto] = agruparPrazos([conta("c1", 10000)]);
    expect(junto).toMatchObject({ titulo: "1 conta a pagar", quantos: 1, fonte: "contas" });
    expect(junto.itens).toBeUndefined();
  });

  it("atraso só nos tipos em que a data passada é atraso", () => {
    expect(estaAtrasado("tarefa", "2026-11-09", HOJE)).toBe(true);
    expect(estaAtrasado("tarefa", HOJE, HOJE)).toBe(false);
    expect(estaAtrasado("ferias", "2026-11-09", HOJE)).toBe(false);
  });
});

describe("a lista de Prazos", () => {
  const p = (dia: string, atrasada = false): PrazoDaAgenda => ({
    chave: `${dia}-${atrasada}`,
    dia,
    tipo: "tarefa",
    fonte: "tarefas",
    titulo: "x",
    setor: "s",
    href: "/",
    quantos: 1,
    ...(atrasada ? { atrasada: true } : {}),
  });

  it("os atrasados de antes do período no alto; o período dia a dia; o que não atrasa e ficou para trás sai", () => {
    const { atrasados, dias } = listaDePrazos([p("2026-11-12"), p("2026-11-05", true), p("2026-11-01", true), p("2026-11-08"), p("2026-11-10"), p("2026-11-12")], HOJE, "2026-12-10");
    expect(atrasados.map((x) => x.dia)).toEqual(["2026-11-01", "2026-11-05"]);
    expect(dias.map((d) => [d.dia, d.prazos.length])).toEqual([
      ["2026-11-10", 1],
      ["2026-11-12", 2],
    ]);
  });

  it("fora do período não entra", () => {
    expect(listaDePrazos([p("2026-12-11")], HOJE, "2026-12-10").dias).toEqual([]);
  });
});
