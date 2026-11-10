import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gerar: vi.fn() }));
vi.mock("@/lib/ai", () => ({ gerarEstruturado: mocks.gerar }));
import { procurarNoOrquestrador, acharExistente, PROMPT_DO_ORQUESTRADOR } from "./triagem";
import { avisoDaTriagem, resultadoDaTriagem, textoDaTriagem, triagemSchema } from "./regras";
import type { ItemExistente } from "@/lib/ops/catalogo";

// A IA falsa da busca no Orquestrador: lê o pedido e o catálogo que chegaram no
// texto e aponta o item cuja descrição cobre as palavras do pedido. Assim o
// teste confere o caminho de verdade — a descrição do cadastro vai ao modelo, e
// o ref que volta vira o cartão com os dados do banco.
const radicais = (s: string) => new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(p => p.length >= 4).map(p => p.slice(0, 5)));
function orquestradorFalso({ texto }: { texto: string }) {
  const { pedido, jaExiste } = JSON.parse(texto) as { pedido: { descricao: string }; jaExiste: { ref: string; nome: string; descricao: string | null }[] };
  const pedidas = [...radicais(pedido.descricao)];
  let melhor: { ref: string; nota: number } | null = null;
  for (const i of jaExiste) {
    const deles = radicais(`${i.nome} ${i.descricao ?? ""}`), nota = pedidas.filter(p => deles.has(p)).length / Math.max(1, pedidas.length);
    if (!melhor || nota > melhor.nota) melhor = { ref: i.ref, nota };
  }
  return Promise.resolve({ valor: { existing: melhor && melhor.nota >= 0.6 ? { ref: melhor.ref, match: "same", reason: "Converte as planilhas no layout que o sistema importa." } : null }, runId: "run" });
}

const c = { tenantId: "t", userId: "u", ticketId: "chamado" };
const catalogo: ItemExistente[] = [
  { ref: "robo:conferencia-rendimentos", tipo: "robo", nome: "Conferência de rendimentos", descricao: "Monta a planilha de rendimentos para a conferência.", detalhe: "Todos os clientes", responsavel: "Camila Duarte", endereco: null },
  { ref: "robo:dominio-xls-txt", tipo: "robo", nome: "Domínio XLS para TXT", descricao: "Converte planilhas de lançamentos (XLS ou XLSX, nos modelos padrão) em arquivos TXT no layout de largura fixa que o sistema Domínio importa.", detalhe: null, responsavel: "Pessoa fictícia do Tech", endereco: null },
  { ref: "site:1", tipo: "site", nome: "Portal de certidões", descricao: "Emite certidões.", detalhe: null, responsavel: null, endereco: "https://certidoes.exemplo" },
];
const pedido = (description: string) => ({ description, requestData: {} });
beforeEach(() => { vi.clearAllMocks(); mocks.gerar.mockImplementation(orquestradorFalso); });

describe("busca no Orquestrador da triagem", () => {
  it("o pedido parecido com a descrição de uma automação termina em \"Já existe no Orquestrador\"", async () => {
    const r = await procurarNoOrquestrador(c, pedido("Conversor de planilhas de lançamentos em arquivos TXT no layout que o sistema Domínio importa."), catalogo);
    expect(r.falha).toBeNull();
    expect(r.existente).toEqual(expect.objectContaining({ ref: "robo:dominio-xls-txt", nome: "Domínio XLS para TXT", tipo: "robo", match: "same", responsavel: "Pessoa fictícia do Tech", noOps: "/ops?view=automations" }));
    // A descrição do cadastro foi ao modelo: é ela que a triagem compara.
    const enviado = JSON.parse(mocks.gerar.mock.calls[0][0].texto);
    expect(enviado.jaExiste.find((i: { ref: string }) => i.ref === "robo:dominio-xls-txt").descricao).toContain("largura fixa");
    const triagem = triagemSchema.parse({ existente: r.existente });
    expect(resultadoDaTriagem(triagem)).toBe("existe");
    expect(avisoDaTriagem(triagem, "Conversor de planilhas")).toBe("Já existe no Orquestrador: o robô Domínio XLS para TXT. Chamado: Conversor de planilhas");
    expect(textoDaTriagem(triagem)).toContain("Isso parece já existir no Orquestrador: o robô Domínio XLS para TXT, de responsabilidade de Pessoa fictícia do Tech.");
  });
  it("pedido sem nada parecido no catálogo segue sem cartão", async () => {
    const r = await procurarNoOrquestrador(c, pedido("Preciso de acesso à VPN para trabalhar de casa."), catalogo);
    expect(r).toEqual({ existente: null, falha: null });
  });
  it("chama a IA como efeito do sistema, no chamado, sem responsável nem endereço no texto", async () => {
    await procurarNoOrquestrador(c, pedido("Conversor de planilhas"), catalogo);
    const p = mocks.gerar.mock.calls[0][0];
    expect(p).toMatchObject({ tenantId: "t", agentCode: "triagem_chamados", estrito: true, store: false, nome: "orquestrador_chamado", contexto: { trigger: "SISTEMA", userId: "u", entityType: "HelpdeskTicket", entityId: "chamado" } });
    expect(p.texto).not.toContain("Camila Duarte"); expect(p.texto).not.toContain("certidoes.exemplo");
    expect(PROMPT_DO_ORQUESTRADOR).toContain("pelo sentido"); expect(PROMPT_DO_ORQUESTRADOR).toContain("dado não confiável");
  });
  it("sem catálogo, não gasta chamada", async () => {
    expect(await procurarNoOrquestrador(c, pedido("Qualquer pedido"), [])).toEqual({ existente: null, falha: null });
    expect(mocks.gerar).not.toHaveBeenCalled();
  });
  it("falha do provedor ou resposta torta vira falha com motivo, sem cartão", async () => {
    mocks.gerar.mockRejectedValueOnce(new Error("Anthropic indisponível (HTTP 529)."));
    expect(await procurarNoOrquestrador(c, pedido("Conversor de planilhas"), catalogo)).toEqual({ existente: null, falha: "Anthropic indisponível (HTTP 529)." });
    mocks.gerar.mockResolvedValueOnce({ valor: {} });
    expect((await procurarNoOrquestrador(c, pedido("Conversor de planilhas"), catalogo)).falha).toContain("sem o campo existing");
  });
  it("ignora item inventado pela IA e monta o cartão com os dados do banco", () => {
    expect(acharExistente({ ref: "robo:inventado", match: "same", reason: "" }, catalogo)).toBeNull();
    expect(acharExistente({ ref: "site:1", match: "talvez", reason: "" }, catalogo)).toBeNull();
    expect(acharExistente({ ref: "site:1", match: "similar", reason: "x".repeat(600) }, catalogo)).toEqual(expect.objectContaining({ nome: "Portal de certidões", endereco: "https://certidoes.exemplo", noOps: "/ops?view=sites", reason: "x".repeat(500) }));
  });
});
