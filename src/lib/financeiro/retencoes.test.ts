import { describe, expect, it } from "vitest";
import {
  categoriaDoImposto,
  credorDoImposto,
  descricaoDaContaDoImposto,
  lerRetencoes,
  liquidoDaConta,
  planoDasRetencoes,
  retencoesDaNota,
  resumoDasRetencoes,
  vencimentoDoImposto,
  type RetencaoAtual,
} from "./retencoes";

const campos = (v: Record<string, string>) => (nome: string) => v[nome] ?? "";

describe("lerRetencoes", () => {
  it("vazio é zero; só o que tem valor volta", () => {
    expect(lerRetencoes(campos({ "retencao:IRRF": "15,00", "retencao:PIS": "", "retencao:ISS": "0" }))).toEqual({
      ok: true,
      retencoes: [{ tributo: "IRRF", centavos: 1_500 }],
    });
  });

  it("ilegível ou negativo é erro, com o tributo", () => {
    expect(lerRetencoes(campos({ "retencao:COFINS": "abc" }))).toEqual({ ok: false, erro: "Valor do COFINS retido ilegível. Use, por exemplo, 15,00." });
    expect(lerRetencoes(campos({ "retencao:CSLL": "-1,00" })).ok).toBe(false);
  });
});

describe("liquidoDaConta", () => {
  it("bruto menos as retenções; não chega a zero", () => {
    expect(liquidoDaConta(100_000, [{ tributo: "IRRF", centavos: 1_500 }, { tributo: "PIS", centavos: 650 }])).toEqual({ ok: true, liquidoCentavos: 97_850 });
    const tudo = liquidoDaConta(1_000, [{ tributo: "INSS", centavos: 1_000 }]);
    expect(tudo.ok).toBe(false);
    if (!tudo.ok) expect(tudo.erro).toMatch(/não podem chegar ao valor bruto/);
  });
});

describe("vencimentoDoImposto", () => {
  it("dia 20 do mês seguinte; ISS no dia 10; virada do ano", () => {
    expect(vencimentoDoImposto("IRRF", "2026-10")).toBe("2026-11-20"); // sexta
    expect(vencimentoDoImposto("ISS", "2026-10")).toBe("2026-11-10"); // terça
    expect(vencimentoDoImposto("PIS", "2026-12")).toBe("2027-01-20"); // quarta
  });

  it("fim de semana antecipa para a sexta", () => {
    expect(vencimentoDoImposto("INSS", "2026-08")).toBe("2026-09-18"); // 20/09/2026 é domingo
    expect(vencimentoDoImposto("CSLL", "2027-01")).toBe("2027-02-19"); // 20/02/2027 é sábado
    expect(vencimentoDoImposto("ISS", "2026-09")).toBe("2026-10-09"); // 10/10/2026 é sábado
  });
});

describe("categoria e credor do imposto", () => {
  it("federais na categoria de retidos; INSS, ISS e a falta dela, na da conta", () => {
    const p = { categoriaDaConta: "servicos", categoriaDosRetidos: "retidos" };
    expect(categoriaDoImposto("IRRF", p)).toBe("retidos");
    expect(categoriaDoImposto("CSLL", p)).toBe("retidos");
    expect(categoriaDoImposto("INSS", p)).toBe("servicos");
    expect(categoriaDoImposto("ISS", p)).toBe("servicos");
    expect(categoriaDoImposto("PIS", { categoriaDaConta: "servicos", categoriaDosRetidos: null })).toBe("servicos");
  });

  it("Receita nos federais e no INSS; prefeitura no ISS", () => {
    expect(credorDoImposto("INSS").documento).toBe("00394460005887");
    expect(credorDoImposto("ISS").nome).toBe("Prefeitura — ISS retido");
  });

  it("a descrição e o resumo", () => {
    expect(descricaoDaContaDoImposto("IRRF", { documento: "123/1", fornecedor: "Fornecedor X" })).toBe("IRRF retido — nº 123/1 · Fornecedor X");
    expect(descricaoDaContaDoImposto("COFINS", { documento: null, fornecedor: "Y" })).toBe("COFINS retida — Y");
    expect(resumoDasRetencoes([{ tributo: "IRRF", centavos: 1_500 }, { tributo: "PIS", centavos: 650 }])).toMatch(/^IRRF R\$\s?15,00 · PIS R\$\s?6,50$/);
    expect(resumoDasRetencoes([])).toBeNull();
  });
});

describe("planoDasRetencoes", () => {
  const aberta = (id: string) => ({ id, temBaixa: false, cancelada: false });
  const atuais: RetencaoAtual[] = [
    { tributo: "IRRF", centavos: 1_500, conta: aberta("c-ir") },
    { tributo: "PIS", centavos: 650, conta: aberta("c-pis") },
    { tributo: "ISS", centavos: 5_000, conta: { id: "c-iss", temBaixa: true, cancelada: false } },
  ];

  it("cria o novo, atualiza o mudado, tira o zerado e deixa o igual", () => {
    const r = planoDasRetencoes(atuais, [
      { tributo: "IRRF", centavos: 1_500 },
      { tributo: "COFINS", centavos: 3_000 },
      { tributo: "ISS", centavos: 5_000 },
    ]);
    expect(r).toEqual({
      ok: true,
      passos: [
        { tipo: "tirar", tributo: "PIS", contaId: "c-pis" },
        { tipo: "criar", tributo: "COFINS", centavos: 3_000 },
      ],
    });
    expect(planoDasRetencoes(atuais.slice(0, 1), [{ tributo: "IRRF", centavos: 2_000 }])).toEqual({
      ok: true,
      passos: [{ tipo: "atualizar", tributo: "IRRF", centavos: 2_000, contaId: "c-ir" }],
    });
  });

  it("conta do imposto com baixa não muda nem sai, com o caminho", () => {
    const mudar = planoDasRetencoes(atuais, [{ tributo: "ISS", centavos: 4_000 }]);
    expect(mudar.ok).toBe(false);
    if (!mudar.ok) expect(mudar.erro).toBe("A conta do ISS retido já tem baixa — desfaça a baixa dela para mudar a retenção.");
  });

  it("retenção sem conta viva: mudar recria a conta; zerar só tira", () => {
    const semConta: RetencaoAtual[] = [{ tributo: "CSLL", centavos: 1_000, conta: { id: "c", temBaixa: false, cancelada: true } }];
    expect(planoDasRetencoes(semConta, [{ tributo: "CSLL", centavos: 1_200 }])).toEqual({ ok: true, passos: [{ tipo: "criar", tributo: "CSLL", centavos: 1_200 }] });
    expect(planoDasRetencoes(semConta, [])).toEqual({ ok: true, passos: [{ tipo: "tirar", tributo: "CSLL", contaId: null }] });
  });
});

describe("retencoesDaNota", () => {
  const nota = { brutoCentavos: 100_000, liquidoCentavos: 88_850 };

  it("o que a NFS-e declarou, na ordem dos tributos", () => {
    expect(retencoesDaNota({ ISS: "50.00", IRRF: "15.00", PIS: "6.5" }, nota)).toEqual([
      { tributo: "IRRF", centavos: 1_500 },
      { tributo: "PIS", centavos: 650 },
      { tributo: "ISS", centavos: 5_000 },
    ]);
  });

  it("na dúvida, nada: sem líquido, chave estranha, valor que não é decimal, ou passando do retido", () => {
    expect(retencoesDaNota({ IRRF: "15.00" }, { brutoCentavos: 100_000, liquidoCentavos: null })).toEqual([]);
    expect(retencoesDaNota({ IRRF: "15.00", ICMS: "1.00" }, nota)).toEqual([]);
    expect(retencoesDaNota({ IRRF: "15,00" }, nota)).toEqual([]);
    expect(retencoesDaNota({ IRRF: 15 }, nota)).toEqual([]);
    expect(retencoesDaNota({ INSS: "200.00" }, nota)).toEqual([]);
    expect(retencoesDaNota(null, nota)).toEqual([]);
    expect(retencoesDaNota(["IRRF"], nota)).toEqual([]);
  });
});
