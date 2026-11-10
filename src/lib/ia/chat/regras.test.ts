import { describe, it, expect } from "vitest";
import {
  publicoPermite,
  inicioDoDiaEmSaoPaulo,
  corteDaRetencao,
  tituloDaConversa,
  contextoDaTela,
  textoDoPasso,
  lerPropostas,
  descreverProposta,
  chamadoDaProposta,
  detalhesDaProposta,
  rotulosDaDecisao,
  rotulosDoCriado,
} from "./regras";
import { normalizarHistorico, MAX_TURNOS_DO_HISTORICO } from "@/lib/ia/laco";

describe("publicoPermite", () => {
  it("no piloto, só coordenadores e administradores", () => {
    expect(publicoPermite("SECTOR_ADMIN", "COORDENADORES")).toBe(true);
    expect(publicoPermite("ADMIN", "COORDENADORES")).toBe(true);
    expect(publicoPermite("SUPER_ADMIN", "COORDENADORES")).toBe(true);
    expect(publicoPermite("SECTOR_USER", "COORDENADORES")).toBe(false);
    expect(publicoPermite("READONLY", "COORDENADORES")).toBe(false);
  });
  it("aberto a todos, menos a quem só lê", () => {
    expect(publicoPermite("SECTOR_USER", "TODOS")).toBe(true);
    expect(publicoPermite("READONLY", "TODOS")).toBe(false);
  });
});

describe("datas", () => {
  it("o dia vira à meia-noite de São Paulo, não à do servidor", () => {
    // 02:30 UTC de 26/09 ainda é 23:30 de 25/09 em São Paulo.
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-09-26T02:30:00Z")).toISOString()).toBe("2026-09-25T03:00:00.000Z");
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-09-26T03:00:00Z")).toISOString()).toBe("2026-09-26T03:00:00.000Z");
  });
  it("retenção de 90 dias", () => {
    expect(corteDaRetencao(new Date("2026-09-25T12:00:00Z")).toISOString()).toBe("2026-06-27T12:00:00.000Z");
  });
});

describe("tituloDaConversa", () => {
  it("uma linha, cortada", () => {
    expect(tituloDaConversa("  o que\n está parado?  ")).toBe("o que está parado?");
    expect(tituloDaConversa("x".repeat(100))).toHaveLength(80);
    expect(tituloDaConversa("   ")).toBe("Conversa");
  });
});

describe("contextoDaTela", () => {
  it("reconhece o processo aberto pelo id", () => {
    const id = "3f2c1b9a-1234-4abc-9def-0123456789ab";
    expect(contextoDaTela(`/processos/${id}`)).toEqual({ tipo: "processo", id });
    expect(contextoDaTela(`/processos/${id}?aba=x`)).toEqual({ tipo: "processo", id });
  });
  it("rota que não é processo vira só o caminho", () => {
    expect(contextoDaTela("/processos/kanban")).toEqual({ tipo: "tela", caminho: "/processos/kanban" });
    const v = "3f2c1b9a-1234-4abc-9def-0123456789ab";
    expect(contextoDaTela(`/vagas/${v}`)).toEqual({ tipo: "vaga", id: v });
    expect(contextoDaTela(`/vagas/${v}/candidaturas/x`)).toEqual({ tipo: "vaga", id: v });
    expect(contextoDaTela(`/candidatos/${v}`)).toEqual({ tipo: "candidato", id: v });
    expect(contextoDaTela("/vagas/novo")).toEqual({ tipo: "tela", caminho: "/vagas/novo" });
    expect(contextoDaTela(`/empresas/${v}/socios`)).toEqual({ tipo: "empresa", id: v });
    expect(contextoDaTela(`/documentos-fiscais/${v}`)).toEqual({ tipo: "documento_fiscal", id: v });
    expect(contextoDaTela("/documentos-fiscais/entrada")).toEqual({ tipo: "tela", caminho: "/documentos-fiscais/entrada" });
    expect(contextoDaTela("/pagar")).toEqual({ tipo: "tela", caminho: "/pagar" });
    expect(contextoDaTela("lixo")).toBeNull();
  });
});

describe("passos e propostas", () => {
  it("ferramenta desconhecida tem passo genérico", () => {
    expect(textoDoPasso("listar_fila")).toContain("fila");
    expect(textoDoPasso("qualquer")).toBe("Consultando o Connect…");
  });
  it("lê só propostas com forma válida", () => {
    const lidas = lerPropostas([
      { ferramenta: "propor_concluir_etapa", descricao: "d", argumentos: { stepId: "s" }, aplicada: true },
      { sem: "ferramenta" },
      null,
    ]);
    expect(lidas).toEqual([{ ferramenta: "propor_concluir_etapa", descricao: "d", argumentos: { stepId: "s" }, aplicada: true }]);
    expect(lerPropostas("x")).toEqual([]);
  });
  it("descreve as propostas do Recrutamento pelo nome do candidato", () => {
    expect(
      descreverProposta({ ferramenta: "propor_mover_etapa", descricao: "", argumentos: { etapa: "ENTREVISTA", motivo: "boa nota" }, alvo: "Maria" })
    ).toBe("Mover Maria para Entrevista — boa nota");
    expect(descreverProposta({ ferramenta: "propor_encerrar_candidatura", descricao: "", argumentos: { desfecho: "REPROVADO" } })).toBe(
      "Encerrar a candidatura como reprovado"
    );
  });

  it("descreve a proposta com o motivo", () => {
    expect(descreverProposta({ ferramenta: "propor_dispensar_etapa", descricao: "", argumentos: { motivo: "não se aplica" } })).toBe(
      "Dispensar a etapa — não se aplica"
    );
  });
});

describe("normalizarHistorico", () => {
  it("alterna papéis, começa pela pessoa e termina no assistente", () => {
    expect(
      normalizarHistorico([
        { papel: "assistente", texto: "sobra do corte" },
        { papel: "usuario", texto: "a" },
        { papel: "usuario", texto: "b" },
        { papel: "assistente", texto: "c" },
        { papel: "usuario", texto: "pergunta sem resposta" },
      ])
    ).toEqual([
      { papel: "usuario", texto: "a\n\nb" },
      { papel: "assistente", texto: "c" },
    ]);
  });
  it("leva só as últimas trocas", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({
      papel: (i % 2 === 0 ? "usuario" : "assistente") as "usuario" | "assistente",
      texto: String(i),
    }));
    expect(normalizarHistorico(muitos).length).toBeLessThanOrEqual(MAX_TURNOS_DO_HISTORICO);
  });
});

describe("chamado proposto pela Ceci", () => {
  const argumentos = {
    categoriaId: "c-bug",
    titulo: " Erro ao gerar a DRE ",
    descricao: "A DRE de outubro não abre.\nAparece tela branca.",
    setor: "bpo",
    setorNome: "BPO",
    prioridade: "ALTA",
    campos: [
      { chave: "tela", nome: "Tela", valor: "DRE" },
      { chave: "tela", nome: "Tela", valor: "repetida" },
      { chave: "", nome: "Sem chave", valor: "x" },
      { chave: "vazio", nome: "Vazio", valor: "  " },
    ],
  };

  it("vira os campos da tela Novo chamado, sem chave vazia nem repetida", () => {
    expect(chamadoDaProposta(argumentos)).toEqual({
      title: "Erro ao gerar a DRE",
      description: "A DRE de outubro não abre.\nAparece tela branca.",
      categoryId: "c-bug",
      requesterSectorCode: "bpo",
      priority: "ALTA",
      requestData: { tela: "DRE" },
      tags: [],
    });
    expect(chamadoDaProposta({ ...argumentos, prioridade: "QUALQUER" }).priority).toBe("MEDIA");
  });

  it("o cartão mostra categoria do servidor, título, descrição, setor, prioridade e campos", () => {
    const p = { ferramenta: "propor_abrir_chamado", descricao: "", argumentos, alvo: "Desenvolvimento › Bug | Correção" };
    expect(descreverProposta(p)).toBe("Abrir este chamado para o Tech");
    expect(detalhesDaProposta(p)).toEqual([
      { rotulo: "Categoria", texto: "Desenvolvimento › Bug | Correção" },
      { rotulo: "Título", texto: "Erro ao gerar a DRE" },
      { rotulo: "Descrição", texto: "A DRE de outubro não abre.\nAparece tela branca.", longo: true },
      { rotulo: "Setor", texto: "BPO" },
      { rotulo: "Prioridade", texto: "Alta" },
      { rotulo: "Tela", texto: "DRE" },
    ]);
    // Sem `alvo` (categoria que não é folha ativa), o cartão avisa em vez de mostrar o texto do modelo.
    expect(detalhesDaProposta({ ...p, alvo: undefined })[0]!.texto).toMatch(/não encontrada/);
    expect(rotulosDaDecisao("propor_abrir_chamado")).toEqual({ sim: "Abrir chamado", nao: "Não abrir" });
    expect(detalhesDaProposta({ ferramenta: "propor_concluir_etapa", argumentos: {} })).toEqual([]);
  });

  it("o link gravado só vale se for caminho do Connect", () => {
    const [ok, fora] = lerPropostas([
      { ferramenta: "propor_abrir_chamado", aplicada: true, link: "/chamados/abc" },
      { ferramenta: "propor_abrir_chamado", aplicada: true, link: "https://fora.test" },
    ]);
    expect(ok!.link).toBe("/chamados/abc");
    expect(fora!.link).toBeUndefined();
  });
});

describe("processo proposto pela Ceci (09/11/2026)", () => {
  const argumentos = {
    tipoId: "t",
    empresaId: "e",
    responsavelId: "",
    titulo: "",
    prioridade: "URGENTE",
    prazo: "",
    jaTemos: [],
    pedidoAoCliente: "Olá!",
    roteiroId: "r",
    resumo: {
      tipo: "Constituição",
      versao: 1,
      etapas: 4,
      empresa: "Transportes Exemplo",
      documento: null,
      responsavel: null,
      jaTemos: [],
      aPedir: ["Contrato social"],
      emAndamento: 0,
    },
  };
  const p = { ferramenta: "propor_abrir_processo", descricao: "", argumentos };

  it("o cartão diz o tipo e a empresa, com os botões de abrir", () => {
    expect(descreverProposta(p)).toBe("Abrir processo de Constituição para Transportes Exemplo");
    expect(rotulosDaDecisao("propor_abrir_processo")).toEqual({ sim: "Abrir processo", nao: "Não abrir" });
    expect(detalhesDaProposta(p).map((d) => d.rotulo)).toEqual(["Empresa", "Tipo", "Responsável", "Prioridade", "Prazo combinado", "Checklist", "Pedido ao cliente"]);
    expect(detalhesDaProposta(p).find((d) => d.rotulo === "Prioridade")!.texto).toBe("Urgente");
  });

  it("depois do sim, o cartão aponta o processo (e o chamado, o chamado)", () => {
    expect(rotulosDoCriado("propor_abrir_processo")).toEqual({ feito: "Processo aberto", ver: "Ver processo" });
    expect(rotulosDoCriado("propor_abrir_chamado")).toEqual({ feito: "Chamado aberto", ver: "Ver chamado" });
    expect(rotulosDoCriado("propor_concluir_etapa").feito).toBe("Aplicado");
    const [aplicada] = lerPropostas([{ ...p, aplicada: true, link: "/processos/abc" }]);
    expect(aplicada!.link).toBe("/processos/abc");
  });

  it("o passo que aparece enquanto ela monta", () => {
    expect(textoDoPasso("roteiro_do_tipo")).toMatch(/roteiro/);
    expect(textoDoPasso("propor_abrir_processo")).toBe("Preparando o processo…");
  });

  it("a ficha da empresa no Societário também é a empresa da tela", () => {
    const v = "3f1c2a4b-1111-4222-8333-444455556666";
    expect(contextoDaTela(`/processos/empresas/${v}`)).toEqual({ tipo: "empresa", id: v });
    expect(contextoDaTela(`/processos/${v}`)).toEqual({ tipo: "processo", id: v });
    expect(contextoDaTela("/processos/empresas")).toEqual({ tipo: "tela", caminho: "/processos/empresas" });
  });
});
