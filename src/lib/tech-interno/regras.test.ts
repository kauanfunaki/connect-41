import { describe, expect, it, vi } from "vitest";
import { getModuleDef, getModuleRoute } from "@/lib/module-catalog";
import { alcancaModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { CONFLITO, MODULO_TECH_INTERNO, itemSchema, lerFiltros, destinoDeVolta, idCurtoDoItem, enderecoDoItem, lerIdCurto, ehUuid, diferencas, hojeEmSaoPaulo, comentarioSchema, fraseDaAlteracao, vinculoDoSistema, chaveDoSistema, nomeDoSistema, diaDoRegistro, horaDoRegistro, SEM_VINCULO, entregaSchema } from "./regras";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: vi.fn(), setorDoModulo: vi.fn() }));
const ctx = (override: Partial<AuthContext> = {}) => ({ userId: "u", tenantId: "t", role: "SECTOR_USER", sectors: ["tech"], subscriptionReadOnly: false, ...override }) as AuthContext;
const minimo = { title: "  Corrigir a lista  ", type: "BUG" };

describe("controle interno do Tech", () => {
  it("é exclusivo do Tech, desativado por padrão e tem rota", () => {
    expect(getModuleDef(MODULO_TECH_INTERNO)).toMatchObject({ sectorCode: "tech", fixedSector: true, defaultEnabled: false, group: "Desenvolvimento", menuDireto: true });
    expect(getModuleRoute(MODULO_TECH_INTERNO)).toBe("/controle-interno");
  });
  it.each(["BUG", "IMPROVEMENT", "FEATURE", "TEST", "MIGRATION"])("aceita o tipo %s e campos opcionais vazios", type => {
    expect(itemSchema.parse({ ...minimo, type, assigneeId: "", dueDate: "" })).toMatchObject({ title: "Corrigir a lista", type, priority: 1, status: "PENDING", systemMode: "NONE", assigneeId: null, dueDate: null });
  });
  it.each(["PENDING", "IN_PROGRESS", "VALIDATION", "DONE", "CANCELED"])("aceita a situação %s", status => expect(itemSchema.parse({ ...minimo, status }).status).toBe(status));
  it.each([0, 1, 2, 3])("aceita prioridade %i", priority => expect(itemSchema.parse({ ...minimo, priority: String(priority) }).priority).toBe(priority));
  it("o critério de aceite é opcional, separado da descrição, e vazio vira null", () => {
    expect(itemSchema.parse(minimo).acceptanceCriteria).toBeNull();
    expect(itemSchema.parse({ ...minimo, acceptanceCriteria: "  " }).acceptanceCriteria).toBeNull();
    expect(itemSchema.parse({ ...minimo, description: "Contexto.", acceptanceCriteria: " Mudança: x " })).toMatchObject({ description: "Contexto.", acceptanceCriteria: "Mudança: x" });
    expect(itemSchema.safeParse({ ...minimo, acceptanceCriteria: "x".repeat(10001) }).success).toBe(false);
  });
  it("diferencia sem sistema, novo sistema e sistema do Ops Center", () => {
    expect(itemSchema.parse({ ...minimo, systemMode: "NEW" }).systemKey).toBeNull();
    expect(itemSchema.parse({ ...minimo, systemMode: "EXISTING", systemKey: "site:id" }).systemKey).toBe("site:id");
    expect(itemSchema.safeParse({ ...minimo, systemMode: "EXISTING" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...minimo, systemMode: "EXISTING", systemKey: "id" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...minimo, systemMode: "NEW", systemKey: "app:id" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...minimo, systemMode: "NONE", systemKey: "app:id" }).success).toBe(false);
  });
  it("a chave do sistema aponta para robô, site, app ou o cadastro anterior", () => {
    expect(vinculoDoSistema("robo:importa-xml")).toEqual({ ...SEM_VINCULO, opsWatcherSlug: "importa-xml" });
    expect(vinculoDoSistema("site:s1")).toEqual({ ...SEM_VINCULO, opsSiteId: "s1" });
    expect(vinculoDoSistema("app:a1")).toEqual({ ...SEM_VINCULO, opsAppId: "a1" });
    expect(vinculoDoSistema("tool:t1")).toEqual({ ...SEM_VINCULO, toolId: "t1" });
    for (const invalida of ["", "outro:x", "site:", null, undefined]) expect(vinculoDoSistema(invalida)).toBeNull();
    for (const chave of ["robo:importa-xml", "site:s1", "app:a1", "tool:t1"]) expect(chaveDoSistema(vinculoDoSistema(chave)!)).toBe(chave);
    expect(chaveDoSistema(SEM_VINCULO)).toBeNull();
  });
  it("mostra o nome do sistema e marca o inativo quando pedido", () => {
    expect(nomeDoSistema({ systemMode: "NONE" })).toBe("Sem sistema");
    expect(nomeDoSistema({ systemMode: "NEW" })).toBe("Novo sistema");
    expect(nomeDoSistema({ systemMode: "EXISTING", opsSite: { name: "Portal", isActive: false } }, true)).toBe("Portal (inativo)");
    expect(nomeDoSistema({ systemMode: "EXISTING", opsSite: { name: "Portal", isActive: false } })).toBe("Portal");
    expect(nomeDoSistema({ systemMode: "EXISTING", tool: { name: "Antigo", active: true } })).toBe("Antigo");
    expect(nomeDoSistema({ systemMode: "EXISTING" })).toBe("Sistema indisponível");
  });
  it.each([{ title: " " }, { title: "x".repeat(201) }, { description: "x".repeat(10001) }, { type: "OTHER" }, { priority: 4 }, { status: "OTHER" }, { dueDate: "2026-02-30" }, { dueDate: "2026-10-21T00:00:00Z" }])("recusa campos inválidos %j", override => expect(itemSchema.safeParse({ ...minimo, ...override }).success).toBe(false));
  it("comentários e nomes são validados e normalizados", () => {
    expect(comentarioSchema.parse("  Conferido  ")).toBe("Conferido");
    expect(comentarioSchema.safeParse(" ").success).toBe(false);
    expect(comentarioSchema.safeParse("x".repeat(5001)).success).toBe(false);
  });
  it("normaliza filtros combinados e impede paginações inválidas", () => {
    expect(lerFiltros({ q: "  lista  ", tipo: "TEST", situacao: "ALL", prioridade: "0", sistema: "NEW", responsavel: "me", atrasados: "1", page: "2" })).toMatchObject({ q: "lista", type: "TEST", status: "ALL", priority: "0", system: "NEW", assignee: "me", overdue: true, page: 2 });
    expect(lerFiltros({ page: "-1", situacao: "INVALID", prioridade: "URGENT" })).toMatchObject({ page: 1, status: undefined, priority: undefined });
    expect(lerFiltros({ q: ["a", "b"], page: "Infinity" })).toMatchObject({ q: "", page: 1 });
  });
  it("volta só para a própria lista, com o recorte de origem", () => {
    expect(destinoDeVolta("/controle-interno?visao=kanban&tipo=BUG&page=2")).toBe("/controle-interno?visao=kanban&tipo=BUG&page=2");
    expect(destinoDeVolta("/controle-interno")).toBe("/controle-interno");
    for (const ruim of ["https://exemplo.test", "//exemplo.test", "/tech/controle-internox", "/controle-interno?a=1//b", "/controle-interno?\\a", ["/controle-interno?a=1"], undefined]) expect(destinoDeVolta(ruim)).toBe("/controle-interno");
    expect(destinoDeVolta(decodeURIComponent("%2Fcontrole-interno%3Fvisao%3Dkanban"))).toBe("/controle-interno?visao=kanban");
    // O Histórico é uma das visões da lista (10/11/2026): o item aberto de lá volta para lá.
    expect(destinoDeVolta("/controle-interno/historico")).toBe("/controle-interno/historico");
    expect(destinoDeVolta("/controle-interno/historico?q=busca&page=2")).toBe("/controle-interno/historico?q=busca&page=2");
    for (const ruim of ["/controle-interno/bug-1", "/controle-interno/novo", "/controle-interno/historicox", "/controle-interno/historico/x"]) expect(destinoDeVolta(ruim)).toBe("/controle-interno");
  });
  it("o endereço curto do item: prefixo do tipo de agora e o número do escritório", () => {
    expect(idCurtoDoItem({ type: "BUG", number: 123 })).toBe("bug-123");
    expect(enderecoDoItem({ type: "IMPROVEMENT", number: 45 })).toBe("/controle-interno/melhoria-45");
    expect([["FEATURE", "funcionalidade"], ["TEST", "teste"], ["MIGRATION", "migracao"]].map(([type, prefixo]) => [idCurtoDoItem({ type: type as "FEATURE", number: 1 }), prefixo])).toEqual([["funcionalidade-1", "funcionalidade"], ["teste-1", "teste"], ["migracao-1", "migracao"]]);
  });
  it("lê o id curto de volta, sem diferença de maiúsculas, e recusa o resto", () => {
    expect(lerIdCurto("bug-123")).toEqual({ tipo: "BUG", numero: 123 });
    expect(lerIdCurto(" Melhoria-45 ")).toEqual({ tipo: "IMPROVEMENT", numero: 45 });
    expect(lerIdCurto("migracao-2147483647")).toEqual({ tipo: "MIGRATION", numero: 2147483647 });
    for (const ruim of ["bug-0", "bug-012", "bug-", "bug-1.5", "bug--1", "tarefa-3", "bug-2147483648", "bug-99999999999", "bug_3", "/controle-interno/bug-3", "11111111-2222-4333-8444-555555555555"]) expect(lerIdCurto(ruim), ruim).toBeNull();
    expect(ehUuid("11111111-2222-4333-8444-555555555555")).toBe(true);
    expect(ehUuid("bug-1")).toBe(false);
  });
  it("registra só campos alterados e preserva valor anterior", () => {
    expect(diferencas({ Prazo: null, Título: "Antes" }, { Prazo: null, Título: "Depois" })).toEqual([{ field: "Título", before: "Antes", after: "Depois" }]);
    expect(diferencas(null, { Título: "Novo" })).toEqual([{ field: "Título", before: null, after: "Novo" }]);
    expect(CONFLITO).toContain("outra pessoa");
  });
  it("data de atraso segue São Paulo, sem depender do fuso do servidor", () => expect(hojeEmSaoPaulo(new Date("2026-10-21T01:00:00Z"))).toBe("2026-10-20"));
  it("Tech opera, outro setor não vê e gestor mantém sistemas", () => {
    expect(alcancaModulo(ctx(), "tech", true, "agir")).toBe(true);
    expect(alcancaModulo(ctx({ sectors: ["fiscal"] }), "tech", true, "ver")).toBe(false);
    expect(alcancaModulo(ctx(), "tech", true, "gerir")).toBe(false);
    expect(alcancaModulo(ctx({ role: "SECTOR_ADMIN" }), "tech", true, "gerir")).toBe(true);
  });
  it("administradores têm acesso e somente leitura apenas consulta", () => {
    for (const role of ["ADMIN", "SUPER_ADMIN"] as const) expect(alcancaModulo(ctx({ role, sectors: [] }), "tech", true, "gerir")).toBe(true);
    expect(alcancaModulo(ctx({ role: "READONLY", sectors: [] }), "tech", true, "ver")).toBe(true);
    expect(alcancaModulo(ctx({ role: "READONLY" }), "tech", true, "agir")).toBe(false);
    expect(alcancaModulo(ctx({ subscriptionReadOnly: true }), "tech", true, "agir")).toBe(false);
    expect(alcancaModulo(ctx({ role: "ADMIN" }), "tech", false, "ver")).toBe(false);
  });
  it("o histórico descreve cada alteração em frase", () => {
    expect(fraseDaAlteracao({ field: "Situação", before: "Pendente", after: "Em andamento" })).toBe("mudou a situação de Pendente para Em andamento");
    expect(fraseDaAlteracao({ field: "Responsável", before: null, after: "Ana" })).toBe("definiu o responsável: Ana");
    expect(fraseDaAlteracao({ field: "Responsável", before: "Ana", after: null })).toBe("removeu o responsável (Ana)");
    expect(fraseDaAlteracao({ field: "Responsável", before: "Ana", after: "Bruno" })).toBe("trocou o responsável de Ana para Bruno");
    expect(fraseDaAlteracao({ field: "Prazo", before: "2026-10-01", after: "2026-10-26" })).toBe("mudou o prazo de 01/10/2026 para 26/10/2026");
    expect(fraseDaAlteracao({ field: "Descrição", before: "a", after: "b" })).toBe("editou a descrição");
    expect(fraseDaAlteracao({ field: "Vínculo do responsável", before: "id-1", after: "id-2" })).not.toContain("id-");
    expect(fraseDaAlteracao({ field: "Prioridade", before: null, after: "Alta" }, true)).toBe("Prioridade: Alta");
    // O critério de aceite (10/11/2026) conta em frase, como a descrição.
    expect(fraseDaAlteracao({ field: "Critério de aceite", before: null, after: "Mudança: x" })).toBe("adicionou o critério de aceite");
    expect(fraseDaAlteracao({ field: "Critério de aceite", before: "a", after: "b" })).toBe("editou o critério de aceite");
    expect(fraseDaAlteracao({ field: "Critério de aceite", before: "a", after: null })).toBe("removeu o critério de aceite");
    expect(fraseDaAlteracao({ field: "Critério de aceite", before: null, after: "a" }, true)).toBe("Critério de aceite: preenchido");
  });
  it("agrupa o histórico por dia em São Paulo: hoje, ontem e o dia por extenso", () => {
    const agora = new Date("2026-10-29T15:00:00Z");
    expect(diaDoRegistro(new Date("2026-10-29T13:34:00Z"), agora)).toEqual({ chave: "2026-10-29", rotulo: "Hoje" });
    // 01h UTC do dia 29 ainda é dia 28 em São Paulo.
    expect(diaDoRegistro(new Date("2026-10-29T01:00:00Z"), agora)).toEqual({ chave: "2026-10-28", rotulo: "Ontem" });
    expect(diaDoRegistro(new Date("2026-10-27T15:00:00Z"), agora).rotulo).toBe("Terça-feira, 27 de outubro");
    expect(diaDoRegistro(new Date("2025-12-31T15:00:00Z"), agora).rotulo).toBe("Quarta-feira, 31 de dezembro de 2025");
    expect(horaDoRegistro(new Date("2026-10-29T16:34:00Z"))).toBe("13:34");
  });
});

describe("PR e commit da entrega (06/11/2026)", () => {
  it("aceita o endereço do PR e o hash do commit, e recusa o que não é", () => {
    expect(entregaSchema.safeParse({ prUrl: "https://github.com/o/r/pull/1", commitSha: "a1B2c3d" }).success).toBe(true);
    expect(entregaSchema.safeParse({ prUrl: "", commitSha: "" }).data).toEqual({ prUrl: null, commitSha: null });
    expect(entregaSchema.safeParse({ prUrl: "github.com/o/r/pull/1" }).success).toBe(false);
    expect(entregaSchema.safeParse({ commitSha: "xyz" }).success).toBe(false);
  });
  it("conta no histórico em frase", () => {
    expect(fraseDaAlteracao({ field: "PR", before: null, after: "https://x/pull/1" })).toBe("informou o PR: https://x/pull/1");
    expect(fraseDaAlteracao({ field: "Commit", before: "abc1234", after: null })).toBe("removeu o Commit (abc1234)");
  });
});
