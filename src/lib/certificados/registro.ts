// O registro de uso dos certificados (05/11/2026): quem usa um certificado
// avisa aqui — a tarefa do robô que voltou, a chamada do Serpro. Separado de
// ./servidor (que lê a sessão) para o robô e o Serpro poderem chamar sem puxar
// cabeçalho nem permissão. A regra dos usos mora em ./usos.

import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { lerDocumentoFiscal } from "@/lib/companyTaxId";

/** O dia do registro (UTC), "AAAA-MM-DD". */
export function diaDoRegistro(agora: Date): string {
  return agora.toISOString().slice(0, 10);
}

/** O que dá para registrar: documento válido e código de uso curto. */
export function usoRegistravel(documento: string | null | undefined, uso: string): { documento: string; uso: string } | null {
  const doc = lerDocumentoFiscal(documento ?? "");
  const codigo = uso.trim();
  if (!doc || !codigo || codigo.length > 40) return null;
  return { documento: doc.digitos, uso: codigo };
}

/**
 * Anota que o certificado do documento foi usado agora: o último uso e mais um
 * na contagem do dia. **Nunca falha** — quem chama está no meio de outra coisa
 * (a devolução do robô, a chamada cobrada do Serpro), e um registro perdido não
 * pode derrubar o trabalho. Devolve se gravou.
 */
export async function registrarUsoDoCertificado(tenantId: string, documento: string | null | undefined, uso: string, agora = new Date()): Promise<boolean> {
  const r = usoRegistravel(documento, uso);
  if (!r) return false;
  try {
    const prisma = getPrisma();
    const chave = { tenantId_documento_uso: { tenantId, documento: r.documento, uso: r.uso } };
    try {
      await prisma.digitalCertificateUse.upsert({
        where: chave,
        create: { tenantId, documento: r.documento, uso: r.uso, ultimoUsoAt: agora },
        update: { ultimoUsoAt: agora },
      });
    } catch (err) {
      // Dois usos ao mesmo tempo, os dois criando: o outro ganhou, este atualiza.
      if (!isPrismaUniqueError(err)) throw err;
      await prisma.digitalCertificateUse.updateMany({ where: { tenantId, documento: r.documento, uso: r.uso }, data: { ultimoUsoAt: agora } });
    }
    // Soma na linha do dia, de uma vez: duas chamadas juntas não perdem conta.
    await prisma.$executeRaw`INSERT INTO digital_certificate_use_days (tenantId, documento, uso, dia, vezes) VALUES (${tenantId}, ${r.documento}, ${r.uso}, ${diaDoRegistro(agora)}, 1) ON DUPLICATE KEY UPDATE vezes = vezes + 1`;
    return true;
  } catch (err) {
    console.error("[certificados] registro de uso", err instanceof Error ? err.name : "erro");
    return false;
  }
}
