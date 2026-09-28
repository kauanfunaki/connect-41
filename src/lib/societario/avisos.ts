// Recebe o aviso de órgão que chegou por e-mail e o transforma em sugestão.
//
// Quem chama é a rota `/api/cron/societario-avisos-email`, alimentada pelo n8n
// (IMAP da caixa societario@). Nada aqui muda protocolo nem etapa: grava o
// aviso, liga ao protocolo quando o número bate, e avisa quem precisa decidir.
// Aplicar é ação de pessoa — ver `src/app/(app)/processos/avisos-actions.ts`.

import { getPrisma } from "@/lib/prisma";
import { notifySector, notifyUser } from "@/lib/notifications";
import { setorDoModulo } from "@/lib/modules";
import { lerAvisoDaJunta, textoDoEmail } from "@/lib/societario/orgaos/junta-email";
import { SIGLA as SIGLA_JUNTA } from "@/lib/societario/orgaos/junta";
import { nomeExibicao } from "@/lib/companyName";

const SETOR = "societario";
const MODULE = "societario_processos";

export type EmailDoN8n = {
  messageId: string;
  remetente: string | null;
  assunto: string | null;
  recebidoEm: Date;
  texto: string | null;
  html: string | null;
};

export type ResultadoDoAviso =
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "repetido"; avisoId: string }
  | { tipo: "gravado"; avisoId: string; sugestao: string; protocolos: number };

const ROTULO: Record<string, string> = {
  EXIGENCIA: "exigência",
  DEFERIDO: "deferido",
  CANCELADO: "cancelado",
  REVISAR: "conferir",
};

export async function receberAvisoPorEmail(tenantId: string, email: EmailDoN8n): Promise<ResultadoDoAviso> {
  const prisma = getPrisma();
  const messageId = email.messageId.trim().slice(0, 255);
  if (!messageId) return { tipo: "ignorado", motivo: "e-mail sem Message-ID" };

  const existente = await prisma.avisoDeOrgao.findUnique({
    where: { tenantId_messageId: { tenantId, messageId } },
    select: { id: true },
  });
  if (existente) return { tipo: "repetido", avisoId: existente.id };

  // Os protocolos da Junta ainda em aberto neste tenant: é contra eles que o
  // texto é comparado (ver `lerAvisoDaJunta`).
  const pendentes = await prisma.processProtocol.findMany({
    where: { tenantId, outcome: "PENDENTE", number: { not: null }, organ: { acronym: SIGLA_JUNTA } },
    select: { id: true, number: true, processId: true, process: { select: { ownerUserId: true } } },
  });

  const texto = textoDoEmail(email.texto, email.html);
  const leitura = lerAvisoDaJunta(
    { remetente: email.remetente, assunto: email.assunto, texto },
    pendentes.map((p) => p.number!)
  );
  // A caixa do societario@ recebe de tudo — cliente, prefeitura, código de
  // acesso. Só fica o que é da Junta ou cita protocolo nosso; o resto nem é
  // gravado, porque não é assunto do robô.
  if (!leitura.ehDaJunta) return { tipo: "ignorado", motivo: "não é aviso da Junta" };

  // Um aviso costuma citar um protocolo. Se citar mais de um, fica sem vínculo
  // e vai para a lista geral: escolher um seria palpite.
  const alvo = leitura.protocolos.length === 1 ? pendentes.find((p) => p.number && leitura.protocolos.includes(p.number)) : undefined;

  const aviso = await prisma.avisoDeOrgao.create({
    data: {
      tenantId,
      organAcronym: SIGLA_JUNTA,
      messageId,
      sender: email.remetente?.slice(0, 255) ?? null,
      subject: email.assunto?.slice(0, 500) ?? null,
      receivedAt: email.recebidoEm,
      body: texto,
      protocolNumber: leitura.protocolos[0] ?? leitura.protocoloNovo,
      protocolId: alvo?.id ?? null,
      processId: alvo?.processId ?? null,
      suggestion: leitura.sugestao,
      suggestionDetail: leitura.detalhe,
    },
    select: { id: true },
  });

  const rotulo = ROTULO[leitura.sugestao] ?? "conferir";
  if (alvo) {
    const input = {
      tenantId,
      type: "PROCESS_AVISO_JUNTA",
      message: `Aviso da Junta no protocolo ${alvo.number}: ${rotulo}. Confira e aplique no processo.`,
      entityId: alvo.processId,
    };
    if (alvo.process.ownerUserId) await notifyUser(alvo.process.ownerUserId, input);
    else await notifySector((await setorDoModulo(tenantId, MODULE)) ?? SETOR, input);
  } else {
    await notifySector((await setorDoModulo(tenantId, MODULE)) ?? SETOR, {
      tenantId,
      type: "AVISO_ORGAO_SEM_PROCESSO",
      message: "Chegou um aviso da Junta que não bateu com nenhum protocolo aberto. Confira em Avisos da Junta.",
    });
  }

  return { tipo: "gravado", avisoId: aviso.id, sugestao: leitura.sugestao, protocolos: leitura.protocolos.length };
}

/** Os avisos que esperam uma pessoa — de um processo, ou de todos. */
export async function avisosPendentes(tenantId: string, processId?: string) {
  const avisos = await getPrisma().avisoDeOrgao.findMany({
    where: { tenantId, status: "PENDENTE", ...(processId ? { processId } : {}) },
    orderBy: { receivedAt: "desc" },
    take: 100,
    select: {
      id: true,
      receivedAt: true,
      sender: true,
      subject: true,
      body: true,
      protocolNumber: true,
      suggestion: true,
      suggestionDetail: true,
      protocol: { select: { outcome: true } },
      process: {
        select: {
          id: true,
          type: { select: { name: true } },
          company: { select: { name: true, displayName: true } },
        },
      },
    },
  });
  return avisos.map((a) => ({
    id: a.id,
    recebidoEm: a.receivedAt,
    remetente: a.sender,
    assunto: a.subject,
    corpo: a.body,
    protocolo: a.protocolNumber,
    aplicavel: a.protocol?.outcome === "PENDENTE",
    processo: a.process
      ? { id: a.process.id, nome: `${a.process.type.name} — ${nomeExibicao(a.process.company)}` }
      : null,
    sugestao: a.suggestion,
    detalhe: a.suggestionDetail,
  }));
}

export async function contarAvisosPendentes(tenantId: string): Promise<number> {
  return getPrisma().avisoDeOrgao.count({ where: { tenantId, status: "PENDENTE" } });
}
