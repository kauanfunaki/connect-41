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
