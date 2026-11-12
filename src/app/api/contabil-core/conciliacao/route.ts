import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { ehUuid } from "@/lib/contabil-core/entradas";
import { lerRazaoDoArquivo } from "@/lib/contabil-core/conciliacao/razaoPdf";
import { RazaoInvalido } from "@/lib/contabil-core/conciliacao/razaoTipos";
import { lerSispag, SispagInvalido, type ConsultaSispag } from "@/lib/contabil-core/conciliacao/sispag";
import { relatorioParaJson } from "@/lib/contabil-core/conciliacao/relatorio";
import { nomeDaPlanilha, planilhaDaConciliacao } from "@/lib/contabil-core/conciliacao/planilhaDoRelatorio";
import { somasDaTela } from "@/lib/contabil-core/conciliacao/telaDaConciliacao";
import { conciliarRazaoExtrato } from "@/lib/contabil-core/servidor/conciliacao";

export const runtime = "nodejs";

// Conciliação Razão × extrato (Bloco B, Fase B2, 12/11/2026): porte do `POST /razao-extrato` de
// `src/api/v1/conciliacao_bancaria.py`. O Razão da conta banco (XLSX, XLS ou PDF) e, se vier, a
// consulta de pagamentos do SISPAG são cruzados com o extrato já importado da conta. Nada é gravado:
// nem o arquivo, nem o relatório. `formato=xlsx` devolve a mesma conciliação em planilha; a tela
// reenvia os arquivos para baixar. A revisão manual (`/revisoes*`) fica para a fase B3.

const MB = 25;
const LIMITE = MB * 1024 * 1024;

class ArquivoGrande extends Error {}

/** Os bytes do arquivo, conferindo o tamanho também depois de ler (o `size` vem do cliente). */
async function bytesDe(arquivo: File): Promise<Uint8Array> {
  if (arquivo.size > LIMITE) throw new ArquivoGrande();
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (bytes.length > LIMITE) throw new ArquivoGrande();
  return bytes;
}

/** "conciliacao_2699_2026-09.xlsx" só com caracteres que o cabeçalho aceita. */
const nomeSeguro = (nome: string) => nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_") || "conciliacao.xlsx";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "contabil_core", "agir"))) return NextResponse.json({ error: "Sem acesso ao Contábil Core." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. Algum arquivo passa de ${MB} MB?` }, { status: 400 });
  const empresaId = String(form.get("empresa") ?? "").toLowerCase();
  const agenciaId = String(form.get("agencia") ?? "").toLowerCase();
  const formato = String(form.get("formato") ?? "json") || "json";
  const arquivo = form.get("arquivo");
  const sispag = form.get("sispag");
  if (!ehUuid(empresaId)) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  if (!ehUuid(agenciaId)) return NextResponse.json({ error: "Escolha a conta bancária." }, { status: 400 });
  if (formato !== "json" && formato !== "xlsx") return NextResponse.json({ error: "Formato desconhecido." }, { status: 400 });
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha o arquivo do Razão." }, { status: 400 });

  try {
    const razao = await lerRazaoDoArquivo(await bytesDe(arquivo), arquivo.name || "");
    // O SISPAG é opcional: campo vazio ou arquivo sem nome e sem bytes é como se não viesse (o original
    // olha só o nome).
    let consulta: ConsultaSispag | null = null;
    if (sispag instanceof File && sispag.size > 0) consulta = lerSispag(await bytesDe(sispag));

    const r = await conciliarRazaoExtrato(ctx.tenantId, empresaId, agenciaId, razao, consulta);
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    const relatorio = r.valor;

    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "contabil.core.conciliacao.gerada",
      entityType: "CoreEmpresa",
      entityId: empresaId,
      metadata: {
        agenciaId,
        periodoInicio: relatorio.resumo.periodoInicio,
        periodoFim: relatorio.resumo.periodoFim,
        formato,
        lancamentosRazao: relatorio.resumo.lancamentosRazao,
        lancamentosExtrato: relatorio.resumo.lancamentosExtrato,
        pendencias: relatorio.resumo.pendencias,
        sispag: relatorio.sispagUsado,
      },
    });

    if (formato === "xlsx") {
      const planilha = await planilhaDaConciliacao(relatorio);
      const nome = nomeSeguro(nomeDaPlanilha(razao));
      return new NextResponse(Buffer.from(planilha), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${nome}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const json = relatorioParaJson(relatorio);
    return NextResponse.json({ ok: true, relatorio: json, somas: somasDaTela(json) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ArquivoGrande) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    if (err instanceof RazaoInvalido || err instanceof SispagInvalido) return NextResponse.json({ error: err.message }, { status: 400 });
    // Sem a mensagem nem a pilha: o erro de leitura pode citar o conteúdo do arquivo.
    console.error("[contabil-core] conciliação", err instanceof Error ? err.name : "erro");
    return NextResponse.json({ error: "Não deu para conciliar. Confira os arquivos e tente de novo." }, { status: 500 });
  }
}
