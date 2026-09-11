import { describe, it, expect } from "vitest";
import {
  FERRAMENTAS_DE_RECRUTAMENTO,
  recorteDaVaga,
  recorteDasCandidaturas,
  recorteDaCandidatura,
} from "./ferramentas-recrutamento";
import { agenteDoCatalogo } from "./catalogo";
import type { ContextoDaFerramenta } from "./ferramentas";

const SEM_RECORTE: ContextoDaFerramenta = { tenantId: "t1", userId: "u1", escopo: {} };
const COM_RECORTE: ContextoDaFerramenta = { tenantId: "t1", userId: "u1", escopo: { vagaId: "v1" } };

const LEITURAS = ["ver_vaga", "listar_candidatos", "ver_candidato"] as const;
const ESCRITAS = ["propor_mover_etapa", "propor_encerrar_candidatura"] as const;

describe("o conjunto", () => {
  it("as de escrita não têm executor", () => {
    for (const nome of ESCRITAS) {
      expect(FERRAMENTAS_DE_RECRUTAMENTO[nome]!.executar).toBeUndefined();
      expect(FERRAMENTAS_DE_RECRUTAMENTO[nome]!.def.natureza).toBe("escrita");
    }
  });

  it("as de leitura têm executor", () => {
    for (const nome of LEITURAS) {
      expect(FERRAMENTAS_DE_RECRUTAMENTO[nome]!.executar).toBeDefined();
      expect(FERRAMENTAS_DE_RECRUTAMENTO[nome]!.def.natureza).toBe("leitura");
    }
  });

  it("o assistente da vaga libera exatamente estas", () => {
    const liberadas = agenteDoCatalogo("assistente_de_vaga")!.ferramentas;
    expect(liberadas.sort()).toEqual(Object.keys(FERRAMENTAS_DE_RECRUTAMENTO).sort());
  });

  // A descrição é o que o modelo lê para decidir se chama. "NÃO move" ali é o
  // que impede o modelo de tratar a proposta como execução e depois dizer à
  // pessoa que já resolveu.
  it("as de escrita avisam, na própria descrição, que não executam", () => {
    for (const nome of ESCRITAS) {
      expect(FERRAMENTAS_DE_RECRUTAMENTO[nome]!.def.descricao).toMatch(/NÃO (move|encerra)/);
    }
  });

  // O modelo não decide em que vaga está: nenhum schema aceita vagaId, senão
  // bastaria pedir outra.
  it("nenhuma ferramenta aceita vagaId como parâmetro", () => {
    for (const reg of Object.values(FERRAMENTAS_DE_RECRUTAMENTO)) {
      const props = (reg.def.parametros as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("vagaId");
      expect(Object.keys(props)).not.toContain("tenantId");
    }
  });
});

describe("a guarda do recorte", () => {
  // Sem recorte, a ferramenta falha **antes** de tocar o banco. Se falhasse
  // depois, uma consulta sem recorte já teria saído — e `findFirst` sem
  // `vagaId` devolve a primeira vaga do tenant, que é o vazamento exato que
  // esta guarda existe para impedir.
  it("recusa antes de consultar quando não há vaga no escopo", async () => {
    for (const nome of LEITURAS) {
      await expect(
        FERRAMENTAS_DE_RECRUTAMENTO[nome]!.executar!({ candidaturaId: "c1" }, SEM_RECORTE)
      ).rejects.toThrow(/conversa aberta a partir de uma vaga/);
    }
  });

  it("ver_candidato exige o id, e recusa o que não é texto", async () => {
    const ver = FERRAMENTAS_DE_RECRUTAMENTO.ver_candidato!.executar!;
    await expect(ver({}, COM_RECORTE)).rejects.toThrow(/candidaturaId/);
    await expect(ver({ candidaturaId: "   " }, COM_RECORTE)).rejects.toThrow(/candidaturaId/);
    await expect(ver({ candidaturaId: 42 }, COM_RECORTE)).rejects.toThrow(/candidaturaId/);
  });
});

describe("os recortes de consulta", () => {
  it("a vaga é sempre a do escopo, dentro do tenant", () => {
    expect(recorteDaVaga(COM_RECORTE)).toEqual({ id: "v1", tenantId: "t1" });
  });

  it("a lista de candidatos é sempre presa à vaga", () => {
    expect(recorteDasCandidaturas(COM_RECORTE)).toEqual({ vagaId: "v1", tenantId: "t1" });
  });

  // A asserção que importa: as TRÊS chaves. Sem `vagaId`, um id de candidatura
  // de outra vaga do mesmo cliente — inventado pelo modelo, ou sugerido pelo
  // texto de um currículo — devolveria candidato de um processo que o
  // recrutador não abriu.
  it("uma candidatura é buscada por id, vaga E tenant", () => {
    expect(recorteDaCandidatura({ candidaturaId: "c9" }, COM_RECORTE)).toEqual({
      id: "c9",
      vagaId: "v1",
      tenantId: "t1",
    });
  });

  it("o id vem aparado, e nada além dele vem do modelo", () => {
    const w = recorteDaCandidatura(
      { candidaturaId: "  c9  ", vagaId: "OUTRA", tenantId: "OUTRO" },
      COM_RECORTE
    );
    expect(w).toEqual({ id: "c9", vagaId: "v1", tenantId: "t1" });
  });

  it("sem recorte, nenhum where é montado", () => {
    expect(() => recorteDaVaga(SEM_RECORTE)).toThrow();
    expect(() => recorteDasCandidaturas(SEM_RECORTE)).toThrow();
    expect(() => recorteDaCandidatura({ candidaturaId: "c9" }, SEM_RECORTE)).toThrow();
  });
});
