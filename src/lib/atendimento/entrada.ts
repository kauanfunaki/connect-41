// A mensagem que chega pelo número do escritório.
//
// O webhook (`/api/integrations/whatsapp/webhook/[integrationId]`) desvia para
// cá quando a conexão é do Atendimento: nada do atendimento de candidato roda.
// Aqui não há robô — a mensagem vira conversa, o ciclo entra na triagem (ou
// segue com quem já atendia), e as pessoas são avisadas.
//
// Idempotência: o `waMessageId` é único em `AtendimentoMensagem`. Reentrega do
// provedor esbarra nele e para antes de qualquer efeito.

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { naFila } from "@/lib/whatsapp/fila";
import { pediuParaSair, voltouAConversar, CONFIRMACAO_DE_SAIDA } from "@/lib/whatsapp/decisao";
import type { MensagemIgnorada, MensagemRecebida, ProvedorWhatsapp } from "@/lib/whatsapp/provedores/tipos";
import { configDoAtendimento } from "./contexto";
import { cadastroPeloTelefone, lerConfiguracao, nomesDosContatos } from "./dados";
import { avisarResposta, avisarTriagem } from "./avisos";
import { ASSINATURA_AUTOMATICA, decidirChegada, mensagemDeChegada, previa, situacaoAoReabrir, type Situacao } from "./regras";
import { enviarNoAtendimento, type ConexaoDoAtendimento } from "./transporte";

export type ConexaoDoWebhook = { id: string; tenantId: string; integrationCode: string; enabled: boolean; configEnc: string };

export type DesfechoDaEntrada = "repetida" | "modulo_desligado" | "parou" | "triagem" | "reaberta" | "continua";

/** O que chegou, já sem o envelope: texto ou mídia. */
type Chegada = {
  waMessageId: string;
  de: string;
  texto: string;
  nomeDoPerfil: string | null;
  midiaTipo: string | null;
};

const ROTULO_DA_MIDIA: Record<string, string> = {
  image: "imagem",
  audio: "áudio",
  video: "vídeo",
  document: "documento",
  sticker: "figurinha",
  imageMessage: "imagem",
  audioMessage: "áudio",
  videoMessage: "vídeo",
  documentMessage: "documento",
  stickerMessage: "figurinha",
};

export function atenderEntrada(conexao: ConexaoDoWebhook, provedor: ProvedorWhatsapp, m: MensagemRecebida) {
  return receber(conexao, provedor, { waMessageId: m.waMessageId, de: m.de, texto: m.texto, nomeDoPerfil: m.nomeDoPerfil, midiaTipo: null });
}

/**
 * Áudio, imagem, documento. Por enquanto entra na conversa como aviso de que
 * chegou um arquivo (com a legenda), e a pessoa pede pelo portal se precisar;
 * baixar e guardar o arquivo chega com os anexos.
 */
export function atenderMidia(conexao: ConexaoDoWebhook, provedor: ProvedorWhatsapp, m: MensagemIgnorada) {
  const tipo = ROTULO_DA_MIDIA[m.tipo] ?? "arquivo";
  const nome = m.documento?.nomeDoArquivo ? ` (${m.documento.nomeDoArquivo})` : "";
  const legenda = m.legenda?.trim();
  const texto = `Arquivo recebido: ${tipo}${nome}${legenda ? `\n${legenda}` : ""}`;
  return receber(conexao, provedor, { waMessageId: m.waMessageId, de: m.de, texto, nomeDoPerfil: null, midiaTipo: m.tipo.slice(0, 30) });
}

function receber(conexao: ConexaoDoWebhook, provedor: ProvedorWhatsapp, c: Chegada): Promise<DesfechoDaEntrada> {
  // Uma mensagem por vez em cada conversa, como no Recrutamento: duas
  // mensagens seguidas de um número novo não podem abrir dois ciclos.
  return naFila(`atendimento:${conexao.id}:${c.de}`, () => processar(conexao, provedor, c));
}

async function processar(conexao: ConexaoDoWebhook, provedor: ProvedorWhatsapp, c: Chegada): Promise<DesfechoDaEntrada> {
  const prisma = getPrisma();
  const tenantId = conexao.tenantId;
  const cfg = await configDoAtendimento(tenantId);
  if (!cfg.enabled) return "modulo_desligado";

  const agora = new Date();

  // Contato e conversa: um por telefone.
  let contato = await prisma.atendimentoContato.findUnique({ where: { tenantId_waPhone: { tenantId, waPhone: c.de } } });
  if (!contato) {
    const cadastro = await cadastroPeloTelefone(tenantId, c.de);
    contato = await prisma.atendimentoContato.upsert({
      where: { tenantId_waPhone: { tenantId, waPhone: c.de } },
      update: {},
      create: {
        tenantId,
        waPhone: c.de,
        nomeNoWhatsapp: c.nomeDoPerfil?.slice(0, 120) ?? null,
        tipo: cadastro ? "CLIENTE" : "DESCONHECIDO",
        companyId: cadastro?.companyId ?? null,
        personId: cadastro?.personId ?? null,
      },
    });
  } else if (c.nomeDoPerfil && !contato.nomeNoWhatsapp) {
    contato = await prisma.atendimentoContato.update({ where: { id: contato.id }, data: { nomeNoWhatsapp: c.nomeDoPerfil.slice(0, 120) } });
  }

  const conversa = await prisma.atendimentoConversa.upsert({
    where: { integrationId_waPhone: { integrationId: conexao.id, waPhone: c.de } },
    update: {},
    create: { tenantId, integrationId: conexao.id, waPhone: c.de, contatoId: contato.id },
  });

  // A entrada primeiro: a reentrega para aqui.
  let mensagemId: string;
  try {
    const m = await prisma.atendimentoMensagem.create({
      data: {
        tenantId,
        conversaId: conversa.id,
        direcao: "ENTRADA",
        body: c.texto,
        waMessageId: c.waMessageId,
        midiaTipo: c.midiaTipo,
        createdAt: agora,
      },
      select: { id: true },
    });
    mensagemId = m.id;
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "P2002") return "repetida";
    throw err;
  }

  await prisma.atendimentoConversa.update({ where: { id: conversa.id }, data: { lastInboundAt: agora, lastMessageAt: agora } });

  const conexaoEnvio: ConexaoDoAtendimento = {
    id: conexao.id,
    tenantId,
    integrationCode: conexao.integrationCode,
    provedor,
    config: lerConfig(conexao.configEnc),
  };

  // PARAR: confirma uma vez e silencia. Quem escreve de novo volta.
  if (!c.midiaTipo && pediuParaSair(c.texto)) {
    await prisma.atendimentoConversa.update({ where: { id: conversa.id }, data: { optedOutAt: agora } });
    await enviarNoAtendimento({
      tenantId,
      conversaId: conversa.id,
      cicloId: null,
      waPhone: c.de,
      conexao: conexaoEnvio,
      texto: CONFIRMACAO_DE_SAIDA,
      assinatura: ASSINATURA_AUTOMATICA,
      senderUserId: null,
      automatica: true,
    });
    return "parou";
  }
  if (conversa.optedOutAt && (c.midiaTipo || voltouAConversar(c.texto))) {
    await prisma.atendimentoConversa.update({ where: { id: conversa.id }, data: { optedOutAt: null } });
  }

  const config = await lerConfiguracao(tenantId);
  const ultimo = await prisma.atendimentoCiclo.findFirst({
    where: { conversaId: conversa.id },
    orderBy: { abertoEm: "desc" },
    select: { id: true, situacao: true, sectorCode: true, assignedToId: true, encerradoEm: true },
  });
  const decisao = decidirChegada(ultimo ? { ...ultimo, situacao: ultimo.situacao as Situacao } : null, agora, config.diasParaReabrir);
  const nome = (await nomesDosContatos(tenantId, [contato]))(contato).titulo;

  if (decisao.tipo === "continuar") {
    await prisma.atendimentoMensagem.update({ where: { id: mensagemId }, data: { cicloId: decisao.cicloId } });
    const ciclo = await prisma.atendimentoCiclo.update({
      where: { id: decisao.cicloId },
      data: decisao.voltaDeAguardando ? { situacao: "EM_ATENDIMENTO" } : {},
      select: { id: true, situacao: true, sectorCode: true, assignedToId: true },
    });
    if (ciclo.situacao !== "TRIAGEM") {
      await avisarResposta({ tenantId, cicloId: ciclo.id, paraUserId: ciclo.assignedToId, sectorCode: ciclo.sectorCode, quem: nome, previa: previa(c.texto, 120) });
    }
    return "continua";
  }

  if (decisao.tipo === "reabrir") {
    const ciclo = await prisma.atendimentoCiclo.create({
      data: {
        tenantId,
        conversaId: conversa.id,
        situacao: situacaoAoReabrir(decisao.assignedToId),
        sectorCode: decisao.sectorCode,
        assignedToId: decisao.assignedToId,
        assignedAt: decisao.assignedToId ? agora : null,
        abertoEm: agora,
        movimentos: { create: { tenantId, tipo: "REABRIU", paraSector: decisao.sectorCode, paraUserId: decisao.assignedToId } },
      },
      select: { id: true },
    });
    await prisma.atendimentoMensagem.update({ where: { id: mensagemId }, data: { cicloId: ciclo.id } });
    await avisarResposta({ tenantId, cicloId: ciclo.id, paraUserId: decisao.assignedToId, sectorCode: decisao.sectorCode, quem: nome, previa: previa(c.texto, 120) });
    return "reaberta";
  }

  // Novo: triagem.
  const ciclo = await prisma.atendimentoCiclo.create({
    data: {
      tenantId,
      conversaId: conversa.id,
      situacao: "TRIAGEM",
      abertoEm: agora,
      movimentos: { create: { tenantId, tipo: "CHEGOU" } },
    },
    select: { id: true },
  });
  await prisma.atendimentoMensagem.update({ where: { id: mensagemId }, data: { cicloId: ciclo.id } });

  const automatica = mensagemDeChegada(config, agora);
  if (automatica) {
    await enviarNoAtendimento({
      tenantId,
      conversaId: conversa.id,
      cicloId: ciclo.id,
      waPhone: c.de,
      conexao: conexaoEnvio,
      texto: automatica,
      assinatura: ASSINATURA_AUTOMATICA,
      senderUserId: null,
      automatica: true,
    });
  }
  await avisarTriagem({ tenantId, cicloId: ciclo.id, triagem: cfg.triagem, quem: nome, previa: previa(c.texto, 120) });
  return "triagem";
}
