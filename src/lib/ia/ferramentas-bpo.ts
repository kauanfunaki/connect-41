// As ferramentas da IA do BPO no chat do canto da tela — só leitura.
//
// ─── Um agente, várias telas, e cada tela tem a sua porta ───────────────────
//
// O BPO não é um módulo: são contas a pagar, a receber, DRE, pendências,
// conciliação e aprovações — e desde 15/09 cada um pode ser operado por outro
// setor (o DRE no Financeiro, por exemplo). Então a pergunta "esta pessoa pode
// ver isto?" é **por ferramenta**: quem abre o chat calcula os módulos que ela
// opera (ligados + `canActOnSector` do setor de cada um) e manda em
// `escopo.modulos`. A ferramenta de DRE recusa quem não tem `bpo_dre`, mesmo
// que tenha contas a pagar.
//
// As leituras são as das telas (`listarContas`, `dreDoMes`, `listarPendencias`)
// — o agente vê o mesmo número que a pessoa vê, calculado pelo mesmo código.

import { getPrisma } from "@/lib/prisma";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { listarContas } from "@/lib/financeiro/data";
import { dreDoMes, mesesComMovimento } from "@/lib/dre/data";
import { listarPendencias } from "@/lib/financeiro/pendencias/consultas";
import { nomeExibicao } from "@/lib/companyName";

/** Os módulos do BPO que o chat pode consultar, com a tela de cada um. */
export const MODULOS_DO_BPO = {
  bpo_contas_pagar: "/pagar",
  bpo_contas_receber: "/receber",
  bpo_dre: "/dre",
  bpo_pendencias: "/pendencias",
  bpo_conciliacao: "/conciliacao",
  bpo_aprovacoes: "/aprovacoes",
} as const;

export type ModuloDoBpo = keyof typeof MODULOS_DO_BPO;

/** Recusa quem não opera o módulo — o recorte vem de quem abriu o chat, nunca do modelo. */
export function exigirModulo(ctx: ContextoDaFerramenta, modulo: ModuloDoBpo): void {
  const modulos = new Set((ctx.escopo.modulos ?? "").split(",").map((m) => m.trim()).filter(Boolean));
  if (!modulos.has(modulo)) throw new Error(`Você não tem acesso à tela ${MODULOS_DO_BPO[modulo]}.`);
}

function textoOpcional(argumentos: Record<string, unknown>, campo: string): string | undefined {
  const v = argumentos[campo];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** A empresa pedida, no tenant; `""` = todas. */
async function empresaOpcional(argumentos: Record<string, unknown>, ctx: ContextoDaFerramenta) {
  const id = textoOpcional(argumentos, "empresaId");
  if (!id) return null;
  const e = await getPrisma().company.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, name: true, displayName: true },
  });
  if (!e) throw new Error("Empresa não encontrada. Use buscar_empresa para achar o id.");
  return e;
}

/** "AAAA-MM", ou nada. */
export function competenciaOpcional(argumentos: Record<string, unknown>): string | undefined {
  const c = textoOpcional(argumentos, "competencia");
  if (!c) return undefined;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) throw new Error("Competência no formato AAAA-MM, ex.: 2026-08.");
  return c;
}

/** Centavos → reais, para o modelo escrever o valor sem conta. */
export function reais(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function link(caminho: string, filtro: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtro)) if (v) q.set(k, v);
  const s = q.toString();
  return `${caminho}${s ? `?${s}` : ""}`;
}

const EMPRESA_OPCIONAL = { type: "string", description: "O id de buscar_empresa, ou \"\" para todas as empresas" } as const;

/** Linhas mostradas por lista — o total vem sempre inteiro, à parte. */
const LINHAS = 30;

export const FERRAMENTAS_DE_BPO: Record<string, FerramentaRegistrada> = {
  contas_do_bpo: {
    def: {
      nome: "contas_do_bpo",
      descricao:
        "Contas a pagar ou a receber, com os totais (vencido, vence hoje, a vencer, pago, em aberto) e até 30 contas na ordem da tela (vencidas primeiro). Filtra por empresa, competência (mês de vencimento, AAAA-MM) e recorte: abertas, vencidas ou todas.",
      parametros: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["PAGAR", "RECEBER"] },
          empresaId: EMPRESA_OPCIONAL,
          competencia: { type: "string", description: "AAAA-MM, ou \"\" para todas" },
          recorte: { type: "string", enum: ["abertas", "vencidas", "todas"] },
        },
        required: ["tipo", "empresaId", "competencia", "recorte"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const tipo = args.tipo === "RECEBER" ? "RECEBER" : "PAGAR";
      exigirModulo(ctx, tipo === "PAGAR" ? "bpo_contas_pagar" : "bpo_contas_receber");
      const empresa = await empresaOpcional(args, ctx);
      const competencia = competenciaOpcional(args);
      const recorte = args.recorte === "vencidas" || args.recorte === "todas" ? args.recorte : "abertas";
      const r = await listarContas(ctx.tenantId, tipo, { empresaId: empresa?.id, competencia, recorte }, new Date());
      return {
        tipo,
        empresa: empresa ? nomeExibicao(empresa) : "todas",
        totais: {
          vencido: reais(r.totais.vencido),
          venceHoje: reais(r.totais.venceHoje),
          aVencer: reais(r.totais.aVencer),
          pago: reais(r.totais.pago),
          emAberto: reais(r.totais.emAberto),
        },
        contasNoRecorte: r.linhas.length,
        mostrando: Math.min(r.linhas.length, LINHAS),
        link: link(tipo === "PAGAR" ? "/pagar" : "/receber", { empresa: empresa?.id, competencia, recorte }),
        contas: r.linhas.slice(0, LINHAS).map((l) => ({
          empresa: l.empresaNome,
          contraparte: l.contraparteNome,
          descricao: l.descricao,
          categoria: l.categoriaNome,
          valor: reais(l.valorCentavos),
          vencimento: l.vencimentoKey,
          situacao: l.situacao,
          aprovacao: l.approvalStatus,
        })),
      };
    },
  },

  dre_do_mes: {
    def: {
      nome: "dre_do_mes",
      descricao:
        "O DRE (demonstração de resultado) de uma empresa num mês: as linhas com valor e percentual, o que ficou sem classificação e se o fechamento bate. Se competencia for \"\", usa o mês mais recente com movimento.",
      parametros: {
        type: "object",
        properties: {
          empresaId: { type: "string", description: "O id de buscar_empresa" },
          competencia: { type: "string", description: "AAAA-MM, ou \"\" para o mais recente" },
        },
        required: ["empresaId", "competencia"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModulo(ctx, "bpo_dre");
      const empresa = await empresaOpcional(args, ctx);
      if (!empresa) throw new Error("Informe a empresa.");
      const meses = await mesesComMovimento(ctx.tenantId, empresa.id);
      const pedida = competenciaOpcional(args);
      const mes = pedida
        ? { ano: Number(pedida.slice(0, 4)), mes: Number(pedida.slice(5, 7)) }
        : meses[0];
      if (!mes) return { empresa: nomeExibicao(empresa), aviso: "A empresa não tem movimento pago no Connect — o DRE sai zerado." };
      const { resultado, lancamentos, fonte } = await dreDoMes(ctx.tenantId, empresa.id, mes);
      const chave = `${mes.ano}-${String(mes.mes).padStart(2, "0")}`;
      return {
        empresa: nomeExibicao(empresa),
        competencia: chave,
        mesesComMovimento: meses.slice(0, 12).map((m) => `${m.ano}-${String(m.mes).padStart(2, "0")}`),
        lancamentos,
        fonte: fonte.tipo === "import" ? "planilha importada" : "financeiro do Connect",
        linhas: resultado.linhas.map((l) =>
          l.tipo === "percentual"
            ? { linha: l.label, percentual: l.fracao === null ? null : Math.round(l.fracao * 1000) / 10 }
            : { linha: l.label, valor: l.centavos === null ? null : reais(l.centavos) }
        ),
        semClassificacao: resultado.naoClassificado.slice(0, 5).map((n) => ({ categoria: n.categoria, valor: reais(n.centavos) })),
        fechamentoBate: resultado.diferencaDeFechamento === 0,
        link: link("/dre", { empresa: empresa.id, mes: `${mes.ano}-${mes.mes}` }),
      };
    },
  },

  pendencias_de_clientes: {
    def: {
      nome: "pendencias_de_clientes",
      descricao:
        "As pendências abertas com os clientes (pedidos de documento, informação, etc.): quantas aguardam o cliente, quantas o cliente já respondeu e quantas estão vencidas, com até 30 da lista.",
      parametros: {
        type: "object",
        properties: {
          empresaId: EMPRESA_OPCIONAL,
          recorte: { type: "string", enum: ["andamento", "aguardando", "respondidas", "vencidas"] },
        },
        required: ["empresaId", "recorte"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModulo(ctx, "bpo_pendencias");
      const empresa = await empresaOpcional(args, ctx);
      const vencidas = args.recorte === "vencidas";
      const recorte = args.recorte === "aguardando" || args.recorte === "respondidas" ? args.recorte : "andamento";
      const r = await listarPendencias(
        { tenantId: ctx.tenantId, companyIds: null },
        { recorte, empresaId: empresa?.id ?? null, vencidas },
        new Date()
      );
      return {
        empresa: empresa ? nomeExibicao(empresa) : "todas",
        contadores: r.contadores,
        mostrando: Math.min(r.linhas.length, LINHAS),
        link: link("/pendencias", { empresa: empresa?.id, recorte, vencidas: vencidas ? "1" : undefined }),
        pendencias: r.linhas.slice(0, LINHAS).map((p) => ({
          titulo: p.titulo,
          empresa: p.empresaNome,
          status: p.status,
          prazo: p.prazo ? p.prazo.toISOString().slice(0, 10) : null,
          situacaoDoPrazo: p.situacaoDoPrazo,
          mensagens: p.mensagens,
        })),
      };
    },
  },

  conciliacao_pendente: {
    def: {
      nome: "conciliacao_pendente",
      descricao:
        "Por conta bancária: quantas transações do extrato ainda não foram conciliadas, a soma delas e a data da mais antiga.",
      parametros: {
        type: "object",
        properties: { empresaId: EMPRESA_OPCIONAL },
        required: ["empresaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModulo(ctx, "bpo_conciliacao");
      const empresa = await empresaOpcional(args, ctx);
      const prisma = getPrisma();
      const grupos = await prisma.bankTransaction.groupBy({
        by: ["bankAccountId"],
        where: {
          tenantId: ctx.tenantId,
          status: "PENDENTE",
          ...(empresa ? { bankAccount: { companyId: empresa.id } } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
        _min: { postedAt: true },
      });
      const contas = await prisma.bankAccount.findMany({
        where: { id: { in: grupos.map((g) => g.bankAccountId) }, tenantId: ctx.tenantId },
        select: { id: true, nickname: true, company: { select: { id: true, name: true, displayName: true } } },
      });
      const porId = new Map(contas.map((c) => [c.id, c]));
      return {
        contas: grupos
          .map((g) => {
            const c = porId.get(g.bankAccountId);
            return {
              conta: c?.nickname ?? "conta",
              empresa: c ? nomeExibicao(c.company) : null,
              pendentes: g._count._all,
              soma: Number(g._sum.amount ?? 0),
              maisAntiga: g._min.postedAt ? g._min.postedAt.toISOString().slice(0, 10) : null,
              link: link("/conciliacao", { empresa: c?.company.id, conta: c?.id }),
            };
          })
          .sort((a, b) => b.pendentes - a.pendentes),
      };
    },
  },

  aprovacoes_aguardando: {
    def: {
      nome: "aprovacoes_aguardando",
      descricao:
        "Contas a pagar aguardando a aprovação do cliente (alçada) — a baixa fica travada até ele decidir. Quantidade, soma e até 30 da lista.",
      parametros: {
        type: "object",
        properties: { empresaId: EMPRESA_OPCIONAL },
        required: ["empresaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModulo(ctx, "bpo_aprovacoes");
      const empresa = await empresaOpcional(args, ctx);
      const linhas = await getPrisma().financeEntry.findMany({
        where: {
          tenantId: ctx.tenantId,
          approvalStatus: "AGUARDANDO",
          status: { not: "CANCELADO" },
          ...(empresa ? { companyId: empresa.id } : {}),
        },
        orderBy: { dueDate: "asc" },
        take: 200,
        select: {
          amount: true,
          dueDate: true,
          description: true,
          company: { select: { name: true, displayName: true } },
          counterparty: { select: { name: true } },
        },
      });
      return {
        quantidade: linhas.length,
        soma: Math.round(linhas.reduce((n, l) => n + Number(l.amount), 0) * 100) / 100,
        link: link("/aprovacoes", {}),
        contas: linhas.slice(0, LINHAS).map((l) => ({
          empresa: nomeExibicao(l.company),
          fornecedor: l.counterparty.name,
          descricao: l.description,
          valor: Number(l.amount),
          vencimento: l.dueDate.toISOString().slice(0, 10),
        })),
      };
    },
  },
};
