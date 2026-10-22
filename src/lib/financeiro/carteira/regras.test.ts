import { describe, expect, it } from "vitest";
import {
  analistaDoFiltro,
  diasSemExtrato,
  filtrarLinhas,
  opcoesDeOrdem,
  ordemDaUrl,
  ordemNaUrl,
  ordenarLinhas,
  textoDosDiasSemExtrato,
  tomDosDiasSemExtrato,
  totaisDaCarteira,
  urgencia,
  type LinhaDaCarteira,
} from "./regras";

// O que se testa (22/10/2026): as regras do painel da carteira do BPO — dias
// sem extrato, a urgência da abertura, a ordem por coluna, o filtro do
// analista ("minhas" para quem não é administrador) e os totais do topo.

const HOJE = "2026-10-22";

function linha(parcial: Partial<LinhaDaCarteira> & { companyId: string }): LinhaDaCarteira {
  return {
    nome: parcial.companyId.toUpperCase(),
    cnpj: null,
    analistaId: null,
    analistaNome: null,
    vencidosPagar: { n: 0, centavos: 0 },
    vencidosReceber: { n: 0, centavos: 0 },
    contasComExtrato: 1,
    ultimoExtratoKey: HOJE,
    linhasAConciliar: 0,
    contasComSaldoDivergente: 0,
    pendenciasAbertas: 0,
    aprovacoesAguardando: 0,
    ultimoAcessoPortal: null,
    acessosAoPortal: 0,
    ...parcial,
  };
}

describe("dias sem extrato", () => {
  it("sem conta não se aplica; com conta e nada importado é nunca", () => {
    expect(diasSemExtrato({ contasComExtrato: 0, ultimoExtratoKey: null }, HOJE)).toBeNull();
    expect(diasSemExtrato({ contasComExtrato: 2, ultimoExtratoKey: null }, HOJE)).toBe(Number.POSITIVE_INFINITY);
    expect(diasSemExtrato({ contasComExtrato: 1, ultimoExtratoKey: "2026-10-12" }, HOJE)).toBe(10);
    expect(diasSemExtrato({ contasComExtrato: 1, ultimoExtratoKey: HOJE }, HOJE)).toBe(0);
  });

  it("o texto e o tom", () => {
    expect(textoDosDiasSemExtrato(null)).toBe("sem conta");
    expect(textoDosDiasSemExtrato(Number.POSITIVE_INFINITY)).toBe("nunca");
    expect(textoDosDiasSemExtrato(0)).toBe("hoje");
    expect(textoDosDiasSemExtrato(1)).toBe("1 dia");
    expect(textoDosDiasSemExtrato(9)).toBe("9 dias");
    expect(tomDosDiasSemExtrato(3)).toBe("ok");
    expect(tomDosDiasSemExtrato(8)).toBe("atencao");
    expect(tomDosDiasSemExtrato(Number.POSITIVE_INFINITY)).toBe("critico");
    expect(tomDosDiasSemExtrato(null)).toBe("neutro");
  });
});

describe("ordem", () => {
  const a = linha({ companyId: "a", nome: "Ágil", vencidosPagar: { n: 2, centavos: 500 }, linhasAConciliar: 1 });
  const b = linha({ companyId: "b", nome: "Beta", vencidosReceber: { n: 1, centavos: 9_000 }, linhasAConciliar: 10 });
  const c = linha({ companyId: "c", nome: "Casa", contasComExtrato: 0, ultimoExtratoKey: null });
  const d = linha({ companyId: "d", nome: "Delta", ultimoExtratoKey: null, contasComSaldoDivergente: 1 });

  it("a urgência soma vencidos e linhas a conciliar; saldo que não bate pesa dez", () => {
    expect(urgencia(a)).toBe(3);
    expect(urgencia(b)).toBe(11);
    expect(urgencia(d)).toBe(10);
  });

  it("abre pelos mais urgentes, com o nome desempatando", () => {
    const o = ordemDaUrl(undefined);
    expect(o).toEqual({ coluna: "urgencia", sentido: "desc" });
    expect(ordenarLinhas([c, a, d, b], o.coluna, o.sentido, HOJE).map((l) => l.companyId)).toEqual(["b", "d", "a", "c"]);
  });

  it("nome em ordem alfabética, sem acento atrapalhar, e invertido no segundo clique", () => {
    expect(ordenarLinhas([b, c, a], "empresa", "asc", HOJE).map((l) => l.companyId)).toEqual(["a", "b", "c"]);
    expect(ordenarLinhas([b, c, a], "empresa", "desc", HOJE).map((l) => l.companyId)).toEqual(["c", "b", "a"]);
  });

  it("dias sem extrato: nunca é o pior, e sem conta fica no fim nos dois sentidos", () => {
    const velho = linha({ companyId: "v", ultimoExtratoKey: "2026-09-01" });
    expect(ordenarLinhas([c, a, velho, d], "extrato", "desc", HOJE).map((l) => l.companyId)).toEqual(["d", "v", "a", "c"]);
    expect(ordenarLinhas([c, a, velho, d], "extrato", "asc", HOJE).map((l) => l.companyId)).toEqual(["a", "v", "d", "c"]);
  });

  it("portal: quem nunca entrou vem antes do acesso mais antigo; sem acesso, no fim", () => {
    const nunca = linha({ companyId: "n", acessosAoPortal: 1 });
    const antigo = linha({ companyId: "o", acessosAoPortal: 1, ultimoAcessoPortal: new Date("2026-01-01T12:00:00Z") });
    const recente = linha({ companyId: "r", acessosAoPortal: 2, ultimoAcessoPortal: new Date("2026-10-20T12:00:00Z") });
    const sem = linha({ companyId: "s" });
    expect(ordenarLinhas([sem, recente, nunca, antigo], "portal", "asc", HOJE).map((l) => l.companyId)).toEqual(["n", "o", "r", "s"]);
  });

  it("vencido pelo valor", () => {
    expect(ordenarLinhas([a, b], "receber", "desc", HOJE).map((l) => l.companyId)).toEqual(["b", "a"]);
    expect(ordenarLinhas([b, a], "pagar", "desc", HOJE).map((l) => l.companyId)).toEqual(["a", "b"]);
  });

  it("a ordem na URL vai e volta, com o sentido padrão omitido", () => {
    expect(ordemNaUrl({ coluna: "urgencia", sentido: "desc" })).toBe("");
    expect(ordemNaUrl({ coluna: "pagar", sentido: "desc" })).toBe("pagar");
    expect(ordemNaUrl({ coluna: "pagar", sentido: "asc" })).toBe("pagar.asc");
    expect(ordemDaUrl("pagar.asc")).toEqual({ coluna: "pagar", sentido: "asc" });
    expect(ordemDaUrl("empresa")).toEqual({ coluna: "empresa", sentido: "asc" });
    expect(ordemDaUrl("lixo.desc")).toEqual({ coluna: "urgencia", sentido: "desc" });
    for (const o of opcoesDeOrdem()) expect(ordemNaUrl(ordemDaUrl(o.value))).toBe(o.value);
    expect(new Set(opcoesDeOrdem().map((o) => o.value)).size).toBe(opcoesDeOrdem().length);
  });
});

describe("filtro do analista", () => {
  const responsaveis = new Set(["u1", "u2"]);

  it("quem não é administrador e é analista abre nas suas", () => {
    const r = analistaDoFiltro(undefined, { userId: "u1", administrador: false }, responsaveis);
    expect(r.filtro).toEqual({ tipo: "pessoa", id: "u1" });
    expect(r.padrao).toEqual({ tipo: "pessoa", id: "u1" });
    expect(analistaDoFiltro("todos", { userId: "u1", administrador: false }, responsaveis).filtro).toEqual({ tipo: "todos" });
  });

  it("administrador, ou quem não responde por empresa, abre em todas", () => {
    expect(analistaDoFiltro(undefined, { userId: "u1", administrador: true }, responsaveis).filtro).toEqual({ tipo: "todos" });
    expect(analistaDoFiltro(undefined, { userId: "u9", administrador: false }, responsaveis).filtro).toEqual({ tipo: "todos" });
  });

  it("eu, sem analista, uma pessoa da carteira; id estranho cai no padrão", () => {
    const quem = { userId: "u9", administrador: true };
    expect(analistaDoFiltro("eu", quem, responsaveis).filtro).toEqual({ tipo: "pessoa", id: "u9" });
    expect(analistaDoFiltro("sem", quem, responsaveis).filtro).toEqual({ tipo: "sem" });
    expect(analistaDoFiltro("u2", quem, responsaveis).filtro).toEqual({ tipo: "pessoa", id: "u2" });
    expect(analistaDoFiltro("outro", quem, responsaveis).filtro).toEqual({ tipo: "todos" });
  });

  it("filtra pelo analista e busca pelo nome, sem acento, ou pelo CNPJ", () => {
    const linhas = [
      linha({ companyId: "a", nome: "Padaria São João", analistaId: "u1", cnpj: "12.345.678/0001-90" }),
      linha({ companyId: "b", nome: "Oficina", analistaId: "u2" }),
      linha({ companyId: "c", nome: "Mercado" }),
    ];
    const ids = (ls: LinhaDaCarteira[]) => ls.map((l) => l.companyId);
    expect(ids(filtrarLinhas(linhas, { analista: { tipo: "pessoa", id: "u1" } }))).toEqual(["a"]);
    expect(ids(filtrarLinhas(linhas, { analista: { tipo: "sem" } }))).toEqual(["c"]);
    expect(ids(filtrarLinhas(linhas, { analista: { tipo: "todos" }, busca: "sao joao" }))).toEqual(["a"]);
    expect(ids(filtrarLinhas(linhas, { analista: { tipo: "todos" }, busca: "12345678" }))).toEqual(["a"]);
    expect(ids(filtrarLinhas(linhas, { analista: { tipo: "todos" }, busca: "1" }))).toEqual([]);
  });
});

describe("totais", () => {
  it("somam a carteira da tela e contam quem está sem extrato há mais de sete dias", () => {
    const t = totaisDaCarteira(
      [
        linha({ companyId: "a", vencidosPagar: { n: 2, centavos: 300 }, linhasAConciliar: 4, pendenciasAbertas: 1 }),
        linha({ companyId: "b", vencidosReceber: { n: 1, centavos: 700 }, contasComSaldoDivergente: 2, ultimoExtratoKey: "2026-10-01" }),
        linha({ companyId: "c", contasComExtrato: 0, ultimoExtratoKey: null, aprovacoesAguardando: 3 }),
        linha({ companyId: "d", ultimoExtratoKey: null }),
      ],
      HOJE
    );
    expect(t).toEqual({
      empresas: 4,
      vencidosPagar: { n: 2, centavos: 300 },
      vencidosReceber: { n: 1, centavos: 700 },
      linhasAConciliar: 4,
      contasComSaldoDivergente: 2,
      empresasSemExtratoRecente: 2,
      pendenciasAbertas: 1,
      aprovacoesAguardando: 3,
    });
  });
});
