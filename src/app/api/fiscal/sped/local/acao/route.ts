import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, podeExcluir } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { ajusteSchema, apoioSchema, dinheiroSchema, parametrosSchema, perfilSchema, tributacaoSchema } from "@/lib/fiscal/sped/local/dominio";
import { autorizar, carregarBase, ErroFiscal, escreverNaRaiz, json, prepararTelaLocal, registrarDecisao, salvarClassificacao } from "@/lib/fiscal/sped/local/servidor";
import { processarImportacao } from "@/lib/fiscal/sped/local/fila";
import { gerarComPacote } from "@/lib/fiscal/sped/local/geracao";
import { ErroDoMotor } from "@/lib/sped/motor";

const entradaSchema = z.object({ empresa: z.string().min(1), competencia: z.string(), revisao: z.number().int().nonnegative(), aba: z.enum(["classificacao", "apuracao", "fechamento", "gerar"]).optional(), acao: z.enum(["perfil", "parametros", "classificar", "apoio", "ajuste", "tributacao", "remover_ajuste", "processar", "cancelar_importacao", "retomar_importacao", "gerar"]), dados: z.record(z.string(), z.unknown()) });
export async function POST(req: Request) {
  try {
    const r = entradaSchema.parse(await req.json());
    const ctx = await getAuthContext();
    const aba = ["ajuste", "remover_ajuste", "parametros", "tributacao"].includes(r.acao) ? "apuracao" : r.acao === "gerar" ? "gerar" : r.acao === "apoio" ? r.aba === "classificacao" ? "classificacao" : "fechamento" : r.acao === "perfil" || r.acao === "processar" || r.acao === "cancelar_importacao" || r.acao === "retomar_importacao" ? r.aba ?? "classificacao" : "classificacao";
    const empresa = await autorizar(ctx, r.empresa, aba, true);
    const tela = await prepararTelaLocal({ empresa: r.empresa, competencia: r.competencia }, aba);
    if (tela.empresa?.id !== r.empresa) throw new ErroFiscal("A empresa em foco mudou. Atualize a tela antes de salvar.", 409);
    const c = { ...tela.contexto!, revisao: r.revisao };
    if (r.acao === "gerar") return NextResponse.json({ ok: true, ...await gerarComPacote(ctx, r) });
    if (r.acao === "processar" || r.acao === "cancelar_importacao" || r.acao === "retomar_importacao") {
      if (!await podeNoModulo(ctx, "fiscal_acervo", "agir")) throw new ErroFiscal("Sem permissão para importar.", 404);
      const id = z.string().uuid().parse(r.dados.id);
      if (r.acao === "processar") return NextResponse.json({ ok: true, ...await processarImportacao(ctx, empresa, id) });
      if (r.acao === "retomar_importacao") { await getPrisma().spedFiscalImport.updateMany({ where: { id, tenantId: ctx.tenantId, companyId: empresa.id, state: "cancelado" }, data: { state: "pendente" } }); return NextResponse.json({ ok: true }); }
      await getPrisma().spedFiscalImport.updateMany({ where: { id, tenantId: ctx.tenantId, companyId: empresa.id, state: { in: ["pendente", "processando", "erro"] } }, data: { state: "cancelado", leaseOwner: null, leaseUntil: null } });
      return NextResponse.json({ ok: true });
    }
    if (r.acao === "classificar") {
      const base = await carregarBase(tela);
      await salvarClassificacao(ctx, c, z.array(z.string()).parse(r.dados.chaves), r.dados.classificacao, r.dados.credito === null || r.dados.credito === undefined || r.dados.restaurarCredito === true ? null : dinheiroSchema.parse(r.dados.credito), base.documentos, r.dados.restaurarCredito === true);
    } else await escreverNaRaiz(ctx, c.raiz, r.revisao, async tx => {
      if (r.acao === "tributacao") {
        const documentoId = z.string().uuid().parse(r.dados.documentoId), ordem = z.number().int().positive().parse(r.dados.ordem), tributos = tributacaoSchema.parse(r.dados.tributos);
        const vinculo = await tx.spedFiscalBook.findFirst({ where: { tenantId: ctx.tenantId, companyId: empresa.id, documentId: documentoId, competence: c.competencia } });
        if (!vinculo || !await tx.spedFiscalItem.findFirst({ where: { tenantId: ctx.tenantId, documentId: documentoId, position: ordem } })) throw new ErroFiscal("Item não encontrado nesta empresa e competência.", 404);
        for (const t of Object.keys(tributos)) if (!await podeNoModulo(ctx, ["pis", "cofins"].includes(t) ? "fiscal_contribuicoes" : "fiscal_icms_ipi", "agir")) throw new ErroFiscal("Sem permissão para ajustar este tributo.", 403);
        const chave = `${empresa.cnpj}|${c.competencia}|${documentoId}|${ordem}`;
        const anterior = await tx.spedFiscalDecision.findUnique({ where: { tenantId_raiz_type_key: { tenantId: ctx.tenantId, raiz: c.raiz, type: "tributacao", key: chave } } });
        await registrarDecisao(tx, ctx, c.raiz, "tributacao", chave, { ...(anterior?.data as object ?? {}), ...tributos });
      } else if (r.acao === "perfil") {
        if (!await podeNoModulo(ctx, "fiscal_configuracoes", "gerir")) throw new ErroFiscal("Sem permissão para configurar o perfil fiscal.", 403);
        const dados = perfilSchema.parse(r.dados);
        await tx.spedFiscalProfile.upsert({ where: { tenantId_companyId: { tenantId: ctx.tenantId, companyId: empresa.id } }, create: { tenantId: ctx.tenantId, companyId: empresa.id, data: json(dados) }, update: { data: json(dados) } });
        await registrarDecisao(tx, ctx, c.raiz, "perfil", empresa.id, dados);
      } else if (r.acao === "parametros") {
        if (c.competencia.length !== 7) throw new ErroFiscal("Parâmetros são informados por competência mensal.");
        const anterior = await tx.spedFiscalPeriod.findUnique({ where: { tenantId_companyId_competence: { tenantId: ctx.tenantId, companyId: empresa.id, competence: c.competencia } } });
        const antes = parametrosSchema.parse(anterior?.data ?? {});
        const dados = parametrosSchema.parse({ ...antes, ...r.dados });
        for (const k of Object.keys(dados) as (keyof typeof dados)[]) {
          if (dados[k] === antes[k] || k === "semMovimento") continue;
          if (!await podeNoModulo(ctx, ["saldoIcms", "saldoIpi"].includes(k) ? "fiscal_icms_ipi" : "fiscal_contribuicoes", "agir")) throw new ErroFiscal("Sem permissão para alterar parâmetros desta obrigação.", 403);
        }
        await tx.spedFiscalPeriod.upsert({ where: { tenantId_companyId_competence: { tenantId: ctx.tenantId, companyId: empresa.id, competence: c.competencia } }, create: { tenantId: ctx.tenantId, companyId: empresa.id, competence: c.competencia, data: json(dados) }, update: { data: json(dados) } });
        await registrarDecisao(tx, ctx, c.raiz, "parametros", `${empresa.id}|${c.competencia}`, dados);
      } else if (r.acao === "apoio") {
        const dados = apoioSchema.parse(r.dados);
        if (dados.anexoId && !await tx.spedFiscalImport.findFirst({ where: { id: dados.anexoId, tenantId: ctx.tenantId, companyId: empresa.id, state: "anexo" } })) throw new ErroFiscal("Anexo indisponível.", 404);
        if (dados.decisao === "rejeitado" && !dados.motivo.trim()) throw new ErroFiscal("Informe o motivo da rejeição.");
        if (dados.decisao === "aceito" && (!dados.dataPagamento || !dados.credito)) throw new ErroFiscal("Para aceitar, informe a data do pagamento e a decisão de crédito.");
        const user = await tx.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
        await tx.spedFiscalSupport.upsert({ where: { tenantId_companyId_identity: { tenantId: ctx.tenantId, companyId: empresa.id, identity: dados.identidade } }, create: { tenantId: ctx.tenantId, companyId: empresa.id, identity: dados.identidade, competence: dados.competencia, data: json(dados), updatedBy: user?.name ?? ctx.userId }, update: { competence: dados.competencia, data: json(dados), updatedBy: user?.name ?? ctx.userId } });
        await registrarDecisao(tx, ctx, c.raiz, "apoio", `${empresa.id}|${dados.identidade}`, dados);
      } else if (r.acao === "ajuste") {
        const dados = ajusteSchema.parse({ ...r.dados, companyId: empresa.id, competencia: c.competencia });
        const modulo = dados.obrigacao === "contribuicoes" ? "fiscal_contribuicoes" : "fiscal_icms_ipi";
        if (!await podeNoModulo(ctx, modulo, "agir")) throw new ErroFiscal("Sem permissão para ajustar esta obrigação.", 403);
        if (dados.tributo === "icms" && dados.natureza !== ({ "0": "debito", "1": "estorno_credito", "2": "credito", "3": "estorno_debito", "4": "deducao", "5": "debito_especial" }[dados.codigo[3]])) throw new ErroFiscal("Natureza incompatível com o código do E111.");
        await registrarDecisao(tx, ctx, c.raiz, "ajuste", dados.id, dados);
      } else if (r.acao === "remover_ajuste") {
        if (!podeExcluir(ctx)) throw new ErroFiscal("Sem permissão para remover ajustes.", 403);
        const id = z.string().uuid().parse(r.dados.id);
        const anterior = await tx.spedFiscalDecision.findFirst({ where: { tenantId: ctx.tenantId, raiz: c.raiz, type: "ajuste", key: id } });
        if (!anterior || ajusteSchema.parse(anterior.data).companyId !== empresa.id) throw new ErroFiscal("Ajuste não encontrado.", 404);
        if (!await podeNoModulo(ctx, ajusteSchema.parse(anterior.data).obrigacao === "contribuicoes" ? "fiscal_contribuicoes" : "fiscal_icms_ipi", "agir")) throw new ErroFiscal("Sem permissão para remover ajustes desta obrigação.", 403);
        await registrarDecisao(tx, ctx, c.raiz, "ajuste_removido", id, anterior.data);
        await tx.spedFiscalDecision.delete({ where: { id: anterior.id, tenantId: ctx.tenantId } });
      }
    });
    return NextResponse.json({ ok: true, mensagem: "Dados salvos no Connect." });
  } catch (e) {
    if (!(e instanceof ErroFiscal) && !(e instanceof z.ZodError)) console.error("[sped/local] ação", e);
    return NextResponse.json({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof ErroFiscal || e instanceof ErroDoMotor ? e.message : "Não foi possível concluir a ação. Seus dados gravados foram preservados." }, { status: e instanceof ErroFiscal ? e.status : e instanceof z.ZodError ? 422 : 502 });
  }
}
