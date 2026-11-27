import { describe, expect, it } from "vitest";
import { eventoS1210, geradorDeId } from "./esocial/eventos";
import { adesaoNoMes, descontoDoPlano, faixaDaIdade, idadeEm, lerPeriodoDaAdesao, lerPlano, planosParaS1210, valorDoBeneficiario } from "./planoDeSaude";

const base = { nome: "Unimed Curitiba Empresarial", tipo: "SAUDE", cnpjOperadora: "75.055.772/0001-20", registroAns: "304701", valorTitular: "150,00", valorDependente: "80,00" };

describe("plano de saúde", () => {
  it("lê o plano: CNPJ da operadora, ANS de 6 algarismos e a parte do empregado", () => {
    expect(lerPlano(base)).toEqual({ ok: true, plano: { nome: "Unimed Curitiba Empresarial", tipo: "SAUDE", cnpjOperadora: "75055772000120", registroAns: "304701", valorTitular: 150, valorDependente: 80, faixas: null } });
    expect(lerPlano({ ...base, cnpjOperadora: "11.111.111/1111-11" })).toMatchObject({ ok: false, erro: expect.stringMatching(/CNPJ/) });
    expect(lerPlano({ ...base, registroAns: "123" })).toMatchObject({ ok: false, erro: expect.stringMatching(/ANS/) });
    expect(lerPlano({ ...base, valorTitular: "", valorDependente: "" })).toMatchObject({ ok: false });
    expect(lerPlano({ ...base, tipo: "X" })).toMatchObject({ ok: false });
  });

  it("o período da adesão e o mês", () => {
    expect(lerPeriodoDaAdesao({ inicio: "2027-03-10", fim: "" })).toEqual({ ok: true, inicio: "2027-03-10", fim: null });
    expect(lerPeriodoDaAdesao({ inicio: "2027-03-10", fim: "2027-02-01" })).toMatchObject({ ok: false });
    const a = { inicio: "2027-03-10", fim: "2027-05-05" };
    expect([adesaoNoMes(a, 2027, 2), adesaoNoMes(a, 2027, 3), adesaoNoMes(a, 2027, 5), adesaoNoMes(a, 2027, 6)]).toEqual([false, true, true, false]);
  });

  it("faixa etária: as 10 faixas da ANS ou nenhuma; a idade no 1º dia do mês escolhe a faixa", () => {
    const faixas = ["100", "120", "140", "160", "180", "200", "250", "300", "400", "600"];
    expect(lerPlano({ ...base, valorTitular: "", valorDependente: "", faixas })).toMatchObject({ ok: true, plano: { faixas: [100, 120, 140, 160, 180, 200, 250, 300, 400, 600] } });
    expect(lerPlano({ ...base, faixas: ["100", "", "", "", "", "", "", "", "", ""] })).toMatchObject({ ok: false, erro: expect.stringMatching(/10 faixas/) });
    expect([idadeEm("1990-06-15", "2027-06-01"), idadeEm("1990-06-01", "2027-06-01")]).toEqual([36, 37]);
    expect([faixaDaIdade(0), faixaDaIdade(18), faixaDaIdade(19), faixaDaIdade(58), faixaDaIdade(59), faixaDaIdade(90)]).toEqual([0, 0, 1, 8, 9, 9]);
    const plano = { valorTitular: 150, valorDependente: 80, faixas: [100, 120, 140, 160, 180, 200, 250, 300, 400, 600] };
    expect(valorDoBeneficiario(plano, true, "1990-06-15", 2027, 6)).toEqual({ valor: 180, faixa: "34 a 38" });
    expect(valorDoBeneficiario(plano, false, "2015-01-10", 2027, 6)).toEqual({ valor: 100, faixa: "0 a 18" });
    expect(valorDoBeneficiario(plano, false, null, 2027, 6)).toEqual({ valor: 80, faixa: "sem data de nascimento" });
    expect(valorDoBeneficiario({ ...plano, faixas: null }, true, "1990-06-15", 2027, 6)).toEqual({ valor: 150, faixa: null });
  });

  it("o desconto é o titular + cada dependente", () => {
    const v = (valor: number, faixa: string | null = null) => ({ valor, faixa });
    expect(descontoDoPlano({ tipo: "SAUDE", nome: "Unimed", titular: v(150), dependentes: [v(80), v(80)] })).toMatchObject({ valor: 310, memoria: expect.stringMatching(/2 dependente\(s\): 80,00 \+ 80,00/) });
    expect(descontoDoPlano({ tipo: "SAUDE", nome: "Unimed", titular: v(200, "34 a 38"), dependentes: [v(100, "0 a 18")] }).memoria).toMatch(/titular 200,00 \(34 a 38\).*100,00 \(0 a 18\)/);
    expect(descontoDoPlano({ tipo: "ODONTO", nome: "Odonto", titular: v(30), dependentes: [] }).valor).toBe(30);
  });

  it("S-1210: a coparticipação vai para o titular do plano de saúde; dependente sem CPF fica de fora", () => {
    const saude = { tipo: "SAUDE" as const, cnpjOperadora: "75055772000120", registroAns: "304701" };
    const odonto = { tipo: "ODONTO" as const, cnpjOperadora: "75055772000120", registroAns: "" };
    const r = planosParaS1210(
      [
        { plano: odonto, titular: 30, dependentes: [] },
        { plano: saude, titular: 150, dependentes: [{ cpf: "529.982.247-25", nome: "Ana", valor: 80 }, { cpf: null, nome: "Beto", valor: 80 }] },
      ],
      45.5
    );
    expect(r.planos[0]).toEqual({ cnpjOperadora: "75055772000120", registroAns: null, titular: 30, dependentes: [] });
    expect(r.planos[1]).toEqual({ cnpjOperadora: "75055772000120", registroAns: "304701", titular: 195.5, dependentes: [{ cpf: "52998224725", nome: "Ana", valor: 80 }] });
    expect(r.semCpf).toEqual(["Beto"]);
    expect(planosParaS1210([{ plano: odonto, titular: 30, dependentes: [] }], 10).planos[0].titular).toBe(40);
  });
});

describe("S-1210 com plano de saúde e previdência complementar", () => {
  const empregador = { cnpj: "48.291.730/0001-15", nome: "Panificadora", classTrib: "01", cnae: "1091102", ratAliquota: 2, fap: 1, fpas: "507", codTercs: "0079", iniValid: "2026-11" };
  const t = { personId: "p1", nome: "Joana Ribeiro", cpf: "529.982.247-25", matricula: "000123", categoria: "101", itens: [], liquido: 2500 };
  const id = () => geradorDeId(empregador.cnpj, new Date("2026-12-20T14:05:09Z"));

  it("leva o infoIRComplem com previdCompl e planSaude, depois do infoPgto", () => {
    const xml = eventoS1210(empregador, "2026-11", "2026-12-05", {
      ...t,
      irComplementar: {
        previdencia: { cnpj: "33.000.167/0001-01", valor: 400 },
        planos: [{ cnpjOperadora: "75055772000120", registroAns: "304701", titular: 195.5, dependentes: [{ cpf: "52998224725", nome: "Ana", valor: 80 }] }],
        semCpf: [],
      },
    }, id()).xml;
    expect(xml).toContain("<infoIRComplem><infoIRCR><tpCR>056107</tpCR><previdCompl><tpPrev>1</tpPrev><cnpjEntidPC>33000167000101</cnpjEntidPC><vlrDedPC>400.00</vlrDedPC></previdCompl></infoIRCR>");
    expect(xml).toContain("<planSaude><cnpjOper>75055772000120</cnpjOper><regANS>304701</regANS><vlrSaudeTit>195.50</vlrSaudeTit><infoDepSau><cpfDep>52998224725</cpfDep><vlrSaudeDep>80.00</vlrSaudeDep></infoDepSau></planSaude></infoIRComplem>");
    expect(xml.indexOf("</infoPgto>")).toBeLessThan(xml.indexOf("<infoIRComplem>"));
  });

  it("sem CNPJ da previdência e com dependente sem CPF, avisa sem bloquear; sem nada, não leva o grupo", () => {
    const ev = eventoS1210(empregador, "2026-11", "2026-12-05", { ...t, irComplementar: { previdencia: { cnpj: null, valor: 400 }, planos: [], semCpf: ["Beto"] } }, id());
    expect(ev.xml).not.toContain("infoIRComplem");
    const avisos = ev.pendencias.filter((p) => !p.bloqueia).map((p) => p.texto).join(" ");
    expect(avisos).toContain("CNPJ da entidade de previdência");
    expect(avisos).toContain("dependente Beto");
    expect(eventoS1210(empregador, "2026-11", "2026-12-05", t, id()).xml).not.toContain("infoIRComplem");
  });
});
