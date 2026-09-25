"use server";

// Conversa e documentos de um processo, do lado do cliente: responder a equipe
// e mandar o documento que o processo pede, dentro do próprio processo.
//
// Autoria gravada no próprio modelo (`authorPortalUserId`), não no AuditLog —
// o AuditLog exige um `User` interno, e cliente do portal não é um.

import { revalidatePath } from "next/cache";
import { nomeExibicao } from "@/lib/companyName";
import { notifySector, notifyUser } from "@/lib/notifications";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { setorDoModulo } from "@/lib/modules";
import { validarResposta } from "@/lib/financeiro/pendencias/regras";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import {
  arquivosDoProcesso,
  gravarDocumentos,
  gravarMensagem,
  lerDescricao,
  processoNoEscopo,
} from "@/lib/societario/conversa";

const MODULO = "societario_processos";

export type ResultadoDoPortal = { error: string } | { ok: true };

async function contexto(formData: FormData) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { ok: false as const, erro: "Sessão expirada. Entre de novo no portal." };
  if (!cliente.modulos.has(MODULO)) return { ok: false as const, erro: "Processos não habilitados." };
  const processo = await processoNoEscopo(
    { tenantId: cliente.tenantId, companyIds: cliente.companyIds },
    String(formData.get("processId") ?? "")
  );
  if (!processo) return { ok: false as const, erro: "Processo não encontrado." };
  return { ok: true as const, cliente, processo };
}

type Contexto = Extract<Awaited<ReturnType<typeof contexto>>, { ok: true }>;

/**
 * Avisa o responsável do processo; sem responsável, o setor inteiro.
 * Best-effort — o envio já está gravado.
 */
async function avisarEquipe(c: Contexto, oQue: string) {
  try {
    const aviso = {
      tenantId: c.cliente.tenantId,
      type: "PROCESS_MESSAGE",
      message: `${nomeExibicao(c.processo.company)} ${oQue} no processo ${c.processo.title || c.processo.type.name}.`,
      entityId: c.processo.id,
    };
    if (c.processo.ownerUserId) await notifyUser(c.processo.ownerUserId, aviso);
    else await notifySector((await setorDoModulo(c.cliente.tenantId, MODULO)) ?? "societario", aviso);
  } catch (err) {
    console.error("[portal:processo] aviso à equipe", c.processo.id, err);
  }
}

function revalidar(processId: string) {
  revalidatePath(`/portal/processos/${processId}`);
  revalidatePath(`/processos/${processId}`);
}

export async function enviarMensagemNoProcessoCliente(formData: FormData): Promise<ResultadoDoPortal> {
  const c = await contexto(formData);
  if (!c.ok) return { error: c.erro };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const mensagem = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!mensagem.ok) return { error: mensagem.erro };

  const gravados = await arquivosDoProcesso.gravarAnexos(c.cliente.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  await gravarMensagem({
    tenantId: c.cliente.tenantId,
    processId: c.processo.id,
    autor: { portalUserId: c.cliente.usuario.id },
    corpo: mensagem.corpo,
    anexos: gravados.anexos,
  });

  await avisarEquipe(c, gravados.anexos.length > 0 ? "mandou mensagem com anexo" : "mandou mensagem");
  revalidar(c.processo.id);
  return { ok: true };
}

export async function adicionarDocumentosNoProcessoCliente(formData: FormData): Promise<ResultadoDoPortal> {
  const c = await contexto(formData);
  if (!c.ok) return { error: c.erro };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  if (arquivos.length === 0) return { error: "Escolha ao menos um arquivo." };
  const descricao = lerDescricao(formData.get("descricao"));
  if (!descricao.ok) return { error: descricao.erro };

  const gravados = await arquivosDoProcesso.gravarAnexos(c.cliente.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  await gravarDocumentos({
    tenantId: c.cliente.tenantId,
    processId: c.processo.id,
    autor: { portalUserId: c.cliente.usuario.id },
    descricao: descricao.descricao,
    anexos: gravados.anexos,
  });

  await avisarEquipe(c, gravados.anexos.length === 1 ? "mandou um documento" : `mandou ${gravados.anexos.length} documentos`);
  revalidar(c.processo.id);
  return { ok: true };
}
