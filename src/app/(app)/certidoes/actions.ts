"use server";

// As certidões (28/10/2026): "Emitir agora" e "Marcar como vista". Cada action
// confere de novo quem pode — Server Function aceita POST direto.

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { acessoAsCertidoes } from "@/lib/certidoes/acesso";
import { emitirAgora, marcarCertidaoComoVista } from "@/lib/certidoes/servidor";
import { TIPOS_DE_CERTIDAO, type TipoDeCertidao } from "@/lib/certidoes/regras";

const ehId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const ehTipo = (v: unknown): v is TipoDeCertidao => typeof v === "string" && (TIPOS_DE_CERTIDAO as readonly string[]).includes(v);

type Resultado = { ok: true; texto: string } | { ok: false; erro: string };

/** Uma consulta à InfoSimples, cobrada, fora da rotina do trimestre. */
export async function emitirCertidaoAction(companyId: unknown, tipo: unknown): Promise<Resultado> {
  const acesso = await acessoAsCertidoes(await getAuthContext());
  if (!acesso?.podeEditar) return { ok: false, erro: "Sem permissão para pedir certidões." };
  if (!ehId(companyId) || !ehTipo(tipo)) return { ok: false, erro: "Certidão não encontrada." };
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId: acesso.tenantId }, select: { id: true } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só mexe nas dele.
  const foraDoFoco = await recusaDoFoco(acesso.ctx, [companyId]);
  if (foraDoFoco) return { ok: false, erro: foraDoFoco };

  const r = await emitirAgora(acesso.tenantId, acesso.userId, companyId, tipo);
  await logAudit({
    tenantId: acesso.tenantId,
    userId: acesso.userId,
    action: "societario.certidao_emitida",
    entityType: "Company",
    entityId: companyId,
    metadata: { tipo, situacao: r.ok ? r.situacao : "NAO_SAIU" },
  });
  revalidatePath("/certidoes");
  return r.ok ? { ok: true, texto: r.texto } : { ok: false, erro: r.erro };
}

/** A positiva que alguém do setor já viu sai do recorte "Positivas a ver". */
export async function marcarCertidaoComoVistaAction(certidaoId: unknown): Promise<Resultado> {
  const acesso = await acessoAsCertidoes(await getAuthContext());
  if (!acesso?.podeEditar) return { ok: false, erro: "Sem permissão para marcar certidões." };
  if (!ehId(certidaoId)) return { ok: false, erro: "Certidão não encontrada." };
  const r = await marcarCertidaoComoVista(acesso.tenantId, acesso.userId, certidaoId);
  if (!r) return { ok: false, erro: "Certidão positiva não encontrada." };
  await logAudit({ tenantId: acesso.tenantId, userId: acesso.userId, action: "societario.certidao_vista", entityType: "Certidao", entityId: certidaoId, metadata: { companyId: r.companyId } });
  revalidatePath("/certidoes");
  return { ok: true, texto: "Marcada como vista." };
}
