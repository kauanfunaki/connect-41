import { describe, expect, it } from "vitest";
import { empresaNosDetalhes, fatosDoRegistro, idsCitados, mudancasDoRegistro, nomeNosDetalhes, registroCompleto, valorLegivel } from "./metadados";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("de → para, nas formas que o código grava", () => {
  it("{ de, para } simples: nome da pasta", () => {
    expect(mudancasDoRegistro("drive.folder_rename", { de: "Contratos 2025", para: "Contratos" })).toEqual([
      { campo: "Nome", de: "Contratos 2025", para: "Contratos" },
    ]);
  });

  it("situação em código vira palavra, com acento", () => {
    expect(mudancasDoRegistro("fiscal.document.destination", { de: "PENDENTE", para: "LANCADO", motivo: null })).toEqual([
      { campo: "Destino", de: "Pendente", para: "Lançado" },
    ]);
    expect(mudancasDoRegistro("solicitacao.concluir", { numero: 12, de: "AGUARDANDO_CLIENTE", para: "CONCLUIDA" })).toEqual([
      { campo: "Situação", de: "Aguardando cliente", para: "Concluída" },
    ]);
    expect(mudancasDoRegistro("autorizacoes.salvar", { documento: "123", de: "PENDING_VALIDATION", para: "ACTIVE" })[0]).toMatchObject({
      de: "Aguardando validação",
      para: "Ativa",
    });
  });

  it("id vira nome pelo mapa; id que sumiu diz que não existe mais; vazio é null", () => {
    const nomes = new Map([[ID_A, "Pasta Fiscal"]]);
    expect(mudancasDoRegistro("drive.folder_move", { de: ID_A, para: ID_B }, nomes)).toEqual([
      { campo: "Pasta", de: "Pasta Fiscal", para: "(não existe mais)" },
    ]);
    expect(mudancasDoRegistro("finance.cost_center_set", { de: null, para: ID_A, emLote: false }, nomes)).toEqual([
      { campo: "Centro de custo", de: null, para: "Pasta Fiscal" },
    ]);
  });

  it("setor por código vira o nome do setor", () => {
    const nomes = new Map([["dp", "DP"], ["fiscal", "Fiscal"]]);
    expect(mudancasDoRegistro("solicitacao.encaminhada", { numero: 3, de: "dp", para: "fiscal" }, nomes)).toEqual([
      { campo: "Setor", de: "DP", para: "Fiscal" },
    ]);
  });

  it("{ antes, depois } do documento fiscal: só o que mudou, formatado", () => {
    const m = mudancasDoRegistro("fiscal.document.edit", {
      antes: { companyId: ID_A, number: "4512", series: "1", amount: "100.5", issuedAt: "2026-10-01T03:00:00.000Z", competence: "2026-09" },
      depois: { companyId: ID_A, number: "4513", series: "1", amount: "200", issuedAt: "2026-10-02T03:00:00.000Z", competence: "2026-10" },
    });
    expect(m).toEqual([
      { campo: "Número", de: "4512", para: "4513" },
      { campo: "Valor", de: "R$\u00a0100,50", para: "R$\u00a0200,00" },
      { campo: "Emissão", de: "01/10/2026", para: "02/10/2026" },
      { campo: "Competência", de: "09/2026", para: "10/2026" },
    ]);
  });

  it("{ de: {…}, para: {…} } da pasta do modelo, e o de nulo de quem recebe as autorizações", () => {
    expect(mudancasDoRegistro("drive.template_update", { de: { nome: "Fiscal", setor: "fiscal" }, para: { nome: "Fiscal", setor: "dp" } })).toEqual([
      { campo: "Setor", de: "fiscal", para: "dp" },
    ]);
    expect(mudancasDoRegistro("autorizacoes.quem_recebe", { de: null, para: { name: "41 Contábil", cnpj: "31052957000105" } })).toEqual([
      { campo: "Nome", de: null, para: "41 Contábil" },
      { campo: "CNPJ", de: null, para: "31052957000105" },
    ]);
  });

  it("acesso ao portal: cliente e nome que trocaram", () => {
    expect(
      mudancasDoRegistro("portal.user.reassigned", {
        email: "a@b.com",
        nomeAnterior: "Ana",
        nome: "Ana Souza",
        deCliente: { id: ID_A, nome: "Grupo A" },
        paraCliente: { id: ID_B, nome: "Grupo B" },
      })
    ).toEqual([
      { campo: "Cliente", de: "Grupo A", para: "Grupo B" },
      { campo: "Nome", de: "Ana", para: "Ana Souza" },
    ]);
    expect(
      mudancasDoRegistro("portal.user.updated", {
        antes: { nome: "Ana", email: "a@b.com", cliente: { id: ID_A, nome: "Grupo A" } },
        depois: { nome: "Ana", email: "ana@b.com", cliente: { id: ID_A, nome: "Grupo A" } },
      })
    ).toEqual([{ campo: "E-mail", de: "a@b.com", para: "ana@b.com" }]);
  });

  it("campo que guardou a própria mudança (centro padrão do fornecedor)", () => {
    const nomes = new Map([[ID_A, "Administrativo"], [ID_B, "Obras"]]);
    expect(mudancasDoRegistro("financeiro.counterparty.updated", { ativo: true, centroPadrao: { de: ID_A, para: ID_B } }, nomes)).toEqual([
      { campo: "Centro de custo padrão", de: "Administrativo", para: "Obras" },
    ]);
  });

  it("edição do plano: cada campo guardou a mudança em texto (\"de → para\")", () => {
    expect(mudancasDoRegistro("subscription_plan.update", { name: "Básico → Essencial", basePrice: "100.00 → 120.00", setupFee: "0.00 → 0.00" })).toEqual([
      { campo: "Nome", de: "Básico", para: "Essencial" },
      { campo: "Valor", de: "R$\u00a0100,00", para: "R$\u00a0120,00" },
    ]);
    expect(nomeNosDetalhes({ name: "Básico → Essencial" })).toBe("Essencial");
  });

  it("sem mudança guardada, nada — inclusive o 'de' sozinho da varredura da IA", () => {
    expect(mudancasDoRegistro("company.update", { name: "Padaria" })).toEqual([]);
    expect(mudancasDoRegistro("societario.ia.varredura_aplicada", { itens: 3, de: 5, processosSubiram: 1 })).toEqual([]);
    expect(mudancasDoRegistro("lead.situacao", { de: "NOVO", para: "NOVO" })).toEqual([]);
    expect(mudancasDoRegistro("x", null)).toEqual([]);
    expect(mudancasDoRegistro("x", "texto")).toEqual([]);
  });
});

describe("valores e fatos curtos", () => {
  it("formata sim/não, papel, dinheiro e números", () => {
    expect(valorLegivel(true)).toBe("Sim");
    expect(valorLegivel("SECTOR_USER", "role")).toBe("Colaborador");
    expect(valorLegivel("1234.5", "valor")).toBe("R$\u00a01.234,50");
    expect(valorLegivel(1500)).toBe("1.500");
    expect(valorLegivel("")).toBeNull();
  });

  it("até três fatos da linha, sem repetir o que já está na frase", () => {
    expect(fatosDoRegistro({ motivo: "lançamento duplicado", fiscalDocumentId: ID_A })).toEqual([{ rotulo: "motivo", valor: "lançamento duplicado" }]);
    expect(fatosDoRegistro({ tela: "DRE", endereco: "/portal/dre" }, new Map(), "tela")).toEqual([]);
    expect(fatosDoRegistro({ name: "Pedro", email: "p@x.com", role: "SECTOR_USER" })).toEqual([
      { rotulo: "e-mail", valor: "p@x.com" },
      { rotulo: "papel", valor: "Colaborador" },
    ]);
  });

  it("nome e empresa guardados nos detalhes", () => {
    expect(nomeNosDetalhes({ title: "Banco X" })).toBe("Banco X");
    expect(nomeNosDetalhes({ company: "Padaria", x: 1 }, "company")).toBe("Padaria");
    expect(nomeNosDetalhes({ antes: { nome: "A" }, depois: { nome: "B" } })).toBe("B");
    expect(nomeNosDetalhes({ total: 3 })).toBeNull();
    expect(empresaNosDetalhes({ companyId: ID_A })).toBe(ID_A);
    expect(empresaNosDetalhes({})).toBeNull();
  });

  it("ids citados, para virar nome", () => {
    expect(idsCitados({ de: ID_A, para: { id: ID_B }, outro: "texto" }).sort()).toEqual([ID_A, ID_B].sort());
  });

  it("registro completo achatado, listas grandes viram contagem", () => {
    expect(registroCompleto({ nome: "Ana", contagens: { Person: 1 }, ids: [1, 2], empresas: [{ id: 1 }, { id: 2 }], vazio: null })).toEqual([
      { chave: "nome", valor: "Ana" },
      { chave: "contagens.Person", valor: "1" },
      { chave: "ids", valor: "1, 2" },
      { chave: "empresas", valor: "2 itens" },
    ]);
  });
});
