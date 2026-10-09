import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { armazenamentoDoDrive, arquivoParaAEquipe } from "@/lib/drive/servidor";
import { respostaDoArquivoDoDrive } from "@/lib/drive/resposta";

// Abrir (`?ver=1`, só PDF e imagem) ou baixar um arquivo dos Arquivos pela
// equipe. A mesma régua da tela: arquivo de pasta de setor só para o setor, e
// nada da lixeira — fora disso responde 404, sem dizer qual dos casos foi.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const alvo = await arquivoParaAEquipe(ctx, id);
  if (!alvo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const conteudo = await armazenamentoDoDrive.lerAnexo(alvo.arquivo.storageKey);
  if (!conteudo) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento." }, { status: 404 });
  return respostaDoArquivoDoDrive(conteudo, alvo.arquivo, req.nextUrl.searchParams.get("ver") === "1");
}
