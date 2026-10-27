import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ gerar: vi.fn() }));
vi.mock("./ia-fallback", () => ({ gerarComFallback: m.gerar }));
import { classificar } from "./classificacao";
import { categoriaSchema, dadosRascunhoSchema } from "./regras";
import { categoriasClassificaveis, caminhoDaCategoria, CATALOGO_DE_CHAMADOS } from "./catalogo";
const cat = (id: string, name: string, parentId: string | null = null, active = true) => ({ ...categoriaSchema.parse({ name, parentId, active }), id });
const cats = [cat("d", "Desenvolvimento"), cat("bug", "Bug | Correção", "d"), cat("i", "Infraestrutura"), cat("senha", "Acesso | Senhas", "i"), cat("s", "Suporte"), cat("treino", "Treinamento", "s"), cat("off", "Desativada", "s", false), cat("pending", "A classificar")];
const c = { tenantId: "t", userId: "u", draftId: "d" }, dados = dadosRascunhoSchema.parse({ title: "Esqueci minha senha", description: "Preciso recuperar a senha de acesso ao sistema.", requesterSectorCode: "fiscal" });
beforeEach(() => { vi.clearAllMocks(); m.gerar.mockResolvedValue({ valor: { categoryId: "senha", reason: "Recuperação de senha" }, origem: "principal" }); });
describe("classificação automática", () => {
  it("aceita rascunho sem categoria e usa apenas folhas ativas da lista", async () => {
    expect(dados.categoryId).toBe(""); expect(categoriasClassificaveis(cats).map(c => c.id)).toEqual(["bug", "senha", "treino"]);
    expect(await classificar(c, dados, cats, [])).toMatchObject({ categoryId: "senha", origem: "principal" });
    const p = m.gerar.mock.calls[0][0]; expect(p.schema.properties.categoryId.anyOf[0].enum).toEqual(["bug", "senha", "treino"]);
    expect(JSON.parse(p.texto).categorias[1].caminho).toBe("Infraestrutura › Acesso | Senhas"); expect(p.store).toBe(false);
  });
  it("devolve o título sugerido e o exige no esquema estrito", async () => {
    m.gerar.mockResolvedValue({ valor: { categoryId: "senha", reason: "Senha", title: "Recuperar senha do sistema" }, origem: "principal" });
    expect((await classificar(c, dados, cats, [])).title).toBe("Recuperar senha do sistema");
    expect(m.gerar.mock.calls[0][0].schema.required).toContain("title");
  });
  it.each(["d", "off", "pending", "outro-escritorio", null])("não aceita grupo, categoria inválida, desativada ou incerta: %s", async categoryId => {
    m.gerar.mockResolvedValue({ valor: { categoryId, reason: "Teste" }, origem: "groq" });
    expect((await classificar(c, dados, cats, [])).categoryId).toBeNull();
  });
  it("preserva a origem do fallback e considera respostas do solicitante", async () => {
    m.gerar.mockResolvedValue({ valor: { categoryId: "treino", reason: "Orientação" }, origem: "groq" });
    expect((await classificar(c, dados, cats, [{ role: "user", body: "Preciso de treinamento" }, { role: "assistant", body: "Instrução antiga" }])).origem).toBe("groq");
    expect(m.gerar.mock.calls[0][0].texto).toContain("Preciso de treinamento"); expect(m.gerar.mock.calls[0][0].texto).not.toContain("Instrução antiga");
  });
  it("mantém a abertura possível em falha, resposta inválida ou limite de contexto", async () => {
    m.gerar.mockRejectedValue(new Error("segredo-privado")); expect((await classificar(c, dados, cats, [])).reason).not.toContain("segredo-privado");
    m.gerar.mockResolvedValue({ valor: {} }); expect((await classificar(c, dados, cats, [])).categoryId).toBeNull();
    m.gerar.mockClear(); await classificar(c, dados, cats, [{ role: "user", body: "a".repeat(100001) }]); expect(m.gerar).not.toHaveBeenCalled();
  });
  it("mantém as 24 categorias e os três grupos da referência, com caminho legível", () => {
    expect(Object.keys(CATALOGO_DE_CHAMADOS)).toEqual(["Desenvolvimento", "Infraestrutura", "Suporte"]);
    expect(Object.values(CATALOGO_DE_CHAMADOS).flat()).toHaveLength(24);
    expect(caminhoDaCategoria(cats, "treino")).toBe("Suporte › Treinamento");
    expect(categoriasClassificaveis([cat("pai", "Pai", null, false), cat("filho", "Filho", "pai")])).toEqual([]);
  });
});
