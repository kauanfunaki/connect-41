import { opcoesDaUrl } from "@/lib/dre/estrutura";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { podeAbrirADre } from "@/lib/dre/acesso";
import { leituraNoFoco } from "@/lib/empresas/focoServidor";
import { lancamentosDoAno, lancamentosDoMes, mesesComMovimento, type MesDoDre } from "@/lib/dre/data";
import { montarDreNoModeloDoBpo, nomeDoArquivoDaDre, type EntradaDoModelo } from "@/lib/dre/modeloDoBpo";
import { gerarXlsxDoModeloDoBpo } from "@/lib/dre/modeloDoBpoXlsx";
import { formatarCompetencia } from "@/lib/format";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { contentDispositionDeAnexo } from "@/lib/drive/zip";

export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// A DRE de caixa no modelo de planilha do BPO (13/10/2026) — o botão
// "Exportar no modelo do BPO" da tela da DRE. Mesma empresa, mesmo período e
// mesma leitura da tela: os lançamentos vêm de `lancamentosDoMes` /
// `lancamentosDoAno`, as mesmas funções que montam o que a tela mostra.
//
// `?empresa=…&visao=mes&mes=2026-10` exporta um mês; `?empresa=…&visao=ano&ano=2026`,
// os doze meses e o total do ano. Sem o período, vale o padrão da tela: o mês
// (ou o ano) mais recente com movimento.
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  // 404, e não 403: para quem não abre a DRE, a tela também não existe.
  if (!(await podeAbrirADre(ctx))) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const empresaId = sp.get("empresa");
  // A visão dos impostos da tela (20/10/2026): o EBITDA do arquivo é o da tela.
  const opcoes = opcoesDaUrl(sp.get("impostos"));
  // Só cliente ativo, como o seletor da tela — e só do escritório de quem pede.
  const empresa = empresaId
    ? await getPrisma().company.findFirst({
        where: { id: empresaId, tenantId: ctx.tenantId, status: "ACTIVE" },
        select: { id: true, name: true, tradeName: true },
      })
    : null;
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
  // Com uma empresa em foco (21/10/2026), a DRE de outra empresa não sai.
  const noFoco = await leituraNoFoco(ctx, empresa.id);
  if (!noFoco.ok) return NextResponse.json({ error: noFoco.erro }, { status: 403 });

  let entrada: EntradaDoModelo;
  let periodo: string;

  if (sp.get("visao") === "ano") {
    const ano =
      anoDaUrl(sp.get("ano")) ??
      (await mesesComMovimento(ctx.tenantId, empresa.id))[0]?.ano ??
      new Date().getFullYear();
    const { porMes, mapeamento, modelo } = await lancamentosDoAno(ctx.tenantId, empresa.id, ano);
    entrada = {
      colunas: Array.from({ length: 12 }, (_, i) => ({
        rotulo: rotuloDoMes({ ano, mes: i + 1 }),
        lancamentos: porMes.get(i + 1) ?? [],
      })),
      mapeamento,
      colunaDeTotal: `Total ${ano}`,
      opcoes: { ...opcoes, modelo },
    };
    periodo = String(ano);
  } else {
    const mes = mesDaUrl(sp.get("mes")) ?? (await mesesComMovimento(ctx.tenantId, empresa.id))[0];
    if (!mes) {
      return NextResponse.json({ error: "Nenhum pagamento ou recebimento nesta empresa" }, { status: 404 });
    }
    const { lancamentos, mapeamento, modelo } = await lancamentosDoMes(ctx.tenantId, empresa.id, mes);
    entrada = { colunas: [{ rotulo: rotuloDoMes(mes), lancamentos }], mapeamento, colunaDeTotal: null, opcoes: { ...opcoes, modelo } };
    periodo = `${String(mes.mes).padStart(2, "0")}-${mes.ano}`;
  }

  const nomeDaEmpresa = empresa.tradeName || empresa.name;
  const arquivo = await gerarXlsxDoModeloDoBpo(montarDreNoModeloDoBpo(entrada), { empresa: nomeDaEmpresa });

  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": contentDispositionDeAnexo(nomeDoArquivoDaDre(nomeDaEmpresa, periodo)),
      "Cache-Control": "no-store",
    },
  });
}

/** "Out/26", como a tela escreve o mês. */
function rotuloDoMes(m: MesDoDre): string {
  return formatarCompetencia(competenciaDe(m.ano, m.mes));
}

/** "2026-10" ou "2026-3" — o `mes` da URL da tela, que não completa com zero. */
function mesDaUrl(texto: string | null): MesDoDre | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(texto ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? { ano: Number(m[1]), mes } : null;
}

function anoDaUrl(texto: string | null): number | null {
  return /^\d{4}$/.test(texto ?? "") ? Number(texto) : null;
}
