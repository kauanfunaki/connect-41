import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { noEscritorioDe } from "@/lib/honorarios/acesso";
import {
  filtrarEmpresasContratos,
  gerarXlsxContratos,
  montarRelatorioContratos,
  type FiltrosContratos,
} from "@/lib/honorarios/servidor/auditContratosService";
import {
  anoAtual,
  filtrarEmpresas,
  gerarXlsxAditivos,
  montarRelatorioAditivos,
  type FiltrosAditivos,
} from "@/lib/honorarios/servidor/auditAditivosService";

// A planilha de Contratos ou de Aditivos, com os filtros da tela.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await podeNoModulo(ctx, "controladoria_honorarios", "ver"))) {
    return new NextResponse("Não encontrado.", { status: 404 });
  }
  const p = req.nextUrl.searchParams;
  const texto = (k: string) => p.get(k) || undefined;

  const { nome, conteudo } = await noEscritorioDe(ctx, async () => {
    if (p.get("relatorio") === "aditivos") {
      const ano = Number.parseInt(p.get("ano") ?? "", 10) || anoAtual();
      const rel = await montarRelatorioAditivos(ano);
      const filtros: FiltrosAditivos = {
        status: texto("status") as FiltrosAditivos["status"],
        responsavel: texto("responsavel"),
        busca: texto("busca"),
        soAlerta: p.get("alerta") === "1",
        decimo: (texto("decimo") as FiltrosAditivos["decimo"]) ?? undefined,
      };
      return { nome: `auditoria_aditivos_${ano}.xlsx`, conteudo: await gerarXlsxAditivos(rel, filtrarEmpresas(rel.empresas, filtros)) };
    }
    const rel = await montarRelatorioContratos();
    const filtros: FiltrosContratos = {
      status: texto("status") as FiltrosContratos["status"],
      responsavel: texto("responsavel"),
      busca: texto("busca"),
    };
    return { nome: "auditoria_contratos.xlsx", conteudo: await gerarXlsxContratos(rel, filtrarEmpresasContratos(rel.empresas, filtros)) };
  });

  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
