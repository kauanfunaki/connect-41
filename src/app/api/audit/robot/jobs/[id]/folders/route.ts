import { atenderRobo, jobIdValido, validar } from "@/lib/honorarios/robo";
import { loteSchema } from "@/lib/honorarios/regras/auditPayload";
import { receberLote } from "@/lib/honorarios/servidor/auditSyncService";

export const runtime = "nodejs";

// Um lote de pastas e arquivos da varredura.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return atenderRobo(request, async (corpo) => {
    const jobId = jobIdValido(id);
    const lote = validar(loteSchema, corpo);
    await receberLote(jobId, lote);
    return { recebidas: lote.pastas.length };
  });
}
