import { describe, expect, it } from "vitest";
import {
  destinoDaRotaAntiga,
  ehSituacaoDoEnvio,
  emailDoDestinatario,
  linhaDaPessoa,
  recusaDoAceite,
  rotaDoArquivoNoPortal,
  rotaDosEnvios,
  situacaoDoEnvio,
  situacaoParaOCliente,
  validarAceite,
} from "./regras";

// Os envios ao cliente (08/10/2026): o "Documentos para cliente" na aba
// "Envios" de Solicitações e no portal. Aqui as regras puras — a situação, a
// linha de destinatário da pessoa do portal, o aceite e as rotas antigas.

const em = (dia: number) => new Date(Date.UTC(2026, 9, dia, 12));
const linha = (campos: Partial<{ email: string; createdAt: Date; sentAt: Date | null; firstViewedAt: Date | null; signedAt: Date | null }>) => ({
  email: "cliente@exemplo.com",
  createdAt: em(1),
  sentAt: null,
  firstViewedAt: null,
  signedAt: null,
  ...campos,
});

describe("situacaoDoEnvio — onde o envio está, para a equipe", () => {
  it("rascunho é rascunho, mesmo que algo estranho tenha prova", () => {
    expect(situacaoDoEnvio({ status: "DRAFT", requiresSignature: true, recipients: [linha({ firstViewedAt: em(2) })] })).toBe("rascunho");
  });

  it("publicado sem ninguém abrir é 'enviado' — tenha saído e-mail ou não (está no portal)", () => {
    expect(situacaoDoEnvio({ status: "PUBLISHED", requiresSignature: false, recipients: [] })).toBe("enviado");
    expect(situacaoDoEnvio({ status: "PUBLISHED", requiresSignature: false, recipients: [linha({ sentAt: em(2) })] })).toBe("enviado");
  });

  it("aberto: 'visto' quando não pede aceite, 'aguardando aceite' quando pede", () => {
    const aberto = [linha({ sentAt: em(2), firstViewedAt: em(3) }), linha({ email: "outro@exemplo.com", sentAt: em(2) })];
    expect(situacaoDoEnvio({ status: "PUBLISHED", requiresSignature: false, recipients: aberto })).toBe("visto");
    expect(situacaoDoEnvio({ status: "PUBLISHED", requiresSignature: true, recipients: aberto })).toBe("aguardando-aceite");
  });

  it("um aceite basta: o aceite é do cliente, não de cada endereço", () => {
    const recipients = [linha({ firstViewedAt: em(3), signedAt: em(3) }), linha({ email: "outro@exemplo.com", sentAt: em(2) })];
    expect(situacaoDoEnvio({ status: "PUBLISHED", requiresSignature: true, recipients })).toBe("aceito");
  });

  it("o filtro só aceita situação que existe", () => {
    expect(ehSituacaoDoEnvio("aguardando-aceite")).toBe(true);
    expect(ehSituacaoDoEnvio("qualquer")).toBe(false);
    expect(ehSituacaoDoEnvio(undefined)).toBe(false);
  });
});

describe("linhaDaPessoa — a pessoa do portal como destinatária", () => {
  it("acha a linha que o e-mail da equipe criou, sem diferença de maiúscula nem espaço", () => {
    const daEquipe = linha({ email: "Fulana@Cliente.com.br ", sentAt: em(2) });
    expect(linhaDaPessoa([linha({ email: "outra@cliente.com.br" }), daEquipe], "fulana@cliente.com.br")).toBe(daEquipe);
  });

  it("sem linha com o e-mail dela, devolve null — a primeira abertura cria a linha", () => {
    expect(linhaDaPessoa([linha({ email: "outra@cliente.com.br" })], "fulana@cliente.com.br")).toBeNull();
    expect(linhaDaPessoa([], "fulana@cliente.com.br")).toBeNull();
  });

  it("com duas linhas do mesmo e-mail, vale sempre a mesma: a do aceite, depois a aberta, depois a mais antiga", () => {
    const antiga = linha({ createdAt: em(1) });
    const aberta = linha({ createdAt: em(2), firstViewedAt: em(2) });
    const aceita = linha({ createdAt: em(3), firstViewedAt: em(3), signedAt: em(3) });
    expect(linhaDaPessoa([antiga, aberta, aceita], "cliente@exemplo.com")).toBe(aceita);
    expect(linhaDaPessoa([antiga, aberta], "cliente@exemplo.com")).toBe(aberta);
    expect(linhaDaPessoa([linha({ createdAt: em(5) }), antiga], "cliente@exemplo.com")).toBe(antiga);
  });

  it("o e-mail é guardado em minúsculas e sem espaço", () => {
    expect(emailDoDestinatario("  Fulana@Cliente.COM ")).toBe("fulana@cliente.com");
  });
});

describe("situacaoParaOCliente — o que o portal mostra a cada pessoa", () => {
  it("'novo' é de cada pessoa: a abertura de outra não conta", () => {
    const recipients = [linha({ email: "outra@cliente.com", firstViewedAt: em(2) })];
    expect(situacaoParaOCliente({ requiresSignature: false, recipients }, "cliente@exemplo.com")).toEqual({ novo: true, aceite: null });
    expect(situacaoParaOCliente({ requiresSignature: false, recipients }, "OUTRA@cliente.com")).toEqual({ novo: false, aceite: null });
  });

  it("o aceite é do cliente: aceito por qualquer pessoa, sai do 'aguardando' para todas", () => {
    expect(situacaoParaOCliente({ requiresSignature: true, recipients: [] }, "cliente@exemplo.com").aceite).toBe("pendente");
    const recipients = [linha({ email: "socio@cliente.com", firstViewedAt: em(2), signedAt: em(2) })];
    expect(situacaoParaOCliente({ requiresSignature: true, recipients }, "cliente@exemplo.com")).toEqual({ novo: true, aceite: "feito" });
  });
});

describe("validarAceite e recusaDoAceite — a mesma regra no link do e-mail e no portal", () => {
  it("pede o nome completo (3 letras ou mais) e a marca de que leu e concorda", () => {
    expect(validarAceite({ nome: " Jo ", consentimento: "true" })).toEqual({ ok: false, erro: "Informe seu nome completo para assinar." });
    expect(validarAceite({ nome: null, consentimento: "true" })).toMatchObject({ ok: false });
    expect(validarAceite({ nome: "Fulana de Tal", consentimento: "false" })).toEqual({ ok: false, erro: "É preciso marcar o aceite para assinar." });
    expect(validarAceite({ nome: "Fulana de Tal", consentimento: null })).toMatchObject({ ok: false });
  });

  it("aceita o formulário (texto) e o booleano, sem espaço nas pontas e no tamanho da coluna", () => {
    expect(validarAceite({ nome: "  Fulana de Tal  ", consentimento: "true" })).toEqual({ ok: true, nome: "Fulana de Tal" });
    expect(validarAceite({ nome: "Fulana", consentimento: true })).toEqual({ ok: true, nome: "Fulana" });
    const longo = validarAceite({ nome: "x".repeat(300), consentimento: true });
    expect(longo.ok && longo.nome.length).toBe(180);
  });

  it("rascunho e documento sem aceite não aceitam; aceite dado não se repete", () => {
    expect(recusaDoAceite({ status: "DRAFT", requiresSignature: true }, false)).toBe("indisponivel");
    expect(recusaDoAceite({ status: "PUBLISHED", requiresSignature: false }, false)).toBe("indisponivel");
    expect(recusaDoAceite({ status: "PUBLISHED", requiresSignature: true }, true)).toBe("ja-aceito");
    expect(recusaDoAceite({ status: "PUBLISHED", requiresSignature: true }, false)).toBeNull();
  });
});

describe("rotas — os endereços antigos da ficha da empresa", () => {
  it("a lista vai para a aba Envios filtrada na empresa", () => {
    expect(destinoDaRotaAntiga("emp-1")).toBe("/solicitacoes/envios?empresa=emp-1");
  });

  it("o novo vai para o novo envio com a empresa escolhida", () => {
    expect(destinoDaRotaAntiga("emp-1", { tela: "novo" })).toBe("/solicitacoes/envios/novo?empresa=emp-1");
  });

  it("o documento e a edição vão para as telas novas, pelo id do documento", () => {
    expect(destinoDaRotaAntiga("emp-1", { docId: "doc-9" })).toBe("/solicitacoes/envios/doc-9");
    expect(destinoDaRotaAntiga("emp-1", { docId: "doc-9", tela: "editar" })).toBe("/solicitacoes/envios/doc-9/editar");
  });

  it("o que vem da URL é codificado, e sem empresa a lista fica sem filtro", () => {
    expect(rotaDosEnvios("a b&c")).toBe("/solicitacoes/envios?empresa=a%20b%26c");
    expect(rotaDosEnvios()).toBe("/solicitacoes/envios");
    expect(rotaDoArquivoNoPortal("doc/1")).toBe("/portal/envios/doc%2F1/arquivo");
  });
});
