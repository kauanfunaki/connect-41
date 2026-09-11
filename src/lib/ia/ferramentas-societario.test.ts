import { describe, it, expect } from "vitest";
import {
  FERRAMENTAS_DE_SOCIETARIO,
  recorteDoProcesso,
  processoPedido,
} from "./ferramentas-societario";
import { agenteDoCatalogo } from "./catalogo";
import type { ContextoDaFerramenta } from "./ferramentas";

const CTX: ContextoDaFerramenta = { tenantId: "t1", userId: "u1", escopo: {} };

const LEITURAS = ["listar_fila", "ver_processo"] as const;
const ESCRITAS = ["propor_concluir_etapa", "propor_dispensar_etapa"] as const;

describe("o conjunto", () => {
  it("as de escrita não têm executor", () => {
    for (const nome of ESCRITAS) {
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.executar).toBeUndefined();
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.def.natureza).toBe("escrita");
    }
  });

  it("as de leitura têm executor", () => {
    for (const nome of LEITURAS) {
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.executar).toBeDefined();
    }
  });

  it("o assistente do Societário libera exatamente estas", () => {
    const liberadas = agenteDoCatalogo("assistente_do_societario")!.ferramentas;
    expect(liberadas.sort()).toEqual(Object.keys(FERRAMENTAS_DE_SOCIETARIO).sort());
  });

  it("as de escrita avisam, na descrição, que não executam", () => {
    for (const nome of ESCRITAS) {
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.def.descricao).toMatch(/NÃO (conclui|dispensa)/);
    }
  });

  // O modelo não escolhe o cliente. Nenhum schema aceita tenantId.
  it("nenhuma ferramenta aceita tenantId como parâmetro", () => {
    for (const reg of Object.values(FERRAMENTAS_DE_SOCIETARIO)) {
      const props = (reg.def.parametros as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("tenantId");
    }
  });

  // A descrição é o que o modelo lê para decidir. Mandar consultar antes de
  // sugerir é o que evita proposta sobre etapa de órgão ou com item pendente —
  // as duas que a server action recusaria depois, com o usuário já clicando.
  it("a descrição de concluir diz quando NÃO sugerir", () => {
    const d = FERRAMENTAS_DE_SOCIETARIO.propor_concluir_etapa!.def.descricao;
    expect(d).toMatch(/liberada/i);
    expect(d).toMatch(/obrigatório/i);
  });
});

describe("o recorte do processo", () => {
  it("é por id E tenant", () => {
    expect(recorteDoProcesso({ processoId: "p1" }, CTX)).toEqual({ id: "p1", tenantId: "t1" });
  });

  it("o id vem aparado, e o tenant não vem do modelo", () => {
    expect(recorteDoProcesso({ processoId: "  p1 ", tenantId: "OUTRO" }, CTX)).toEqual({
      id: "p1",
      tenantId: "t1",
    });
  });

  it("id ausente ou que não é texto recusa antes do banco", () => {
    expect(() => processoPedido({})).toThrow(/processoId/);
    expect(() => processoPedido({ processoId: "  " })).toThrow(/processoId/);
    expect(() => processoPedido({ processoId: 7 })).toThrow(/processoId/);
  });

  it("ver_processo recusa sem id, sem consultar", async () => {
    await expect(FERRAMENTAS_DE_SOCIETARIO.ver_processo!.executar!({}, CTX)).rejects.toThrow(
      /processoId/
    );
  });
});
