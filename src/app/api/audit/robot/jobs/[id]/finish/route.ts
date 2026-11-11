import { atenderRobo, jobIdValido, validar } from "@/lib/honorarios/robo";
import { concluirSchema } from "@/lib/honorarios/regras/auditPayload";
import { concluir } from "@/lib/honorarios/servidor/auditSyncService";

export const runtime = "nodejs";

// Fim da varredura: confere os totais e liga as pastas novas pelo nome.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return atenderRobo(request, async (corpo) => {
    const jobId = jobIdValido(id);
    const { totais } = validar(concluirSchema, corpo);
    return concluir(jobId, totais);
  });
}
