// O Excel do fluxo previsto, no portal (25/11/2026, funcionalidade-837): o
// mesmo arquivo da equipe, para o cliente mexer nos dados. A empresa tem de
// estar no grupo de quem está entrando; fora dele, "não encontrado".

import { NextResponse, type NextRequest } from "next/server";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { contentDispositionDeAnexo } from "@/lib/drive/zip";
import { baseDoPrevisto, entradaDaPlanilha } from "@/lib/fluxoDeCaixa/previstoServidor";
import { gerarPlanilhaDoPrevisto, nomeDoArquivoDoPrevisto } from "@/lib/fluxoDeCaixa/planilhaDoPrevisto";
import { TIPO_DO_XLSX } from "@/lib/planilha/tabelaDoExcel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  const naoEncontrado = NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (!modulos.has("bpo_fluxo_caixa")) return naoEncontrado;
  if (await telaBloqueadaNoPortal(escopo.tenantId, "/portal/fluxo-de-caixa")) return naoEncontrado;

  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  const pedida = req.nextUrl.searchParams.get("empresa");
  const empresa = empresas.find((e) => e.id === pedida) ?? (empresas.length === 1 ? empresas[0] : undefined);
  if (!empresa) return naoEncontrado;

  const base = await baseDoPrevisto(escopo.tenantId, empresa.id);
  const arquivo = await gerarPlanilhaDoPrevisto(entradaDaPlanilha(base, empresa.nome));
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": TIPO_DO_XLSX,
      "Content-Disposition": contentDispositionDeAnexo(nomeDoArquivoDoPrevisto(empresa.nome, base.hojeKey)),
      "Cache-Control": "no-store",
    },
  });
}
