"use server";

// A conversa livre com o cliente, do lado da equipe: escrever mensagem, com ou
// sem anexo.
//
// Não há status para mudar nem prazo para conferir — é o que separa a conversa
// da pendência. A única regra de escrita é a mesma: mensagem precisa dizer
// alguma coisa, em texto ou em arquivo.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { nomeExibicao } from "@/lib/companyName";
import { validarResposta } from "@/lib/financeiro/pendencias/regras";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { usuariosDoPortalDaEmpresa } from "@/lib/financeiro/pendencias/avisos";
import { anexosDaConversa } from "@/lib/financeiro/comunicacao/armazenamento";
import { MODULO_DE_COMUNICACAO } from "@/lib/financeiro/comunicacao/regras";
import { sendMensagemAoClienteEmail } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";

export type ResultadoDaMensagem = { error: string } | { ok: true; aviso: string | null };

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULO_DE_COMUNICACAO)) ?? getModuleDef(MODULO_DE_COMUNICACAO)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { ok: false as const, erro: "Sem permissão na conversa com o cliente." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_DE_COMUNICACAO))) return { ok: false as const, erro: "Módulo não habilitado." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId, userId: ctx.userId || null, prisma: getPrisma() };
}

export async function enviarMensagemEquipe(formData: FormData): Promise<ResultadoDaMensagem> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const companyId = String(formData.get("companyId") ?? "");
  const empresa = await c.prisma.company.findFirst({
    where: { id: companyId, tenantId: c.tenantId },
    select: { id: true, name: true, displayName: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const mensagem = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!mensagem.ok) return { error: mensagem.erro };

  const gravados = await anexosDaConversa.gravarAnexos(c.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  let mensagemId: string;
  try {
    mensagemId = await c.prisma.$transaction(async (tx) => {
      const msg = await tx.companyMessage.create({
        data: { tenantId: c.tenantId, companyId: empresa.id, authorUserId: c.userId, body: mensagem.corpo },
        select: { id: true },
      });
      if (gravados.anexos.length > 0) {
        await tx.companyMessageAttachment.createMany({
          data: gravados.anexos.map((a) => ({ tenantId: c.tenantId, messageId: msg.id, ...a })),
        });
      }
      return msg.id;
    });
  } catch (err) {
    // Arquivo no disco sem a mensagem que o trouxe é lixo que ninguém encontra.
    await anexosDaConversa.apagarAnexosGravados(gravados.anexos);
    throw err;
  }

  const destinatarios = await usuariosDoPortalDaEmpresa(c.tenantId, empresa.id);
  // Push além do e-mail: quem instalou o portal no celular vê na hora. O corpo
  // da mensagem não vai em nenhum dos dois — ver `lib/portal/avisos.ts`.
  const [envio] = await Promise.all([
    destinatarios.length > 0
      ? sendMensagemAoClienteEmail({
          tenantId: c.tenantId,
          destinatarios: destinatarios.map((u) => ({ email: u.email, nome: u.name })),
          empresaNome: nomeExibicao(empresa),
        })
      : Promise.resolve({ enviados: 0, falhas: 0, semSmtp: false }),
    avisarClientePorPush(c.tenantId, destinatarios.map((u) => u.id), {
      tipo: "mensagem",
      empresaNome: nomeExibicao(empresa),
    }),
  ]);

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.company_message.sent",
    entityType: "Company",
    entityId: empresa.id,
    metadata: { mensagemId, anexos: gravados.anexos.length, emailsEnviados: envio.enviados, semSmtp: envio.semSmtp },
  });

  revalidatePath("/comunicacao");
  revalidatePath("/portal/comunicacao");

  return {
    ok: true,
    aviso:
      destinatarios.length === 0
        ? "Nenhum usuário ativo do portal nesta empresa — a mensagem fica aqui até alguém ter acesso."
        : envio.semSmtp
          ? "Mensagem gravada, mas o SMTP deste workspace não está configurado: o cliente só vê ao entrar no portal."
          : envio.falhas > 0
            ? `${envio.falhas} aviso(s) por e-mail falharam. O cliente vê a mensagem ao entrar no portal.`
            : null,
  };
}
