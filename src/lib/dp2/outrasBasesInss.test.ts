import { describe, expect, it } from "vitest";
import { calcularInss, calcularInssComOutrasBases } from "./impostos";
import { CONVENCAO_DA_CLT, calcularMes } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";
import { documentoFormatado, lerOutraBase, mesAnterior } from "./outrasBasesInss";

describe("formulário das outras bases de INSS (funcionalidade-769)", () => {
  it("lê CNPJ ou CPF, categoria e remuneração", () => {
    expect(lerOutraBase("11.222.333/0001-81", "", "4.000,00")).toEqual({ ok: true, base: { tpInsc: 1, nrInsc: "11222333000181", codCateg: "101", remuneracao: 4000 } });
    expect(lerOutraBase("529.982.247-25", "103", "1500")).toEqual({ ok: true, base: { tpInsc: 2, nrInsc: "52998224725", codCateg: "103", remuneracao: 1500 } });
  });

  it("recusa documento inválido, o CNPJ da própria empresa, categoria e valor errados", () => {
    expect(lerOutraBase("11.222.333/0001-00", "101", "10").ok).toBe(false);
    expect(lerOutraBase("11222333000181", "101", "10", "11.222.333/0001-81")).toEqual({ ok: false, erro: "Esse CNPJ é desta empresa: informe o da outra empresa onde o colaborador trabalha." });
    expect(lerOutraBase("11222333000181", "1", "10").ok).toBe(false);
    expect(lerOutraBase("11222333000181", "101", "0").ok).toBe(false);
  });

  it("mês anterior e documento formatado", () => {
    expect(mesAnterior(2027, 1)).toEqual({ ano: 2026, mes: 12 });
    expect(mesAnterior(2027, 6)).toEqual({ ano: 2027, mes: 5 });
    expect(documentoFormatado(1, "11222333000181")).toBe("11.222.333/0001-81");
    expect(documentoFormatado(2, "52998224725")).toBe("529.982.247-25");
  });
});

// A tabela dos exemplos da Nota Orientativa eSocial 2019.20 (exemplos b.2 a b.4).
const NOTA = { faixas: [{ ate: 998, aliquota: 7.5 }, { ate: 2000, aliquota: 9 }, { ate: 3000, aliquota: 12 }, { ate: 5839.45, aliquota: 14 }] };

describe("INSS com outras bases — mais de um vínculo (funcionalidade-769)", () => {
  it("sem outras bases é o cálculo de sempre", () => {
    const r = calcularInssComOutrasBases(3000, 0, NOTA);
    const { memoria, ...sem } = calcularInss(3000, NOTA);
    expect(r).toMatchObject({ ...sem, indMV: null, outrasBases: 0 });
    expect(r.memoria).toEqual(memoria);
  });

  it("Nota b.2 (indMV 1): declarante com 2.000 depois de 3.000 em outras empresas desconta 280,00", () => {
    const r = calcularInssComOutrasBases(2000, 3000, NOTA);
    expect(r.valor).toBe(280);
    expect(r.indMV).toBe(1);
    expect(r.baseLimitada).toBe(2000);
    // E os vínculos somam o INSS do total: 120,03 + 165,00 + 280,00 = INSS de 5.000.
    expect(calcularInssComOutrasBases(1500, 0, NOTA).valor + calcularInssComOutrasBases(1500, 1500, NOTA).valor + r.valor).toBeCloseTo(calcularInss(5000, NOTA).valor, 2);
    expect(calcularInssComOutrasBases(1500, 0, NOTA).valor).toBe(120.03);
    expect(calcularInssComOutrasBases(1500, 1500, NOTA).valor).toBe(165);
  });

  it("Nota b.3 (indMV 2): total passa do teto — base daqui = teto − outras", () => {
    const r = calcularInssComOutrasBases(3000, 4000, NOTA);
    expect(r.indMV).toBe(2);
    expect(r.baseLimitada).toBe(1839.45);
    expect(r.valor).toBe(257.52);
    expect(r.memoria.join(" ")).toContain("indMV 2");
  });

  it("Nota b.4 (indMV 3): outras bases já no teto — sem desconto", () => {
    const r = calcularInssComOutrasBases(2500, 6000, NOTA);
    expect(r.indMV).toBe(3);
    expect(r.valor).toBe(0);
    expect(r.faixas).toEqual([]);
    expect(calcularInssComOutrasBases(2500, 5839.45, NOTA).indMV).toBe(3);
  });

  it("no motor do mês: o INSS do holerite já sai com as outras bases, e o patronal não muda", () => {
    const t = tabelasDaCompetencia("2026-11");
    if (!t.ok) throw new Error("tabelas");
    const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
    const entrada = {
      ano: 2026, mes: 11, admissao: null, desligamento: null,
      vinculo: { salarioBase: 3000, tipoSalario: "MENSAL" as const, horasMensais: 220, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM" as const, periculosidade: false, valeTransporte: false, aprendiz: false },
      eventos: [], rubricas: porPapel, tabelas: t.tabelas, convencao: CONVENCAO_DA_CLT,
      empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
    };
    const so = calcularMes(entrada);
    const com = calcularMes({ ...entrada, outrasBasesInss: 4000 });
    const esperado = calcularInssComOutrasBases(3000, 4000, t.tabelas.inss.dados).valor;
    expect(com.inss.valor).toBe(esperado);
    // 3.000 nas faixas de cima (depois dos 4.000 de fora) pagam mais que sozinhos.
    expect(com.inss.valor).toBeGreaterThan(so.inss.valor);
    expect(com.inss.indMV).toBe(1);
    expect(com.liquido).toBeLessThan(so.liquido);
    expect(com.itens.find((i) => i.papel === "INSS")?.valor ?? 0).toBe(esperado);
    expect(com.encargos.inssEmpresa).toBe(so.encargos.inssEmpresa);
  });
});
