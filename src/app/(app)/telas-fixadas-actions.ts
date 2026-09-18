"use server";

import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getModuleDef } from "@/lib/module-catalog";
import { setorDoModulo } from "@/lib/modules";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { avaliarFixar } from "@/lib/telasFixadas";

export type ResultadoDeFixar = { error: string } | { ok: true; fixada: boolean };

/**
 * Fixa ou solta uma tela na sidebar de quem está logado.
 *
 * Fixar é preferência pessoal e não concede acesso nenhum — a sidebar continua
 * montando a lista a partir do que está ligado no tenant e do setor que a pessoa
 * enxerga. Ainda assim recusa fixar tela de setor que ela não vê: guardar o que
 * nunca vai aparecer é sujeira que ninguém entende depois.
 *
 * Quem atualiza a tela é o `router.refresh()` de quem chamou: a sidebar mora no
 * layout, e `revalidatePath` aqui limparia o cache do app inteiro para mudar uma
 * lista de seis itens.
 */
export async function alternarTelaFixada(code: string): Promise<ResultadoDeFixar> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };

  const def = getModuleDef(code);
  if (!def) return { error: "Tela desconhecida." };

  const setor = (await setorDoModulo(ctx.tenantId, code)) ?? def.sectorCode;
  if (!canViewSector(ctx, setor)) return { error: "Sem acesso a esta tela." };

  const prisma = getPrisma();
  const { userId, tenantId } = ctx;

  try {
    const atuais = await prisma.userPinnedModule.findMany({
      where: { userId, tenantId },
      orderBy: { position: "asc" },
      select: { moduleCode: true, position: true },
    });

    const veredito = avaliarFixar(
      atuais.map((a) => a.moduleCode),
      code
    );
    if (!veredito.ok) return { error: veredito.erro };

    if (!veredito.fixar) {
      await prisma.userPinnedModule.deleteMany({ where: { userId, tenantId, moduleCode: code } });
      return { ok: true, fixada: false };
    }

    const ultima = atuais.at(-1)?.position ?? -1;
    try {
      await prisma.userPinnedModule.create({
        data: { userId, tenantId, moduleCode: code, position: ultima + 1 },
      });
    } catch (err) {
      // Duas abas clicando no mesmo alfinete: o unique decide, e o resultado é o
      // mesmo que o usuário queria.
      if (!isPrismaUniqueError(err)) throw err;
    }
    return { ok: true, fixada: true };
  } catch (err) {
    console.error("[alternarTelaFixada]", err);
    return { error: "Erro ao fixar a tela." };
  }
}
