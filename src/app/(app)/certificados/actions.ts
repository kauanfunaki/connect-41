"use server";

import { revalidatePath } from "next/cache";
import { canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { acessoAosCertificados, importarCertificados, setorDosCertificados, type ResumoDaImportacao } from "@/lib/certificados/servidor";

/** Teto por importação: a pasta da 41 tem ~480 arquivos; 5 mil é folga, não limite de uso. */
const MAXIMO_DE_LINHAS = 5000;

export async function importarRelatorio(linhas: unknown): Promise<{ error: string } | { ok: true; resumo: ResumoDaImportacao }> {
  const acesso = await acessoAosCertificados();
  if (!acesso) return { error: "Módulo não habilitado ou sem acesso." };
  if (!canActOnSector(acesso.ctx, await setorDosCertificados(acesso.tenantId))) return { error: "Sem permissão para importar." };
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
