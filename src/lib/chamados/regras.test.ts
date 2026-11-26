import { describe, expect, it } from "vitest";
import { categoriaSchema, dadosSchema, dadosRascunhoSchema, validarFormulario, parecerSchema, tituloDaDescricao, ehTituloProvisorio, triagemSchema, textoDaTriagem, avisoDaTriagem, resultadoDaTriagem, intervaloDaTriagem, SITUACOES_MANUAIS, STATUS, ROTULOS, emTriagem, situacoesPermitidas, situacoesDoSeletor } from "./regras";
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
describe("abertura sem título", () => {
  it("aceita rascunho sem título e tira um título curto da descrição", () => {
    expect(dadosRascunhoSchema.parse({ description: "Pedido", requesterSectorCode: "fiscal" }).title).toBe("");
    expect(tituloDaDescricao("\n  Automatizar   a conferência de extratos\nRequisitos: ...")).toBe("Automatizar a conferência de extratos");
    const longo = tituloDaDescricao("palavra ".repeat(30));
    expect(longo.length).toBeLessThanOrEqual(81); expect(longo.endsWith("…")).toBe(true); expect(longo).not.toContain("palavra …");
    expect(tituloDaDescricao("ok")).toBe("Chamado: ok");
  });
  it("o título provisório pula o cumprimento do começo do pedido (bug-701)", () => {
    const pedido = "Olá, bom dia!\nTemos o certificado digital A3 do Marcos, porém ao tentar utilizar, não foi possível.\nObrigada!";
    expect(tituloDaDescricao(pedido)).toBe("Temos o certificado digital A3 do Marcos, porém ao tentar utilizar, não foi…");
    expect(tituloDaDescricao("Oi, pessoal, tudo bem? preciso de acesso à VPN")).toBe("Preciso de acesso à VPN");
    expect(tituloDaDescricao("Boa tarde")).toBe("Boa tarde");
    // Palavra que só começa igual a um cumprimento fica.
    expect(tituloDaDescricao("Timesheet não abre")).toBe("Timesheet não abre");
    expect(tituloDaDescricao("Oitava parcela veio errada")).toBe("Oitava parcela veio errada");
    // O título gravado antes da mudança ("Olá, bom dia!") continua sendo provisório para a IA trocar.
    expect(ehTituloProvisorio("Olá, bom dia!", pedido)).toBe(true);
    expect(ehTituloProvisorio(tituloDaDescricao(pedido), pedido)).toBe(true);
    expect(ehTituloProvisorio("Certificado A3 do Marcos", pedido)).toBe(false);
  });
  it("a categoria confirmada por quem abriu e a deixada para a equipe têm frase própria (funcionalidade-702)", () => {
    const confirmada = triagemSchema.parse({ categoria: "Suporte › Treinamento", confirmadaPorQuemAbriu: true });
    expect(textoDaTriagem(confirmada)).toBe("Quem abriu confirmou a categoria Suporte › Treinamento. Ele está com a equipe.");
    expect(avisoDaTriagem(confirmada, "Treinar a equipe")).toBe("Triagem concluída, chamado classificado em Suporte › Treinamento: Treinar a equipe");
    const deixada = triagemSchema.parse({ semCategoria: "solicitante" });
    expect(textoDaTriagem(deixada)).toBe("Quem abriu deixou a classificação para a equipe.");
    expect(avisoDaTriagem(deixada, "Pedido")).toBe("Triagem concluída; a equipe vai classificar o chamado: Pedido");
    // Evento gravado antes da mudança: sem o campo, a categoria é da triagem.
    expect(textoDaTriagem(triagemSchema.parse({ categoria: "Suporte › Treinamento" }))).toContain("A triagem automática classificou");
  });
  it("com item do Orquestrador e sem categoria, a frase diz por que não classificou (bug-701)", () => {
    const existente = { ref: "app:x", tipo: "app" as const, nome: "App fictício", responsavel: null, endereco: null, noOps: null, detalhe: null, match: "similar" as const, reason: "" };
    expect(textoDaTriagem(triagemSchema.parse({ existente, semCategoria: "falha" }))).toContain("A triagem automática falhou");
    expect(textoDaTriagem(triagemSchema.parse({ existente, semCategoria: "incerto" }))).toContain("não identificou a categoria");
    expect(textoDaTriagem(triagemSchema.parse({ existente, categoria: "Suporte › Treinamento" }))).toContain("classificado em Suporte › Treinamento");
  });
  it("lê o parecer antigo, com pergunta em texto, para os chamados da conversa com a IA", () => {
    const p = parecerSchema.parse({ status: "needs_information", summary: "Faltam dados.", questions: ["Qual sistema?"], attachments: [] });
    expect(p.questions[0]).toEqual({ text: "Qual sistema?", options: [] });
  });
});
describe("triagem depois do envio", () => {
  it("Aguardando triagem é situação da triagem, não da equipe", () => {
    expect(STATUS).toContain("AGUARDANDO_TRIAGEM"); expect(ROTULOS.AGUARDANDO_TRIAGEM).toBe("Aguardando triagem");
    expect(SITUACOES_MANUAIS).not.toContain("AGUARDANDO_TRIAGEM"); expect(SITUACOES_MANUAIS).toHaveLength(STATUS.length - 1);
    expect(emTriagem("AGUARDANDO_TRIAGEM")).toBe(true); expect(emTriagem("ABERTO")).toBe(false);
  });
  it("separa falha de falta de contexto na frase e no aviso", () => {
    const falha = triagemSchema.parse({ semCategoria: "falha" }), incerto = triagemSchema.parse({ semCategoria: "incerto" });
    expect(textoDaTriagem(falha)).toContain("falhou"); expect(textoDaTriagem(falha)).not.toContain("contexto");
    expect(textoDaTriagem(incerto)).toContain("não identificou a categoria"); expect(textoDaTriagem(incerto)).not.toContain("falhou");
    expect(avisoDaTriagem(falha, "Pedido")).toBe("A triagem automática falhou; a equipe vai classificar: Pedido");
    expect(avisoDaTriagem(incerto, "Pedido")).toBe("A triagem não identificou a categoria; a equipe vai classificar: Pedido");
    expect(resultadoDaTriagem(falha)).toBe("a_classificar");
  });
  it("classificado e já existente: um resultado por aviso, o que já existe primeiro", () => {
    const classificado = triagemSchema.parse({ categoria: "Desenvolvimento › Nova Automação" });
    expect(resultadoDaTriagem(classificado)).toBe("classificado");
    expect(avisoDaTriagem(classificado, "Pedido")).toBe("Triagem concluída, chamado classificado em Desenvolvimento › Nova Automação: Pedido");
    const existente = { ref: "robo:x", tipo: "robo" as const, nome: "Robô fictício", responsavel: null, endereco: null, noOps: null, detalhe: null, match: "similar" as const, reason: "" };
    const ambos = triagemSchema.parse({ categoria: "Desenvolvimento › Nova Automação", existente });
    expect(resultadoDaTriagem(ambos)).toBe("existe"); expect(avisoDaTriagem(ambos, "Pedido")).toBe("Pode já existir no Orquestrador: o robô Robô fictício. Chamado: Pedido");
  });
  it("confere de 3 em 3 segundos no primeiro minuto e depois de 15 em 15", () => {
    expect(intervaloDaTriagem(0)).toBe(3000); expect(intervaloDaTriagem(59_999)).toBe(3000); expect(intervaloDaTriagem(60_000)).toBe(15000);
  });
});
describe("trocas de situação oferecidas na tela (melhoria-782)", () => {
  const sem = "NOT_REQUIRED";
  it("a equipe vê todas as situações manuais menos a atual e Aguardando aprovação", () => {
    expect(situacoesPermitidas({ status: "EM_ANDAMENTO", approvalStatus: sem }, "equipe")).toEqual(["ABERTO", "NA_FILA", "AGUARDANDO_USUARIO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"]);
    expect(situacoesPermitidas({ status: "ABERTO", approvalStatus: "APPROVED" }, "equipe")).toEqual(["NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"]);
    expect(situacoesPermitidas({ status: "STANDBY", approvalStatus: "REJECTED" }, "equipe")).not.toContain("AGUARDANDO_APROVACAO");
  });
  it("com aprovação pendente, só cancelar (e Aguardando aprovação se ainda não estiver nela)", () => {
    expect(situacoesPermitidas({ status: "AGUARDANDO_APROVACAO", approvalStatus: "PENDING" }, "equipe")).toEqual(["CANCELADO"]);
    expect(situacoesPermitidas({ status: "ABERTO", approvalStatus: "PENDING" }, "equipe")).toEqual(["AGUARDANDO_APROVACAO", "CANCELADO"]);
  });
  it("Aguardando aprovação sem aprovação pendente pode ir para qualquer outra, menos ela mesma", () => {
    expect(situacoesPermitidas({ status: "AGUARDANDO_APROVACAO", approvalStatus: "APPROVED" }, "equipe")).toEqual(["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"]);
  });
  it("nada muda durante a triagem, depois de encerrado ou para quem pediu", () => {
    expect(situacoesPermitidas({ status: "AGUARDANDO_TRIAGEM", approvalStatus: sem }, "equipe")).toEqual([]);
    expect(situacoesPermitidas({ status: "RESOLVIDO", approvalStatus: sem }, "equipe")).toEqual([]);
    expect(situacoesPermitidas({ status: "CANCELADO", approvalStatus: sem }, "equipe")).toEqual([]);
    for (const status of STATUS) for (const approvalStatus of [sem, "PENDING", "APPROVED"]) expect(situacoesPermitidas({ status, approvalStatus }, "solicitante")).toEqual([]);
  });
  it("nunca oferece Aguardando triagem nem a situação atual", () => {
    for (const status of STATUS) for (const approvalStatus of [sem, "PENDING"]) {
      const lista = situacoesPermitidas({ status, approvalStatus }, "equipe");
      expect(lista).not.toContain("AGUARDANDO_TRIAGEM"); expect(lista).not.toContain(status);
    }
  });
  it("o seletor junta Aguardando usuário e Aguardando requerente numa opção só", () => {
    expect(situacoesDoSeletor({ status: "EM_ANDAMENTO", approvalStatus: sem }, "equipe")).toEqual(["ABERTO", "NA_FILA", "AGUARDANDO_USUARIO", "STANDBY", "RESOLVIDO", "CANCELADO"]);
    expect(situacoesDoSeletor({ status: "AGUARDANDO_REQUERENTE", approvalStatus: sem }, "equipe")).toEqual(["ABERTO", "NA_FILA", "EM_ANDAMENTO", "STANDBY", "RESOLVIDO", "CANCELADO"]);
    expect(situacoesDoSeletor({ status: "AGUARDANDO_USUARIO", approvalStatus: sem }, "equipe")).not.toContain("AGUARDANDO_REQUERENTE");
    expect(situacoesDoSeletor({ status: "AGUARDANDO_APROVACAO", approvalStatus: "PENDING" }, "equipe")).toEqual(["CANCELADO"]);
    expect(situacoesDoSeletor({ status: "EM_ANDAMENTO", approvalStatus: sem }, "solicitante")).toEqual([]);
  });
});

describe("busca pelo número do chamado (bug-819)", () => {
  it("lê o id curto do cartão, o #45 e o número sozinho", async () => {
    const { numeroDaBusca } = await import("./regras");
    // A sigla de três letras (melhoria-818) e o id curto antigo, por extenso.
    expect(numeroDaBusca("CHA-45")).toBe(45);
    expect(numeroDaBusca(" cha-45 ")).toBe(45);
    expect(numeroDaBusca("chamado-45")).toBe(45);
    expect(numeroDaBusca(" Chamado-45 ")).toBe(45);
    expect(numeroDaBusca("#45")).toBe(45);
    expect(numeroDaBusca("45")).toBe(45);
  });

  it("texto, zero à esquerda e número grande demais não são número de chamado", async () => {
    const { numeroDaBusca } = await import("./regras");
    expect(numeroDaBusca("impressora")).toBeNull();
    expect(numeroDaBusca("chamado 45")).toBeNull();
    expect(numeroDaBusca("pro-45")).toBeNull();
    expect(numeroDaBusca("CHA-0")).toBeNull();
    expect(numeroDaBusca("045")).toBeNull();
    expect(numeroDaBusca("0")).toBeNull();
    expect(numeroDaBusca("99999999999")).toBeNull();
  });
});
