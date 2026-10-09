import { NextRequest, NextResponse } from "next/server";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { guardarArquivo, pastaDeEnviados } from "@/lib/drive/servidor";

// O cliente manda um arquivo pelo portal (09/10/2026). Vai sempre para a pasta
// "Enviados pelo cliente" da empresa — o cliente não escolhe pasta nem mexe no
// que o escritório organizou. Um arquivo por requisição, com progresso, como na
// rota da equipe. O aviso à equipe sai uma vez por lote, pela action
// `avisarEquipeDosEnvios`, que a tela chama quando a fila termina.
export async function POST(req: NextRequest) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return NextResponse.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });
  if (!cliente.modulos.has(MODULO_ARQUIVOS)) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "O envio chegou incompleto. O arquivo passa de 10 MB?" }, { status: 400 });
  const companyId = String(form.get("companyId") ?? "");
  const arquivo = form.get("arquivo");
  if (!cliente.companyIds.includes(companyId)) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });

  try {
    const pastaId = await pastaDeEnviados(cliente.tenantId, companyId);
    const r = await guardarArquivo({
      tenantId: cliente.tenantId,
      folderId: pastaId,
      arquivo,
      uploadedByPortalUserId: cliente.usuario.id,
    });
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    return NextResponse.json({ ok: true, id: r.arquivoId, nome: r.nome });
  } catch (err) {
    console.error("[drive] envio do cliente", err);
    return NextResponse.json({ error: "Não deu para guardar o arquivo. Tente de novo." }, { status: 500 });
  }
}
