import { NextRequest, NextResponse } from "next/server";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { getPrisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rateLimit";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { armazenamentoDoDrive, arquivoParaOCliente, temPrevia } from "@/lib/drive/servidor";
import { respostaDoArquivoDoDrive } from "@/lib/drive/resposta";

// O cliente abre (`?ver=1`, só PDF e imagem) ou baixa um arquivo dos Arquivos
// (09/10/2026). Só sai arquivo de empresa do grupo dele, numa pasta
// compartilhada (ela ou alguma acima) e fora da lixeira — o resto responde 404,
// igual a um id que não existe. Cada abertura vira prova em DriveFileAccess, que
// a equipe vê na linha do arquivo. Conta ativa conferida no banco: gravar a
// prova é escrita.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!cliente.modulos.has(MODULO_ARQUIVOS)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const arquivo = await arquivoParaOCliente(cliente.tenantId, cliente.companyIds, id);
  if (!arquivo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const conteudo = await armazenamentoDoDrive.lerAnexo(arquivo.storageKey);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });

  const abrir = req.nextUrl.searchParams.get("ver") === "1" && temPrevia(arquivo.mimeType, arquivo.name);
  await getPrisma()
    .driveFileAccess.create({
      data: {
        fileId: arquivo.id,
        portalUserId: cliente.usuario.id,
        kind: abrir ? "VIEW" : "DOWNLOAD",
        ipAddress: clientIp(req).slice(0, 64),
        userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
      },
    })
    .catch((err) => console.error("[drive] prova de acesso", arquivo.id, err));
  return respostaDoArquivoDoDrive(conteudo, arquivo, abrir);
}
