import { beforeEach, describe, expect, it, vi } from "vitest";

// O painel "Adicionar candidato" da ficha da vaga (14/10/2026): busca no banco
// de talentos, vincula quem já está lá e cadastra quem é novo, já vinculado.
// Sempre dentro do escritório de quem pede, com a permissão da vaga.

const m = vi.hoisted(() => {
  const db = {
    vaga: { findFirst: vi.fn() },
    person: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    candidatura: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    db,
    ctx: { tenantId: "escritorio-a", userId: "recrutadora-1", role: "SECTOR_USER", sectors: ["recrutamento"] as string[] } as {
      tenantId: string | undefined;
      userId: string;
      role: string;
      sectors: string[];
    },
    podeAgir: vi.fn(),
    podeNoModulo: vi.fn(),
    revalidatePath: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/scope", () => ({ scopedVagaWhere: (c: { tenantId: string }) => ({ tenantId: c.tenantId }) }));
vi.mock("@/lib/recrutamento/acessoVagas", () => ({ podeAgirNaVaga: m.podeAgir }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.podeNoModulo }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("fs/promises", () => ({ mkdir: m.mkdir, writeFile: m.writeFile, unlink: m.unlink }));

const { buscarNoBancoDeTalentos, vincularCandidatoAVaga, cadastrarEVincularCandidato } = await import("./actions");

const VAGA = { id: "vaga-1", sectorCode: "contabil", restrictedToRecruiters: false };
const erroUnico = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

function formulario(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const pdf = (bytes = "%PDF-1.4 currículo") => new File([bytes], "curriculo.pdf", { type: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx.tenantId = "escritorio-a";
  m.db.vaga.findFirst.mockResolvedValue(VAGA);
  m.podeAgir.mockResolvedValue(true);
  m.podeNoModulo.mockResolvedValue(true);
  m.db.$transaction.mockImplementation(async (fn: (tx: typeof m.db) => unknown) => fn(m.db));
  m.db.person.create.mockResolvedValue({ id: "pessoa-nova" });
  m.db.candidatura.create.mockResolvedValue({ id: "cand-1" });
  m.db.person.findFirst.mockResolvedValue(null);
  m.mkdir.mockResolvedValue(undefined);
  m.writeFile.mockResolvedValue(undefined);
  m.unlink.mockResolvedValue(undefined);
});

describe("buscarNoBancoDeTalentos", () => {
  it("quem não age na vaga não busca", async () => {
    m.podeAgir.mockResolvedValueOnce(false);
    expect(await buscarNoBancoDeTalentos("vaga-1", "Gabriel")).toEqual({ error: "Sem permissão para adicionar candidatos nesta vaga." });
    expect(m.db.person.findMany).not.toHaveBeenCalled();
  });

  it("vaga de outro escritório não é encontrada", async () => {
    m.db.vaga.findFirst.mockResolvedValueOnce(null);
    expect(await buscarNoBancoDeTalentos("vaga-de-outro", "Gabriel")).toEqual({ error: "Vaga não encontrada." });
    expect(m.db.vaga.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vaga-de-outro", tenantId: "escritorio-a" } }));
  });

  it("menos de duas letras não consulta", async () => {
    expect(await buscarNoBancoDeTalentos("vaga-1", " G ")).toEqual({ candidatos: [] });
    expect(m.db.person.findMany).not.toHaveBeenCalled();
  });

  it("busca candidatos ativos do escritório por nome, e-mail e CPF, e marca quem já está na vaga", async () => {
    m.db.person.findMany.mockResolvedValueOnce([
      { id: "p1", name: "Gabriela Mendes", email: "gabi@exemplo.com", createdAt: new Date("2026-10-03T15:00:00Z"), candidaturas: [] },
      { id: "p2", name: "Gabriel Santos", email: null, createdAt: new Date("2026-09-21T15:00:00Z"), candidaturas: [{ id: "c9" }] },
    ]);
    const r = await buscarNoBancoDeTalentos("vaga-1", "123.456");
    const where = m.db.person.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ tenantId: "escritorio-a", type: "CANDIDATO", active: true });
    expect(where.OR).toEqual([
      { name: { contains: "123.456" } },
      { email: { contains: "123.456" } },
      { cpf: { contains: "123.456" } },
      { cpf: { contains: "123456" } },
    ]);
    expect(m.db.person.findMany.mock.calls[0]![0].select.candidaturas).toEqual({ where: { vagaId: "vaga-1" }, select: { id: true }, take: 1 });
    expect(r).toEqual({
      candidatos: [
        { id: "p1", nome: "Gabriela Mendes", email: "gabi@exemplo.com", desde: "no banco desde 03/10/2026", jaNaVaga: false },
        { id: "p2", nome: "Gabriel Santos", email: null, desde: "no banco desde 21/09/2026", jaNaVaga: true },
      ],
    });
  });
});

describe("vincularCandidatoAVaga", () => {
  it("vincula o candidato do banco com a origem escolhida", async () => {
    m.db.person.findFirst.mockResolvedValueOnce({ id: "p1", name: "Gabriela Mendes" });
    expect(await vincularCandidatoAVaga("vaga-1", { personId: "p1", origem: " Indicação " })).toEqual({ ok: true, nome: "Gabriela Mendes" });
    expect(m.db.person.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", tenantId: "escritorio-a", type: "CANDIDATO" } }));
    expect(m.db.candidatura.create).toHaveBeenCalledWith({
      data: { tenantId: "escritorio-a", vagaId: "vaga-1", personId: "p1", origin: "Indicação" },
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/vagas/vaga-1");
  });

  it("sem origem grava vazio", async () => {
    m.db.person.findFirst.mockResolvedValueOnce({ id: "p1", name: "Gabriela Mendes" });
    await vincularCandidatoAVaga("vaga-1", { personId: "p1", origem: null });
    expect(m.db.candidatura.create.mock.calls[0]![0].data.origin).toBeNull();
  });

  it("pessoa de outro escritório (ou que não é candidato) não vincula", async () => {
    expect(await vincularCandidatoAVaga("vaga-1", { personId: "p-de-outro" })).toEqual({ error: "Candidato não encontrado." });
    expect(m.db.candidatura.create).not.toHaveBeenCalled();
  });

  it("quem já está na vaga não entra duas vezes", async () => {
    m.db.person.findFirst.mockResolvedValueOnce({ id: "p2", name: "Gabriel Santos" });
    m.db.candidatura.create.mockRejectedValueOnce(erroUnico);
    expect(await vincularCandidatoAVaga("vaga-1", { personId: "p2" })).toEqual({ error: "Este candidato já está vinculado a esta vaga." });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("sem permissão na vaga, nada", async () => {
    m.podeAgir.mockResolvedValueOnce(false);
    expect(await vincularCandidatoAVaga("vaga-1", { personId: "p1" })).toEqual({ error: "Sem permissão para adicionar candidatos nesta vaga." });
    expect(m.db.person.findFirst).not.toHaveBeenCalled();
  });
});

describe("cadastrarEVincularCandidato", () => {
  it("cadastra e vincula na mesma operação, com a origem", async () => {
    const r = await cadastrarEVincularCandidato(
      "vaga-1",
      formulario({ name: "  Renata   Alves ", email: "Renata.Alves@Exemplo.com", phone: "(41) 99812-4410", origem: "LinkedIn" })
    );
    expect(r).toEqual({ ok: true, nome: "Renata Alves" });
    expect(m.db.person.create).toHaveBeenCalledWith({
      data: {
        tenantId: "escritorio-a",
        type: "CANDIDATO",
        name: "Renata Alves",
        email: "renata.alves@exemplo.com",
        phone: "(41) 99812-4410",
      },
      select: { id: true },
    });
    expect(m.db.candidatura.create).toHaveBeenCalledWith({
      data: { tenantId: "escritorio-a", vagaId: "vaga-1", personId: "pessoa-nova", origin: "LinkedIn", resumeUrl: null },
    });
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("precisa da permissão de cadastrar candidatos, a mesma de /candidatos/nova", async () => {
    m.podeNoModulo.mockResolvedValueOnce(false);
    expect(await cadastrarEVincularCandidato("vaga-1", formulario({ name: "Renata" }))).toEqual({ error: "Sem permissão para cadastrar candidatos." });
    expect(m.podeNoModulo).toHaveBeenCalledWith(m.ctx, "recrutamento_candidatos", "gerir");
    expect(m.db.person.create).not.toHaveBeenCalled();
  });

  it("valida como o cadastro de candidato: nome obrigatório, e-mail e telefone válidos", async () => {
    expect(await cadastrarEVincularCandidato("vaga-1", formulario({ name: "  " }))).toEqual({ error: "Nome é obrigatório." });
    expect(await cadastrarEVincularCandidato("vaga-1", formulario({ name: "Renata", email: "renata@" }))).toEqual({ error: "E-mail inválido." });
    expect(await cadastrarEVincularCandidato("vaga-1", formulario({ name: "Renata", phone: "abc" }))).toEqual({ error: "Telefone inválido." });
    expect(m.db.person.create).not.toHaveBeenCalled();
  });

  it("e-mail de um candidato que já está no banco: não duplica, e a tela volta para a busca", async () => {
    m.db.person.findFirst.mockResolvedValueOnce({ name: "Renata Alves" });
    const r = await cadastrarEVincularCandidato("vaga-1", formulario({ name: "Renata", email: "renata.alves@exemplo.com" }));
    expect(r).toEqual({
      error: "Já existe um candidato com este e-mail: Renata Alves. Ele está na busca — é só vincular.",
      buscar: "renata.alves@exemplo.com",
    });
    expect(m.db.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "escritorio-a", type: "CANDIDATO", email: "renata.alves@exemplo.com" } })
    );
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("guarda o currículo em PDF com os do portal e liga à candidatura", async () => {
    const r = await cadastrarEVincularCandidato("vaga-1", formulario({ name: "Renata", curriculo: pdf() }));
    expect(r).toEqual({ ok: true, nome: "Renata" });
    expect(m.writeFile).toHaveBeenCalledTimes(1);
    const caminho = String(m.writeFile.mock.calls[0]![0]).replace(/\\/g, "/");
    expect(caminho).toMatch(/storage\/resumes\/escritorio-a\/[0-9a-f-]{36}\.pdf$/);
    const resumeUrl = m.db.candidatura.create.mock.calls[0]![0].data.resumeUrl as string;
    expect(resumeUrl).toMatch(/^escritorio-a\/[0-9a-f-]{36}\.pdf$/);
    expect(caminho.endsWith(resumeUrl)).toBe(true);
  });

  it("arquivo que não é PDF de verdade é recusado antes de gravar qualquer coisa", async () => {
    const falso = new File(["MZ executável"], "curriculo.pdf", { type: "application/pdf" });
    expect(await cadastrarEVincularCandidato("vaga-1", formulario({ name: "Renata", curriculo: falso }))).toEqual({
      error: "O currículo precisa ser um PDF.",
    });
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.db.person.create).not.toHaveBeenCalled();
  });

  it("se o banco recusar, o arquivo já gravado sai", async () => {
    m.db.$transaction.mockRejectedValueOnce(new Error("conexão caiu"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await cadastrarEVincularCandidato("vaga-1", formulario({ name: "Renata", curriculo: pdf() }))).toEqual({
      error: "Não foi possível cadastrar o candidato. Tente novamente.",
    });
    expect(m.unlink).toHaveBeenCalledWith(m.writeFile.mock.calls[0]![0]);
  });
});
