"use server";

// Conversa e documentos de um processo, do lado da equipe.
//
// Tudo o que a equipe escreve ou anexa aqui o cliente vê no portal — não há
// nota interna nesta conversa; para isso o processo tem as observações. Por
// isso cada envio avisa o cliente (e-mail e push), com o nome do processo e
// nada do conteúdo.

import { revalidatePath } from "next/cache";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { nomeExibicao } from "@/lib/companyName";
import { validarResposta } from "@/lib/financeiro/pendencias/regras";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { usuariosDoPortalDaEmpresa } from "@/lib/financeiro/pendencias/avisos";
import { sendNovidadeNoProcessoEmail } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";
import {
  arquivosDoProcesso,
  gravarDocumentos,
  gravarMensagem,
  lerDescricao,
  processoNoEscopo,
} from "@/lib/societario/conversa";

const SECTOR = "societario";
const MODULE = "societario_processos";

export type ResultadoNoProcesso = { error: string } | { ok: true; aviso: string | null };

async function contexto(formData: FormData) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) {
    return { ok: false as const, erro: "Sem permissão no Societário." };
  }
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo não habilitado." };
  const processo = await processoNoEscopo({ tenantId: ctx.tenantId, companyIds: null }, String(formData.get("processId") ?? ""));
  if (!processo) return { ok: false as const, erro: "Processo não encontrado." };
  return { ok: true as const, tenantId: ctx.tenantId, userId: ctx.userId || null, ctxUserId: ctx.userId, processo };
}

type Processo = NonNullable<Awaited<ReturnType<typeof processoNoEscopo>>>;

/** Avisa os usuários do portal da empresa. Best-effort: o envio já está gravado. */
async function avisarCliente(tenantId: string, processo: Processo, motivo: "mensagem" | "documento"): Promise<string | null> {
  try {
    const destinatarios = await usuariosDoPortalDaEmpresa(tenantId, processo.companyId);
    if (destinatarios.length === 0) {
      return "Nenhum usuário ativo do portal nesta empresa — fica gravado aqui até alguém ter acesso.";
    }
    const processoNome = `${processo.title || processo.type.name} — ${nomeExibicao(processo.company)}`;
    const [envio] = await Promise.all([
      sendNovidadeNoProcessoEmail({
        tenantId,
        destinatarios: destinatarios.map((u) => ({ email: u.email, nome: u.name })),
        processId: processo.id,
        processoNome,
        motivo,
      }),
      avisarClientePorPush(tenantId, destinatarios.map((u) => u.id), {
        tipo: "processo",
        motivo,
        processoNome,
        processId: processo.id,
      }),
    ]);
    if (envio.semSmtp) return "Gravado, mas o SMTP deste workspace não está configurado: o cliente só vê ao entrar no portal.";
    if (envio.falhas > 0) return `${envio.falhas} aviso(s) por e-mail falharam. O cliente vê ao entrar no portal.`;
    return null;
  } catch (err) {
    console.error("[processo:conversa] aviso ao cliente", processo.id, err);
    return "Gravado, mas o aviso ao cliente falhou. Ele vê ao entrar no portal.";
  }
}

function revalidar(processId: string) {
  revalidatePath(`/processos/${processId}`);
  revalidatePath(`/portal/processos/${processId}`);
}

export async function enviarMensagemNoProcesso(formData: FormData): Promise<ResultadoNoProcesso> {
  const c = await contexto(formData);
  if (!c.ok) return { error: c.erro };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const mensagem = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!mensagem.ok) return { error: mensagem.erro };

  const gravados = await arquivosDoProcesso.gravarAnexos(c.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  const mensagemId = await gravarMensagem({
    tenantId: c.tenantId,
    processId: c.processo.id,
    autor: { userId: c.userId },
    corpo: mensagem.corpo,
    anexos: gravados.anexos,
  });

  const aviso = await avisarCliente(c.tenantId, c.processo, "mensagem");
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctxUserId,
    action: "societario.processo.mensagem",
    entityType: "Process",
    entityId: c.processo.id,
    metadata: { mensagemId, anexos: gravados.anexos.length },
  });
  revalidar(c.processo.id);
  return { ok: true, aviso };
}

export async function adicionarDocumentosAoProcesso(formData: FormData): Promise<ResultadoNoProcesso> {
  const c = await contexto(formData);
  if (!c.ok) return { error: c.erro };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  if (arquivos.length === 0) return { error: "Escolha ao menos um arquivo." };
  const descricao = lerDescricao(formData.get("descricao"));
  if (!descricao.ok) return { error: descricao.erro };

  const gravados = await arquivosDoProcesso.gravarAnexos(c.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  await gravarDocumentos({
    tenantId: c.tenantId,
    processId: c.processo.id,
    autor: { userId: c.userId },
    descricao: descricao.descricao,
    anexos: gravados.anexos,
  });

  const aviso = await avisarCliente(c.tenantId, c.processo, "documento");
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctxUserId,
    action: "societario.processo.documento",
    entityType: "Process",
    entityId: c.processo.id,
    metadata: { arquivos: gravados.anexos.map((a) => a.fileName) },
  });
  revalidar(c.processo.id);
  return { ok: true, aviso };
}
