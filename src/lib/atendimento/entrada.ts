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
import { avisarQuemVeTudo, avisarResposta, avisarTriagem } from "./avisos";
import {
  ASSINATURA_AUTOMATICA,
  decidirChegada,
  esperaNota,
  mensagemDeChegada,
  notaDaResposta,
  previa,
  quemAvisarNaResposta,
  situacaoAoReabrir,
  type Situacao,
} from "./regras";
import { enviarNoAtendimento, type ConexaoDoAtendimento } from "./transporte";
import { arquivosDoAtendimento, rotuloDaMidia } from "./midia";

export type ConexaoDoWebhook = { id: string; tenantId: string; integrationCode: string; enabled: boolean; configEnc: string };

export type DesfechoDaEntrada = "repetida" | "modulo_desligado" | "parou" | "triagem" | "reaberta" | "continua" | "nota";

/** O que chegou, já sem o envelope: texto ou mídia. */
type Chegada = {
  waMessageId: string;
  de: string;
  texto: string;
  nomeDoPerfil: string | null;
  midiaTipo: string | null;
  /** A mídia para baixar e guardar, quando o provedor sabe (11/11/2026). */
  midia?: MensagemIgnorada["midia"];
};

export function atenderEntrada(conexao: ConexaoDoWebhook, provedor: ProvedorWhatsapp, m: MensagemRecebida) {
  return receber(conexao, provedor, { waMessageId: m.waMessageId, de: m.de, texto: m.texto, nomeDoPerfil: m.nomeDoPerfil, midiaTipo: null });
}

/**
 * Áudio, imagem, documento: o arquivo é baixado e guardado na própria
 * mensagem, que leva a legenda como texto. Se não der para baixar, a conversa
 * mostra que chegou um arquivo, e a pessoa pede de novo ou pelo portal.
 */
export async function atenderMidia(conexao: ConexaoDoWebhook, provedor: ProvedorWhatsapp, m: MensagemIgnorada) {
  // Telefone escondido pelo WhatsApp: abrir conversa com o identificador seria
  // responder para um número que não é o do cliente.
  if (m.semNumero) return "sem_numero" as const;
  const tipo = rotuloDaMidia(m.tipo);
  const legenda = m.legenda?.trim() ?? "";
  const nome = m.midia?.nomeDoArquivo ?? m.documento?.nomeDoArquivo ?? null;
  const texto = legenda || `Arquivo recebido: ${tipo}${nome ? ` (${nome})` : ""}`;
  return receber(conexao, provedor, { waMessageId: m.waMessageId, de: m.de, texto, nomeDoPerfil: null, midiaTipo: m.tipo.slice(0, 30), midia: m.midia });
}

/** Baixa e guarda o arquivo da mensagem. Nunca lança: falhar aqui não pode perder a mensagem. */
async function guardarMidia(
  tenantId: string,
  mensagemId: string,
  provedor: ProvedorWhatsapp,
  configEnc: string,
  c: Chegada
): Promise<void> {
  if (!c.midia || !provedor.baixarMidia) return;
  try {
    const r = await provedor.baixarMidia(lerConfig(configEnc), c.midia.referencia);
    if (!r.ok) {
      console.error("[atendimento:midia] não baixou", mensagemId, r.erro);
      return;
    }
    const nome = r.nomeDoArquivo ?? c.midia.nomeDoArquivo ?? `${rotuloDaMidia(c.midiaTipo ?? "")}`;
    const g = await arquivosDoAtendimento.gravarAnexos(tenantId, [new File([new Uint8Array(r.bytes)], nome)]);
    if (!g.ok) {
      console.error("[atendimento:midia] recusada", mensagemId, g.erro);
      return;
    }
    const a = g.anexos[0]!;
    await getPrisma().atendimentoMensagem.update({
      where: { id: mensagemId },
      data: { midiaPath: a.fileUrl, midiaNome: a.fileName.slice(0, 180), midiaMime: a.mimeType.slice(0, 100) },
    });
  } catch (err) {
    console.error("[atendimento:midia] falha", mensagemId, err);
  }
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
  await guardarMidia(tenantId, mensagemId, provedor, conexao.configEnc, c);

  await prisma.atendimentoConversa.update({ where: { id: conversa.id }, data: { lastInboundAt: agora, lastMessageAt: agora } });

  const conexaoEnvio: ConexaoDoAtendimento = {
    id: conexao.id,
    tenantId,
    integrationCode: conexao.integrationCode,
    provedor,
    config: lerConfig(conexao.configEnc),
  };

  const config = await lerConfiguracao(tenantId);

  // PARAR: confirma uma vez e silencia. Quem escreve de novo volta. Com as
  // respostas automáticas desligadas, só marca, sem responder.
  if (!c.midiaTipo && pediuParaSair(c.texto)) {
    await prisma.atendimentoConversa.update({ where: { id: conversa.id }, data: { optedOutAt: agora } });
    if (config.respostasAutomaticas) await enviarNoAtendimento({
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

  const ultimo = await prisma.atendimentoCiclo.findFirst({
    where: { conversaId: conversa.id },
    orderBy: { abertoEm: "desc" },
    select: { id: true, situacao: true, sectorCode: true, assignedToId: true, encerradoEm: true, notaPedidaEm: true, nota: true },
  });

  // A nota do cliente (12/11/2026): a resposta que é só o número, logo depois
  // de encerrar, fica no atendimento encerrado e não reabre a conversa.
  const nota = !c.midiaTipo ? notaDaResposta(c.texto) : null;
  if (ultimo && nota !== null && esperaNota({ ...ultimo, situacao: ultimo.situacao as Situacao }, agora)) {
    await prisma.atendimentoMensagem.update({ where: { id: mensagemId }, data: { cicloId: ultimo.id } });
    await prisma.atendimentoCiclo.update({ where: { id: ultimo.id }, data: { nota, notaEm: agora } });
    return "nota";
  }

  const decisao = decidirChegada(ultimo ? { ...ultimo, situacao: ultimo.situacao as Situacao } : null, agora, config.diasParaReabrir);
  const nome = (await nomesDosContatos(tenantId, [contato]))(contato).titulo;

  if (decisao.tipo === "continuar") {
    await prisma.atendimentoMensagem.update({ where: { id: mensagemId }, data: { cicloId: decisao.cicloId } });
    const ciclo = await prisma.atendimentoCiclo.update({
      where: { id: decisao.cicloId },
      data: decisao.voltaDeAguardando ? { situacao: "EM_ATENDIMENTO" } : {},
      select: { id: true, situacao: true, sectorCode: true, assignedToId: true, transferidaParaId: true },
    });
    await avisarResposta({ tenantId, cicloId: ciclo.id, para: quemAvisarNaResposta({ ...ciclo, situacao: ciclo.situacao as Situacao }), quem: nome, previa: previa(c.texto, 120) });
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
    await avisarResposta({
      tenantId,
      cicloId: ciclo.id,
      para: quemAvisarNaResposta({ situacao: situacaoAoReabrir(decisao.assignedToId), sectorCode: decisao.sectorCode, assignedToId: decisao.assignedToId }),
      quem: nome,
      previa: previa(c.texto, 120),
    });
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

  const automatica = config.respostasAutomaticas ? mensagemDeChegada(config, agora) : null;
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
  await avisarQuemVeTudo({ tenantId, cicloId: ciclo.id, lista: cfg.veemTudo ?? [], triagem: cfg.triagem, quem: nome, previa: previa(c.texto, 120) });
  return "triagem";
}
