// O número do escritório e o envio pelo Atendimento.
//
// O envio segue a regra do Recrutamento (`src/lib/whatsapp/envio.ts`): a linha é
// gravada ANTES de sair, e depois fechada com o resultado. Uma mensagem que o
// cliente recebeu e o Connect não registrou é o único estado que não tem conserto.

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { CODIGOS_DO_ATENDIMENTO, provedorDaIntegracao } from "@/lib/whatsapp/provedores";
import type { ConfigDoProvedor, ProvedorWhatsapp } from "@/lib/whatsapp/provedores/tipos";
import { dentroDaJanelaLivre } from "@/lib/whatsapp/decisao";
import { textoAssinado } from "./regras";

export type ConexaoDoAtendimento = {
  id: string;
  tenantId: string;
  integrationCode: string;
  provedor: ProvedorWhatsapp;
  config: ConfigDoProvedor;
};

/** A conexão do número de uma conversa. `null` = desligada, apagada ou de outro tipo. */
export async function conexaoPeloId(tenantId: string, integrationId: string): Promise<ConexaoDoAtendimento | null> {
  const linha = await getPrisma().tenantIntegration.findFirst({
    where: { id: integrationId, tenantId, enabled: true, integrationCode: { in: CODIGOS_DO_ATENDIMENTO } },
    select: { id: true, tenantId: true, integrationCode: true, configEnc: true },
  });
  if (!linha) return null;
  const provedor = provedorDaIntegracao(linha.integrationCode);
  if (!provedor) return null;
  return { id: linha.id, tenantId: linha.tenantId, integrationCode: linha.integrationCode, provedor, config: lerConfig(linha.configEnc) };
}

/** As conexões de Atendimento do escritório, para a tela de configurações. */
export async function conexoesDoEscritorio(tenantId: string) {
  return getPrisma().tenantIntegration.findMany({
    where: { tenantId, integrationCode: { in: CODIGOS_DO_ATENDIMENTO } },
    select: { id: true, integrationCode: true, label: true, enabled: true, lastError: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export type PodeEnviar = { ok: true } | { ok: false; motivo: string };

/** A conversa aceita mensagem livre agora? Fora da janela da Meta, ou com PARAR, não. */
export function podeEnviarNaConversa(
  conversa: { lastInboundAt: Date | null; optedOutAt: Date | null },
  provedor: ProvedorWhatsapp,
  agora: Date
): PodeEnviar {
  if (conversa.optedOutAt) return { ok: false, motivo: "O cliente pediu para parar de receber mensagens. Só ele pode retomar, escrevendo de novo." };
  if (!dentroDaJanelaLivre(conversa.lastInboundAt, agora, provedor.politica.janelaLivreHoras)) {
    return {
      ok: false,
      motivo: "Passaram 24 h desde a última mensagem do cliente. O WhatsApp só deixa retomar com um modelo aprovado pela Meta.",
    };
  }
  return { ok: true };
}

/**
 * Grava, envia e fecha a linha. Caminho único de saída do Atendimento.
 * `texto` é o que a pessoa escreveu; o cliente recebe com a assinatura em cima.
 */
export async function enviarNoAtendimento(p: {
  tenantId: string;
  conversaId: string;
  cicloId: string | null;
  waPhone: string;
  conexao: ConexaoDoAtendimento;
  texto: string;
  assinatura: string;
  senderUserId: string | null;
  automatica?: boolean;
}): Promise<{ ok: true; mensagemId: string } | { ok: false; erro: string; mensagemId: string }> {
  const prisma = getPrisma();
  const agora = new Date();
  const linha = await prisma.atendimentoMensagem.create({
    data: {
      tenantId: p.tenantId,
      conversaId: p.conversaId,
      cicloId: p.cicloId,
      direcao: "SAIDA",
      body: p.texto,
      status: "PENDENTE",
      senderUserId: p.senderUserId,
      assinatura: p.assinatura,
      automatica: p.automatica ?? false,
      createdAt: agora,
    },
    select: { id: true },
  });

  const r = await p.conexao.provedor.enviarTexto(p.conexao.config, p.waPhone, textoAssinado(p.assinatura, p.texto));

  await prisma.atendimentoMensagem.update({
    where: { id: linha.id },
    data: r.ok ? { status: "ENVIADA", waMessageId: r.waMessageId, erro: null } : { status: "FALHOU", erro: r.erro.slice(0, 500) },
  });
  await prisma.atendimentoConversa.update({ where: { id: p.conversaId }, data: { lastMessageAt: agora } });

  return r.ok ? { ok: true, mensagemId: linha.id } : { ok: false, erro: r.erro, mensagemId: linha.id };
}
