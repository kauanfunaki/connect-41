"use server";

// O registro na Junta pelo processo (27/11/2026, melhoria-892): ao deferir a
// constituição, a alteração, o distrato ou a baixa, a equipe grava o NIRE e a
// data do registro na ficha da empresa e guarda a foto do quadro societário com
// essa data. Era o "Finalizado (NIRE, data)" da Alteração Contratual do Domínio.
//
// Quem pode: "agir" no módulo de processos, como as outras ações do processo.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { nomeDeQuemFez } from "@/lib/honorarios/acesso";
import { lerDataDoCampo } from "@/lib/societario/datas";
import { ErroDoQuadro, registrarNaJunta } from "@/lib/societario/quadroServidor";

const MODULO = "societario_processos";

export type ResultadoDoRegistro = { ok: true; quadro: boolean } | { ok: false; erro: string };

export async function registrarNaJuntaPeloProcesso(form: FormData): Promise<ResultadoDoRegistro> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Entre de novo no Connect." };
  if (!(await podeNoModulo(ctx, MODULO, "agir"))) return { ok: false, erro: "Você não tem permissão para agir nos processos do Societário." };
  const processId = String(form.get("processId") ?? "").slice(0, 64);
  const nire = String(form.get("nire") ?? "").replace(/\D/g, "");
  const data = lerDataDoCampo(form.get("data"));
  const guardar = form.get("guardarQuadro") === "on";
  if (!processId) return { ok: false, erro: "Pedido inválido." };
  if (nire.length < 8 || nire.length > 20) return { ok: false, erro: "Informe o NIRE, só com números (11 na maioria das Juntas)." };
  if (!data.ok || !data.data) return { ok: false, erro: "Informe a data do registro." };
  const quando = data.data;
  try {
    const r = await registrarNaJunta(ctx.tenantId, processId, { nire, data: quando, guardarQuadro: guardar, registradoPor: await nomeDeQuemFez(ctx) });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "societario.processo.registro_na_junta",
      entityType: "Process",
      entityId: processId,
      metadata: { nome: r.empresa, nire, data: String(form.get("data")), quadro: r.quadro },
    });
    revalidatePath("/processos/[id]", "page");
    revalidatePath(`/empresas/${r.companyId}/socios`);
    return { ok: true, quadro: r.quadro };
  } catch (err) {
    if (err instanceof ErroDoQuadro) return { ok: false, erro: err.message };
    throw err;
  }
}
