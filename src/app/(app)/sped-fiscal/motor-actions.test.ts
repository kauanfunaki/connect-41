import { beforeEach, describe, expect, it, vi } from "vitest";
import { parametrosIniciais } from "@/lib/fiscal/previa/execucao";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "ADMIN" },
  pode: vi.fn(),
  audit: vi.fn(),
  motor: null as unknown as { escrita: boolean; raizes: string[]; cliente: Record<string, ReturnType<typeof vi.fn>> },
  estabs: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx, podeExcluir: (c: { role: string }) => c.role === "ADMIN" }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/fiscal/motor/servidor", () => ({
  abrirMotor: async () => m.motor,
  atorDaSessao: async () => ({ id: "u1", nome: "Kátia", email: "k@41.com.br", tenant: "t1" }),
  estabelecimentosDaRaiz: m.estabs,
}));
const { ErroDoMotor } = await import("@/lib/sped/motor");
const acoes = await import("./motor-actions");

const CHAVE = "c41:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const EXEC = { id: 812, empresa_id: 3, data_ini: "2026-09-01", data_fim: "2026-09-30" };
const ESTABS = [
  { id: 1, cnpj: "17122471000175", matriz: true, companyId: "c1", companyNome: "BLD Matriz", ativo: true },
  { id: 3, cnpj: "17122471001147", matriz: false, companyId: "c3", companyNome: "BLD SP", ativo: true },
];
const geracao = { ...parametrosIniciais("2026-09", "sped"), tipoSped: "0" as const };

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1", role: "ADMIN" };
  m.pode.mockResolvedValue(true);
  m.estabs.mockResolvedValue({ visiveis: ESTABS, semCadastro: [], semMotor: [] });
  m.motor = {
    escrita: true,
    raizes: ["17122471"],
    cliente: {
      criarExecucao: vi.fn().mockResolvedValue(EXEC),
      obterExecucao: vi.fn().mockResolvedValue(EXEC),
      cancelarExecucao: vi.fn().mockResolvedValue(EXEC),
      destravarExecucao: vi.fn().mockResolvedValue(EXEC),
      obterArquivo: vi.fn().mockResolvedValue({ id: 301, cnpj: "17122471001147" }),
      validarArquivo: vi.fn().mockResolvedValue({ validacao_id: 78, estado: "validando" }),
      atualizarEmpresa: vi.fn().mockResolvedValue({ rotulo: "BLD SP" }),
    },
  };
});

describe("solicitar execução", () => {
  it("exige agir no módulo de operação e não chama o motor sem permissão", async () => {
    m.pode.mockResolvedValue(false);
    const r = await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: geracao, chave: CHAVE });
    expect(r.ok).toBe(false);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_operacao", "agir");
    expect(m.motor.cliente.criarExecucao).not.toHaveBeenCalled();
  });
  it("raiz fora do alcance, sem escrita ou estabelecimento invisível: recusa sem chamar", async () => {
    expect((await acoes.solicitarExecucaoNoMotor({ raiz: "99999999", estabelecimentoId: 3, parametros: geracao, chave: CHAVE })).ok).toBe(false);
    expect((await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 77, parametros: geracao, chave: CHAVE })).ok).toBe(false);
    m.motor.escrita = false;
    const r = await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: geracao, chave: CHAVE });
    expect(r).toMatchObject({ ok: false, codigo: "escrita_nao_habilitada" });
    expect(m.motor.cliente.criarExecucao).not.toHaveBeenCalled();
  });
  it("valida parâmetros e chave antes de tudo", async () => {
    expect((await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: { ...geracao, tipoSped: undefined }, chave: CHAVE })).ok).toBe(false);
    expect((await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: geracao, chave: "curta" })).ok).toBe(false);
    expect(m.pode).not.toHaveBeenCalled();
  });
  it("envia com o ator da sessão e a chave do formulário, e audita", async () => {
    const r = await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: { ...geracao, solicitante: "campo do formulário" }, chave: CHAVE });
    expect(r.ok).toBe(true);
    const [raiz, corpo, escrita] = m.motor.cliente.criarExecucao.mock.calls[0];
    expect(raiz).toBe("17122471");
    expect(corpo).toMatchObject({ acao: "sped", empresa_id: 3, competencia: "2026-09", tipo_sped: "0" });
    expect(JSON.stringify(corpo)).not.toContain("campo do formulário");
    expect(escrita).toEqual({ ator: { id: "u1", nome: "Kátia", email: "k@41.com.br", tenant: "t1" }, chave: CHAVE });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", action: "fiscal.sped.execucao.solicitada", entityId: "812" }));
  });
  it("Contribuições vai pela matriz, qualquer que seja o estabelecimento escolhido", async () => {
    await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: { ...parametrosIniciais("2026-09", "sped_contribuicoes"), tipoSped: "0" }, chave: CHAVE });
    expect(m.motor.cliente.criarExecucao.mock.calls[0][1].empresa_id).toBe(1);
  });
  it("devolve a duplicata com o existente e pede chave nova; em 5xx mantém a chave", async () => {
    m.motor.cliente.criarExecucao.mockRejectedValueOnce(new ErroDoMotor(409, "execucao_duplicada", "Já existe", { existente: EXEC, codigo: "execucao_duplicada" }));
    const r = await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: geracao, chave: CHAVE });
    expect(r).toMatchObject({ ok: false, codigo: "execucao_duplicada", renovarChave: true, detalhe: { existente: EXEC } });
    m.motor.cliente.criarExecucao.mockRejectedValueOnce(new ErroDoMotor(503, "banco_indisponivel", "fora"));
    expect(await acoes.solicitarExecucaoNoMotor({ raiz: "17122471", estabelecimentoId: 3, parametros: geracao, chave: CHAVE })).toMatchObject({ ok: false, renovarChave: false });
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("cancelar, destravar, validar e cadastro", () => {
  it("destravar pede gestão; cancelar, agir", async () => {
    m.pode.mockImplementation(async (_c, _m, nivel) => nivel !== "gerir");
    expect((await acoes.destravarExecucaoNoMotor({ raiz: "17122471", id: 812 })).ok).toBe(false);
    expect(m.motor.cliente.destravarExecucao).not.toHaveBeenCalled();
    expect((await acoes.cancelarExecucaoNoMotor({ raiz: "17122471", id: 812 })).ok).toBe(true);
  });
  it("execução de estabelecimento que a pessoa não vê é 'não encontrada'", async () => {
    m.motor.cliente.obterExecucao.mockResolvedValue({ ...EXEC, empresa_id: 99 });
    expect(await acoes.cancelarExecucaoNoMotor({ raiz: "17122471", id: 812 })).toMatchObject({ ok: false, mensagem: "Execução não encontrada." });
    expect(m.motor.cliente.cancelarExecucao).not.toHaveBeenCalled();
  });
  it("validar exige agir em SPED gerados e o arquivo no alcance", async () => {
    expect((await acoes.validarArquivoNoMotor({ raiz: "17122471", id: 301, chave: CHAVE })).ok).toBe(true);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_entregas", "agir");
    m.motor.cliente.obterArquivo.mockResolvedValue({ id: 302, cnpj: "11111111000100" });
    expect((await acoes.validarArquivoNoMotor({ raiz: "17122471", id: 302, chave: CHAVE })).ok).toBe(false);
    expect(m.motor.cliente.validarArquivo).toHaveBeenCalledTimes(1);
  });
  it("cadastro: gestão de Configurações, só campos editáveis", async () => {
    expect((await acoes.atualizarEstabelecimentoNoMotor({ raiz: "17122471", id: 3, atualizadoEmEsperado: null, campos: { cnpj: "1" } })).ok).toBe(false);
    const r = await acoes.atualizarEstabelecimentoNoMotor({ raiz: "17122471", id: 3, atualizadoEmEsperado: "2026-10-01T12:00:00+00:00", campos: { apelido: "BLD" } });
    expect(r.ok).toBe(true);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "fiscal_configuracoes", "gerir");
    expect(m.motor.cliente.atualizarEmpresa.mock.calls[0][2]).toEqual({ apelido: "BLD", atualizado_em_esperado: "2026-10-01T12:00:00+00:00" });
  });
});
