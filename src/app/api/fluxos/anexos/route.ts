import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { isModuleEnabled } from "@/lib/modules";
import { ANEXOS_POR_FLUXO, TAMANHO_MAXIMO_DO_ANEXO, nomeDoAnexo, tipoDoAnexo } from "@/lib/fluxos/arquivos";
import { MODULO_FLUXOS, podeEditarOsFluxos } from "@/lib/fluxos/regras";
import { fluxoDoEscritorio } from "@/lib/fluxos/servidor";

export const runtime = "nodejs";

/**
 * "Anexar arquivo" num fluxo (10/11/2026, pedido do Kauan): quem pode editar
 * os fluxos do setor. PDF, imagem (PNG, JPG, WEBP) ou .drawio, até 10 MB, com
 * o tipo conferido pelos bytes (ver `src/lib/fluxos/arquivos.ts`).
 *
 * Grava em `storage/fluxos/<tenantId>/<uuid>.<ext>` — debaixo de
 * `/app/storage`, que tem volume no EasyPanel (25/09/2026), como a Academia.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !(await isModuleEnabled(ctx.tenantId, MODULO_FLUXOS))) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const fluxoId = form?.get("fluxo");
  const arquivo = form?.get("arquivo");
  if (typeof fluxoId !== "string" || !(arquivo instanceof File)) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });

  const fluxo = await fluxoDoEscritorio(ctx, fluxoId);
  if (!fluxo) return NextResponse.json({ error: "Fluxo não encontrado." }, { status: 404 });
  if (!podeEditarOsFluxos(ctx, fluxo.folder.sectorCode)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (arquivo.size > TAMANHO_MAXIMO_DO_ANEXO) return NextResponse.json({ error: "O arquivo passa de 10 MB." }, { status: 400 });

  const prisma = getPrisma();
  if ((await prisma.flowAttachment.count({ where: { flowDocId: fluxo.id } })) >= ANEXOS_POR_FLUXO) {
    return NextResponse.json({ error: `O fluxo já tem ${ANEXOS_POR_FLUXO} arquivos. Exclua um antes de anexar outro.` }, { status: 400 });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoDoAnexo(bytes, arquivo.name);
  if (!tipo) return NextResponse.json({ error: "Formato não aceito. Use PDF, PNG, JPG, WEBP ou um .drawio." }, { status: 400 });

  const pasta = path.join(process.cwd(), "storage", "fluxos", ctx.tenantId);
  const guardado = `${randomUUID()}.${tipo.ext}`;
  const nome = nomeDoAnexo(arquivo.name, tipo.ext);
  try {
    await mkdir(pasta, { recursive: true });
    await writeFile(path.join(pasta, guardado), bytes);
  } catch (err) {
    console.error("[fluxos/anexos] gravar", err);
    return NextResponse.json({ error: "Erro ao guardar o arquivo." }, { status: 500 });
  }
  try {
    const anexo = await prisma.flowAttachment.create({
      data: { flowDocId: fluxo.id, fileName: nome, mime: tipo.mime, size: bytes.length, storagePath: guardado, uploadedById: ctx.userId },
    });
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fluxo.anexo.create", entityType: "FlowAttachment", entityId: anexo.id, metadata: { nome, fluxo: fluxo.title } });
  } catch (err) {
    // Sem a linha, o arquivo no disco ficaria órfão.
    await unlink(path.join(pasta, guardado)).catch(() => {});
    console.error("[fluxos/anexos] registrar", err);
    return NextResponse.json({ error: "Erro ao guardar o arquivo." }, { status: 500 });
  }
  revalidatePath("/fluxos");
  return NextResponse.json({ ok: true });
}
