"use server";

// A DCTFWeb do mês (17/11/2026, funcionalidade-734): marcar as empresas,
// ajustar a rotina e o "Rodar agora". Quem edita nas Autorizações, como a
// emissão de guias. Cada action confere de novo quem pode — Server Function
// aceita POST direto — e o "Rodar agora" gasta: só por clique, com confirmação.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { hojeIso } from "@/lib/datas/calendario";
import { lerTeto, reais } from "@/lib/serpro/regras";
import { lerCompetencia, lerDiaSemEvento, ROTULO_DA_SITUACAO_DCTFWEB, type SituacaoDaDctfweb } from "@/lib/serpro/dctfweb";
import { marcarEmpresas, rodarAgora, salvarAjusteDaRotina } from "@/lib/serpro/dctfwebDoMes";

type Resultado = { ok: true; texto: string } | { ok: false; erro: string };

const ehId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const TELA = "/autorizacoes/dctfweb";

async function quemEdita() {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  return acesso?.podeEditar && acesso.ctx.userId ? acesso : null;
}

export async function marcarEmpresasAction(ids: unknown, entra: unknown): Promise<Resultado> {
  const acesso = await quemEdita();
  if (!acesso) return { ok: false, erro: "Sem permissão para mudar as empresas da DCTFWeb do mês." };
  if (!Array.isArray(ids) || !ids.length || !ids.every(ehId) || typeof entra !== "boolean") return { ok: false, erro: "Escolha ao menos uma empresa." };
  const foraDoFoco = await recusaDoFoco(acesso.ctx, ids);
  if (foraDoFoco) return { ok: false, erro: foraDoFoco };
  const n = await marcarEmpresas(acesso.tenantId, ids, entra);
  await logAudit({ tenantId: acesso.tenantId, userId: acesso.ctx.userId, action: "autorizacoes.dctfweb_empresas", entityType: "Tenant", entityId: acesso.tenantId, metadata: { entra, empresas: ids } });
  revalidatePath(TELA);
  if (entra) {
    const fora = ids.length - n;
    return { ok: true, texto: `${n} ${n === 1 ? "empresa entrou" : "empresas entraram"}${fora ? ` (${fora} sem CNPJ ou já marcada${fora === 1 ? "" : "s"})` : ""}.` };
  }
  return { ok: true, texto: `${n} ${n === 1 ? "empresa saiu" : "empresas saíram"}. O que já foi baixado continua nos Arquivos.` };
}

export async function salvarAjusteAction(form: FormData): Promise<Resultado> {
  const acesso = await quemEdita();
  if (!acesso) return { ok: false, erro: "Sem permissão para mudar a rotina." };
  const diaSemEvento = lerDiaSemEvento(form.get("diaSemEvento"));
  if (diaSemEvento === null) return { ok: false, erro: "O dia sem evento vai de 1 a 28." };
  const tetoBruto = String(form.get("teto") ?? "").trim();
  const tetoCentavos = tetoBruto ? lerTeto(tetoBruto) : null;
  if (tetoBruto && tetoCentavos === null) return { ok: false, erro: "Teto inválido: use um valor em reais, como 200 ou 1.250,00." };
  const ligada = form.get("ligada") === "on";
  await salvarAjusteDaRotina(acesso.tenantId, { ligada, diaSemEvento, tetoCentavos });
  await logAudit({ tenantId: acesso.tenantId, userId: acesso.ctx.userId, action: "autorizacoes.dctfweb_rotina", entityType: "Tenant", entityId: acesso.tenantId, metadata: { ligada, diaSemEvento, tetoCentavos } });
  revalidatePath(TELA);
  return { ok: true, texto: ligada ? `Rotina ligada${tetoCentavos !== null ? `, com teto de ${reais(tetoCentavos)} no mês` : ""}.` : "Rotina desligada: só roda por clique." };
}

/** `companyId` nulo = todas as empresas marcadas que ainda não estão resolvidas na competência. */
export async function rodarAgoraAction(competenciaBruta: unknown, companyId: unknown): Promise<Resultado> {
  const acesso = await quemEdita();
  if (!acesso) return { ok: false, erro: "Sem permissão para chamar o Serpro." };
  const competencia = lerCompetencia(competenciaBruta, hojeIso());
  if (!competencia) return { ok: false, erro: "Escolha uma competência que já acabou." };
  if (companyId !== null && !ehId(companyId)) return { ok: false, erro: "Empresa não encontrada." };
  if (companyId) {
    const foraDoFoco = await recusaDoFoco(acesso.ctx, [companyId]);
    if (foraDoFoco) return { ok: false, erro: foraDoFoco };
  }
  const r = await rodarAgora(acesso.tenantId, acesso.ctx.userId!, competencia, companyId ? [companyId] : null);
  revalidatePath(TELA);
  if (!r.ok) return r;
  const partes = Object.entries(r.resumo.porSituacao).map(([s, n]) => `${n} ${ROTULO_DA_SITUACAO_DCTFWEB[s as SituacaoDaDctfweb].toLowerCase()}`);
  const resto = r.naFila - r.resumo.tratadas;
  const texto = [
    r.naFila === 0 ? "Nada a fazer: as empresas já estão resolvidas nesta competência." : `${r.resumo.tratadas} de ${r.naFila} tratadas agora${partes.length ? ` (${partes.join(", ")})` : ""}.`,
    resto > 0 && !r.resumo.parou ? `As outras ${resto} seguem na fila do agendador, a cada 10 minutos.` : "",
    r.resumo.parou ? `Parou: ${r.resumo.parou}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return r.resumo.parou && r.resumo.tratadas === 0 ? { ok: false, erro: texto } : { ok: true, texto };
}
