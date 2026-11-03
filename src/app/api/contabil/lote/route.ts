import { NextResponse, type NextRequest } from "next/server";
import { zipSync, strToU8 } from "fflate";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { txtDaDominio, xlsxDaDominio } from "@/lib/financeiro/dominio/planilha";
import { contentDispositionDeAnexo } from "@/lib/drive/zip";
import { empresaContabilVisivel, linhasParaADominio, painelDasSaidas, painelDoContabil, type EmpresaDoContabil } from "@/lib/contabil/servidor";
import { CTE, NFE, NFSE } from "@/lib/contabil/lancamentos";
import { competenciasDoAno, nomeNoLote, resumoDoLote, type MesDoLote, type ResultadoDoPasso } from "@/lib/contabil/lote";

export const dynamic = "force-dynamic";

const ENTRADAS = [["nfe", NFE], ["cte", CTE], ["nfse", NFSE]] as const;

/** Os passos que geram lançamento num mês. Um passo que falha vira linha de ERRO no resumo, e o lote segue. */
async function mesDoLote(tenantId: string, empresa: EmpresaDoContabil, competencia: string): Promise<MesDoLote> {
  const passos: ResultadoDoPasso[] = [];
  try {
    const painel = await painelDoContabil(tenantId, empresa, competencia, { sugestoes: false });
    for (const [passo, tipo] of ENTRADAS) passos.push({
      passo, linhas: linhasParaADominio(painel.lancamentos, tipo, painel.configuracao.modelos.codigoFilial),
      pendencias: painel.pendencias.filter((p) => p.tipos.includes(tipo)).reduce((s, p) => s + p.qtd, 0),
    });
  } catch (err) {
    console.error("[contabil/lote] entradas", competencia, err);
    for (const [passo] of ENTRADAS) passos.push({ passo, linhas: [], pendencias: 0, erro: "Não foi possível montar as entradas do mês." });
  }
  try {
    passos.push({ passo: "saidas", linhas: (await painelDasSaidas(tenantId, empresa, competencia)).linhas, pendencias: 0 });
  } catch (err) {
    console.error("[contabil/lote] saídas", competencia, err);
    passos.push({ passo: "saidas", linhas: [], pendencias: 0, erro: "Não foi possível montar as saídas do mês." });
  }
  // Os pagamentos sem nota (passo 5) entram aqui quando existirem.
  return { competencia, passos };
}

/**
 * O lote do ano (passo 7, 03/11/2026): os doze meses da empresa num ZIP, uma
 * pasta por mês com um arquivo da Domínio por passo, e o _RESUMO.csv.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext();
  const naoAchou = () => NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  if (!auth.tenantId || !(await podeNoModulo(auth, "contabil_sped", "ver"))) return naoAchou();
  const p = req.nextUrl.searchParams;
  const ano = Number(p.get("ano"));
  const formato = p.get("formato") === "txt" ? "txt" : "xlsx";
  const id = p.get("empresa") ?? "";
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || !/^[0-9a-f-]{36}$/i.test(id)) return naoAchou();
  const empresa = await empresaContabilVisivel(auth, id);
  if (!empresa) return naoAchou();

  // Um mês por vez: doze painéis juntos seriam doze leituras do acervo de uma vez.
  const meses: MesDoLote[] = [];
  for (const competencia of competenciasDoAno(ano)) meses.push(await mesDoLote(auth.tenantId, empresa, competencia));
  const arquivos: Record<string, Uint8Array> = { "_RESUMO.csv": strToU8(resumoDoLote(meses)) };
  for (const m of meses) for (const r of m.passos) {
    if (!r.linhas.length) continue;
    arquivos[nomeNoLote(r.passo, empresa.cnpj, m.competencia, formato)] = new Uint8Array(formato === "txt" ? txtDaDominio(r.linhas) : await xlsxDaDominio(r.linhas));
  }
  if (Object.keys(arquivos).length === 1) return NextResponse.json({ error: "Nenhum lançamento no ano." }, { status: 409 });
  const zip = zipSync(arquivos);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDispositionDeAnexo(`lancamentos_dominio_${empresa.cnpj || "empresa"}_${ano}_${formato}.zip`),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
