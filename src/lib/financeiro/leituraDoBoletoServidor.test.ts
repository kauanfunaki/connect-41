import { beforeEach, describe, expect, it, vi } from "vitest";

// "Ler boleto" (lote H2, 19/10): só para quem lança, só PDF de verdade, a
// empresa do escritório de quem pede, e o fornecedor procurado nela.

const m = vi.hoisted(() => ({
  db: { company: { findFirst: vi.fn() }, financeCounterparty: { findFirst: vi.fn() } },
  ctx: { tenantId: "escritorio-a", userId: "u1", role: "SECTOR_USER", sectors: ["bpo"], subscriptionReadOnly: false },
  gerar: vi.fn(),
  ligado: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/modules", () => ({ setorDoModulo: async () => null, isModuleEnabled: m.ligado }));
vi.mock("@/lib/ai", () => ({ gerarEstruturado: m.gerar }));

import { lerBoletoParaLancar } from "./leituraDoBoletoServidor";

const LINHA = "34191091233456781234156789000009516150000123456";
const pdf = (bytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]) => new File([new Uint8Array(bytes)], "boleto.pdf", { type: "application/pdf" });

function envio(arquivo: File | null = pdf()) {
  const f = new FormData();
  f.set("companyId", "empresa-1");
  if (arquivo) f.set("boleto", arquivo);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx.sectors = ["bpo"];
  m.ligado.mockResolvedValue(true);
  m.db.company.findFirst.mockResolvedValue({ id: "empresa-1", name: "Empresa Cliente Ltda", displayName: null, kind: "PESSOA_JURIDICA", cnpj: "11444777000161", cpf: null });
  m.db.financeCounterparty.findFirst.mockResolvedValue({ id: "forn-1", name: "Imobiliária Exemplo" });
  m.gerar.mockResolvedValue({
    runId: "run-1",
    valor: { tipoDoDocumento: "boleto", beneficiario: "Imobiliária Exemplo", documentoDoBeneficiario: "11222333000181", documentoDoPagador: "11444777000161", linhaDigitavel: LINHA, valor: 1234.56, vencimento: "2026-10-30" },
  });
});

describe("lerBoletoParaLancar", () => {
  it("lê, confere e acha o fornecedor já cadastrado na empresa", async () => {
    const r = await lerBoletoParaLancar(envio());
    expect(m.gerar).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "escritorio-a", agentCode: "leitor_de_boleto" }));
    expect(m.db.company.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "empresa-1", tenantId: "escritorio-a" } }));
    expect(m.db.financeCounterparty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "escritorio-a", companyId: "empresa-1", document: "11222333000181", active: true } })
    );
    expect(r).toMatchObject({ ok: true, runId: "run-1", contraparte: { id: "forn-1" }, leitura: { valorCentavos: 123456 } });
  });

  it("quem não é do setor não lê", async () => {
    m.ctx.sectors = ["dp"];
    expect(await lerBoletoParaLancar(envio())).toEqual({ error: "Sem permissão para lançar." });
    expect(m.gerar).not.toHaveBeenCalled();
  });

  it("módulo de Lançamentos desligado não lê", async () => {
    m.ligado.mockResolvedValue(false);
    expect(await lerBoletoParaLancar(envio())).toEqual({ error: "Módulo não habilitado." });
  });

  it("empresa de outro escritório não lê", async () => {
    m.db.company.findFirst.mockResolvedValue(null);
    expect(await lerBoletoParaLancar(envio())).toEqual({ error: "Empresa não encontrada." });
    expect(m.gerar).not.toHaveBeenCalled();
  });

  it("arquivo que não é PDF pelos bytes é recusado antes da IA", async () => {
    expect(await lerBoletoParaLancar(envio(pdf([0x89, 0x50, 0x4e, 0x47])))).toEqual({ error: "O arquivo não é um PDF. A leitura aceita o boleto em PDF." });
    expect(m.gerar).not.toHaveBeenCalled();
  });

  it("sem arquivo, pede o PDF", async () => {
    expect(await lerBoletoParaLancar(envio(null))).toEqual({ error: "Escolha o PDF do boleto." });
  });

  it("agente desligado vira mensagem de como ligar", async () => {
    m.gerar.mockRejectedValue(new Error("Este agente está desligado para o escritório."));
    expect(await lerBoletoParaLancar(envio())).toEqual({
      error: "A leitura de boleto está desligada. Um administrador liga em Configurações › Inteligência artificial.",
    });
  });

  it("sem CNPJ lido, não procura fornecedor", async () => {
    m.gerar.mockResolvedValue({ runId: "run-2", valor: { tipoDoDocumento: "boleto", documentoDoBeneficiario: "", linhaDigitavel: LINHA } });
    const r = await lerBoletoParaLancar(envio());
    expect(m.db.financeCounterparty.findFirst).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, contraparte: null });
  });
});
