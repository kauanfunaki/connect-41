import { describe, expect, it } from "vitest";
import {
  avisoParaAEquipe,
  decidirEnvioAoCliente,
  etapaDeEnvioAoCliente,
  rotuloDeEnvio,
  type EtapaDaInstanciaParaOEnvio,
  type EtapaParaOEnvio,
} from "./envioAoCliente";

// Os roteiros do seed do Societário (scripts/seed-societario.ts), reduzidos ao
// que a regra do envio enxerga.

const etapa = (templateStepId: string, position: number, label: string, expectedActor: EtapaParaOEnvio["expectedActor"], organId: string | null = null): EtapaParaOEnvio => ({
  templateStepId,
  position,
  label,
  expectedActor,
  organId,
});

const REGISTRO: EtapaParaOEnvio[] = [
  etapa("doc", 1, "Reunir documentação", "PESSOA"),
  etapa("viabilidade", 2, "Viabilidade", "INTEGRACAO", "junta"),
  etapa("acompanhamento", 6, "Acompanhamento do registro", "ROBO", "junta"),
  etapa("cadastro", 9, "Cadastro e comunicação interna", "PESSOA"),
  etapa("envio", 10, "Envio de documentação ao cliente", "ROBO"),
];

const ALVARA: EtapaParaOEnvio[] = [
  etapa("info", 1, "Reunir informações da empresa, atividade e imóvel", "PESSOA"),
  etapa("bombeiros", 4, "Corpo de Bombeiros", "INTEGRACAO", "cb"),
  etapa("ambiente", 4, "Meio Ambiente", "INTEGRACAO", "ma"),
  etapa("deferimento", 5, "Acompanhamento até deferimento", "ROBO"),
  etapa("cadastro", 6, "Cadastro / comunicação interna", "PESSOA"),
  etapa("envio", 7, "Envio ao cliente", "ROBO"),
];

const REGULARIZACAO: EtapaParaOEnvio[] = [
  etapa("pendencia", 1, "Confirmar a pendência", "PESSOA"),
  etapa("comunicacao", 6, "Comunicação ao cliente", "PESSOA"),
];

function instancia(roteiro: EtapaParaOEnvio[], status: Record<string, EtapaDaInstanciaParaOEnvio["status"]>, pendentes: Record<string, number> = {}): EtapaDaInstanciaParaOEnvio[] {
  return roteiro.map((e) => ({
    templateStepId: e.templateStepId,
    status: status[e.templateStepId] ?? "PENDENTE",
    itensObrigatoriosPendentes: pendentes[e.templateStepId] ?? 0,
  }));
}

/** Tudo encerrado menos o envio. */
function tudoFeitoMenosOEnvio(roteiro: EtapaParaOEnvio[]): Record<string, "CONCLUIDA"> {
  return Object.fromEntries(roteiro.filter((e) => e.templateStepId !== "envio").map((e) => [e.templateStepId, "CONCLUIDA" as const]));
}

describe("rotuloDeEnvio", () => {
  it("aceita os rótulos do seed e as variações que o editor de roteiro pode trazer", () => {
    expect(rotuloDeEnvio("Envio ao cliente")).toBe(true);
    expect(rotuloDeEnvio("Envio de documentação ao cliente")).toBe(true);
    expect(rotuloDeEnvio("Enviar documentos ao cliente")).toBe(true);
    expect(rotuloDeEnvio("  ENVIO ao cliente")).toBe(true);
  });

  it("recusa o que não começa pelo verbo do envio", () => {
    expect(rotuloDeEnvio("Comunicação ao cliente")).toBe(false);
    expect(rotuloDeEnvio("Acompanhamento até deferimento")).toBe(false);
    expect(rotuloDeEnvio("Documentação enviada ao cliente")).toBe(false);
  });
});

describe("etapaDeEnvioAoCliente", () => {
  it("acha o envio nos roteiros de registro e do alvará", () => {
    expect(etapaDeEnvioAoCliente(REGISTRO)).toBe("envio");
    expect(etapaDeEnvioAoCliente(ALVARA)).toBe("envio");
  });

  it("a Comunicação ao cliente da Regularização é de pessoa e fica com gente", () => {
    expect(etapaDeEnvioAoCliente(REGULARIZACAO)).toBeNull();
  });

  it("etapa de robô que não é envio, no fim do roteiro, não vira envio", () => {
    const roteiro = [...ALVARA.filter((e) => e.templateStepId !== "envio" && e.templateStepId !== "cadastro")];
    // O acompanhamento até deferimento passou a ser a última etapa.
    expect(etapaDeEnvioAoCliente(roteiro)).toBeNull();
  });

  it("envio que não está na última posição não conta", () => {
    const roteiro = [...REGISTRO, etapa("arquivo", 11, "Arquivar o processo", "PESSOA")];
    expect(etapaDeEnvioAoCliente(roteiro)).toBeNull();
  });

  it("envio com órgão se encerra pelo protocolo, não pelo robô do envio", () => {
    const roteiro = REGISTRO.map((e) => (e.templateStepId === "envio" ? { ...e, organId: "junta" } : e));
    expect(etapaDeEnvioAoCliente(roteiro)).toBeNull();
  });

  it("envio marcado para pessoa fica com gente", () => {
    const roteiro = REGISTRO.map((e) => (e.templateStepId === "envio" ? { ...e, expectedActor: "PESSOA" as const } : e));
    expect(etapaDeEnvioAoCliente(roteiro)).toBeNull();
  });

  it("dois envios de robô na última posição são palpite: nenhum", () => {
    const roteiro = [...REGISTRO, etapa("envio2", 10, "Envio à contabilidade", "ROBO")];
    expect(etapaDeEnvioAoCliente(roteiro)).toBeNull();
  });

  it("uma etapa de pessoa em paralelo no fim não atrapalha achar o envio", () => {
    const roteiro = [...REGISTRO, etapa("arquivo", 10, "Arquivar o processo", "PESSOA")];
    expect(etapaDeEnvioAoCliente(roteiro)).toBe("envio");
  });

  it("roteiro vazio não tem envio", () => {
    expect(etapaDeEnvioAoCliente([])).toBeNull();
  });
});

describe("decidirEnvioAoCliente", () => {
  it("envia quando o envio é a única etapa em aberto", () => {
    expect(decidirEnvioAoCliente(REGISTRO, instancia(REGISTRO, tudoFeitoMenosOEnvio(REGISTRO)), "EM_ANDAMENTO")).toEqual({
      enviar: true,
      templateStepId: "envio",
    });
  });

  it("etapa dispensada conta como encerrada: a licença que não se aplica não segura o envio", () => {
    const status = { ...tudoFeitoMenosOEnvio(ALVARA), ambiente: "DISPENSADA" as const };
    expect(decidirEnvioAoCliente(ALVARA, instancia(ALVARA, status), "EM_ANDAMENTO")).toMatchObject({ enviar: true });
  });

  it("não envia enquanto falta etapa — nem a de pessoa logo antes", () => {
    const status = { ...tudoFeitoMenosOEnvio(REGISTRO), cadastro: "EM_ANDAMENTO" as const };
    expect(decidirEnvioAoCliente(REGISTRO, instancia(REGISTRO, status), "EM_ANDAMENTO")).toEqual({ enviar: false, motivo: "falta_etapa" });
  });

  it("etapa paralela ainda aberta na última posição segura o envio: o processo não terminou", () => {
    const roteiro = [...REGISTRO, etapa("arquivo", 10, "Arquivar o processo", "PESSOA")];
    const status = { ...tudoFeitoMenosOEnvio(REGISTRO) };
    expect(decidirEnvioAoCliente(roteiro, instancia(roteiro, status), "EM_ANDAMENTO")).toEqual({ enviar: false, motivo: "falta_etapa" });
  });

  it("envio já concluído — pelo robô ou à mão — não sai de novo", () => {
    const status = { ...tudoFeitoMenosOEnvio(REGISTRO), envio: "CONCLUIDA" as const };
    expect(decidirEnvioAoCliente(REGISTRO, instancia(REGISTRO, status), "CONCLUIDO")).toEqual({ enviar: false, motivo: "ja_encerrada" });
    const dispensado = { ...tudoFeitoMenosOEnvio(REGISTRO), envio: "DISPENSADA" as const };
    expect(decidirEnvioAoCliente(REGISTRO, instancia(REGISTRO, dispensado), "EM_ANDAMENTO")).toEqual({ enviar: false, motivo: "ja_encerrada" });
  });

  it("processo pausado ou encerrado sem conclusão não fala com o cliente", () => {
    const status = tudoFeitoMenosOEnvio(REGISTRO);
    for (const parado of ["SUSPENSO", "AGUARDANDO_CLIENTE", "CANCELADO", "INDEFERIDO"] as const) {
      expect(decidirEnvioAoCliente(REGISTRO, instancia(REGISTRO, status), parado), parado).toEqual({ enviar: false, motivo: "processo_parado" });
    }
    // Esperando órgão ou em exigência é situação derivada, não pausa da equipe.
    expect(decidirEnvioAoCliente(REGISTRO, instancia(REGISTRO, status), "AGUARDANDO_ORGAO")).toMatchObject({ enviar: true });
  });

  it("item obrigatório do checklist do envio em aberto segura o robô, como segura a conclusão à mão", () => {
    const r = decidirEnvioAoCliente(REGISTRO, instancia(REGISTRO, tudoFeitoMenosOEnvio(REGISTRO), { envio: 2 }), "EM_ANDAMENTO");
    expect(r).toEqual({ enviar: false, motivo: "checklist_pendente", templateStepId: "envio", itensPendentes: 2 });
  });

  it("roteiro sem envio de robô nunca envia", () => {
    const status = { pendencia: "CONCLUIDA" as const };
    expect(decidirEnvioAoCliente(REGULARIZACAO, instancia(REGULARIZACAO, status), "EM_ANDAMENTO")).toEqual({ enviar: false, motivo: "sem_etapa_de_envio" });
  });
});

describe("avisoParaAEquipe", () => {
  const nome = "Constituição — ACME";

  it("diz por que ficou com a equipe e o que fazer", () => {
    expect(avisoParaAEquipe({ tipo: "sem_portal" }, nome)).toBe(
      "Envio ao cliente de Constituição — ACME ficou com você: a empresa não tem usuário ativo no portal. Avise o cliente e conclua a etapa."
    );
    expect(avisoParaAEquipe({ tipo: "tela_bloqueada" }, nome)).toContain("tela de Processos está bloqueada no portal");
    expect(avisoParaAEquipe({ tipo: "checklist_pendente", itensPendentes: 1 }, nome)).toContain("espera 1 item obrigatório do checklist");
    expect(avisoParaAEquipe({ tipo: "checklist_pendente", itensPendentes: 3 }, nome)).toContain("espera 3 itens obrigatórios do checklist");
  });

  it("quando o e-mail não sai, diz que o processo foi concluído e o que faltou", () => {
    expect(avisoParaAEquipe({ tipo: "sem_smtp" }, nome)).toContain("o SMTP do workspace não está configurado");
    expect(avisoParaAEquipe({ tipo: "falha_no_email", falhas: 1 }, nome)).toContain("1 e-mail ao cliente falhou");
    expect(avisoParaAEquipe({ tipo: "falha_no_email", falhas: 2 }, nome)).toContain("2 e-mails ao cliente falharam");
    expect(avisoParaAEquipe({ tipo: "falha_no_aviso" }, nome)).toContain("foi concluído, mas o aviso ao cliente falhou");
  });
});
