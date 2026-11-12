import { describe, it, expect } from "vitest";
import {
  assinaturaDe,
  decidirChegada,
  dentroDoHorario,
  diasDoHorario,
  mensagemDeChegada,
  noRecorte,
  preencherCampos,
  recorteValido,
  recortesDe,
  situacaoAoReabrir,
  textoAssinado,
} from "./regras";

const DIA = 24 * 60 * 60 * 1000;

describe("assinatura", () => {
  it("nome e setor numa linha em negrito, e a mensagem embaixo", () => {
    expect(textoAssinado(assinaturaDe("Ana  Ribeiro", "Fiscal"), "Segue a guia.")).toBe("*Ana Ribeiro · Fiscal*\nSegue a guia.");
  });
  it("asterisco no nome não quebra o negrito", () => {
    expect(textoAssinado("Ana *Ri* · Fiscal", "oi")).toBe("*Ana Ri · Fiscal*\noi");
  });
  it("sem setor, só o nome; sem nome, Equipe", () => {
    expect(assinaturaDe("Ana", null)).toBe("Ana");
    expect(assinaturaDe("  ", "DP")).toBe("Equipe · DP");
  });
});

describe("chegada de uma mensagem", () => {
  const agora = new Date("2026-11-10T12:00:00Z");
  it("primeiro contato entra na triagem", () => {
    expect(decidirChegada(null, agora, 7)).toEqual({ tipo: "novo" });
  });
  it("atendimento aberto continua; aguardando o cliente volta", () => {
    const base = { id: "c1", sectorCode: "fiscal", assignedToId: "u1", encerradoEm: null };
    expect(decidirChegada({ ...base, situacao: "EM_ATENDIMENTO" }, agora, 7)).toEqual({ tipo: "continuar", cicloId: "c1", voltaDeAguardando: false });
    expect(decidirChegada({ ...base, situacao: "AGUARDANDO_CLIENTE" }, agora, 7)).toEqual({ tipo: "continuar", cicloId: "c1", voltaDeAguardando: true });
  });
  it("encerrado há pouco reabre com o mesmo setor e a mesma pessoa", () => {
    const ultimo = { id: "c1", situacao: "ENCERRADO" as const, sectorCode: "fiscal", assignedToId: "u1", encerradoEm: new Date(agora.getTime() - 3 * DIA) };
    expect(decidirChegada(ultimo, agora, 7)).toEqual({ tipo: "reabrir", sectorCode: "fiscal", assignedToId: "u1" });
  });
  it("encerrado faz tempo, sem setor, ou com reabertura desligada, volta à triagem", () => {
    const velho = { id: "c1", situacao: "ENCERRADO" as const, sectorCode: "fiscal", assignedToId: "u1", encerradoEm: new Date(agora.getTime() - 8 * DIA) };
    expect(decidirChegada(velho, agora, 7)).toEqual({ tipo: "novo" });
    expect(decidirChegada({ ...velho, encerradoEm: agora, sectorCode: null }, agora, 7)).toEqual({ tipo: "novo" });
    expect(decidirChegada({ ...velho, encerradoEm: agora }, agora, 0)).toEqual({ tipo: "novo" });
  });
  it("reaberto com pessoa segue com ela; sem pessoa, espera o setor", () => {
    expect(situacaoAoReabrir("u1")).toBe("EM_ATENDIMENTO");
    expect(situacaoAoReabrir(null)).toBe("NO_SETOR");
  });
});

describe("horário", () => {
  const h = { diasDaSemana: "1,2,3,4,5", abreAs: "08:00", fechaAs: "18:00" };
  it("usa o horário de Brasília", () => {
    // Terça, 10/11/2026, 12:00 UTC = 09:00 em Brasília.
    expect(dentroDoHorario(h, new Date("2026-11-10T12:00:00Z"))).toBe(true);
    // 22:00 UTC = 19:00 em Brasília.
    expect(dentroDoHorario(h, new Date("2026-11-10T22:00:00Z"))).toBe(false);
    // Domingo.
    expect(dentroDoHorario(h, new Date("2026-11-08T14:00:00Z"))).toBe(false);
  });
  it("escolhe a mensagem de chegada pelo horário, e nada quando o texto está vazio", () => {
    const comTextos = { ...h, boasVindas: "Olá!", foraDoHorario: "Estamos fechados." };
    expect(mensagemDeChegada(comTextos, new Date("2026-11-10T12:00:00Z"))).toBe("Olá!");
    expect(mensagemDeChegada(comTextos, new Date("2026-11-10T22:00:00Z"))).toBe("Estamos fechados.");
    expect(mensagemDeChegada({ ...comTextos, boasVindas: "  " }, new Date("2026-11-10T12:00:00Z"))).toBeNull();
  });
  it("lê os dias e ignora lixo", () => {
    expect(diasDoHorario("5,1, 1,9,x,0")).toEqual([0, 1, 5]);
  });
});

describe("mensagens padrão", () => {
  it("troca os campos e não deixa campo vazio no texto", () => {
    const t = preencherCampos("Olá, {nome do contato}! Aqui é {seu nome}, do {seu setor}. {empresa}", {
      nomeDoContato: "Juliana Prado",
      empresa: null,
      seuNome: "Ana Ribeiro",
      seuSetor: "Fiscal",
    });
    expect(t).toBe("Olá, Juliana! Aqui é Ana, do Fiscal.");
  });
});

describe("recortes", () => {
  it("a triagem vê os dela; o setor, os dele; quem gere, também Do setor", () => {
    expect(recortesDe({ triagem: true, meus: [], geridos: [] })).toEqual(["triagem", "pedidos", "minhas", "todas", "aguardando", "encerradas"]);
    expect(recortesDe({ triagem: false, meus: ["fiscal"], geridos: [] })).toEqual(["sem_responsavel", "minhas", "aguardando", "encerradas"]);
    expect(recortesDe({ triagem: false, meus: ["fiscal"], geridos: ["fiscal"] })).toContain("do_setor");
    expect(recortesDe({ triagem: false, meus: [], geridos: [] })).toEqual(["minhas", "aguardando", "encerradas"]);
  });
  it("recorte da URL que a pessoa não tem cai no primeiro dela", () => {
    expect(recorteValido("triagem", ["sem_responsavel", "minhas"])).toBe("sem_responsavel");
    expect(recorteValido("minhas", ["sem_responsavel", "minhas"])).toBe("minhas");
  });
  it("corta como o servidor", () => {
    const quem = { userId: "u1", meus: ["fiscal"], geridos: [], triagem: false };
    const c = (x: Partial<Parameters<typeof noRecorte>[0]>) => ({ situacao: "NO_SETOR" as const, sectorCode: "fiscal", assignedToId: null, pedidoPendente: false, ...x });
    expect(noRecorte(c({}), "sem_responsavel", quem)).toBe(true);
    expect(noRecorte(c({ sectorCode: "dp" }), "sem_responsavel", quem)).toBe(false);
    expect(noRecorte(c({ situacao: "EM_ATENDIMENTO", assignedToId: "u1" }), "minhas", quem)).toBe(true);
    expect(noRecorte(c({ situacao: "ENCERRADO", assignedToId: "u1" }), "minhas", quem)).toBe(false);
    expect(noRecorte(c({ situacao: "ENCERRADO" }), "encerradas", quem)).toBe(true);
    expect(noRecorte(c({ situacao: "TRIAGEM", sectorCode: null }), "triagem", quem)).toBe(true);
    expect(noRecorte(c({ pedidoPendente: true }), "pedidos", quem)).toBe(true);
  });
});

import { nomeDeModeloValido, parametrosDoModelo, textoDoModelo, variaveisDoModelo } from "./regras";

describe("modelos da Meta", () => {
  const texto = "*{{1}}*\nOlá! Ainda precisamos de {{2}} para seguir com o atendimento de {{3}}.";
  it("conta as variáveis pelo maior {{n}}", () => {
    expect(variaveisDoModelo(texto)).toBe(3);
    expect(variaveisDoModelo("sem nada")).toBe(0);
  });
  it("o {{1}} é a assinatura, e variável sem valor vai como -", () => {
    expect(parametrosDoModelo(texto, "Ana Ribeiro · Fiscal", ["a folha de ponto", ""])).toEqual(["Ana Ribeiro · Fiscal", "a folha de ponto", "-"]);
  });
  it("monta o texto como o cliente lê", () => {
    expect(textoDoModelo(texto, ["Ana · Fiscal", "o extrato", "outubro"])).toBe("*Ana · Fiscal*\nOlá! Ainda precisamos de o extrato para seguir com o atendimento de outubro.");
  });
  it("nome na Meta só com minúsculas, números e _", () => {
    expect(nomeDeModeloValido("retomar_atendimento_2")).toBe(true);
    expect(nomeDeModeloValido("Retomar atendimento")).toBe(false);
  });
});

import { estaEmQuemVeTudo, lerQuemVeTudo, quemAvisarNaResposta } from "./regras";

describe("quem vê tudo e quem recebe o aviso", () => {
  it("lê a lista guardada e descarta o que não serve", () => {
    expect(
      lerQuemVeTudo([
        { tipo: "PESSOA", id: "u1", avisos: true },
        { tipo: "PESSOA", id: "u1", avisos: false },
        { tipo: "SETOR", id: "dp" },
        { tipo: "OUTRO", id: "x" },
        "lixo",
      ])
    ).toEqual([
      { tipo: "PESSOA", id: "u1", avisos: true },
      { tipo: "SETOR", id: "dp", avisos: false },
    ]);
    expect(lerQuemVeTudo(null)).toEqual([]);
  });
  it("acha a pessoa pelo nome ou pelo setor, e filtra quem quer aviso", () => {
    const l = lerQuemVeTudo([{ tipo: "SETOR", id: "dp", avisos: false }]);
    expect(estaEmQuemVeTudo(l, "u9", ["dp"])).toBe(true);
    expect(estaEmQuemVeTudo(l, "u9", ["dp"], true)).toBe(false);
  });
  it("quem vê tudo ganha a aba Todas e as encerradas de todos", () => {
    expect(recortesDe({ triagem: false, meus: ["fiscal"], geridos: [], veTudo: true })).toEqual(["sem_responsavel", "minhas", "todas", "aguardando", "encerradas"]);
    expect(recortesDe({ triagem: false, meus: [], geridos: [], veTudo: true })).toEqual(["minhas", "todas", "aguardando", "encerradas"]);
    const quem = { userId: "u1", meus: [], geridos: [], triagem: false, veTudo: true };
    expect(noRecorte({ situacao: "ENCERRADO", sectorCode: "dp", assignedToId: "x", pedidoPendente: false }, "encerradas", quem)).toBe(true);
  });
  it("o aviso de mensagem nova vai só para quem está com a conversa", () => {
    expect(quemAvisarNaResposta({ situacao: "TRIAGEM", sectorCode: null, assignedToId: "bia" })).toEqual({ pessoa: "bia" });
    expect(quemAvisarNaResposta({ situacao: "EM_ATENDIMENTO", sectorCode: "fiscal", assignedToId: "ana" })).toEqual({ pessoa: "ana" });
    expect(quemAvisarNaResposta({ situacao: "NO_SETOR", sectorCode: "fiscal", assignedToId: null })).toEqual({ setor: "fiscal" });
    expect(quemAvisarNaResposta({ situacao: "TRIAGEM", sectorCode: null, assignedToId: null })).toBeNull();
  });
});
