"use server";

// Trazer as licenças do Radar Societário (28/10/2026). Só quem administra o
// setor: é uma carga de uma vez, para a carteira inteira. A action confere de
// novo quem pode — Server Function aceita POST direto.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { canManageSector } from "@/lib/auth/papeis";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { importarDoRadar, urlDoRadar } from "@/lib/societario/importar-radar-servidor";

const MODULO = "societario_licencas";

export async function importarDoRadarAction(url: unknown): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { ok: false, erro: "Não autenticado." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULO))) return { ok: false, erro: "O módulo de licenças não está ligado." };
  if (!canManageSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULO)) ?? "societario")) return { ok: false, erro: "Só quem administra o Societário traz as licenças do Radar." };
  const endereco = urlDoRadar(typeof url === "string" ? url : null);
  if (!endereco) return { ok: false, erro: "Endereço do Radar inválido." };

  const r = await importarDoRadar(ctx.tenantId, ctx.userId, endereco);
  revalidatePath("/licencas");
  revalidatePath("/licencas/radar");
  if (!r.ok) return r;
  const partes = [`${r.licencas} licença${r.licencas === 1 ? "" : "s"} trazida${r.licencas === 1 ? "" : "s"}`, `${r.anexos} anexo${r.anexos === 1 ? "" : "s"}`];
  if (r.anexosQueFalharam) partes.push(`${r.anexosQueFalharam} anexo(s) não vieram`);
  if (r.semPastaOuArquivos) partes.push(`${r.semPastaOuArquivos} anexo(s) sem pasta Societário ou com os Arquivos desligados`);
  return { ok: true, texto: `${partes.join(", ")}.` };
}
