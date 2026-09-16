// Ligar a conversa do WhatsApp à candidatura — a parte que toca o banco.
// As regras (telefone, nome, mensagens) estão em `vinculo.ts`.

import { getPrisma } from "@/lib/prisma";
import { formasLocaisDoTelefone, telefonesConferem } from "./vinculo";

/**
 * A pessoa com candidatura cujo telefone confere com o número da conversa —
 * **só quando é uma pessoa só**.
 *
 * Duas pessoas com o mesmo telefone (casal que usa um número, cadastro
 * duplicado) é ambíguo, e ambíguo não vira pergunta: a conversa segue sem
 * vínculo e uma pessoa do time liga à mão.
 *
 * A consulta estreita pelos quatro últimos dígitos, que aparecem juntos em
 * qualquer máscara ("9999-8888", "99998888"); a conferência de verdade é a de
 * `telefonesConferem`, em memória.
 */
export async function pessoaPeloTelefone(tenantId: string, waPhone: string): Promise<{ personId: string } | null> {
  const formas = formasLocaisDoTelefone(waPhone);
  if (formas.length === 0) return null;

  const prisma = getPrisma();
  const pessoas = await prisma.person.findMany({
    where: { tenantId, phone: { contains: formas[0]!.slice(-4) }, candidaturas: { some: {} } },
    select: { id: true, phone: true },
    take: 50,
  });
  const conferem = pessoas.filter((p) => telefonesConferem(p.phone, waPhone));
  return conferem.length === 1 ? { personId: conferem[0]!.id } : null;
}

/**
 * A candidatura que a conversa passa a mostrar na tela: a mais recente em
 * andamento, ou a mais recente de todas. O agente não depende dela — ele lê
 * todas as da pessoa (`ver_meu_processo`).
 */
export async function candidaturaPrincipal(tenantId: string, personId: string): Promise<string | null> {
  const prisma = getPrisma();
  const emAndamento = await prisma.candidatura.findFirst({
    where: { tenantId, personId, status: "EM_ANDAMENTO" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (emAndamento) return emAndamento.id;
  const qualquer = await prisma.candidatura.findFirst({
    where: { tenantId, personId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return qualquer?.id ?? null;
}
