import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { setorDoModulo } from "@/lib/modules";
import { nomeDoArquivoParaTela } from "@/lib/whatsapp/documento";

const STORAGE_DIR = path.join(process.cwd(), "storage", "resumes");
const MODULE = "recrutamento_whatsapp";

/**
 * O único formato que o atendimento grava. O segmento do tenant aceita qualquer
 * id sem ponto nem barra (tenant antigo pode não ter UUID); o arquivo é sempre
 * `<uuid>.pdf`. Nenhum dos dois deixa subir de pasta.
 */
const CAMINHO_VALIDO = /^[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}\.pdf$/i;

/**
 * O arquivo que um candidato mandou pelo WhatsApp.
 *
 * O gate é o da conversa (setor que opera o WhatsApp), e não o do currículo do
 * portal: um arquivo de número sem vínculo não é de nenhuma candidatura, e quem
 * pode vê-lo é quem atende a conversa.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? "recrutamento")) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const { messageId } = await params;
  const mensagem = await getPrisma().whatsappMessage.findFirst({
    where: { id: messageId, tenantId: ctx.tenantId, mediaUrl: { not: null } },
    select: { mediaUrl: true, mediaFileName: true },
  });
  // `mediaUrl` é gravado pelo Connect; a conferência de formato é defesa a mais,
  // porque é ela que fica entre o banco e o disco.
  if (!mensagem?.mediaUrl || !CAMINHO_VALIDO.test(mensagem.mediaUrl)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  try {
    const buffer = await readFile(path.join(STORAGE_DIR, mensagem.mediaUrl));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(nomeDoArquivoParaTela(mensagem.mediaFileName))}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  }
}
