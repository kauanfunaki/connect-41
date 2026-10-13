import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { respostaDoZip, zipDaPastaParaAEquipe } from "@/lib/drive/baixarPasta";

// Baixar a pasta inteira num zip, pela equipe (13/10/2026). A régua é a do
// download de um arquivo avulso (/api/arquivos/[id]): pasta de setor só para o
// setor, nada da lixeira — fora disso, 404, sem dizer qual dos casos foi. Como
// no avulso, o download da equipe não vira registro.
// `?conferir=1` responde só se dá para gerar (quantos arquivos, ou o porquê não).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const { id } = await params;
  const zip = await zipDaPastaParaAEquipe(ctx, id);
  if (!zip) return NextResponse.json({ error: "Pasta não encontrada." }, { status: 404 });
  return respostaDoZip(zip, { conferir: req.nextUrl.searchParams.get("conferir") === "1" });
}
