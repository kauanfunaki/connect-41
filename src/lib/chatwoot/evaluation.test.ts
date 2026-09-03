import { describe, expect, it } from "vitest";
import {
  normalizarNomeAtendente,
  indexarVinculosPorNome,
  chaveDoAtendente,
  type VinculoAtendente,
} from "./evaluation";

const vinculos = (...v: VinculoAtendente[]) => indexarVinculosPorNome(v);

describe("normalizarNomeAtendente", () => {
  it("apara e baixa a caixa", () => {
    expect(normalizarNomeAtendente("  Juliana Coelho ")).toBe("juliana coelho");
  });

  it("colapsa espaço interno — dois espaços não fazem uma segunda pessoa", () => {
    expect(normalizarNomeAtendente("Juliana  Coelho")).toBe("juliana coelho");
  });

  it("preserva acento: aproximar nomes distintos é pior que separar um", () => {
    expect(normalizarNomeAtendente("Djanane Paixão")).toBe("djanane paixão");
  });

  it("vazio e nulo caem no mesmo lugar", () => {
    expect(normalizarNomeAtendente("   ")).toBeNull();
    expect(normalizarNomeAtendente(null)).toBeNull();
    expect(normalizarNomeAtendente(undefined)).toBeNull();
  });
});

describe("indexarVinculosPorNome", () => {
  it("prefere o vínculo que tem conta quando dois agentes dividem o nome", () => {
    const mapa = vinculos(
      { chatwootAgentName: "Débora Leite", linkedUserId: null },
      { chatwootAgentName: "débora  leite", linkedUserId: "u-debora" }
    );
    expect(mapa.get("débora leite")?.linkedUserId).toBe("u-debora");
  });

  it("não deixa um agente sem conta sobrescrever um já vinculado", () => {
    const mapa = vinculos(
      { chatwootAgentName: "Ruli", linkedUserId: "u-ruli" },
      { chatwootAgentName: "Ruli", linkedUserId: null }
    );
    expect(mapa.get("ruli")?.linkedUserId).toBe("u-ruli");
  });

  it("ignora agente sem nome", () => {
    expect(indexarVinculosPorNome([{ chatwootAgentName: "  ", linkedUserId: "u-x" }]).size).toBe(0);
  });
});

describe("chaveDoAtendente", () => {
  const mapa = vinculos(
    { chatwootAgentName: "Juliana Coelho", linkedUserId: "u-juliana" },
    { chatwootAgentName: "Debora Souza", linkedUserId: null }
  );

  it("um cadastro do Connect é um card só", () => {
    expect(chaveDoAtendente("Juliana Coelho", mapa)).toBe("user:u-juliana");
    expect(chaveDoAtendente("juliana  coelho", mapa)).toBe("user:u-juliana");
  });

  it("sem vínculo, agrupa pelo nome normalizado", () => {
    expect(chaveDoAtendente("Debora Souza", mapa)).toBe("label:debora souza");
    expect(chaveDoAtendente("Susemara", mapa)).toBe("label:susemara");
  });

  it("sem nome de quem atendeu, cai em sem-atendente", () => {
    expect(chaveDoAtendente(null, mapa)).toBe("sem-atendente");
    expect(chaveDoAtendente("  ", mapa)).toBe("sem-atendente");
  });

  // Regressão do defeito de 2026-09-03: a tela mostrava doze cards "Juliana
  // Coelho" com contagens diferentes, porque o vínculo era procurado pelo
  // `assigneeId` da conversa — que nesta operação é sempre a recepção. A chave
  // agora só olha quem escreveu, então pessoas diferentes não colidem, mesmo
  // que a recepção esteja no assignee de todas elas.
  it("pessoas diferentes continuam em cards diferentes ainda que a recepção seja a responsável de todas", () => {
    const chaves = ["Debora Souza", "Ruli", "Wellington", "Talita Souza"].map((n) =>
      chaveDoAtendente(n, mapa)
    );
    expect(new Set(chaves).size).toBe(4);
    expect(chaves).not.toContain("user:u-juliana");
  });

  // O formato `label:` não pode mudar: AgentEvaluationSummary guarda esta
  // chave, e mudá-lo invalidaria em silêncio todo resumo já gerado.
  it("mantém o formato label: de quem não tem conta vinculada", () => {
    expect(chaveDoAtendente("Alguém Novo", vinculos())).toBe("label:alguém novo");
  });
});
