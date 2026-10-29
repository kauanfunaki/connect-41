import { describe, expect, it, vi } from "vitest";
import { getModuleDef, getModuleRoute } from "@/lib/module-catalog";
import { alcancaModulo } from "@/lib/auth/modulo";
import type { AuthContext } from "@/lib/auth/context";
import { CONFLITO, MODULO_TECH_INTERNO, itemSchema, lerFiltros, destinoDeVolta, comVolta, diferencas, hojeEmSaoPaulo, comentarioSchema, fraseDaAlteracao, vinculoDoSistema, chaveDoSistema, nomeDoSistema, resumoDoRegistro, SEM_VINCULO } from "./regras";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: vi.fn(), setorDoModulo: vi.fn() }));
const ctx = (override: Partial<AuthContext> = {}) => ({ userId: "u", tenantId: "t", role: "SECTOR_USER", sectors: ["tech"], subscriptionReadOnly: false, ...override }) as AuthContext;
const minimo = { title: "  Corrigir a lista  ", type: "BUG" };

describe("controle interno do Tech", () => {
  it("é exclusivo do Tech, desativado por padrão e tem rota", () => {
    expect(getModuleDef(MODULO_TECH_INTERNO)).toMatchObject({ sectorCode: "tech", fixedSector: true, defaultEnabled: false, group: "Desenvolvimento", menuDireto: true });
    expect(getModuleRoute(MODULO_TECH_INTERNO)).toBe("/tech/controle-interno");
  });
  it.each(["BUG", "IMPROVEMENT", "FEATURE", "TEST", "MIGRATION"])("aceita o tipo %s e campos opcionais vazios", type => {
    expect(itemSchema.parse({ ...minimo, type, assigneeId: "", dueDate: "" })).toMatchObject({ title: "Corrigir a lista", type, priority: 1, status: "PENDING", systemMode: "NONE", assigneeId: null, dueDate: null });
  });
  it.each(["PENDING", "IN_PROGRESS", "VALIDATION", "DONE", "CANCELED"])("aceita a situação %s", status => expect(itemSchema.parse({ ...minimo, status }).status).toBe(status));
  it.each([0, 1, 2, 3])("aceita prioridade %i", priority => expect(itemSchema.parse({ ...minimo, priority: String(priority) }).priority).toBe(priority));
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
    expect(destinoDeVolta("/tech/controle-interno?visao=kanban&tipo=BUG&page=2")).toBe("/tech/controle-interno?visao=kanban&tipo=BUG&page=2");
    expect(destinoDeVolta("/tech/controle-interno")).toBe("/tech/controle-interno");
    for (const ruim of ["https://exemplo.test", "//exemplo.test", "/tech/controle-internox", "/tech/controle-interno?a=1//b", "/tech/controle-interno?\\a", ["/tech/controle-interno?a=1"], undefined]) expect(destinoDeVolta(ruim)).toBe("/tech/controle-interno");
    expect(comVolta("/tech/controle-interno/abc", "/tech/controle-interno")).toBe("/tech/controle-interno/abc");
    expect(comVolta("/tech/controle-interno/abc", "/tech/controle-interno?visao=kanban")).toBe("/tech/controle-interno/abc?voltar=%2Ftech%2Fcontrole-interno%3Fvisao%3Dkanban");
    expect(destinoDeVolta(decodeURIComponent("%2Ftech%2Fcontrole-interno%3Fvisao%3Dkanban"))).toBe("/tech/controle-interno?visao=kanban");
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
  });
  it("resume cada registro do histórico em uma frase e, se preciso, detalhes", () => {
    expect(resumoDoRegistro([{ field: "Título", before: null, after: "Novo" }, { field: "Prazo", before: null, after: null }], 0)).toEqual({ frase: "criou o item", detalhes: ["Título: Novo"] });
    expect(resumoDoRegistro([{ field: "Situação", before: "Pendente", after: "Concluído" }], 3)).toEqual({ frase: "mudou a situação de Pendente para Concluído", detalhes: [] });
    expect(resumoDoRegistro([{ field: "Tipo", before: "Bug", after: "Teste" }, { field: "Prazo", before: null, after: "2026-10-29" }], 2))
      .toEqual({ frase: "alterou o item", detalhes: ["mudou o tipo de Bug para Teste", "definiu o prazo para 29/10/2026"] });
  });
});
