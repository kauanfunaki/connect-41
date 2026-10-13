import { NextRequest, NextResponse } from "next/server";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { getPrisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rateLimit";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { respostaDoZip, zipDaPastaParaOCliente } from "@/lib/drive/baixarPasta";

// O cliente baixa uma pasta compartilhada inteira num zip (13/10/2026). A régua
// é a do download de um arquivo avulso (/portal/arquivos/[id]): empresa do
// grupo dele, pasta compartilhada (ela ou alguma acima) e fora da lixeira — o
// resto responde 404, igual a um id que não existe. Como no avulso, cada
// arquivo que entra no zip vira uma prova de download em DriveFileAccess, que a
// equipe vê na linha do arquivo.
// `?conferir=1` responde só se dá para gerar (quantos arquivos, ou o porquê não).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!cliente.modulos.has(MODULO_ARQUIVOS)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const zip = await zipDaPastaParaOCliente(cliente.tenantId, cliente.companyIds, id);
  if (!zip) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });

  const ipAddress = clientIp(req).slice(0, 64);
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;
  return respostaDoZip(zip, {
    conferir: req.nextUrl.searchParams.get("conferir") === "1",
    aoTerminar: async (incluidos) => {
      if (incluidos.length === 0) return;
      await getPrisma().driveFileAccess.createMany({
        data: incluidos.map((a) => ({ fileId: a.id, portalUserId: cliente.usuario.id, kind: "DOWNLOAD" as const, ipAddress, userAgent })),
      });
    },
  });
}
