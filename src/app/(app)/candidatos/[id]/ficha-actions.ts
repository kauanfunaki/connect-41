"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { dadosDaSecao, ehSecaoDaFicha, validarSecao, type SecaoDaFicha } from "@/lib/recrutamento/fichaDoCandidato";

/** `salvoEm` muda a cada gravação: é o que fecha o bloco de volta para a leitura. */
export type SecaoState = { error: string } | { ok: true; salvoEm: number } | null;

/**
 * Edição no próprio bloco da ficha do candidato (escolha 5A do Kauan,
 * 14/10/2026): Identificação, Contato ou Endereço, um de cada vez. Mesma
 * permissão e mesma validação do "Editar tudo" (`atualizarCandidato`), mas só
 * os campos do bloco vão para o banco — o resto do formulário é ignorado.
 */
export async function salvarSecaoDoCandidato(
  personId: string,
  secao: SecaoDaFicha,
  _prev: SecaoState,
  form: FormData
): Promise<SecaoState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!ehSecaoDaFicha(secao)) return { error: "Bloco da ficha desconhecido." };
  if (!(await podeNoModulo(ctx, "recrutamento_candidatos", "gerir"))) return { error: "Sem permissão para editar candidatos." };

  const erro = validarSecao(secao, form);
  if (erro) return { error: erro };

  const prisma = getPrisma();
  const existente = await prisma.person.findFirst({
    where: { id: personId, tenantId: ctx.tenantId, type: PersonType.CANDIDATO },
    select: { id: true },
  });
  if (!existente) return { error: "Candidato não encontrado." };

  try {
    await prisma.person.update({ where: { id: existente.id }, data: dadosDaSecao(secao, form) });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe uma pessoa cadastrada com este CPF." };
    console.error("[salvarSecaoDoCandidato]", err);
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath(`/candidatos/${personId}`);
  revalidatePath("/candidatos");
  return { ok: true, salvoEm: Date.now() };
}
