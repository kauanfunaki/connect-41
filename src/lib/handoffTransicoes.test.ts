import { describe, expect, it } from "vitest";
import type { HandoffSectorStatus, UserRole } from "@/generated/prisma/enums";
import {
  ACOES_NA_PARTE,
  MOTIVO_MAXIMO,
  acoesDaParte,
  aoSetor,
  avisoDaAcao,
  destinatariosDoComentario,
  diferencaDeResponsaveis,
  doSetor,
  ehAcaoNaParte,
  juntarNomes,
  peloSetor,
  podeAgirNaParte,
  podeComentar,
  podeEditarATransferencia,
  podeMudarResponsaveis,
  proximaSituacao,
  resumir,
  resumoDosResponsaveis,
  rotuloDaAcao,
  textoDaAcao,
  textoDoComentario,
  type AcaoNaParte,
  type QuemAge,
} from "./handoffTransicoes";

// A transferência aberta (10/11/2026): a parte de cada setor anda por botões,
// e "Devolvida" é situação nova.

const SITUACOES: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE", "RETURNED"];

describe("transições da parte", () => {
  // A tabela inteira: de cada situação, para onde cada ação leva (ou não vale).
  const ESPERADO: Record<AcaoNaParte, Partial<Record<HandoffSectorStatus, HandoffSectorStatus>>> = {
    comecar: { NEW: "IN_PROGRESS" },
    finalizar: { NEW: "DONE", IN_PROGRESS: "DONE" },
    devolver: { NEW: "RETURNED", IN_PROGRESS: "RETURNED" },
    reenviar: { RETURNED: "NEW" },
    reabrir: { DONE: "IN_PROGRESS" },
  };

  it.each(ACOES_NA_PARTE.flatMap((a) => SITUACOES.map((s) => [a, s] as const)))("%s a partir de %s", (acao, de) => {
    expect(proximaSituacao(acao, de)).toBe(ESPERADO[acao][de] ?? null);
  });

  it("só as cinco ações existem", () => {
    expect(ehAcaoNaParte("devolver")).toBe(true);
    expect(ehAcaoNaParte("apagar")).toBe(false);
    expect(ehAcaoNaParte(3)).toBe(false);
  });
});

// Quem é quem: o Societário pediu ao Fiscal; Marina pediu, Paulo é
// responsável no Fiscal, Ana coordena o Fiscal, Rui coordena o Societário.
const PEDIDO = { requestedBy: "u-marina", fromSector: "societario" };
const parte = (status: HandoffSectorStatus) => ({ sectorCode: "fiscal", status, responsaveis: ["u-paulo"] });
const quem = (userId: string, role: UserRole, sectors: string[] = [], subscriptionReadOnly = false): QuemAge => ({
  userId,
  role,
  sectors,
  subscriptionReadOnly,
});

const PESSOAS = {
  superAdmin: quem("u-super", "SUPER_ADMIN"),
  admin: quem("u-admin", "ADMIN"),
  coordenaODestino: quem("u-ana", "SECTOR_ADMIN", ["fiscal"]),
  responsavel: quem("u-paulo", "SECTOR_USER", ["fiscal"]),
  colegaDoDestino: quem("u-carla", "SECTOR_USER", ["fiscal"]),
  quemPediu: quem("u-marina", "SECTOR_USER", ["societario"]),
  coordenaAOrigem: quem("u-rui", "SECTOR_ADMIN", ["societario"]),
  colegaDaOrigem: quem("u-bia", "SECTOR_USER", ["societario"]),
  deOutroSetor: quem("u-davi", "SECTOR_ADMIN", ["dp"]),
  somenteLeitura: quem("u-leo", "READONLY"),
  responsavelSomenteLeitura: quem("u-paulo", "READONLY"),
} satisfies Record<string, QuemAge>;

type Pessoa = keyof typeof PESSOAS;

describe("quem pode cada ação", () => {
  // O lado do setor de destino: a regra de antes (coordenação do destino,
  // responsável, administrador), nunca o somente leitura.
  const LADO_DO_DESTINO: Pessoa[] = ["superAdmin", "admin", "coordenaODestino", "responsavel"];
  // O lado de quem pediu: quem pediu, a coordenação da origem, o administrador.
  const LADO_DO_PEDIDO: Pessoa[] = ["superAdmin", "admin", "quemPediu", "coordenaAOrigem"];

  const casos: [AcaoNaParte, HandoffSectorStatus, Pessoa[]][] = [
    ["comecar", "NEW", LADO_DO_DESTINO],
    ["finalizar", "IN_PROGRESS", LADO_DO_DESTINO],
    ["devolver", "IN_PROGRESS", LADO_DO_DESTINO],
    ["reabrir", "DONE", LADO_DO_DESTINO],
    ["reenviar", "RETURNED", LADO_DO_PEDIDO],
  ];

  it.each(casos)("%s (parte %s)", (acao, status, podem) => {
    const quemPode = (Object.keys(PESSOAS) as Pessoa[]).filter((p) => podeAgirNaParte(acao, PESSOAS[p], parte(status), PEDIDO));
    expect(quemPode.sort()).toEqual([...podem].sort());
  });

  it("nenhuma ação fora da situação de onde ela parte, nem para o administrador", () => {
    expect(podeAgirNaParte("comecar", PESSOAS.admin, parte("IN_PROGRESS"), PEDIDO)).toBe(false);
    expect(podeAgirNaParte("reenviar", PESSOAS.admin, parte("NEW"), PEDIDO)).toBe(false);
    expect(podeAgirNaParte("devolver", PESSOAS.admin, parte("RETURNED"), PEDIDO)).toBe(false);
    expect(podeAgirNaParte("finalizar", PESSOAS.admin, parte("RETURNED"), PEDIDO)).toBe(false);
  });

  it("assinatura em somente leitura tira o administrador e a coordenação; o responsável segue como antes", () => {
    expect(podeAgirNaParte("finalizar", quem("u-admin", "ADMIN", [], true), parte("NEW"), PEDIDO)).toBe(false);
    expect(podeAgirNaParte("finalizar", quem("u-ana", "SECTOR_ADMIN", ["fiscal"], true), parte("NEW"), PEDIDO)).toBe(false);
    expect(podeAgirNaParte("finalizar", quem("u-paulo", "SECTOR_USER", ["fiscal"], true), parte("NEW"), PEDIDO)).toBe(true);
  });

  it("os botões da parte, na ordem, para quem cuida dela e para quem pediu", () => {
    expect(acoesDaParte(PESSOAS.responsavel, parte("NEW"), PEDIDO)).toEqual(["comecar", "finalizar", "devolver"]);
    expect(acoesDaParte(PESSOAS.responsavel, parte("IN_PROGRESS"), PEDIDO)).toEqual(["finalizar", "devolver"]);
    expect(acoesDaParte(PESSOAS.responsavel, parte("RETURNED"), PEDIDO)).toEqual([]);
    expect(acoesDaParte(PESSOAS.quemPediu, parte("RETURNED"), PEDIDO)).toEqual(["reenviar"]);
    expect(acoesDaParte(PESSOAS.quemPediu, parte("NEW"), PEDIDO)).toEqual([]);
    // O administrador está dos dois lados.
    expect(acoesDaParte(PESSOAS.admin, parte("RETURNED"), PEDIDO)).toEqual(["reenviar"]);
  });

  it("responsáveis: só quem gerencia o setor de destino", () => {
    const podem = (Object.keys(PESSOAS) as Pessoa[]).filter((p) => podeMudarResponsaveis(PESSOAS[p], parte("NEW")));
    expect(podem.sort()).toEqual(["admin", "coordenaODestino", "superAdmin"]);
  });

  it("editar: o lado de quem pediu", () => {
    const podem = (Object.keys(PESSOAS) as Pessoa[]).filter((p) => podeEditarATransferencia(PESSOAS[p], PEDIDO));
    expect(podem.sort()).toEqual(["admin", "coordenaAOrigem", "quemPediu", "superAdmin"]);
  });

  it("comentar: quem escreve; o somente leitura só lê", () => {
    expect(podeComentar(PESSOAS.colegaDoDestino)).toBe(true);
    expect(podeComentar(PESSOAS.somenteLeitura)).toBe(false);
    expect(podeComentar({ userId: "", role: "ADMIN" })).toBe(false);
  });
});

describe("o texto de devolver e de reenviar", () => {
  it("é obrigatório nas duas", () => {
    expect(textoDaAcao("devolver", "   ")).toEqual({ ok: false, erro: "Escreva o motivo da devolução." });
    expect(textoDaAcao("reenviar", null)).toEqual({ ok: false, erro: "Escreva a resposta antes de reenviar." });
  });

  it("vai até 1.000 caracteres", () => {
    expect(MOTIVO_MAXIMO).toBe(1000);
    expect(textoDaAcao("devolver", "x".repeat(1000))).toEqual({ ok: true, texto: "x".repeat(1000) });
    expect(textoDaAcao("devolver", "x".repeat(1001))).toEqual({ ok: false, erro: "O motivo pode ter até 1.000 caracteres." });
    expect(textoDaAcao("reenviar", "y".repeat(1001))).toEqual({ ok: false, erro: "A resposta pode ter até 1.000 caracteres." });
  });

  it("sai sem espaço sobrando; nas outras ações não há texto", () => {
    expect(textoDaAcao("devolver", "  Falta o distrato  ")).toEqual({ ok: true, texto: "Falta o distrato" });
    expect(textoDaAcao("finalizar", "ignorado")).toEqual({ ok: true, texto: null });
  });

  it("o comentário não pode ir vazio", () => {
    expect(textoDoComentario(" \n ")).toEqual({ ok: false, erro: "Escreva o comentário." });
    expect(textoDoComentario(" Pedi ao cliente. ")).toEqual({ ok: true, texto: "Pedi ao cliente." });
  });
});

describe("responsáveis: quem entra e quem sai", () => {
  it("só a diferença — quem já estava não entra de novo (e não é avisado)", () => {
    expect(diferencaDeResponsaveis(["u-ana", "u-paulo"], ["u-paulo", "u-bruno"])).toEqual({ entram: ["u-bruno"], saem: ["u-ana"] });
    expect(diferencaDeResponsaveis(["u-ana"], ["u-ana"])).toEqual({ entram: [], saem: [] });
    expect(diferencaDeResponsaveis([], ["u-ana", "u-ana"])).toEqual({ entram: ["u-ana"], saem: [] });
  });

  it("o resumo do evento", () => {
    expect(resumoDosResponsaveis(["Bruno Alves"], ["Ana Torres", "Carla Dias"])).toBe("Entra: Bruno Alves. Saem: Ana Torres e Carla Dias.");
    expect(resumoDosResponsaveis(["Ana", "Bia", "Caio"], [])).toBe("Entram: Ana, Bia e Caio.");
  });
});

describe("quem recebe o aviso do comentário", () => {
  it("quem pediu e os responsáveis; o mencionado recebe a menção, e não as duas; o autor nada", () => {
    expect(
      destinatariosDoComentario({
        autor: "u-paulo",
        requestedBy: "u-marina",
        responsaveis: ["u-paulo", "u-ana", "u-ana"],
        mencionados: ["u-ana", "u-davi", "u-paulo"],
      })
    ).toEqual({ comentario: ["u-marina"], mencao: ["u-ana", "u-davi"] });
  });

  it("quem pediu comentando não avisa a si mesmo", () => {
    expect(destinatariosDoComentario({ autor: "u-marina", requestedBy: "u-marina", responsaveis: ["u-paulo"], mencionados: [] })).toEqual({
      comentario: ["u-paulo"],
      mencao: [],
    });
  });
});

describe("textos com o nome do setor", () => {
  it("o gênero sai da terminação: -a e -ão são femininos", () => {
    expect(doSetor("Fiscal")).toBe("do Fiscal");
    expect(doSetor("Controladoria")).toBe("da Controladoria");
    expect(aoSetor("Societário")).toBe("ao Societário");
    expect(aoSetor("Gestão")).toBe("à Gestão");
    expect(aoSetor("DP")).toBe("ao DP");
    expect(peloSetor("Corretora")).toBe("pela Corretora");
    expect(peloSetor("BPO")).toBe("pelo BPO");
  });

  it("os botões e os avisos", () => {
    const setores = { parte: "Contábil", origem: "Societário" };
    expect(rotuloDaAcao("comecar", setores)).toBe("Começar");
    expect(rotuloDaAcao("finalizar", setores)).toBe("Finalizar a parte do Contábil");
    expect(rotuloDaAcao("devolver", setores)).toBe("Devolver ao Societário");
    expect(rotuloDaAcao("reenviar", setores)).toBe("Responder e reenviar");
    expect(avisoDaAcao("devolver", setores)).toBe("Parte do Contábil devolvida ao Societário.");
  });

  it("nomes e resumo", () => {
    expect(juntarNomes([])).toBe("");
    expect(juntarNomes(["Ana"])).toBe("Ana");
    expect(juntarNomes(["Ana", "Bia"])).toBe("Ana e Bia");
    expect(resumir("  falta   o distrato ", 50)).toBe("falta o distrato");
    expect(resumir("abcdefghij", 6)).toBe("abcde…");
  });
});
