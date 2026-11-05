import { responderApi } from "@/lib/api-v1/http";
import { ErroApi } from "@/lib/api-v1/erros";
import { anexarParaApi } from "@/lib/tech-interno/api";

export const runtime = "nodejs";

/**
 * Anexa um arquivo ao item, em multipart (campo `arquivo`), um por chamada e
 * até 10 MB — o mesmo armazenamento e a mesma régua de tipo da tela.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return responderApi(request, "controle-interno:escrever", async (ator, base) => {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new ErroApi("validation_error", "Envie o arquivo em multipart/form-data, no campo \"arquivo\".");
    }
    const form = await request.formData().catch(() => null);
    if (!form) throw new ErroApi("validation_error", "O envio chegou incompleto. O arquivo passa de 10 MB?");
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) throw new ErroApi("validation_error", "Envie o arquivo no campo \"arquivo\".");
    return anexarParaApi(ator, id, arquivo, base);
  }, 201);
}
