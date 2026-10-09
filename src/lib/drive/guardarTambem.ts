// "Guardar também em Arquivos" (09/10/2026): nos formulários da equipe que
// anexam arquivo (resposta de solicitação, pendência, processo do Societário,
// envio ao cliente), a pessoa pode escolher uma pasta da empresa para guardar
// uma cópia. O anexo continua no módulo, como sempre — decisão do Kauan: a cópia
// organiza sem mudar o comportamento de nenhum módulo.
//
// Chamado pela action do módulo DEPOIS que o anexo foi gravado de vez. É
// best-effort: uma falha aqui não desfaz o que o módulo salvou; volta só uma
// frase para a tela, quando a action tem onde mostrar.

import type { AuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { guardarCopias } from "./servidor";
import { CAMPO_DA_PASTA } from "./tela";

export async function guardarTambemNosArquivos(
  ctx: AuthContext,
  formData: FormData,
  companyId: string,
  arquivos: { name: string; arrayBuffer(): Promise<ArrayBuffer> }[]
): Promise<string | null> {
  const pastaId = String(formData.get(CAMPO_DA_PASTA) ?? "").trim();
  if (!pastaId || arquivos.length === 0) return null;
  try {
    const conteudos = await Promise.all(
      arquivos.map(async (f) => ({ nome: f.name, conteudo: new Uint8Array(await f.arrayBuffer()) }))
    );
    const r = await guardarCopias(ctx, { pastaId, companyId, arquivos: conteudos });
    if (r.guardados > 0) {
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "drive.file_copy_from_module",
        entityType: "DriveFolder",
        entityId: pastaId,
        metadata: { companyId, guardados: r.guardados },
      });
    }
    return r.erro ? `O anexo foi salvo, mas a cópia nos Arquivos não: ${r.erro}` : null;
  } catch (err) {
    console.error("[drive] guardar também", err);
    return "O anexo foi salvo, mas a cópia nos Arquivos falhou.";
  }
}
