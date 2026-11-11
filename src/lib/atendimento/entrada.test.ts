import { beforeEach, describe, expect, it, vi } from "vitest";

// A mensagem que chega pelo número do escritório (10/11/2026): vira conversa,
// entra na triagem e avisa a Controladoria; reentrega não repete nada; PARAR
// silencia; quem já está com alguém avisa essa pessoa.

const prisma = {
  atendimentoContato: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  atendimentoConversa: { upsert: vi.fn(), update: vi.fn() },
  atendimentoMensagem: { create: vi.fn(), update: vi.fn() },
  atendimentoCiclo: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
};
const avisarTriagem = vi.fn();
const avisarResposta = vi.fn();
const enviarNoAtendimento = vi.fn();
let moduloLigado = true;

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("@/lib/integracoes/data", () => ({ lerConfig: () => ({}) }));
vi.mock("./contexto", () => ({ configDoAtendimento: async () => ({ enabled: moduloLigado, triagem: "controladoria" }) }));
vi.mock("./dados", () => ({
  cadastroPeloTelefone: async () => null,
  lerConfiguracao: async () => ({
    diasDaSemana: "0,1,2,3,4,5,6",
    abreAs: "00:00",
    fechaAs: "23:59",
    boasVindas: "Olá! Já respondemos.",
    foraDoHorario: null,
    diasParaReabrir: 7,
  }),
  nomesDosContatos: async () => () => ({ titulo: "Rafael", subtitulo: null, empresa: null, pessoa: null }),
}));
vi.mock("./avisos", () => ({ avisarTriagem: (...a: unknown[]) => avisarTriagem(...a), avisarResposta: (...a: unknown[]) => avisarResposta(...a) }));
vi.mock("./transporte", () => ({ enviarNoAtendimento: (...a: unknown[]) => enviarNoAtendimento(...a) }));

const { atenderEntrada } = await import("./entrada");
const { provedorDaIntegracao } = await import("@/lib/whatsapp/provedores");

const conexao = { id: "int1", tenantId: "t1", integrationCode: "whatsapp_atendimento_evolution", enabled: true, configEnc: "" };
const provedor = provedorDaIntegracao("whatsapp_atendimento_evolution")!;
const msg = (texto: string, id = "wa1") => ({ waMessageId: id, de: "5541988887777", texto, recebidaEm: new Date(), nomeDoPerfil: "Rafael" });

beforeEach(() => {
  vi.clearAllMocks();
  moduloLigado = true;
  prisma.atendimentoContato.findUnique.mockResolvedValue(null);
  prisma.atendimentoContato.upsert.mockResolvedValue({ id: "ct1", waPhone: "5541988887777", nomeNoWhatsapp: "Rafael", nome: null, companyId: null, personId: null });
  prisma.atendimentoConversa.upsert.mockResolvedValue({ id: "cv1", optedOutAt: null });
  prisma.atendimentoMensagem.create.mockResolvedValue({ id: "m1" });
  prisma.atendimentoCiclo.findFirst.mockResolvedValue(null);
  prisma.atendimentoCiclo.create.mockResolvedValue({ id: "cl1" });
  enviarNoAtendimento.mockResolvedValue({ ok: true, mensagemId: "m2" });
});

describe("entrada do Atendimento", () => {
  it("número novo vira contato desconhecido, entra na triagem, recebe as boas-vindas e avisa a triagem", async () => {
    expect(await atenderEntrada(conexao, provedor, msg("Oi, quero abrir uma empresa"))).toBe("triagem");
    expect(prisma.atendimentoContato.upsert.mock.calls[0]![0].create).toMatchObject({ tipo: "DESCONHECIDO", waPhone: "5541988887777" });
    expect(prisma.atendimentoCiclo.create.mock.calls[0]![0].data).toMatchObject({ situacao: "TRIAGEM" });
    expect(enviarNoAtendimento).toHaveBeenCalledWith(expect.objectContaining({ texto: "Olá! Já respondemos.", assinatura: "Atendimento 41", automatica: true }));
    expect(avisarTriagem).toHaveBeenCalledWith(expect.objectContaining({ triagem: "controladoria", cicloId: "cl1" }));
  });

  it("reentrega do provedor para na gravação e não repete nada", async () => {
    prisma.atendimentoMensagem.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await atenderEntrada(conexao, provedor, msg("Oi"))).toBe("repetida");
    expect(prisma.atendimentoCiclo.create).not.toHaveBeenCalled();
    expect(avisarTriagem).not.toHaveBeenCalled();
  });

  it("com o módulo desligado não grava nada", async () => {
    moduloLigado = false;
    expect(await atenderEntrada(conexao, provedor, msg("Oi"))).toBe("modulo_desligado");
    expect(prisma.atendimentoContato.upsert).not.toHaveBeenCalled();
  });

  it("PARAR marca a conversa e confirma uma vez, sem abrir atendimento", async () => {
    expect(await atenderEntrada(conexao, provedor, msg("PARAR"))).toBe("parou");
    expect(prisma.atendimentoConversa.update).toHaveBeenCalledWith(expect.objectContaining({ data: { optedOutAt: expect.any(Date) } }));
    expect(enviarNoAtendimento).toHaveBeenCalledTimes(1);
    expect(prisma.atendimentoCiclo.create).not.toHaveBeenCalled();
  });

  it("conversa aguardando o cliente volta para em atendimento e avisa o responsável", async () => {
    prisma.atendimentoCiclo.findFirst.mockResolvedValue({ id: "cl9", situacao: "AGUARDANDO_CLIENTE", sectorCode: "fiscal", assignedToId: "ana", encerradoEm: null });
    prisma.atendimentoCiclo.update.mockResolvedValue({ id: "cl9", situacao: "EM_ATENDIMENTO", sectorCode: "fiscal", assignedToId: "ana" });
    expect(await atenderEntrada(conexao, provedor, msg("Mandei o comprovante"))).toBe("continua");
    expect(prisma.atendimentoCiclo.update.mock.calls[0]![0].data).toEqual({ situacao: "EM_ATENDIMENTO" });
    expect(avisarResposta).toHaveBeenCalledWith(expect.objectContaining({ paraUserId: "ana", cicloId: "cl9" }));
    expect(avisarTriagem).not.toHaveBeenCalled();
  });

  it("encerrado há pouco reabre com o mesmo setor e a mesma pessoa", async () => {
    prisma.atendimentoCiclo.findFirst.mockResolvedValue({ id: "cl9", situacao: "ENCERRADO", sectorCode: "fiscal", assignedToId: "ana", encerradoEm: new Date() });
    prisma.atendimentoCiclo.create.mockResolvedValue({ id: "cl10" });
    expect(await atenderEntrada(conexao, provedor, msg("Oi de novo"))).toBe("reaberta");
    expect(prisma.atendimentoCiclo.create.mock.calls[0]![0].data).toMatchObject({ situacao: "EM_ATENDIMENTO", sectorCode: "fiscal", assignedToId: "ana" });
    expect(avisarResposta).toHaveBeenCalledWith(expect.objectContaining({ paraUserId: "ana" }));
  });
});
