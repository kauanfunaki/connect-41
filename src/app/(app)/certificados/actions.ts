"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import {
  acessoAosCertificados,
  declararUsos,
  gravarRenovacao,
  importarCertificados,
  type ResumoDaImportacao,
} from "@/lib/certificados/servidor";
import { validarRenovacao, validarUsosDeclarados } from "@/lib/certificados/usos";

/** Teto por importação: a pasta da 41 tem ~480 arquivos; 5 mil é folga, não limite de uso. */
const MAXIMO_DE_LINHAS = 5000;

export async function importarRelatorio(linhas: unknown): Promise<{ error: string } | { ok: true; resumo: ResumoDaImportacao }> {
  const acesso = await acessoAosCertificados();
  if (!acesso) return { error: "Módulo não habilitado ou sem acesso." };
  if (!acesso.podeImportar) return { error: "Sem permissão para importar." };
  if (!Array.isArray(linhas) || linhas.length === 0) return { error: "Nenhum certificado no arquivo." };
  if (linhas.length > MAXIMO_DE_LINHAS) return { error: `Arquivo grande demais (máximo de ${MAXIMO_DE_LINHAS} linhas).` };

  const resumo = await importarCertificados(acesso.tenantId, linhas);
  await logAudit({
    tenantId: acesso.tenantId,
    userId: acesso.ctx.userId,
    action: "certificados.importar",
    entityType: "DigitalCertificate",
    metadata: resumo,
  });
  revalidatePath("/certificados");
  return { ok: true, resumo };
}

/** O "Usado por" à mão (05/11/2026): só quem coordena. Vale para o documento, e o certificado renovado herda. */
export async function salvarUsadoPor(documento: unknown, usos: unknown): Promise<{ error: string } | { ok: true }> {
  const acesso = await acessoAosCertificados();
  if (!acesso) return { error: "Módulo não habilitado ou sem acesso." };
  if (!acesso.podeDeclararUso) return { error: "Só quem coordena o setor marca onde o certificado é usado." };
  const doc = typeof documento === "string" ? documento.replace(/\D/g, "") : "";
  if (doc.length !== 11 && doc.length !== 14) return { error: "Documento inválido." };
  const validos = validarUsosDeclarados(usos);
  if (!validos) return { error: "Uso inválido. No “Outro”, escreva qual é." };
  await declararUsos(acesso.tenantId, doc, validos, acesso.ctx.userId);
  await logAudit({
    tenantId: acesso.tenantId,
    userId: acesso.ctx.userId,
    action: "certificados.usado_por",
    entityType: "DigitalCertificate",
    metadata: { documento: doc, usos: validos.map((u) => u.uso) },
  });
  revalidatePath("/certificados");
  return { ok: true };
}

/** A renovação: situação, responsável, custo e quem paga — quem opera a tela (Tech ou Financeiro). */
export async function salvarRenovacao(id: unknown, form: unknown): Promise<{ error: string } | { ok: true }> {
  const acesso = await acessoAosCertificados();
  if (!acesso) return { error: "Módulo não habilitado ou sem acesso." };
  if (!acesso.podeImportar) return { error: "Sem permissão para editar a renovação." };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "Certificado não encontrado." };
  const v = validarRenovacao(form && typeof form === "object" ? (form as Record<string, unknown>) : {});
  if (!v.ok) return { error: v.erro };
  const r = await gravarRenovacao(acesso.tenantId, id, v.dados, acesso.setores);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: acesso.tenantId,
    userId: acesso.ctx.userId,
    action: "certificados.renovacao",
    entityType: "DigitalCertificate",
    entityId: id,
    metadata: { status: v.dados.status, custoCentavos: v.dados.custoCentavos, pagaQuem: v.dados.pagaQuem },
  });
  revalidatePath("/certificados");
  return { ok: true };
}
