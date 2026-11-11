import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ACADEMIA, podeAdministrarAcademia } from "@/lib/academia/regras";
import { TAMANHO_MAXIMO_DA_IMAGEM, tipoDaImagem, urlDaImagem } from "@/lib/academia/imagens";

export const runtime = "nodejs";

/**
 * O envio de uma imagem das questões de lógica (10/11/2026, pedido do Kauan):
 * só quem administra a Academia. Mesmas regras da capa do Repositório de
 * manuais (JPG, PNG ou WEBP, até 4 MB), com o tipo conferido pelos bytes.
 *
 * Grava em `storage/academia/<tenantId>/<uuid>.<ext>` — debaixo de
 * `/app/storage`, que tem volume no EasyPanel (25/09/2026). A resposta é o
 * endereço que o cadastro da questão guarda.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !podeAdministrarAcademia(ctx) || !(await isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("imagem");
  if (!(arquivo instanceof File)) return NextResponse.json({ error: "Escolha uma imagem." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO_DA_IMAGEM) return NextResponse.json({ error: "A imagem passa de 4 MB." }, { status: 400 });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoDaImagem(bytes);
  if (!tipo) return NextResponse.json({ error: "Formato não aceito. Use JPG, PNG ou WEBP." }, { status: 400 });

  const pasta = path.join(process.cwd(), "storage", "academia", ctx.tenantId);
  await mkdir(pasta, { recursive: true });
  const nome = `${randomUUID()}.${tipo.ext}`;
  await writeFile(path.join(pasta, nome), bytes);
  return NextResponse.json({ url: urlDaImagem(nome) });
}
