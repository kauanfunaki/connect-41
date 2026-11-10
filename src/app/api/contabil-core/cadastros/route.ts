import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { ehUuid } from "@/lib/contabil-core/entradas";
import { analisarRegras, confirmarRegras, type ItemDaImportacaoDeRegras } from "@/lib/contabil-core/servidor/importacaoRegras";
import { analisarContrapartes, confirmarContrapartes } from "@/lib/contabil-core/servidor/importacaoContrapartes";
import { importarPlano } from "@/lib/contabil-core/servidor/importacaoPlano";

export const runtime = "nodejs";

// Importação de cadastros por planilha no Contábil Core (Fase 3b, 10/11/2026): regras pelo modelo
// de seis colunas e contrapartes pelas relações fiscais (prévia e confirmação com comprovante), e o
// plano de contas (importação direta, como no original). Rota, e não server action: a relação fiscal
// pode ter até 25 MB. O arquivo não é guardado; a confirmação o recebe de novo e refaz a análise.

const MB = 25;

/** A prévia no formato da tela: colunas e valores já escritos, para um componente só mostrar os três tipos. */
type PreviaParaTela = {
  totalLinhas: number;
  prontas: number;
  duplicadas: number;
  conflitos: number;
  invalidas: number;
  avisos: string[];
  comprovante: string;
  colunas: string[];
  itens: { linha: number; status: string; motivo: string | null; valores: string[] }[];
};

const lado = (dc: string | null) => (dc === "D" ? "Débito" : dc === "C" ? "Crédito" : "");

function itensDeRegras(itens: ItemDaImportacaoDeRegras[]) {
  return {
    colunas: ["Conta", "Lado", "Histórico contábil", "Padrão do extrato", "Banco"],
    itens: itens.map((i) => ({
      linha: i.linha,
      status: i.status,
      motivo: i.motivo,
      valores: [
        [i.contaNumero ?? "", i.contaDescricao ?? ""].filter(Boolean).join(" · "),
        lado(i.dc),
        i.manterHistorico ? `${i.descricao} (copia o extrato)` : i.descricao,
        i.historico,
        i.banco,
      ].map(String),
    })),
  };
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: `O envio chegou incompleto. O arquivo passa de ${MB} MB?` }, { status: 400 });
  const tipo = String(form.get("tipo") ?? "");
  const acao = String(form.get("acao") ?? "");
  const empresaId = String(form.get("empresaId") ?? "").toLowerCase();
  const arquivo = form.get("arquivo");

  // O plano de contas é de quem coordena o setor; regras e contrapartes, de quem opera.
  const permitido = tipo === "plano" ? await podeNoModulo(ctx, "contabil_core", "gerir") : await podeNoModulo(ctx, "contabil_core", "agir");
  if (!permitido) return NextResponse.json({ error: "Sem acesso a esta importação do Contábil Core." }, { status: 403 });
  if (!ehUuid(empresaId)) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
  if (arquivo.size > MB * 1024 * 1024) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });

  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes.length > MB * 1024 * 1024) return NextResponse.json({ error: `O arquivo passa de ${MB} MB.` }, { status: 400 });
    const nome = arquivo.name || "";

    if (tipo === "regras") {
      const banco = String(form.get("banco") ?? "arquivo") || "arquivo";
      if (acao === "analisar") {
        const r = await analisarRegras(ctx.tenantId, ctx.userId, empresaId, bytes, nome, banco);
        if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
        const { itens, comprovante, avisos, totalLinhas, prontas, duplicadas, conflitos, invalidas } = r.valor;
        const previa: PreviaParaTela = { totalLinhas, prontas, duplicadas, conflitos, invalidas, avisos, comprovante, ...itensDeRegras(itens) };
        return NextResponse.json({ ok: true, previa });
      }
      if (acao === "confirmar") {
        const r = await confirmarRegras(ctx.tenantId, ctx.userId, empresaId, bytes, nome, banco, String(form.get("comprovante") ?? ""));
        if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 409 });
        if (r.valor.importadas) {
          await logAudit({
            tenantId: ctx.tenantId, userId: ctx.userId, action: "contabil.core.regras.importadas", entityType: "CoreEmpresa", entityId: empresaId,
            metadata: { arquivo: nome, sha256: r.valor.arquivoHash, banco, importadas: r.valor.importadas, duplicadas: r.valor.duplicadas, conflitos: r.valor.conflitos, invalidas: r.valor.invalidas },
          });
        }
        return NextResponse.json({ ok: true, resultado: r.valor });
      }
    }
    if (tipo === "contrapartes") {
      if (acao === "analisar") {
        const r = await analisarContrapartes(ctx.tenantId, ctx.userId, empresaId, bytes, nome);
        if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
        const { itens, comprovante, avisos, totalLinhas, prontas, duplicadas, conflitos, invalidas, tipoDetectado } = r.valor;
        const previa: PreviaParaTela = {
          totalLinhas, prontas, duplicadas, conflitos, invalidas, comprovante,
          avisos: [`Relação de ${tipoDetectado === "cliente" ? "clientes" : "fornecedores"}.`, ...avisos],
          colunas: ["CPF/CNPJ", "Razão social", "Conta contábil"],
          itens: itens.map((i) => ({
            linha: i.linha,
            status: i.status,
            motivo: i.motivo,
            valores: [i.documento ?? "", i.razaoSocial ?? "", [i.contaNumero ?? "", i.contaCodigo ?? "", i.contaDescricao ?? ""].filter(Boolean).join(" · ")].map(String),
          })),
        };
        return NextResponse.json({ ok: true, previa });
      }
      if (acao === "confirmar") {
        const r = await confirmarContrapartes(ctx.tenantId, ctx.userId, empresaId, bytes, nome, String(form.get("comprovante") ?? ""));
        if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 409 });
        if (r.valor.importadas) {
          await logAudit({
            tenantId: ctx.tenantId, userId: ctx.userId, action: "contabil.core.contrapartes.importadas", entityType: "CoreEmpresa", entityId: empresaId,
            metadata: { arquivo: nome, sha256: r.valor.arquivoHash, tipo: r.valor.tipo, importadas: r.valor.importadas, duplicadas: r.valor.duplicadas, conflitos: r.valor.conflitos, invalidas: r.valor.invalidas },
          });
        }
        return NextResponse.json({ ok: true, resultado: r.valor });
      }
    }
    if (tipo === "plano" && acao === "importar") {
      const r = await importarPlano(ctx.tenantId, empresaId, bytes, nome);
      if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
      const { importadas, atualizadas, duplicadas, erros, mudancas } = r.valor;
      if (importadas || atualizadas) {
        await logAudit({
          tenantId: ctx.tenantId, userId: ctx.userId, action: "contabil.core.plano.importado", entityType: "CoreEmpresa", entityId: empresaId,
          metadata: {
            arquivo: nome, importadas, atualizadas, duplicadas, recusadas: erros.length,
            criadas: mudancas.criadas.map((c) => c.codigo),
            alteradas: mudancas.atualizadas.map((m) => ({ codigo: m.codigo, antes: m.antes, depois: m.depois })),
          },
        });
      }
      return NextResponse.json({ ok: true, plano: { importadas, atualizadas, duplicadas, erros } });
    }
    return NextResponse.json({ error: "Importação desconhecida." }, { status: 400 });
  } catch (err) {
    console.error("[contabil-core] importação de cadastro", err instanceof Error ? err.name : "erro");
    return NextResponse.json({ error: "Não deu para ler o arquivo. Tente de novo." }, { status: 500 });
  }
}
