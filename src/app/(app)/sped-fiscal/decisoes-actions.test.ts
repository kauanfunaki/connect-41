import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "ADMIN" },
  pode: vi.fn(),
  audit: vi.fn(),
  cliente: { gravarDecisoes: vi.fn(), apagarDecisoes: vi.fn(), criarDecisoes: vi.fn() },
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx, podeExcluir: (c: { role: string }) => c.role === "ADMIN" }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({
  abrirMotor: async () => ({ escrita: true, raizes: ["17122471"], cliente: m.cliente }),
  atorDaSessao: async () => ({ id: "u1", nome: "Kátia", email: "k@41.com.br" }),
  estabelecimentosDaRaiz: async () => ({ visiveis: [{ id: 3, cnpj: "17122471001147" }], semCadastro: [], semMotor: [] }),
}));
const { ErroDoMotor } = await import("@/lib/sped/motor");
const { apagarDecisaoNoMotor, criarDecisaoNoMotor, gravarDecisaoNoMotor } = await import("./decisoes-actions");

const CHAVE = "c41:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const credito = { cnpj_emit: "12345678000199", cod_prod: "A1", competencia: "2026-09", cnpj_empresa: "17122471001147" };

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1", role: "ADMIN" };
  m.pode.mockResolvedValue(true);
  m.cliente.gravarDecisoes.mockResolvedValue({ gravadas: 2, itens: [], registro_ids: [10, 11] });
  m.cliente.apagarDecisoes.mockResolvedValue({ apagadas: 1, registro_ids: [12] });
  m.cliente.criarDecisoes.mockResolvedValue({ ids: [5], itens: [] });
});

describe("decisões pelo Connect", () => {
  it("grava em lote no módulo do tipo, com o ator da sessão, e audita", async () => {
    const r = await gravarDecisaoNoMotor({ raiz: "17122471", tipo: "credito_icms_item", chaves: [credito, { ...credito, cod_prod: "B2" }], valor: { valor: "0.00" } });
    expect(r).toMatchObject({ ok: true, dados: { gravadas: 2 } });
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_classificacao", "agir");
    expect(m.cliente.gravarDecisoes.mock.calls[0][2]).toEqual({ chaves: [credito, { ...credito, cod_prod: "B2" }], valor: { valor: "0.00" } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "fiscal.sped.decisao.gravada", entityType: "SpedDecisao" }));
  });
  it("recusa estabelecimento fora do alcance, campo desconhecido e decimal como número", async () => {
    expect((await gravarDecisaoNoMotor({ raiz: "17122471", tipo: "credito_icms_item", chave: { ...credito, cnpj_empresa: "17122471000175" }, valor: { valor: "1.00" } })).ok).toBe(false);
    expect(await gravarDecisaoNoMotor({ raiz: "17122471", tipo: "credito_icms_item", chave: credito, valor: { valor: 1 } })).toMatchObject({ ok: false, campos: { valor: expect.any(String) } });
    expect((await gravarDecisaoNoMotor({ raiz: "17122471", tipo: "credito_icms_item", chave: credito, valor: { decidido_por: "x" } })).ok).toBe(false);
    expect(m.cliente.gravarDecisoes).not.toHaveBeenCalled();
  });
  it("tipos sem remoção (405) e o documento_excluido nem chamam o motor", async () => {
    expect(await apagarDecisaoNoMotor({ raiz: "17122471", tipo: "classificacao_item", chave: { cnpj_emit: "12345678000199", cod_prod: "A" } })).toMatchObject({ ok: false, codigo: "operacao_nao_suportada" });
    expect((await gravarDecisaoNoMotor({ raiz: "17122471", tipo: "documento_excluido", chave: { chave: "1".repeat(44) }, valor: { motivo: "teste longo" } })).ok).toBe(false);
    expect(m.cliente.apagarDecisoes).not.toHaveBeenCalled();
  });
  it("apagar exige o perfil que exclui", async () => {
    m.ctx = { ...m.ctx, role: "SECTOR_USER" };
    expect((await apagarDecisaoNoMotor({ raiz: "17122471", tipo: "credito_icms_item", chave: credito })).ok).toBe(false);
    m.ctx = { ...m.ctx, role: "ADMIN" };
    expect((await apagarDecisaoNoMotor({ raiz: "17122471", tipo: "credito_icms_item", chave: credito })).ok).toBe(true);
  });
  it("criar ajuste exige chave de idempotência e vai por POST", async () => {
    expect((await criarDecisaoNoMotor({ raiz: "17122471", tipo: "ajuste_contribuicoes", valor: { competencias: ["2026-09"], descricao: "Ajuste x", valor: "1.00" } })).ok).toBe(false);
    const r = await criarDecisaoNoMotor({ raiz: "17122471", tipo: "ajuste_contribuicoes", valor: { competencias: ["2026-09"], descricao: "Ajuste x", valor: "1.00" }, idempotencia: CHAVE });
    expect(r.ok).toBe(true);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_contribuicoes", "agir");
    expect(m.cliente.criarDecisoes.mock.calls[0][3]).toMatchObject({ chave: CHAVE });
  });
  it("tipo bloqueado no motor (CONNECT_DECISOES_ESCRITA) volta com mensagem clara", async () => {
    m.cliente.gravarDecisoes.mockRejectedValueOnce(new ErroDoMotor(403, "decisao_bloqueada", "Este tipo de decisão está bloqueado para gravação pelo Connect no motor SPED."));
    expect(await gravarDecisaoNoMotor({ raiz: "17122471", tipo: "parametro_contribuicoes", chave: { competencia: "2026-09" }, valor: { tipo_escrit: "0" } }))
      .toMatchObject({ ok: false, codigo: "decisao_bloqueada", mensagem: expect.stringMatching(/bloqueado/), renovarChave: true });
  });
});
