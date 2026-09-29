import { describe, expect, it } from "vitest";
import { lerContrato, planejarContrato, type SocioNoCadastro } from "./contratoSocial";

// CPFs válidos gerados para teste (não pertencem a ninguém conhecido).
const CPF_A = "52998224725";
const CPF_B = "11144477735";

const socio = (p: Partial<Record<string, unknown>>) => ({
  nome: "Maria da Silva",
  documento: "",
  participacao: null,
  quotas: null,
  capital: null,
  administrador: false,
  qualificacao: "",
  entrada: "",
  ...p,
});

describe("conferência do que a IA leu", () => {
  it("guarda CPF válido só com números e descarta o inválido com aviso", () => {
    const r = lerContrato({
      socios: [socio({ documento: "529.982.247-25" }), socio({ nome: "João", documento: "123.456.789-00" })],
      confianca: "ALTA",
    });
    expect(r.socios.map((s) => s.documento)).toEqual([CPF_A, null]);
    expect(r.avisos.join(" ")).toContain("não é um CPF ou CNPJ válido");
  });

  it("avisa quando as participações não somam 100%", () => {
    const r = lerContrato({ socios: [socio({ participacao: 60 }), socio({ nome: "João", participacao: 30 })], confianca: "ALTA" });
    expect(r.avisos.join(" ")).toContain("somam 90%");
  });

  it("avisa quando o capital dos sócios não fecha com o capital social", () => {
    const r = lerContrato({
      capitalSocial: 100000,
      socios: [socio({ capital: 50000 }), socio({ nome: "João", capital: 40000 })],
      confianca: "ALTA",
    });
    expect(r.avisos.join(" ")).toContain("capital social");
  });

  it("número fora da faixa e data inválida viram nulo", () => {
    const r = lerContrato({ socios: [socio({ participacao: 180, entrada: "2026-02-30" })], confianca: "MEDIA" });
    expect(r.socios[0]).toMatchObject({ participacao: null, entrada: null });
  });

  it("sem sócio lido, a confiança é baixa e a pessoa é avisada", () => {
    const r = lerContrato({ socios: [], confianca: "ALTA" });
    expect(r.confianca).toBe("BAIXA");
    expect(r.avisos.join(" ")).toContain("Nenhum sócio foi lido");
  });
});

describe("plano contra o cadastro", () => {
  const cad = (p: Partial<SocioNoCadastro>): SocioNoCadastro => ({
    id: "c1",
    name: "Maria da Silva",
    document: null,
    documentMasked: null,
    exitDate: null,
    sharePercent: null,
    quotas: null,
    capitalAmount: null,
    administrator: false,
    qualification: null,
    entryDate: null,
    ...p,
  });
  const lido = (p: Record<string, unknown>) => lerContrato({ socios: [socio(p)], confianca: "ALTA" }).socios[0];

  it("sócio importado da Receita (CPF mascarado) casa pelo meio do CPF e pelo nome", () => {
    const plano = planejarContrato(
      [cad({ documentMasked: "***982247**" })],
      [lido({ documento: CPF_A, participacao: 50, quotas: 5000, capital: 5000, administrador: true })]
    );
    expect(plano.novos).toEqual([]);
    expect(plano.atualizar[0].mudancas.map((m) => m.campo)).toEqual(["Participação", "Quotas", "Capital", "Administra", "Documento"]);
  });

  it("CPF diferente não casa, mesmo com o mesmo nome", () => {
    const plano = planejarContrato([cad({ document: CPF_B })], [lido({ documento: CPF_A })]);
    expect(plano.novos).toHaveLength(1);
    expect(plano.foraDoContrato).toEqual([{ id: "c1", nome: "Maria da Silva" }]);
  });

  it("o que alguém digitou não é trocado: qualificação e entrada só preenchem o vazio", () => {
    const plano = planejarContrato(
      [cad({ qualification: "Sócio-Administrador", entryDate: new Date("2020-01-01T12:00:00Z") })],
      [lido({ qualificacao: "Sócia", entrada: "2021-05-05" })]
    );
    expect(plano.iguais).toHaveLength(1);
  });

  it("ex-sócio não é casado de novo, e quem ficou de fora do contrato é listado sem sair sozinho", () => {
    const plano = planejarContrato(
      [cad({ id: "ex", exitDate: new Date("2024-01-01T12:00:00Z") }), cad({ id: "c2", name: "Pedro Souza" })],
      [lido({})]
    );
    expect(plano.novos).toHaveLength(1);
    expect(plano.foraDoContrato).toEqual([{ id: "c2", nome: "Pedro Souza" }]);
  });
});
