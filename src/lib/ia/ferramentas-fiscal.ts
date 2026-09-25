// As ferramentas da IA do Fiscal no chat do canto da tela.
//
// ─── O acervo é grande, e isso manda no desenho ─────────────────────────────
//
// 252 mil documentos em produção (09/09), num MySQL com buffer pool de 128 MB:
// varrer a tabela leva ~90 s. Por isso toda ferramenta aqui ou **pede a
// empresa** (e usa o índice `tenantId, companyId, competence`), ou usa as
// consultas da tela, que já contam com teto (`resumoPorDestino`, com o
// `TETO_DA_CONTAGEM` de `src/lib/fiscal/data.ts`). Nenhuma soma o acervo
// inteiro.
//
// ─── Alcance ────────────────────────────────────────────────────────────────
//
// A equipe vê o tenant inteiro (`alcanceDaEquipe`) — a mesma regra da tela
// `/documentos-fiscais`. Quem abre o chat já passou por `canActOnSector` do
// setor que opera o módulo; aqui o tenant vem do contexto, nunca do modelo.
//
// Só leitura. Lançar e ignorar documento continua na tela.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { FiscalDocumentDestination, FiscalDocumentType } from "@/generated/prisma/enums";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { listarDocumentos, resumoPorDestino } from "@/lib/fiscal/data";
import type { AlcanceFiscal } from "@/lib/fiscal/alcance";
import { nomeExibicao } from "@/lib/companyName";

function alcance(ctx: ContextoDaFerramenta): AlcanceFiscal {
  return { tipo: "TENANT", tenantId: ctx.tenantId };
}

function texto(argumentos: Record<string, unknown>, campo: string): string {
  const v = argumentos[campo];
  if (typeof v !== "string" || !v.trim()) throw new Error(`Informe ${campo}.`);
  return v.trim();
}

/** Competência "AAAA-MM", conferida. */
export function competenciaPedida(argumentos: Record<string, unknown>): string {
  const c = texto(argumentos, "competencia");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) throw new Error("Competência no formato AAAA-MM, ex.: 2026-08.");
  return c;
}

/** A empresa pedida, **no tenant** — id de outro cliente responde "não encontrada". */
async function empresaDoTenant(argumentos: Record<string, unknown>, ctx: ContextoDaFerramenta) {
  const id = texto(argumentos, "empresaId");
  const e = await getPrisma().company.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, name: true, displayName: true, cnpj: true, cpf: true },
  });
  if (!e) throw new Error("Empresa não encontrada. Use buscar_empresa para achar o id.");
  return e;
}

/** Só dígitos — o documento do emitente é gravado assim. */
export function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

const TIPOS = ["NFE", "NFCE", "CTE", "NFSE"] as const;
const DESTINOS = ["PENDENTE", "LANCADO", "IGNORADO"] as const;

/** Link da tela filtrada — a IA manda a pessoa conferir lá. */
export function linkDoAcervo(filtro: { empresa?: string; competencia?: string; destino?: string; tipo?: string }): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtro)) if (v) q.set(k, v);
  const s = q.toString();
  return `/documentos-fiscais${s ? `?${s}` : ""}`;
}

const PEDE_EMPRESA = {
  type: "object",
  properties: { empresaId: { type: "string", description: "O id que veio de buscar_empresa" } },
  required: ["empresaId"],
  additionalProperties: false,
} as const;

const PEDE_EMPRESA_E_COMPETENCIA = {
  type: "object",
  properties: {
    empresaId: { type: "string", description: "O id que veio de buscar_empresa" },
    competencia: { type: "string", description: "AAAA-MM, ex.: 2026-08" },
  },
  required: ["empresaId", "competencia"],
  additionalProperties: false,
} as const;

type Grupo = { type: string; situation: string; destination: string; completude: string; _count: { _all: number }; _sum: { amount: Prisma.Decimal | null } };

/** Soma os grupos por tipo — quantidade e valor autorizados, canceladas à parte. */
export function somarPorTipo(grupos: Grupo[]) {
  const porTipo: Record<string, { quantidade: number; valor: number; canceladas: number }> = {};
  for (const g of grupos) {
    const t = (porTipo[g.type] ??= { quantidade: 0, valor: 0, canceladas: 0 });
    if (g.situation === "CANCELADA") {
      t.canceladas += g._count._all;
      continue;
    }
    t.quantidade += g._count._all;
    t.valor += Number(g._sum.amount ?? 0);
  }
  for (const t of Object.values(porTipo)) t.valor = Math.round(t.valor * 100) / 100;
  return porTipo;
}

export const FERRAMENTAS_DE_FISCAL: Record<string, FerramentaRegistrada> = {
  buscar_empresa: {
    def: {
      nome: "buscar_empresa",
      descricao: "Acha empresas do escritório pelo nome, nome fantasia ou CNPJ/CPF. Devolve o id que as outras ferramentas pedem.",
      parametros: {
        type: "object",
        properties: { busca: { type: "string", description: "Parte do nome ou o CNPJ/CPF" } },
        required: ["busca"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const busca = texto(args, "busca");
      const digitos = soDigitos(busca);
      const empresas = await getPrisma().company.findMany({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { name: { contains: busca } },
            { displayName: { contains: busca } },
            ...(digitos.length >= 8 ? [{ cnpj: { contains: digitos } }, { cpf: { contains: digitos } }] : []),
          ],
        },
        orderBy: { name: "asc" },
        take: 10,
        select: { id: true, name: true, displayName: true, cnpj: true, cpf: true, status: true },
      });
      return empresas.map((e) => ({
        empresaId: e.id,
        nome: nomeExibicao(e),
        razaoSocial: e.name,
        documento: e.cnpj ?? e.cpf,
        situacaoNoEscritorio: e.status,
      }));
    },
  },

  competencias_da_empresa: {
    def: {
      nome: "competencias_da_empresa",
      descricao: "Os últimos 12 meses (competências AAAA-MM) em que a empresa tem documentos fiscais, com a quantidade de cada um.",
      parametros: PEDE_EMPRESA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const empresa = await empresaDoTenant(args, ctx);
      // Só os últimos 24 meses: agrupar o histórico inteiro da maior empresa
      // (mais de 10 mil notas por mês) levava 3,5 s, medido em 25/09.
      const hoje = new Date();
      const desde = `${hoje.getUTCFullYear() - 2}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
      const grupos = await getPrisma().fiscalDocument.groupBy({
        by: ["competence"],
        where: { tenantId: ctx.tenantId, companyId: empresa.id, competence: { gte: desde }, removedAtOrigin: false },
        _count: { _all: true },
        orderBy: { competence: "desc" },
        take: 12,
      });
      return grupos.map((g) => ({ competencia: g.competence, documentos: g._count._all }));
    },
  },

  resumo_fiscal_do_mes: {
    def: {
      nome: "resumo_fiscal_do_mes",
      descricao:
        "O resumo de uma empresa numa competência: notas emitidas e recebidas por tipo (quantidade e valor, canceladas à parte), quantas ainda sem destino no financeiro (pendentes), lançadas e ignoradas, e quantas com XML incompleto. Traz o link da tela filtrada.",
      parametros: PEDE_EMPRESA_E_COMPETENCIA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const empresa = await empresaDoTenant(args, ctx);
      const competencia = competenciaPedida(args);
      const documento = soDigitos(empresa.cnpj ?? empresa.cpf);
      const base: Prisma.FiscalDocumentWhereInput = {
        tenantId: ctx.tenantId,
        companyId: empresa.id,
        competence: competencia,
        removedAtOrigin: false,
      };
      const prisma = getPrisma();
      const agrupar = (where: Prisma.FiscalDocumentWhereInput) =>
        prisma.fiscalDocument.groupBy({
          by: ["type", "situation", "destination", "completude"],
          where,
          _count: { _all: true },
          _sum: { amount: true },
        }) as unknown as Promise<Grupo[]>;
      const [emitidas, recebidas] = await Promise.all([
        documento ? agrupar({ ...base, issuerDocument: documento }) : Promise.resolve([] as Grupo[]),
        agrupar(documento ? { ...base, NOT: { issuerDocument: documento } } : base),
      ]);
      const todas = [...emitidas, ...recebidas];
      const autorizadas = todas.filter((g) => g.situation === "AUTORIZADA");
      const porDestino = Object.fromEntries(
        DESTINOS.map((d) => [d, autorizadas.filter((g) => g.destination === d).reduce((n, g) => n + g._count._all, 0)])
      );
      return {
        empresa: nomeExibicao(empresa),
        competencia,
        emitidas: somarPorTipo(emitidas),
        recebidas: somarPorTipo(recebidas),
        noFinanceiro: porDestino,
        comXmlIncompleto: todas.filter((g) => g.completude === "PARCIAL").reduce((n, g) => n + g._count._all, 0),
        link: linkDoAcervo({ empresa: empresa.id, competencia }),
      };
    },
  },

  listar_documentos_fiscais: {
    def: {
      nome: "listar_documentos_fiscais",
      descricao:
        "Lista até 50 documentos de uma empresa numa competência, do mais recente para o mais antigo, com filtros opcionais de tipo, destino no financeiro e busca por número ou contraparte. Use \"\" para não filtrar.",
      parametros: {
        type: "object",
        properties: {
          empresaId: { type: "string", description: "O id que veio de buscar_empresa" },
          competencia: { type: "string", description: "AAAA-MM" },
          tipo: { type: "string", enum: ["", ...TIPOS], description: "\"\" para todos" },
          destino: { type: "string", enum: ["", ...DESTINOS], description: "\"\" para todos" },
          busca: { type: "string", description: "Número da nota ou nome da contraparte; \"\" para nenhuma" },
        },
        required: ["empresaId", "competencia", "tipo", "destino", "busca"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const empresa = await empresaDoTenant(args, ctx);
      const competencia = competenciaPedida(args);
      const tipo = TIPOS.find((t) => t === args.tipo) as FiscalDocumentType | undefined;
      const destino = DESTINOS.find((d) => d === args.destino) as FiscalDocumentDestination | undefined;
      const busca = typeof args.busca === "string" && args.busca.trim() ? args.busca.trim() : undefined;
      const r = await listarDocumentos(alcance(ctx), { companyId: empresa.id, competencia, tipo, destino, busca }, 1);
      return {
        total: r.total,
        haMaisQueOTotal: r.totalLimitado,
        mostrando: r.documentos.length,
        link: linkDoAcervo({ empresa: empresa.id, competencia, tipo, destino }),
        documentos: r.documentos.map((d) => ({
          tipo: d.type,
          numero: d.series ? `${d.number}/${d.series}` : d.number,
          emitente: d.issuerName,
          destinatario: d.recipientName,
          valor: d.amount === null ? null : Number(d.amount),
          emitidaEm: d.issuedAt.toISOString().slice(0, 10),
          situacao: d.situation,
          destino: d.destination,
          xmlIncompleto: d.completude === "PARCIAL",
          link: `/documentos-fiscais/${d.id}`,
        })),
      };
    },
  },

  fila_de_lancamento: {
    def: {
      nome: "fila_de_lancamento",
      descricao:
        "Quantos documentos autorizados estão pendentes, lançados e ignorados no financeiro — de uma empresa, ou do escritório inteiro se empresaId for \"\". As contagens param em 1.000 (\"mais de 1.000\").",
      parametros: {
        type: "object",
        properties: { empresaId: { type: "string", description: "O id de buscar_empresa, ou \"\" para o escritório inteiro" } },
        required: ["empresaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const pedido = typeof args.empresaId === "string" ? args.empresaId.trim() : "";
      const empresa = pedido ? await empresaDoTenant(args, ctx) : null;
      const r = await resumoPorDestino(alcance(ctx), empresa ? { companyId: empresa.id } : {});
      const fmt = (c: { total: number; limitado: boolean }) => (c.limitado ? `mais de ${c.total}` : c.total);
      return {
        empresa: empresa ? nomeExibicao(empresa) : "todas as empresas",
        pendentes: fmt(r.PENDENTE),
        lancados: fmt(r.LANCADO),
        ignorados: fmt(r.IGNORADO),
        link: linkDoAcervo({ empresa: empresa?.id, destino: "PENDENTE" }),
      };
    },
  },
};
