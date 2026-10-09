import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";

/**
 * Porta das telas dos Arquivos: módulo ligado e alguém logado. Quem vê o quê
 * dentro dele é decidido pasta a pasta (src/lib/drive/regras.ts). Desligado,
 * as telas respondem 404 como qualquer módulo desligado.
 */
export async function abrirArquivos() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) notFound();
  return ctx;
}
