import { atenderRobo, jobIdValido, validar } from "@/lib/honorarios/robo";
import { falharSchema } from "@/lib/honorarios/regras/auditPayload";
import { falhar } from "@/lib/honorarios/servidor/auditSyncService";

export const runtime = "nodejs";

// O robô avisa que a varredura falhou.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return atenderRobo(request, async (corpo) => {
    const jobId = jobIdValido(id);
    const { erro } = validar(falharSchema, corpo);
    await falhar(jobId, erro);
    return { message: "Falha registrada." };
  });
}
