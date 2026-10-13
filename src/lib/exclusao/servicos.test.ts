import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarBancoFalso, type Chamada, type Regras } from "./bancoFalso";
import { papelExclui } from "./comum";
import { LIMITE_DE_NOTAS, excluirEmpresaDeVez, excluirEmpresasEmMassa, previaDaEmpresa } from "./empresa";
import { excluirPessoaDeVez, previaDaPessoa } from "./pessoa";
import { excluirUsuarioDeVez, previaDoUsuario } from "./usuario";

// O que se testa: as regras dos serviços de exclusão, sem banco — quem pode,
// o tenant em toda consulta, os dois modos, o nome digitado, o teto de notas
// fiscais, a passagem dos registros do usuário para quem exclui e o registro
// que sobrevive. A ordem contra as chaves estrangeiras é do plano.test.ts.

// Nenhum arquivo de verdade sai do disco nos testes.
vi.mock("fs/promises", async (original) => ({ ...(await original<typeof import("fs/promises")>()), unlink: vi.fn(async () => undefined) }));

const ADMIN = { id: "admin", role: "ADMIN" };
const EMPRESA = { id: "e1", name: "TRANSPORTES MODELO LTDA", displayName: null, kind: "PESSOA_JURIDICA", cnpj: "11222333000181", cpf: null, logoUrl: null };
const PESSOA = {
  id: "p1",
  name: "Ana Souza",
  cpf: "12345678901",
  email: "ana@exemplo.test",
  type: "COLABORADOR",
  isInternal: false,
  linkedUserId: null as string | null,
  dataDeletionRequestedAt: null,
};
const USUARIO = { id: "u2", name: "Bruno Teste", email: "bruno@exemplo.test", role: "SECTOR_USER", photoUrl: null };

/** O banco de um escritório "t1" com a empresa, a pessoa e o usuário acima. */
function escritorio(
  opcoes: { contagens?: Record<string, number>; usuario?: typeof USUARIO; pessoa?: typeof PESSOA; achar?: Regras["achar"]; contar?: Regras["contar"]; mexer?: Regras["mexer"] } = {}
) {
  return criarBancoFalso({
    mexer: opcoes.mexer,
    contar: (delegado, where) => opcoes.contar?.(delegado, where) ?? opcoes.contagens?.[delegado] ?? 0,
    achar: (delegado, metodo, args) => {
      const de = opcoes.achar?.(delegado, metodo, args);
      if (de !== undefined) return de;
      const where = (args.where ?? {}) as Record<string, unknown>;
      if (where.tenantId !== undefined && where.tenantId !== "t1") return metodo === "findMany" ? [] : null;
      if (delegado === "company" && metodo === "findFirst" && where.id === "e1") return EMPRESA;
      if (delegado === "person" && metodo === "findFirst" && where.id === "p1") return opcoes.pessoa ?? PESSOA;
      if (delegado === "user" && metodo === "findFirst" && where.id === "u2") return opcoes.usuario ?? USUARIO;
      if (delegado === "user" && metodo === "findUnique") return { name: "Admin Fulano" };
      return undefined;
    },
  });
}

const prisma = (banco: unknown) => banco as PrismaClient;
const json = (c: Chamada) => JSON.stringify(c.args ?? {});
const indice = (chamadas: Chamada[], delegado: string, metodo: string) => chamadas.findIndex((c) => c.delegado === delegado && c.metodo === metodo);

beforeEach(() => vi.clearAllMocks());

describe("quem pode excluir", () => {
  it("só ADMIN e SUPER_ADMIN", () => {
    expect(papelExclui("ADMIN")).toBe(true);
    expect(papelExclui("SUPER_ADMIN")).toBe(true);
    for (const papel of ["SECTOR_ADMIN", "SECTOR_USER", "READONLY", "", undefined, null]) expect(papelExclui(papel)).toBe(false);
  });

  for (const role of ["SECTOR_ADMIN", "SECTOR_USER", "READONLY"]) {
    it(`${role} é recusado nos três cadastros e na massa, sem tocar no banco`, async () => {
      const b = escritorio();
      const ator = { id: "x", role };
      const esperado = { ok: false, erro: "Só o Administrador ou o Super Admin pode excluir." };
      expect(await excluirEmpresaDeVez(prisma(b.banco), { tenantId: "t1", ator, id: "e1", modo: "simples" })).toEqual(esperado);
      expect(await excluirPessoaDeVez(prisma(b.banco), { tenantId: "t1", ator, id: "p1", modo: "simples" })).toEqual(esperado);
      expect(await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator, id: "u2", modo: "simples" })).toEqual(esperado);
      expect(await excluirEmpresasEmMassa(prisma(b.banco), { tenantId: "t1", ator, ids: ["e1"] })).toEqual({ erro: esperado.erro });
      expect(b.chamadas).toEqual([]);
      expect(b.transacoes()).toBe(0);
    });
  }
});

describe("empresa", () => {
  it("sem nada ligado, o modo simples exclui de vez e grava o registro na mesma transação", async () => {
    const b = escritorio();
    const r = await excluirEmpresaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "e1", modo: "simples" });
    expect(r).toMatchObject({ ok: true, nome: "TRANSPORTES MODELO LTDA", destino: "/empresas", arquivosNaoApagados: 0 });
    expect(b.transacoes()).toBe(1);

    const apagou = indice(b.chamadas, "company", "deleteMany");
    const registrou = indice(b.chamadas, "auditLog", "create");
    expect(b.chamadas[apagou].args).toEqual({ where: { tenantId: "t1", id: "e1" } });
    expect(registrou).toBeGreaterThan(apagou);
    expect(b.chamadas[registrou].args).toMatchObject({
      data: {
        tenantId: "t1",
        userId: "admin",
        actorName: "Admin Fulano",
        action: "company.delete",
        entityType: "Company",
        entityId: "e1",
        metadata: { nome: "TRANSPORTES MODELO LTDA", documento: "11222333000181", modo: "simples" },
      },
    });
  });

  it("toda escrita fica no escritório e na empresa pedida", async () => {
    const b = escritorio();
    await excluirEmpresaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "e1", modo: "simples" });
    const escritas = b.escritas().filter((c) => c.delegado !== "auditLog");
    expect(escritas.length).toBeGreaterThan(30);
    for (const c of escritas) {
      expect(json(c), `${c.delegado}.${c.metodo}`).toContain('"e1"');
      expect(json(c)).not.toMatch(/"tenantId":"(?!t1")/);
    }
  });

  it("de outro escritório: não encontrada, nada apagado", async () => {
    const b = escritorio();
    const r = await excluirEmpresaDeVez(prisma(b.banco), { tenantId: "t2", ator: ADMIN, id: "e1", modo: "simples" });
    expect(r).toEqual({ ok: false, erro: "Empresa não encontrada." });
    expect(b.chamadas[0]).toMatchObject({ delegado: "company", metodo: "findFirst", args: { where: { id: "e1", tenantId: "t2" } } });
    expect(b.escritas()).toEqual([]);
  });

  it("com histórico, o modo simples é recusado", async () => {
    const b = escritorio({ contagens: { fiscalDocument: 312, vaga: 4 } });
    const previa = await previaDaEmpresa(prisma(b.banco), "t1", "e1");
    expect(previa).toMatchObject({ temHistorico: true, bloqueio: null });
    expect(previa!.itens.map((i) => i.texto)).toEqual(expect.arrayContaining(["312 notas fiscais", "4 vagas"]));

    const r = await excluirEmpresaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "e1", modo: "simples" });
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("histórico") });
    expect(b.escritas()).toEqual([]);
  });

  it("nome digitado errado: recusado, nada apagado", async () => {
    const b = escritorio({ contagens: { fiscalDocument: 3 } });
    const r = await excluirEmpresaDeVez(prisma(b.banco), {
      tenantId: "t1",
      ator: ADMIN,
      id: "e1",
      modo: "completo",
      confirmacao: "TRANSPORTES MODELO",
    });
    expect(r).toEqual({ ok: false, erro: "O nome digitado não confere. Nada foi apagado." });
    expect(b.escritas()).toEqual([]);
  });

  it("com histórico e o nome certo, sai com tudo — e o registro diz o quê", async () => {
    const b = escritorio({ contagens: { fiscalDocument: 3, financeEntry: 21 } });
    const r = await excluirEmpresaDeVez(prisma(b.banco), {
      tenantId: "t1",
      ator: ADMIN,
      id: "e1",
      modo: "completo",
      confirmacao: "transportes modelo ltda",
    });
    expect(r).toMatchObject({ ok: true, resumo: expect.arrayContaining(["3 notas fiscais", "21 lançamentos financeiros"]) });
    expect(indice(b.chamadas, "fiscalDocument", "deleteMany")).toBeGreaterThan(-1);
    const registro = b.chamadas.find((c) => c.delegado === "auditLog" && c.metodo === "create")!;
    expect(registro.args).toMatchObject({ data: { metadata: { modo: "completo", removido: expect.stringContaining("3 notas fiscais") } } });
  });

  it(`mais de ${LIMITE_DE_NOTAS} notas fiscais: não sai por aqui, nem com o nome certo`, async () => {
    const b = escritorio({ contagens: { fiscalDocument: LIMITE_DE_NOTAS + 1 } });
    const previa = await previaDaEmpresa(prisma(b.banco), "t1", "e1");
    expect(previa!.bloqueio).toContain("2.001 notas fiscais");

    const r = await excluirEmpresaDeVez(prisma(b.banco), {
      tenantId: "t1",
      ator: ADMIN,
      id: "e1",
      modo: "completo",
      confirmacao: EMPRESA.name,
    });
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("histórico demais") });
    expect(b.escritas()).toEqual([]);
  });

  it(`exatamente ${LIMITE_DE_NOTAS} notas fiscais ainda saem`, async () => {
    const b = escritorio({ contagens: { fiscalDocument: LIMITE_DE_NOTAS } });
    const r = await excluirEmpresaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "e1", modo: "completo", confirmacao: EMPRESA.name });
    expect(r.ok).toBe(true);
  });

  it("com a caixa marcada, os funcionários saem antes da empresa; o histórico deles pede o nome", async () => {
    const b = escritorio({
      achar: (delegado, metodo, args) =>
        delegado === "person" && metodo === "findMany" && (args.where as { currentCompanyId?: string }).currentCompanyId === "e1"
          ? [{ id: "p1", name: "Ana Souza" }]
          : undefined,
      contar: (delegado, where) => (delegado === "vacation" && JSON.stringify(where).includes("p1") ? 2 : undefined),
    });
    const previa = await previaDaEmpresa(prisma(b.banco), "t1", "e1");
    expect(previa!.temHistorico).toBe(false);
    expect(previa!.opcao).toMatchObject({ trazHistorico: true, itens: [expect.objectContaining({ texto: "2 períodos de férias" })] });

    const simples = await excluirEmpresaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "e1", modo: "simples", incluirFuncionarios: true });
    expect(simples.ok).toBe(false);

    const r = await excluirEmpresaDeVez(prisma(b.banco), {
      tenantId: "t1",
      ator: ADMIN,
      id: "e1",
      modo: "completo",
      confirmacao: EMPRESA.name,
      incluirFuncionarios: true,
    });
    expect(r.ok).toBe(true);
    const pessoas = b.chamadas.findIndex((c) => c.delegado === "person" && c.metodo === "deleteMany");
    expect(b.chamadas[pessoas].args).toEqual({ where: { tenantId: "t1", id: { in: ["p1"] } } });
    expect(pessoas).toBeLessThan(b.chamadas.findIndex((c) => c.delegado === "company" && c.metodo === "deleteMany"));
  });

  it("em massa: sai a sem histórico, fica a com histórico, com o motivo", async () => {
    const b = escritorio({
      achar: (delegado, metodo, args) => {
        const where = args.where as { id?: string; tenantId?: string };
        if (delegado === "company" && metodo === "findFirst" && where.id === "e2" && where.tenantId === "t1") return { ...EMPRESA, id: "e2", name: "COM NOTAS LTDA" };
        return undefined;
      },
      contar: (delegado, where) => (delegado === "fiscalDocument" && (where as { companyId?: string }).companyId === "e2" ? 3 : undefined),
    });
    const r = await excluirEmpresasEmMassa(prisma(b.banco), { tenantId: "t1", ator: ADMIN, ids: ["e1", "e2", "e1", "inexistente"] });
    expect(r).toEqual({
      excluidas: [{ id: "e1", nome: "TRANSPORTES MODELO LTDA" }],
      recusadas: [
        { id: "e2", nome: "COM NOTAS LTDA", motivo: expect.stringContaining("3 notas fiscais") },
        { id: "inexistente", nome: "Empresa", motivo: "não encontrada neste escritório" },
      ],
    });
    // Uma transação por empresa excluída; a com histórico nem abre.
    expect(b.transacoes()).toBe(1);
    expect(b.chamadas.filter((c) => c.delegado === "company" && c.metodo === "deleteMany").map((c) => c.args)).toEqual([
      { where: { tenantId: "t1", id: "e1" } },
    ]);
  });
});

describe("pessoa", () => {
  it("sem nada ligado sai no modo simples, e o registro guarda nome e CPF", async () => {
    const b = escritorio();
    const r = await excluirPessoaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "p1", modo: "simples" });
    expect(r).toMatchObject({ ok: true, nome: "Ana Souza", destino: "/colaboradores-clientes" });
    expect(b.chamadas.find((c) => c.delegado === "person" && c.metodo === "deleteMany")!.args).toEqual({
      where: { tenantId: "t1", id: { in: ["p1"] } },
    });
    expect(b.chamadas.find((c) => c.delegado === "auditLog" && c.metodo === "create")!.args).toMatchObject({
      data: { action: "person.delete", entityType: "Person", entityId: "p1", metadata: { nome: "Ana Souza", cpf: "12345678901" } },
    });
  });

  it("candidato com candidatura: pede o nome, e volta para a lista de candidatos", async () => {
    const b = escritorio({ contagens: { candidatura: 2 }, pessoa: { ...PESSOA, type: "CANDIDATO" } });
    expect(await excluirPessoaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "p1", modo: "simples" })).toMatchObject({ ok: false });
    const r = await excluirPessoaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "p1", modo: "completo", confirmacao: "ana souza" });
    expect(r).toMatchObject({ ok: true, destino: "/candidatos", resumo: ["2 candidaturas"] });
  });

  it("da equipe, com conta de acesso: avisa que a conta continua", async () => {
    const b = escritorio({
      pessoa: { ...PESSOA, isInternal: true, linkedUserId: "u2" },
      achar: (delegado, metodo) => (delegado === "user" && metodo === "findFirst" ? { name: "Bruno Teste", email: "bruno@exemplo.test" } : undefined),
    });
    const previa = await previaDaPessoa(prisma(b.banco), "t1", "p1");
    expect(previa!.avisos[0]).toContain("A conta de acesso de Bruno Teste");
    // Nada na exclusão da pessoa toca no usuário.
    await excluirPessoaDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "p1", modo: "simples" });
    expect(b.escritas().filter((c) => c.delegado === "user")).toEqual([]);
  });

  it("de outro escritório: não encontrada", async () => {
    const b = escritorio();
    expect(await excluirPessoaDeVez(prisma(b.banco), { tenantId: "t2", ator: ADMIN, id: "p1", modo: "simples" })).toEqual({
      ok: false,
      erro: "Pessoa não encontrada.",
    });
    expect(b.escritas()).toEqual([]);
  });
});

describe("usuário", () => {
  it("não exclui a própria conta", async () => {
    const b = escritorio();
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: { id: "u2", role: "ADMIN" }, id: "u2", modo: "simples" });
    expect(r).toEqual({ ok: false, erro: "Você não pode excluir a própria conta." });
    expect(b.escritas()).toEqual([]);
  });

  it("não exclui o último administrador ativo", async () => {
    const b = escritorio({ usuario: { ...USUARIO, role: "ADMIN" }, contagens: { user: 0 } });
    const previa = await previaDoUsuario(prisma(b.banco), "t1", "u2", ADMIN);
    expect(previa!.bloqueio).toContain("última conta de administrador");
    const contou = b.chamadas.find((c) => c.delegado === "user" && c.metodo === "count")!;
    expect(contou.args).toEqual({ where: { tenantId: "t1", id: { not: "u2" }, active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "completo", confirmacao: "Bruno Teste" });
    expect(r.ok).toBe(false);
    expect(b.escritas()).toEqual([]);
  });

  it("com outro administrador ativo, o administrador sai", async () => {
    const b = escritorio({ usuario: { ...USUARIO, role: "ADMIN" }, contagens: { user: 1 } });
    expect((await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "simples" })).ok).toBe(true);
  });

  it("Super Admin só sai pelas mãos de outro Super Admin", async () => {
    const b = escritorio({ usuario: { ...USUARIO, role: "SUPER_ADMIN" }, contagens: { user: 2 } });
    expect(await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "simples" })).toEqual({
      ok: false,
      erro: "Só um Super Admin pode excluir outro Super Admin.",
    });
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: { id: "admin", role: "SUPER_ADMIN" }, id: "u2", modo: "simples" });
    expect(r.ok).toBe(true);
  });

  it("conta com acesso a outros escritórios não sai por aqui", async () => {
    const b = escritorio({ contagens: { userTenantAccess: 1 } });
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "simples" });
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("outros escritórios") });
  });

  it("o que ele criou passa para quem exclui; a conta sai por último; o registro fica com o nome de quem excluiu", async () => {
    const b = escritorio({ contagens: { activity: 3, document: 12, auditLog: 40 } });
    const previa = await previaDoUsuario(prisma(b.banco), "t1", "u2", ADMIN);
    expect(previa).toMatchObject({ temHistorico: true, rotuloDoModoCompleto: "Excluir e passar os registros para mim" });
    expect(previa!.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ texto: "12 documentos anexados", efeito: "reatribuir" }),
        expect.objectContaining({ texto: "40 registros na auditoria (ficam, com o nome dele)", efeito: "desligar" }),
      ])
    );

    expect(await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "simples" })).toMatchObject({ ok: false });
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "completo", confirmacao: "bruno teste" });
    expect(r).toMatchObject({ ok: true, destino: "/admin/usuarios" });

    const passou = (delegado: string) => b.chamadas.find((c) => c.delegado === delegado && c.metodo === "updateMany")!.args;
    expect(passou("activity")).toEqual({ where: { tenantId: "t1", userId: "u2" }, data: { userId: "admin" } });
    expect(passou("document")).toEqual({ where: { tenantId: "t1", uploadedById: "u2" }, data: { uploadedById: "admin" } });
    expect(passou("handoff")).toEqual({ where: { tenantId: "t1", requestedBy: "u2" }, data: { requestedBy: "admin" } });

    const apagouConta = indice(b.chamadas, "user", "deleteMany");
    expect(b.chamadas[apagouConta].args).toEqual({ where: { tenantId: "t1", id: "u2" } });
    expect(indice(b.chamadas, "activity", "updateMany")).toBeLessThan(apagouConta);
    expect(indice(b.chamadas, "refreshToken", "deleteMany")).toBeLessThan(apagouConta);
    // A trilha não é apagada nem reatribuída: o banco anula o vínculo (SetNull).
    expect(b.escritas().filter((c) => c.delegado === "auditLog" && c.metodo !== "create")).toEqual([]);
    expect(b.chamadas.find((c) => c.delegado === "auditLog" && c.metodo === "create")!.args).toMatchObject({
      data: { userId: "admin", actorName: "Admin Fulano", action: "user.delete", entityId: "u2", metadata: { nome: "Bruno Teste", email: "bruno@exemplo.test" } },
    });
  });

  it("a marca do tutorial do primeiro acesso sai com a conta — só a da equipe, antes da conta", async () => {
    const b = escritorio();
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "simples" });
    expect(r.ok).toBe(true);
    const tutorial = indice(b.chamadas, "tutorialVisto", "deleteMany");
    expect(b.chamadas[tutorial].args).toEqual({ where: { subject: "USER", userId: "u2" } });
    expect(tutorial).toBeLessThan(indice(b.chamadas, "user", "deleteMany"));
  });

  it("sem a tabela do tutorial (deploy antes da migration), a exclusão segue", async () => {
    const b = escritorio({
      mexer: (delegado) => {
        if (delegado === "tutorialVisto") throw Object.assign(new Error("tabela não existe"), { code: "P2021" });
        return undefined;
      },
    });
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "simples" });
    expect(r.ok).toBe(true);
    expect(indice(b.chamadas, "user", "deleteMany")).toBeGreaterThan(-1);
  });

  it("a lista de senhas do cofre que ele viu vai para o registro antes das linhas saírem", async () => {
    const vista = { viewedAt: new Date("2026-10-01T12:00:00Z"), credential: { title: "Portal da prefeitura", company: { name: "Cliente X" } } };
    const b = escritorio({
      contagens: { bpoCredentialView: 1 },
      achar: (delegado, metodo) => (delegado === "bpoCredentialView" && metodo === "findMany" ? [vista] : undefined),
    });
    const r = await excluirUsuarioDeVez(prisma(b.banco), { tenantId: "t1", ator: ADMIN, id: "u2", modo: "completo", confirmacao: "Bruno Teste" });
    expect(r.ok).toBe(true);
    expect(b.chamadas.find((c) => c.delegado === "auditLog" && c.metodo === "create")!.args).toMatchObject({
      data: { metadata: { senhasVistas: [{ em: "2026-10-01T12:00:00.000Z", senha: "Portal da prefeitura", empresa: "Cliente X" }] } },
    });
    expect(b.chamadas.find((c) => c.delegado === "bpoCredentialView" && c.metodo === "deleteMany")!.args).toEqual({
      where: { tenantId: "t1", userId: "u2" },
    });
  });
});
