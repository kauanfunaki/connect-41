// A marca pública do escritório (22/10/2026): o pedaço da Aparência do portal
// que pode aparecer para quem ainda não entrou — na tela de login do portal e
// nos e-mails ao cliente.
//
// Só o que já é público: o nome do escritório, o logo (que a rota
// /api/workspace-logos serve sem sessão) e a cor principal. As cores dos
// grupos e o resto da configuração ficam dentro do portal.

import { getPrisma } from "@/lib/prisma";
import { lerAparencia, type LeituraDaAparencia } from "./leitura";

/** O que a entrada do portal e os e-mails mostram do escritório. */
export type MarcaPublica = {
  nome: string;
  /** Só com "Mostrar o logo do escritório no portal" ligado e logo enviado. */
  logoUrl: string | null;
  /** "#RRGGBB" já canônica, ou `null` = o azul do Connect. */
  corPrincipal: string | null;
};

/**
 * A marca a partir da leitura da aparência. `null` quando o escritório não
 * escolheu nada que apareça fora do portal (nem logo ligado, nem cor) — e aí
 * fica a marca do Connect.
 */
export function marcaPublicaDe(leitura: Pick<LeituraDaAparencia, "aparencia" | "escritorio">): MarcaPublica | null {
  const logoUrl = leitura.aparencia.logoNoPortal && leitura.escritorio.logoUrl ? leitura.escritorio.logoUrl : null;
  const corPrincipal = leitura.aparencia.corPrincipal;
  if (!logoUrl && !corPrincipal) return null;
  return { nome: leitura.escritorio.nome, logoUrl, corPrincipal };
}

/** A marca de um escritório ativo. Nunca lança: na dúvida, a do Connect. */
export async function marcaPublicaDoEscritorio(tenantId: string | null | undefined): Promise<MarcaPublica | null> {
  if (!tenantId) return null;
  try {
    const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { active: true } });
    if (!tenant?.active) return null;
    return marcaPublicaDe(await lerAparencia(tenantId));
  } catch (err) {
    console.error("[portal] marca do escritório", err instanceof Error ? err.message : err);
    return null;
  }
}

