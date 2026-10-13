import { describe, expect, it } from "vitest";
import { ENTRADA_COOKIE, entradaCookieOptions, novaEntrada } from "@/lib/auth/cookies";
import { especialidadeDoAgente } from "@/lib/ia/ligia";
import { configDoChat } from "./agentes";
import {
  boasVindasPendentes,
  ENTRADA_SEM_MARCA,
  entradaAtual,
  lerCookie,
  mensagensNovas,
  respostaNaoLidaDepois,
  rotuloDoAviso,
  sugestoesDasBoasVindas,
  textoDasBoasVindas,
} from "./boasVindas";

// As boas-vindas da Lígia depois do login e o aviso de mensagem nova no botão
// do canto (13/10/2026).

describe("a marca da entrada", () => {
  it("o login grava uma marca nova, que a tela consegue ler", () => {
    expect(novaEntrada(1)).not.toBe(novaEntrada(2));
    const opts = entradaCookieOptions(60);
    expect(opts.httpOnly).toBe(false);
    expect(opts.path).toBe("/");
    expect(opts.sameSite).toBe("lax");
  });

  it("a tela lê o cookie em meio aos outros", () => {
    expect(lerCookie(`tema=escuro; ${ENTRADA_COOKIE}=abc123; outro=x`, ENTRADA_COOKIE)).toBe("abc123");
    expect(entradaAtual(`${ENTRADA_COOKIE}=k9z`)).toBe("k9z");
    expect(lerCookie("x=1", ENTRADA_COOKIE)).toBeNull();
  });

  it("sessão aberta antes do cookie conta como uma entrada só", () => {
    expect(entradaAtual("")).toBe(ENTRADA_SEM_MARCA);
  });
});

describe("boas-vindas: uma vez por entrada", () => {
  it("entrada nova, ainda não vista: esperando", () => {
    expect(boasVindasPendentes({ entrada: "e2", vista: "e1", temAgenteDoSetor: true })).toBe(true);
    expect(boasVindasPendentes({ entrada: "e1", vista: null, temAgenteDoSetor: true })).toBe(true);
  });

  it("recarregar a página não repete: a marca é a mesma", () => {
    expect(boasVindasPendentes({ entrada: "e1", vista: "e1", temAgenteDoSetor: true })).toBe(false);
  });

  it("sem a Lígia do setor ativo, não há boas-vindas", () => {
    expect(boasVindasPendentes({ entrada: "e2", vista: "e1", temAgenteDoSetor: false })).toBe(false);
  });

  it("o texto diz o setor ('BPO', não 'BPO Financeiro') e cumprimenta pelo nome", () => {
    const t = textoDasBoasVindas({ primeiroNome: "Kauan", especialidade: especialidadeDoAgente("assistente_do_bpo")! });
    expect(t).toMatch(/^Oi, Kauan! Eu sou a Lígia e estou aqui para ajudar no BPO\./);
    expect(t).not.toContain("BPO Financeiro");
    expect(t).toContain("não altero nada sozinha");
    expect(textoDasBoasVindas({ primeiroNome: "", especialidade: "Fiscal" })).toMatch(/^Oi! /);
  });

  it("as sugestões são as do agente do setor, até três", () => {
    const sugestoes = configDoChat("assistente_do_bpo")!.sugestoes;
    expect(sugestoesDasBoasVindas(sugestoes)).toEqual(sugestoes.slice(0, 3));
    expect(sugestoesDasBoasVindas(["a", "b", "c", "d"])).toHaveLength(3);
  });
});

describe("aviso de mensagem nova", () => {
  it("as boas-vindas esperando ou a resposta que chegou com o chat fechado", () => {
    expect(mensagensNovas({ boasVindasEsperando: true, respostaNaoLida: false })).toBe(1);
    expect(mensagensNovas({ boasVindasEsperando: true, respostaNaoLida: true })).toBe(2);
    expect(mensagensNovas({ boasVindasEsperando: false, respostaNaoLida: false })).toBe(0);
  });

  it("resposta com o chat aberto não vira aviso; com ele fechado, vira", () => {
    expect(respostaNaoLidaDepois({ chatAberto: true, jaHavia: false })).toBe(false);
    expect(respostaNaoLidaDepois({ chatAberto: false, jaHavia: false })).toBe(true);
    expect(respostaNaoLidaDepois({ chatAberto: true, jaHavia: true })).toBe(true);
  });

  it("o nome acessível do aviso", () => {
    expect(rotuloDoAviso(1)).toBe("1 mensagem nova da Lígia");
    expect(rotuloDoAviso(2)).toBe("2 mensagens novas da Lígia");
    expect(rotuloDoAviso(0)).toBeNull();
  });
});
