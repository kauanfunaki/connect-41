import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ gerar: vi.fn() }));
vi.mock("@/lib/ai", () => ({ gerarEstruturado: m.gerar }));
import { classificar } from "./classificacao";
import { categoriaSchema, dadosSchema } from "./regras";
import { categoriasClassificaveis, caminhoDaCategoria, CATALOGO_DE_CHAMADOS } from "./catalogo";
const cat = (id: string, name: string, parentId: string | null = null, active = true) => ({ ...categoriaSchema.parse({ name, parentId, active }), id });
const cats = [cat("d", "Desenvolvimento"), cat("bug", "Bug | Correção", "d"), cat("i", "Infraestrutura"), cat("senha", "Acesso | Senhas", "i"), cat("s", "Suporte"), cat("treino", "Treinamento", "s"), cat("off", "Desativada", "s", false), cat("pending", "A classificar")];
const c = { tenantId: "t", userId: "u", ticketId: "chamado" }, dados = dadosSchema.parse({ title: "Esqueci minha senha", description: "Preciso recuperar a senha de acesso ao sistema.", categoryId: "pending", requesterSectorCode: "fiscal" });
beforeEach(() => { vi.clearAllMocks(); m.gerar.mockResolvedValue({ valor: { categoryId: "senha", reason: "Recuperação de senha" }, origem: "principal" }); });
describe("classificação automática", () => {
  it("usa apenas folhas ativas da lista e registra a chamada no chamado, como efeito do sistema", async () => {
    expect(categoriasClassificaveis(cats).map(c => c.id)).toEqual(["bug", "senha", "treino"]);
    expect(await classificar(c, dados, cats)).toMatchObject({ categoryId: "senha", origem: "principal", falha: null });
    const p = m.gerar.mock.calls[0][0]; expect(p.schema.properties.categoryId.anyOf[0].enum).toEqual(["bug", "senha", "treino"]);
    expect(JSON.parse(p.texto).categorias[1].caminho).toBe("Infraestrutura › Acesso | Senhas"); expect(p.store).toBe(false);
    expect(p.contexto).toEqual({ trigger: "SISTEMA", userId: "u", entityType: "HelpdeskTicket", entityId: "chamado" });
  });
  it("devolve o título sugerido e o exige no esquema estrito", async () => {
    m.gerar.mockResolvedValue({ valor: { categoryId: "senha", reason: "Senha", title: "Recuperar senha do sistema" }, origem: "principal" });
    expect((await classificar(c, dados, cats)).title).toBe("Recuperar senha do sistema");
    expect(m.gerar.mock.calls[0][0].schema.required).toContain("title");
  });
  it("devolve as tags sugeridas, limpas e sem repetição", async () => {
    m.gerar.mockResolvedValue({ valor: { categoryId: "senha", reason: "Senha", title: "Recuperar senha", tags: [" Senha ", "senha", "", "ERP", "a".repeat(61), "vpn", "e-mail", "acesso", "extra"] }, origem: "principal" });
    expect((await classificar(c, dados, cats)).tags).toEqual(["senha", "erp", "vpn", "e-mail", "acesso"]);
    expect(m.gerar.mock.calls[0][0].schema.required).toContain("tags");
    m.gerar.mockRejectedValue(new Error("fora")); expect((await classificar(c, dados, cats)).tags).toEqual([]);
  });
  it.each(["d", "off", "pending", "outro-escritorio"])("não aceita grupo, categoria inválida ou desativada, e conta como falha: %s", async categoryId => {
    m.gerar.mockResolvedValue({ valor: { categoryId, reason: "Teste" } });
    expect(await classificar(c, dados, cats)).toMatchObject({ categoryId: null, falha: "A IA devolveu uma categoria fora da lista." });
  });
  it("separa a falta de contexto da falha: a IA respondeu sem categoria", async () => {
    m.gerar.mockResolvedValue({ valor: { categoryId: null, reason: "Não dá para saber se é ajuste ou sistema novo.", title: "Conversor de planilhas", tags: ["planilhas"] } });
    expect(await classificar(c, dados, cats)).toEqual({ categoryId: null, reason: "Não dá para saber se é ajuste ou sistema novo.", title: "Conversor de planilhas", tags: ["planilhas"], origem: "principal", falha: null });
  });
  it("em falha do provedor, guarda o motivo para o log e nunca o põe na justificativa", async () => {
    m.gerar.mockRejectedValue(new Error("OpenAI indisponível (HTTP 429).")); const r = await classificar(c, dados, cats);
    expect(r).toMatchObject({ categoryId: null, reason: "", origem: null, falha: "OpenAI indisponível (HTTP 429)." });
    m.gerar.mockRejectedValue(new SyntaxError('Unexpected token "conteúdo do chamado"')); expect((await classificar(c, dados, cats)).falha).toBe("resposta da IA fora do formato JSON");
    m.gerar.mockResolvedValue({ valor: {} }); expect(await classificar(c, dados, cats)).toMatchObject({ categoryId: null, falha: "resposta da IA fora do esquema esperado" });
  });
  it("sem categorias ativas, falha sem chamar a IA", async () => {
    expect((await classificar(c, dados, [cat("pending", "A classificar")])).falha).toContain("Sem categorias");
    expect(m.gerar).not.toHaveBeenCalled();
  });
  it("mantém as 24 categorias e os três grupos da referência, com caminho legível", () => {
    expect(Object.keys(CATALOGO_DE_CHAMADOS)).toEqual(["Desenvolvimento", "Infraestrutura", "Suporte"]);
    expect(Object.values(CATALOGO_DE_CHAMADOS).flat()).toHaveLength(24);
    expect(caminhoDaCategoria(cats, "treino")).toBe("Suporte › Treinamento");
    expect(categoriasClassificaveis([cat("pai", "Pai", null, false), cat("filho", "Filho", "pai")])).toEqual([]);
  });
});
