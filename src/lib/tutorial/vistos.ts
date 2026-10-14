// A marca de "já vi o tutorial" no banco (`TutorialVisto`, 13/10/2026): ler,
// gravar e apagar.
//
// Nenhuma função daqui derruba tela: erro de banco — inclusive a tabela ainda
// não existir, se o deploy vier antes da migration — vira "indisponível" na
// leitura (o tutorial não abre) e `false` na gravação (a pessoa segue, e o
// tutorial só abre de novo no próximo acesso).

import type { TutorialSubject } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import type { ChaveDoTutorial, EstadoDoTutorial } from "./tutoriais";

export type DonoDoTutorial = {
  subject: TutorialSubject;
  /** Id de `users` (USER) ou de `portal_users` (PORTAL_USER). */
  userId: string;
};

/** O que a pessoa já fez com o tutorial. */
export async function lerTutorialVisto(dono: DonoDoTutorial, tutorial: ChaveDoTutorial): Promise<EstadoDoTutorial> {
  if (!dono.userId) return { tipo: "indisponivel" };
  try {
    const linha = await getPrisma().tutorialVisto.findUnique({
      where: { subject_userId_tutorial: { subject: dono.subject, userId: dono.userId, tutorial } },
      select: { version: true },
    });
    return linha ? { tipo: "visto", versao: linha.version } : { tipo: "nunca" };
  } catch (err) {
    console.error("[tutorial] leitura", err);
    return { tipo: "indisponivel" };
  }
}

/** Marca o tutorial como visto nesta versão. `false` quando o banco recusou. */
export async function marcarTutorialVisto(
  dono: DonoDoTutorial & { tenantId: string },
  tutorial: ChaveDoTutorial,
  versao: number
): Promise<boolean> {
  if (!dono.userId || !dono.tenantId) return false;
  try {
    const agora = new Date();
    await getPrisma().tutorialVisto.upsert({
      where: { subject_userId_tutorial: { subject: dono.subject, userId: dono.userId, tutorial } },
      create: { subject: dono.subject, userId: dono.userId, tutorial, tenantId: dono.tenantId, version: versao, completedAt: agora },
      update: { version: versao, completedAt: agora },
    });
    return true;
  } catch (err) {
    // Dois cliques ao mesmo tempo, ou a tabela ainda não existe: a pessoa
    // segue, e no pior caso o tutorial abre de novo no próximo acesso.
    console.error("[tutorial] gravação", err);
    return false;
  }
}

/**
 * Apaga as marcas de acessos do portal que saíram. Fora da transação da
 * exclusão, de propósito, e sem lançar: a marca não tem chave estrangeira, e
 * uma linha órfã não atrapalha nada — não vale desfazer uma exclusão por ela.
 */
export async function apagarTutoriaisDoPortal(tenantId: string, portalUserIds: string[]): Promise<void> {
  if (!tenantId || portalUserIds.length === 0) return;
  try {
    await getPrisma().tutorialVisto.deleteMany({
      where: { subject: "PORTAL_USER", tenantId, userId: { in: portalUserIds } },
    });
  } catch (err) {
    console.error("[tutorial] limpeza do portal", err);
  }
}
