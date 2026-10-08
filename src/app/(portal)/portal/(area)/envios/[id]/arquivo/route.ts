import { NextRequest, NextResponse } from "next/server";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { clientIp } from "@/lib/rateLimit";
import { lerArquivoDoDocumento, recordClientDocumentView, respostaDoArquivoDoDocumento } from "@/lib/clientDocuments";
import { envioDoCliente, linhaDoClienteNoEnvio } from "@/lib/envios/consultas";

// O anexo de um envio, baixado pelo cliente no portal (08/10/2026). Só sai se
// o envio estiver publicado e for de uma empresa do grupo dele — o mesmo
// `where` da tela (`envioDoCliente`); id de outra empresa responde 404, igual a
// um que não existe. O download entra na prova, na linha da pessoa, como no
// link do e-mail. Conta ativa conferida no banco: registrar a prova é escrita.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!cliente.modulos.has("portal_solicitacoes")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const envio = await envioDoCliente({ tenantId: cliente.tenantId, companyIds: cliente.companyIds }, id);
  if (!envio?.fileUrl) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const conteudo = await lerArquivoDoDocumento(envio.fileUrl);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });

  const linha = await linhaDoClienteNoEnvio(envio.id, cliente.usuario.email);
  await recordClientDocumentView({
    recipientId: linha.id,
    action: "DOWNLOADED",
    ipAddress: clientIp(req),
    userAgent: req.headers.get("user-agent"),
    isFirstView: false,
  });
  return respostaDoArquivoDoDocumento(conteudo, { fileUrl: envio.fileUrl, fileName: envio.fileName, mimeType: envio.mimeType });
}
