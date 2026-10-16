import { describe, expect, it } from "vitest";
import { abertaHa, enderecoCurto, fatosDaFicha, faixaCadastrada, linkDoWhatsApp, situacaoNoPortal, type VagaDaFicha } from "./fichaDaVaga";

// 14/10/2026, 15h em Brasília.
const AGORA = new Date("2026-10-14T18:00:00Z");

const VAGA: VagaDaFicha = {
  cargo: "Auxiliar de produção",
  quantidade: 2,
  contratadas: 1,
  prioridade: "ALTA",
  abertaEm: new Date("2026-10-02T13:00:00Z"),
  encerradaEm: null,
  contrato: "CLT",
  modalidade: "PRESENCIAL",
  cidade: "Curitiba",
  uf: "PR",
  salarioMin: 1800,
  salarioMax: 2100,
  mostrarSalario: false,
};

describe("fatosDaFicha", () => {
  it("monta os seis fatos da faixa, na ordem da tela", () => {
    const fatos = fatosDaFicha(VAGA, AGORA);
    expect(fatos.map((f) => f.chave)).toEqual(["cargo", "vagas", "prioridade", "abertura", "contrato", "salario"]);
    const por = Object.fromEntries(fatos.map((f) => [f.chave, f]));
    expect(por.cargo).toMatchObject({ rotulo: "Cargo", valor: "Auxiliar de produção" });
    expect(por.vagas).toMatchObject({ rotulo: "Vagas", valor: "2", detalhe: "1 preenchida" });
    expect(por.prioridade).toMatchObject({ valor: "Alta", destaque: true });
    expect(por.abertura).toMatchObject({ rotulo: "Aberta em", valor: "02/10/2026", detalhe: "há 12 dias" });
    expect(por.contrato).toMatchObject({ rotulo: "Contrato", valor: "CLT · Presencial", detalhe: "Curitiba/PR" });
    expect(por.salario!.valor).toMatch(/^R\$\s1\.800 a R\$\s2\.100$/);
    expect(por.salario!.detalhe).toBe("não aparece no portal");
  });

  it("esconde o fato sem valor: sem cargo, sem contrato nem local, sem salário", () => {
    const fatos = fatosDaFicha(
      { ...VAGA, cargo: null, contrato: null, modalidade: null, cidade: null, uf: null, salarioMin: null, salarioMax: null },
      AGORA
    );
    expect(fatos.map((f) => f.chave)).toEqual(["vagas", "prioridade", "abertura"]);
  });

  it("prioridade que não é alta não pede atenção", () => {
    const prioridade = fatosDaFicha({ ...VAGA, prioridade: "MEDIA" }, AGORA).find((f) => f.chave === "prioridade");
    expect(prioridade).toMatchObject({ valor: "Média" });
    expect(prioridade!.destaque).toBe(false);
  });

  it("conta as vagas preenchidas e o singular", () => {
    const vagas = (contratadas: number, quantidade = 3) =>
      fatosDaFicha({ ...VAGA, quantidade, contratadas }, AGORA).find((f) => f.chave === "vagas")!;
    expect(vagas(0).detalhe).toBe("nenhuma preenchida");
    expect(vagas(2).detalhe).toBe("2 preenchidas");
    expect(vagas(0, 1).rotulo).toBe("Vaga");
  });

  it("só a modalidade vira 'Modalidade'; só o local, 'Local'", () => {
    const so = (v: Partial<VagaDaFicha>) => fatosDaFicha({ ...VAGA, ...v }, AGORA).find((f) => f.chave === "contrato");
    expect(so({ contrato: null })).toMatchObject({ rotulo: "Modalidade", valor: "Presencial", detalhe: "Curitiba/PR" });
    expect(so({ contrato: null, modalidade: null })).toMatchObject({ rotulo: "Local", valor: "Curitiba/PR" });
    expect(so({ contrato: "PJ", modalidade: null, cidade: null, uf: null })).toEqual({ chave: "contrato", rotulo: "Contrato", valor: "PJ" });
  });

  it("salário mostrado no portal não leva a nota; vaga encerrada diz quando", () => {
    const fatos = fatosDaFicha({ ...VAGA, mostrarSalario: true, encerradaEm: new Date("2026-10-10T15:00:00Z") }, AGORA);
    expect(fatos.find((f) => f.chave === "salario")!.detalhe).toBeUndefined();
    expect(fatos.find((f) => f.chave === "abertura")!.detalhe).toBe("encerrada em 10/10/2026");
  });
});

describe("abertaHa", () => {
  it("conta dias de calendário em Brasília, sem parar no mês", () => {
    expect(abertaHa(new Date("2026-10-14T03:30:00Z"), AGORA)).toBe("hoje");
    // 23h de 13/10 em Brasília: ontem, mesmo a menos de 24 horas.
    expect(abertaHa(new Date("2026-10-14T02:00:00Z"), AGORA)).toBe("ontem");
    expect(abertaHa(new Date("2026-08-01T12:00:00Z"), AGORA)).toBe("há 74 dias");
  });
});

describe("faixaCadastrada", () => {
  it("mostra a faixa como foi cadastrada", () => {
    expect(faixaCadastrada(null, null)).toBeNull();
    expect(faixaCadastrada(2000, 2000)).toMatch(/^R\$\s2\.000$/);
    expect(faixaCadastrada(2000, null)).toMatch(/^A partir de R\$\s2\.000$/);
    expect(faixaCadastrada(null, 3000)).toMatch(/^Até R\$\s3\.000$/);
  });
});

describe("situacaoNoPortal", () => {
  const base = { isPublic: true, status: "ABERTA" as const, applicationDeadline: null };

  it("publicada: marcada, aberta e no prazo (o prazo vale o dia inteiro)", () => {
    expect(situacaoNoPortal(base, AGORA)).toEqual({ publicada: true });
    expect(situacaoNoPortal({ ...base, applicationDeadline: new Date("2026-10-14T00:00:00Z") }, AGORA)).toEqual({ publicada: true });
  });

  it("diz por que está fora do portal", () => {
    expect(situacaoNoPortal({ ...base, isPublic: false }, AGORA)).toEqual({ publicada: false, motivo: "nao_marcada" });
    expect(situacaoNoPortal({ ...base, status: "ENCERRADA" }, AGORA)).toEqual({ publicada: false, motivo: "fora_do_ar", status: "ENCERRADA" });
    expect(situacaoNoPortal({ ...base, applicationDeadline: new Date("2026-10-13T00:00:00Z") }, AGORA)).toEqual({
      publicada: false,
      motivo: "prazo_vencido",
      prazo: "13/10/2026",
    });
  });
});

describe("enderecoCurto", () => {
  it("tira o protocolo e corta o id da vaga", () => {
    expect(enderecoCurto("https://useconnect.com.br/carreiras/teste/8c2f41d7-5b9e-4e1a-a3c6-0f27d9b41e58")).toBe(
      "useconnect.com.br/carreiras/teste/8c2f…"
    );
    expect(enderecoCurto("https://41carreiras.com.br/vagas/8c2f41d7-5b9e-4e1a-a3c6-0f27d9b41e58")).toBe("41carreiras.com.br/vagas/8c2f…");
  });

  it("caminho sem domínio e endereço sem id ficam como estão", () => {
    expect(enderecoCurto("/carreiras/teste/8c2f41d7-5b9e-4e1a-a3c6-0f27d9b41e58")).toBe("/carreiras/teste/8c2f…");
    expect(enderecoCurto("https://41carreiras.com.br/")).toBe("41carreiras.com.br");
  });
});

describe("linkDoWhatsApp", () => {
  it("abre o WhatsApp com a vaga, a empresa e o link na mensagem", () => {
    const url = "https://41carreiras.com.br/vagas/abc";
    const link = linkDoWhatsApp(url, "Auxiliar de produção", "Pão Dourado");
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    const texto = decodeURIComponent(link.slice("https://wa.me/?text=".length));
    expect(texto).toBe(`Vaga: Auxiliar de produção — Pão Dourado\n${url}`);
  });
});
