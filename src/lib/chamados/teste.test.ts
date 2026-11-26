import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { podeResponder } from "./acesso";
import { pausado, situacoesPermitidas, SITUACOES_MANUAIS, ROTULOS } from "./regras";
import { EFEITO_DO_RETORNO, atalhosDoTeste, avisoDoTeste, descreverEventoDoTeste, diaDoPrazo, erroDoPrazo, esperaDecisao, estadoDoTeste, fimDoDia, podeConduzirTeste, podePedirTeste, podeResponderTeste, retornoDoTesteSchema, rotuloDoTeste, ultimoRetorno } from "./teste";

// O período de teste da entrega (26/11/2026, funcionalidade-853).
const sem = "NOT_REQUIRED";
describe("período de teste: quem pede, prorroga e conclui", () => {
  it("só quem atende pede o teste, com o chamado em atendimento", () => {
    expect(podePedirTeste({ status: "EM_ANDAMENTO", approvalStatus: sem }, "equipe")).toBe(true);
    expect(podePedirTeste({ status: "AGUARDANDO_USUARIO", approvalStatus: "APPROVED" }, "equipe")).toBe(true);
    expect(podePedirTeste({ status: "EM_ANDAMENTO", approvalStatus: sem }, "solicitante")).toBe(false);
  });
  it("não pede teste encerrado, em triagem, já em teste ou com aprovação pendente", () => {
    for (const status of ["RESOLVIDO", "CANCELADO", "AGUARDANDO_TRIAGEM", "EM_TESTE"]) expect(podePedirTeste({ status, approvalStatus: sem }, "equipe")).toBe(false);
    expect(podePedirTeste({ status: "AGUARDANDO_APROVACAO", approvalStatus: "PENDING" }, "equipe")).toBe(false);
  });
  it("prorrogar e concluir: só quem atende, com o chamado em teste", () => {
    expect(podeConduzirTeste({ status: "EM_TESTE" }, "equipe")).toBe(true);
    expect(podeConduzirTeste({ status: "EM_TESTE" }, "solicitante")).toBe(false);
    expect(podeConduzirTeste({ status: "EM_ANDAMENTO" }, "equipe")).toBe(false);
  });
});

describe("período de teste: quem responde", () => {
  const chamado = { status: "EM_TESTE", createdById: "quem-abriu" };
  const pessoa = { userId: "quem-abriu", role: "SECTOR_USER" as const, somenteLeitura: false };
  it("quem abriu e o administrador do escritório respondem", () => {
    expect(podeResponderTeste(pessoa, chamado)).toBe(true);
    expect(podeResponderTeste({ ...pessoa, userId: "outra", role: "ADMIN" }, chamado)).toBe(true);
    expect(podeResponderTeste({ ...pessoa, userId: "outra", role: "SUPER_ADMIN" }, chamado)).toBe(true);
  });
  it("o gestor do setor, quem atende e o acesso de leitura não respondem", () => {
    expect(podeResponderTeste({ ...pessoa, userId: "gestor", role: "SECTOR_ADMIN" }, chamado)).toBe(false);
    expect(podeResponderTeste({ ...pessoa, userId: "atendente" }, chamado)).toBe(false);
    expect(podeResponderTeste({ ...pessoa, role: "READONLY" }, chamado)).toBe(false);
    expect(podeResponderTeste({ ...pessoa, somenteLeitura: true }, chamado)).toBe(false);
  });
  it("fora do teste ninguém responde", () => {
    expect(podeResponderTeste(pessoa, { ...chamado, status: "EM_ANDAMENTO" })).toBe(false);
    expect(podeResponderTeste({ ...pessoa, role: "ADMIN" }, { ...chamado, status: "RESOLVIDO" })).toBe(false);
  });
  it("em teste, quem pediu também conversa (a caixa de mensagem fica aberta)", () => {
    const ctx: AuthContext = { userId: "u", tenantId: "t", homeTenantId: "t", role: "SECTOR_USER", sectors: ["fiscal"], activeSector: "fiscal", subscriptionReadOnly: false, canSelfRegularizeSubscription: false };
    const config = { enabled: true, sectorCode: "tech", sectorCodes: ["tech"] };
    const alvo = { tenantId: "t", createdById: "u", requesterSectorCode: "fiscal", handlingSectorCode: "tech", participants: [], approverIds: [] };
    expect(podeResponder(ctx, config, alvo, "EM_TESTE", false)).toBe(true);
    expect(podeResponder(ctx, config, alvo, "EM_TESTE", true)).toBe(false);
  });
});

describe("período de teste: os retornos", () => {
  it("só “Deu tudo certo” dispensa o texto", () => {
    expect(retornoDoTesteSchema.safeParse({ retorno: "ok" }).success).toBe(true);
    const problema = retornoDoTesteSchema.safeParse({ retorno: "problema", texto: "" });
    expect(problema.success).toBe(false);
    expect(problema.error?.issues[0]?.message).toBe("Descreva o problema que encontrou.");
    expect(retornoDoTesteSchema.safeParse({ retorno: "nao_testou", texto: "ok" }).success).toBe(false);
    expect(retornoDoTesteSchema.safeParse({ retorno: "outro", texto: "Testei só uma parte." }).success).toBe(true);
    expect(retornoDoTesteSchema.safeParse({ retorno: "talvez", texto: "Testei só uma parte." }).success).toBe(false);
  });
  it("deu certo conclui, problema volta ao atendimento, o resto espera quem atende", () => {
    expect(EFEITO_DO_RETORNO).toEqual({ ok: "RESOLVIDO", problema: "EM_ANDAMENTO", nao_testou: null, outro: null });
    expect(esperaDecisao("nao_testou")).toBe(true); expect(esperaDecisao("outro")).toBe(true);
    expect(esperaDecisao("ok")).toBe(false); expect(esperaDecisao(null)).toBe(false);
  });
  it("o último retorno vale só até a próxima prorrogação", () => {
    const ev = (data: unknown, createdAt: string) => ({ type: "teste", data, actorId: "quem-abriu", createdAt });
    const retorno = ev({ acao: "retorno", retorno: "nao_testou", texto: "Estava sem acesso." }, "2026-11-28T12:00:00Z");
    const pedido = ev({ acao: "pedido", ate: "2026-12-01" }, "2026-11-26T12:00:00Z");
    // Do mais novo para o mais antigo, como a tela recebe.
    expect(ultimoRetorno([retorno, pedido])).toMatchObject({ retorno: "nao_testou", texto: "Estava sem acesso." });
    expect(ultimoRetorno([ev({ acao: "prorrogado", ate: "2026-12-05" }, "2026-11-29T12:00:00Z"), retorno, pedido])).toBeNull();
    expect(ultimoRetorno([{ type: "comment", data: {}, actorId: "x", createdAt: "2026-11-29T12:00:00Z" }, pedido])).toBeNull();
  });
});

describe("período de teste: o prazo", () => {
  it("os atalhos contam dias úteis a partir de amanhã, pulando fim de semana e feriado", () => {
    // Quinta, 26/11/2026.
    expect(atalhosDoTeste("2026-11-26", new Set())).toEqual([{ dias: 3, ate: "2026-12-01" }, { dias: 5, ate: "2026-12-03" }, { dias: 10, ate: "2026-12-10" }]);
    expect(atalhosDoTeste("2026-11-26", new Set(["2026-11-27"]))[0]).toEqual({ dias: 3, ate: "2026-12-02" });
  });
  it("aceita de hoje até 90 dias à frente", () => {
    expect(erroDoPrazo("2026-11-26", "2026-11-26")).toBeNull();
    expect(erroDoPrazo("2026-11-25", "2026-11-26")).toBe("O prazo do teste não pode ficar no passado.");
    expect(erroDoPrazo("2027-02-24", "2026-11-26")).toBeNull();
    expect(erroDoPrazo("2027-02-25", "2026-11-26")).toContain("90 dias");
    expect(erroDoPrazo("26/11/2026", "2026-11-26")).toBe("Escolha a data do prazo.");
  });
  it("o teste vale até o fim do dia escolhido, em Brasília", () => {
    expect(fimDoDia("2026-12-01").toISOString()).toBe("2026-12-02T02:59:59.999Z");
    expect(diaDoPrazo(fimDoDia("2026-12-01"))).toBe("2026-12-01");
  });
  it("vencido não conclui: só muda o selo", () => {
    const chamado = { status: "EM_TESTE", testDueAt: fimDoDia("2026-12-01") };
    expect(estadoDoTeste(chamado, new Date("2026-12-01T20:00:00Z"))).toBe("em_teste");
    expect(estadoDoTeste(chamado, new Date("2026-12-02T03:00:00Z"))).toBe("vencido");
    expect(rotuloDoTeste(chamado, new Date("2026-12-01T20:00:00Z"))).toBe("Em teste até 01/12");
    expect(rotuloDoTeste(chamado, new Date("2026-12-02T03:00:00Z"))).toBe("Teste vencido em 01/12");
    expect(estadoDoTeste({ ...chamado, status: "RESOLVIDO" }, new Date("2026-12-05T00:00:00Z"))).toBeNull();
  });
});

describe("período de teste: a situação", () => {
  it("“Em teste” pausa o prazo de atendimento e não se escolhe no seletor", () => {
    expect(ROTULOS.EM_TESTE).toBe("Em teste");
    expect(pausado("EM_TESTE")).toBe(true);
    expect(SITUACOES_MANUAIS).not.toContain("EM_TESTE");
    for (const status of ["EM_ANDAMENTO", "ABERTO", "STANDBY"]) expect(situacoesPermitidas({ status, approvalStatus: sem }, "equipe")).not.toContain("EM_TESTE");
  });
  it("do teste, a equipe pode levar o chamado para as outras situações", () => {
    expect(situacoesPermitidas({ status: "EM_TESTE", approvalStatus: sem }, "equipe")).toEqual(["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"]);
  });
});

describe("período de teste: o histórico e os avisos", () => {
  it("cada passo vira uma frase da linha do tempo", () => {
    expect(descreverEventoDoTeste({ acao: "pedido", ate: "2026-12-01", oQueTestar: "Gerar a guia." }, "Ana")).toEqual({ texto: "Ana entregou e pediu teste até 01/12", detalhe: "O que testar: Gerar a guia." });
    expect(descreverEventoDoTeste({ acao: "prorrogado", ate: "2026-12-05", antes: "2026-12-01" }, "Ana").texto).toBe("Ana prorrogou o teste até 05/12");
    expect(descreverEventoDoTeste({ acao: "retorno", retorno: "ok" }, "Bruno").texto).toBe("Bruno testou: deu tudo certo, e o chamado foi concluído");
    expect(descreverEventoDoTeste({ acao: "retorno", retorno: "problema", texto: "Valor errado." }, "Bruno")).toEqual({ texto: "Bruno testou e encontrou um problema; o chamado voltou para o atendimento", detalhe: "Valor errado." });
    expect(descreverEventoDoTeste({ acao: "concluido", retorno: null }, "Ana").texto).toBe("Ana concluiu o chamado sem retorno do teste");
    expect(descreverEventoDoTeste({ acao: "concluido", retorno: "nao_testou" }, "Ana").texto).toBe("Ana concluiu o chamado depois do retorno “Não consegui testar”");
    expect(descreverEventoDoTeste({ acao: "vencido", ate: "2026-12-01" }, "O Connect").texto).toBe("O prazo do teste (01/12) venceu sem retorno");
    expect(descreverEventoDoTeste({ acao: "desconhecida" }, "Ana").texto).toBe("Ana atualizou o teste da entrega");
  });
  it("quem abriu recebe o aviso da vez dele; a equipe, o resumo", () => {
    expect(avisoDoTeste({ acao: "pedido", ate: "2026-12-01" }, "Guia", true)).toEqual({ mensagem: "Teste a entrega até 01/12 e conte como foi: Guia", tipo: "CHAMADO_TESTE" });
    expect(avisoDoTeste({ acao: "pedido", ate: "2026-12-01" }, "Guia", false)).toEqual({ mensagem: "Em teste até 01/12: Guia", tipo: "CHAMADO_ATUALIZADO" });
    expect(avisoDoTeste({ acao: "vencido", ate: "2026-12-01" }, "Guia", true)?.tipo).toBe("CHAMADO_TESTE_VENCIDO");
    expect(avisoDoTeste({ acao: "vencido", ate: "2026-12-01" }, "Guia", false)?.mensagem).toBe("Teste vencido sem retorno: Guia");
    expect(avisoDoTeste({ acao: "retorno", retorno: "nao_testou", texto: "Sem acesso." }, "Guia", false)?.mensagem).toBe("Retorno do teste, não consegui testar: Guia");
    expect(avisoDoTeste({ acao: "concluido", retorno: null }, "Guia", true)?.mensagem).toBe("Chamado concluído sem retorno do teste: Guia");
    // O teste encerrado por outra troca de situação é só histórico: quem avisa é o evento "status".
    expect(avisoDoTeste({ acao: "encerrado", para: "EM_ANDAMENTO" }, "Guia", true)).toBeNull();
  });
});
