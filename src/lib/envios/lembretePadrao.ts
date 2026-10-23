// O lembrete de não lido padrão do escritório (23/10/2026): o prazo que um
// envio novo já traz escolhido — quem envia ainda troca, envio a envio. Fica
// em Administração › Portal do cliente › Envios, ao lado do resto do que o
// escritório configura para o portal.
//
// A leitura nunca derruba o novo envio: sem a tabela (deploy antes da
// migration) ou com o banco recusando, vale "sem lembrete", que é o de antes.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { lerDiasDoLembrete } from "./lembrete";

export const FALTA_ATUALIZAR_O_BANCO_DOS_ENVIOS =
  "Falta a atualização do banco para guardar o padrão dos envios. Até lá, os envios novos vêm sem lembrete.";

/** `sem-tabela`: a migration ainda não rodou. `erro`: o banco recusou a leitura. */
export type LeituraDoLembretePadrao = { dias: number | null; situacao: "ok" | "sem-tabela" | "erro" };

let avisouSemTabela = false;

/** O prazo padrão do escritório (`null` = sem lembrete). Nunca lança. */
export async function lerLembretePadrao(tenantId: string): Promise<LeituraDoLembretePadrao> {
  try {
    const linha = await getPrisma().tenantEnviosConfig.findUnique({ where: { tenantId }, select: { lembreteDias: true } });
    // Relido pela regra do formulário: um valor fora dos prazos da tela vira "sem lembrete".
    return { dias: lerDiasDoLembrete(linha?.lembreteDias ?? null), situacao: "ok" };
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      if (!avisouSemTabela) {
        avisouSemTabela = true;
        console.warn("[envios] tabela tenant_envios_configs ainda não existe: os envios novos vêm sem lembrete até rodar a migration.");
      }
      return { dias: null, situacao: "sem-tabela" };
    }
    console.error("[envios] leitura do lembrete padrão", err);
    return { dias: null, situacao: "erro" };
  }
}
