import { describe, expect, it } from "vitest";
import { categoriaSchema, dadosSchema, dadosRascunhoSchema, validarFormulario, parecerSchema, tituloDaDescricao, perguntaAtual } from "./regras";
import { minutosUteisEntre, somarMinutosUteis } from "./sla";

const dados = dadosSchema.parse({ title: "Acesso ao sistema", description: "Preciso de acesso ao sistema de atendimento para trabalhar.", categoryId: "cat", requesterSectorCode: "fiscal" });
describe("formulários do helpdesk", () => {
  it("valida campos obrigatórios, opções, números, e-mails e anexos independentemente da IA", () => {
    const c = categoriaSchema.parse({ name: "Acesso", formSchema: [{ key: "email", label: "E-mail", type: "email", required: true }, { key: "perfil", label: "Perfil", type: "select", options: ["Leitura"] }, { key: "quantidade", label: "Quantidade", type: "number", rules: { min: 1, max: 5 } }], requiredAttachments: [{ key: "print", label: "Print", required: true, mime: ["image/*"] }] });
    expect(() => validarFormulario(dados, c, [])).toThrow("E-mail");
    expect(() => validarFormulario({ ...dados, requestData: { email: "invalido" } }, c, [])).toThrow("E-mail inválido");
    expect(() => validarFormulario({ ...dados, requestData: { email: "teste@example.test", perfil: "Admin" } }, c, [])).toThrow("Opção inválida");
    expect(() => validarFormulario({ ...dados, requestData: { email: "teste@example.test", quantidade: "10" } }, c, [])).toThrow("Número inválido");
    expect(() => validarFormulario({ ...dados, requestData: { email: "teste@example.test" } }, c, [])).toThrow("Print");
    expect(() => validarFormulario({ ...dados, requestData: { email: "teste@example.test" } }, c, [{ attachmentKey: "print", mimeType: "application/pdf" }])).toThrow("Formato incompatível");
    expect(() => validarFormulario({ ...dados, requestData: { email: "teste@example.test", perfil: "Leitura", quantidade: "2" } }, c, [{ attachmentKey: "print", mimeType: "image/png" }])).not.toThrow();
  });
  it("recusa chaves repetidas e categoria desativada", () => {
    expect(categoriaSchema.safeParse({ name: "x", checklistTemplate: [{ key: "a", label: "1" }, { key: "a", label: "2" }] }).success).toBe(false);
    expect(() => validarFormulario(dados, categoriaSchema.parse({ name: "x", active: false }), [])).toThrow("desativada");
  });
  it("não aceita parecer suficiente com perguntas nem pendência sem perguntas", () => {
    expect(parecerSchema.safeParse({ status: "sufficient", summary: "OK", questions: ["Qual sistema?"], attachments: [] }).success).toBe(false);
    expect(parecerSchema.safeParse({ status: "needs_information", summary: "Falta sistema", questions: [], attachments: [] }).success).toBe(false);
  });
});
describe("SLA do Hub em Brasília", () => {
  it("atravessa sexta e fim de semana com o expediente correto", () => {
    expect(somarMinutosUteis(new Date("2026-10-16T16:30:00-03:00"), 60).toISOString()).toBe("2026-10-19T11:30:00.000Z");
  });
  it("ignora períodos fora do expediente e conta pausas em minutos úteis", () => {
    expect(somarMinutosUteis(new Date("2026-10-17T14:00:00-03:00"), 60).toISOString()).toBe("2026-10-19T12:00:00.000Z");
    expect(minutosUteisEntre(new Date("2026-10-16T16:30:00-03:00"), new Date("2026-10-19T08:30:00-03:00"))).toBe(60);
    expect(minutosUteisEntre(new Date("2026-10-19T09:00:00-03:00"), new Date("2026-10-19T07:00:00-03:00"))).toBe(0);
    expect(() => somarMinutosUteis(new Date(), Infinity)).toThrow("inválido");
  });
  it("usa America/Sao_Paulo também quando o offset histórico era diferente", () => {
    const inicio = new Date("2018-12-03T10:00:00.000Z");
    expect(somarMinutosUteis(inicio, 60).toISOString()).toBe("2018-12-03T11:00:00.000Z");
    expect(minutosUteisEntre(inicio, new Date("2018-12-03T11:00:00.000Z"))).toBe(60);
    expect(somarMinutosUteis(new Date("2018-11-02T19:30:00.000Z"), 60).toISOString()).toBe("2018-11-05T10:30:00.000Z");
  });
});
describe("abertura sem título e perguntas uma por vez", () => {
  it("aceita rascunho sem título e tira um título curto da descrição", () => {
    expect(dadosRascunhoSchema.parse({ description: "Pedido", requesterSectorCode: "fiscal" }).title).toBe("");
    expect(tituloDaDescricao("\n  Automatizar   a conferência de extratos\nRequisitos: ...")).toBe("Automatizar a conferência de extratos");
    const longo = tituloDaDescricao("palavra ".repeat(30));
    expect(longo.length).toBeLessThanOrEqual(81); expect(longo.endsWith("…")).toBe(true); expect(longo).not.toContain("palavra …");
    expect(tituloDaDescricao("ok")).toBe("Chamado: ok");
  });
  it("acha a pergunta em aberto pela última mensagem do assistente", () => {
    const p = parecerSchema.parse({ status: "needs_information", summary: "Faltam dados.", questions: ["Qual sistema?", "Desde quando?", "Quem é afetado?"], attachments: [] });
    expect(perguntaAtual(p, [{ role: "assistant", body: "Faltam dados.\n\nQual sistema?" }])).toEqual({ indice: 0, total: 3 });
    expect(perguntaAtual(p, [{ role: "assistant", body: "Faltam dados.\n\nQual sistema?" }, { role: "user", body: "ERP" }, { role: "assistant", body: "Desde quando?" }])).toEqual({ indice: 1, total: 3 });
    expect(perguntaAtual(p, [{ role: "user", body: "Sem pergunta ainda" }])).toBeNull();
    expect(p.questions[0]).toEqual({ text: "Qual sistema?", options: [] });
    expect(perguntaAtual({ ...p, status: "sufficient", questions: [] }, [{ role: "assistant", body: "Qual sistema?" }])).toBeNull();
  });
});
