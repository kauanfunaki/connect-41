// As ferramentas da IA do DP no chat do canto da tela — só leitura.
//
// ─── Duas portas: a tela e o campo sensível ─────────────────────────────────
//
// Como no BPO, cada ferramenta confere o **módulo** da tela que ela espelha
// (`escopo.modulos`, calculado por quem abre o chat com o setor de cada módulo).
// E o DP tem uma segunda porta, que o BPO não tem: **campo sensível**. Salário
// (`SALARIO`) e motivo de afastamento/atestado (`DADOS_MEDICOS`) só saem para
// quem tem a permissão do papel (`canViewSensitiveField`) — a mesma regra da
// tela de afastamentos. Quem abre o chat manda os grupos liberados em
// `escopo.sensiveis`; sem o grupo, o campo simplesmente não vai ao modelo. Não
// basta pedir ao modelo para "não mostrar": o que ele não recebe, ele não vaza.
//
// As regras de prazo são as dos alertas do DP (`src/lib/alerts.ts`,
// `src/lib/rescisaoChecklist.ts`) — férias que vencem em até 30 dias e o prazo
// de 10 dias do art. 477 §6º da CLT.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { statusPrazoPagamento } from "@/lib/rescisaoChecklist";
import { nomeExibicao } from "@/lib/companyName";

export const MODULOS_DO_DP = {
  dp_colaboradores: "/colaboradores",
  dp_afastamentos: "/afastamentos",
  dp_horas_extras: "/horas-extras",
} as const;

export type ModuloDoDp = keyof typeof MODULOS_DO_DP;

function lista(ctx: ContextoDaFerramenta, chave: string): Set<string> {
  return new Set((ctx.escopo[chave] ?? "").split(",").map((m) => m.trim()).filter(Boolean));
}

export function exigirModuloDoDp(ctx: ContextoDaFerramenta, modulo: ModuloDoDp): void {
  if (!lista(ctx, "modulos").has(modulo)) throw new Error(`Você não tem acesso à tela ${MODULOS_DO_DP[modulo]}.`);
}

/** O campo sensível pode ir ao modelo? Só se o grupo veio liberado de quem abriu o chat. */
export function podeVerSensivel(ctx: ContextoDaFerramenta, grupo: "SALARIO" | "DADOS_MEDICOS"): boolean {
  return lista(ctx, "sensiveis").has(grupo);
}

const DIA = 24 * 60 * 60 * 1000;
/** A mesma antecedência do alerta de férias vencendo. */
export const DIAS_DE_AVISO_DAS_FERIAS = 30;
const FERIAS_EM_ABERTO = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;

const data = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function empresaOpcional(argumentos: Record<string, unknown>, ctx: ContextoDaFerramenta) {
  const id = typeof argumentos.empresaId === "string" ? argumentos.empresaId.trim() : "";
  if (!id) return null;
  const e = await getPrisma().company.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, name: true, displayName: true } });
  if (!e) throw new Error("Empresa não encontrada. Use buscar_empresa para achar o id.");
  return e;
}

/** O `where` de pessoa colaboradora, do tenant, opcionalmente de uma empresa. */
export function recorteDeColaborador(ctx: ContextoDaFerramenta, empresaId: string | null): Prisma.PersonWhereInput {
  return { tenantId: ctx.tenantId, type: "COLABORADOR", ...(empresaId ? { currentCompanyId: empresaId } : {}) };
}

const EMPRESA_OPCIONAL = { type: "string", description: "O id de buscar_empresa, ou \"\" para todas as empresas" } as const;
const SO_EMPRESA = {
  type: "object",
  properties: { empresaId: EMPRESA_OPCIONAL },
  required: ["empresaId"],
  additionalProperties: false,
} as const;

const LINHAS = 40;

export const FERRAMENTAS_DE_DP: Record<string, FerramentaRegistrada> = {
  colaboradores_da_empresa: {
    def: {
      nome: "colaboradores_da_empresa",
      descricao:
        "Os colaboradores de uma empresa: quantos em cada situação (ativo, em férias, afastado, admissão em andamento, desligado) e a lista com cargo e data de admissão.",
      parametros: {
        type: "object",
        properties: {
          empresaId: { type: "string", description: "O id de buscar_empresa" },
          incluirDesligados: { type: "boolean", description: "true para listar também os desligados; normalmente false" },
        },
        required: ["empresaId", "incluirDesligados"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModuloDoDp(ctx, "dp_colaboradores");
      const empresa = await empresaOpcional(args, ctx);
      if (!empresa) throw new Error("Informe a empresa.");
      const where = recorteDeColaborador(ctx, empresa.id);
      const salario = podeVerSensivel(ctx, "SALARIO");
      const prisma = getPrisma();
      const [grupos, pessoas] = await Promise.all([
        prisma.person.groupBy({ by: ["employmentStatus"], where, _count: { _all: true } }),
        prisma.person.findMany({
          where: { ...where, ...(args.incluirDesligados === true ? {} : { employmentStatus: { not: "DESLIGADO" } }) },
          orderBy: { name: "asc" },
          take: 200,
          select: { name: true, employmentStatus: true, admissionDate: true, currentSalary: true, cargo: { select: { name: true } } },
        }),
      ]);
      return {
        empresa: nomeExibicao(empresa),
        porSituacao: Object.fromEntries(grupos.map((g) => [g.employmentStatus, g._count._all])),
        mostrando: Math.min(pessoas.length, LINHAS),
        ...(salario ? {} : { aviso: "Salário omitido: seu perfil não tem acesso a esse dado." }),
        colaboradores: pessoas.slice(0, LINHAS).map((p) => ({
          nome: p.name,
          cargo: p.cargo?.name ?? null,
          situacao: p.employmentStatus,
          admissao: data(p.admissionDate),
          ...(salario ? { salario: p.currentSalary === null ? null : Number(p.currentSalary) } : {}),
        })),
      };
    },
  },

  buscar_colaborador: {
    def: {
      nome: "buscar_colaborador",
      descricao: "Procura um colaborador pelo nome, em todas as empresas: empresa, cargo, situação, admissão, e férias, afastamento ou rescisão em aberto.",
      parametros: {
        type: "object",
        properties: { nome: { type: "string", description: "Nome ou parte do nome" } },
        required: ["nome"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModuloDoDp(ctx, "dp_colaboradores");
      const nome = typeof args.nome === "string" ? args.nome.trim() : "";
      if (nome.length < 3) throw new Error("Informe ao menos 3 letras do nome.");
      const medico = podeVerSensivel(ctx, "DADOS_MEDICOS");
      const pessoas = await getPrisma().person.findMany({
        where: { ...recorteDeColaborador(ctx, null), name: { contains: nome } },
        orderBy: { name: "asc" },
        take: 10,
        select: {
          name: true,
          employmentStatus: true,
          admissionDate: true,
          cargo: { select: { name: true } },
          currentCompany: { select: { name: true, displayName: true } },
          vacations: {
            where: { status: { in: [...FERIAS_EM_ABERTO] } },
            select: { status: true, startDate: true, returnDate: true, concessivePeriodEnd: true },
            take: 3,
          },
          absences: {
            where: { status: { in: ["AFASTADO", "RETORNO_PREVISTO", "EM_ANALISE"] } },
            select: { type: true, startDate: true, returnDate: true, reason: true },
            take: 3,
          },
          terminations: {
            where: { status: { notIn: ["FINALIZADO", "CANCELADO"] } },
            select: { type: true, status: true, terminationDate: true },
            take: 1,
          },
        },
      });
      return pessoas.map((p) => ({
        nome: p.name,
        empresa: p.currentCompany ? nomeExibicao(p.currentCompany) : null,
        cargo: p.cargo?.name ?? null,
        situacao: p.employmentStatus,
        admissao: data(p.admissionDate),
        feriasEmAberto: p.vacations.map((v) => ({ status: v.status, inicio: data(v.startDate), retorno: data(v.returnDate), limiteParaTirar: data(v.concessivePeriodEnd) })),
        afastamentos: p.absences.map((a) => ({
          tipo: a.type,
          inicio: data(a.startDate),
          retornoPrevisto: data(a.returnDate),
          ...(medico ? { motivo: a.reason } : {}),
        })),
        rescisaoEmAndamento: p.terminations[0]
          ? { tipo: p.terminations[0].type, status: p.terminations[0].status, termino: data(p.terminations[0].terminationDate) }
          : null,
      }));
    },
  },

  ferias_do_dp: {
    def: {
      nome: "ferias_do_dp",
      descricao:
        "Férias em aberto: as em gozo agora, as programadas, e as que VENCEM em até 30 dias ou já venceram (fim do período concessivo — férias vencidas são pagas em dobro).",
      parametros: {
        type: "object",
        properties: {
          empresaId: EMPRESA_OPCIONAL,
          recorte: { type: "string", enum: ["vencendo", "em_gozo", "todas_em_aberto"] },
        },
        required: ["empresaId", "recorte"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModuloDoDp(ctx, "dp_colaboradores");
      const empresa = await empresaOpcional(args, ctx);
      const hoje = new Date();
      const where: Prisma.VacationWhereInput = {
        tenantId: ctx.tenantId,
        status: args.recorte === "em_gozo" ? "EM_GOZO" : { in: [...FERIAS_EM_ABERTO] },
        ...(args.recorte === "vencendo"
          ? { concessivePeriodEnd: { not: null, lte: new Date(hoje.getTime() + DIAS_DE_AVISO_DAS_FERIAS * DIA) } }
          : {}),
        ...(empresa ? { person: { currentCompanyId: empresa.id } } : {}),
      };
      const ferias = await getPrisma().vacation.findMany({
        where,
        orderBy: [{ concessivePeriodEnd: "asc" }],
        take: 100,
        select: {
          status: true,
          days: true,
          startDate: true,
          returnDate: true,
          concessivePeriodEnd: true,
          person: { select: { name: true, currentCompany: { select: { name: true, displayName: true } } } },
        },
      });
      return {
        empresa: empresa ? nomeExibicao(empresa) : "todas",
        quantidade: ferias.length,
        link: "/ferias",
        ferias: ferias.slice(0, LINHAS).map((v) => {
          const limite = v.concessivePeriodEnd;
          const dias = limite ? Math.round((limite.getTime() - hoje.getTime()) / DIA) : null;
          return {
            colaborador: v.person.name,
            empresa: v.person.currentCompany ? nomeExibicao(v.person.currentCompany) : null,
            status: v.status,
            dias: v.days,
            inicio: data(v.startDate),
            retorno: data(v.returnDate),
            limiteParaTirar: data(limite),
            situacaoDoLimite: dias === null ? null : dias < 0 ? `vencidas há ${-dias} dias` : `vencem em ${dias} dias`,
          };
        }),
      };
    },
  },

  rescisoes_em_andamento: {
    def: {
      nome: "rescisoes_em_andamento",
      descricao:
        "Rescisões em andamento, com o tipo, a etapa e o prazo legal de pagamento (10 dias do término — CLT art. 477 §6º): no prazo, vence hoje ou vencido.",
      parametros: SO_EMPRESA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModuloDoDp(ctx, "dp_colaboradores");
      const empresa = await empresaOpcional(args, ctx);
      const hoje = new Date();
      const linhas = await getPrisma().termination.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { notIn: ["FINALIZADO", "CANCELADO"] },
          ...(empresa ? { person: { currentCompanyId: empresa.id } } : {}),
        },
        orderBy: { terminationDate: "asc" },
        take: 100,
        select: {
          type: true,
          status: true,
          terminationDate: true,
          person: { select: { name: true, currentCompany: { select: { name: true, displayName: true } } } },
        },
      });
      return {
        quantidade: linhas.length,
        link: "/desligamentos",
        rescisoes: linhas.slice(0, LINHAS).map((t) => {
          const prazo = t.terminationDate ? statusPrazoPagamento(t.terminationDate, hoje) : null;
          return {
            colaborador: t.person.name,
            empresa: t.person.currentCompany ? nomeExibicao(t.person.currentCompany) : null,
            tipo: t.type,
            etapa: t.status,
            termino: data(t.terminationDate),
            prazoDePagamento: prazo ? { ate: data(prazo.dueDate), situacao: prazo.status, diasRestantes: prazo.diasRestantes } : "sem data de término",
          };
        }),
      };
    },
  },

  afastamentos_ativos: {
    def: {
      nome: "afastamentos_ativos",
      descricao: "Afastamentos e atestados em aberto (afastado, retorno previsto, em análise), com tipo, início e retorno previsto.",
      parametros: SO_EMPRESA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModuloDoDp(ctx, "dp_afastamentos");
      const empresa = await empresaOpcional(args, ctx);
      const medico = podeVerSensivel(ctx, "DADOS_MEDICOS");
      const linhas = await getPrisma().absence.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["AFASTADO", "RETORNO_PREVISTO", "EM_ANALISE"] },
          ...(empresa ? { person: { currentCompanyId: empresa.id } } : {}),
        },
        orderBy: { returnDate: "asc" },
        take: 100,
        select: {
          type: true,
          status: true,
          startDate: true,
          returnDate: true,
          lostDays: true,
          reason: true,
          person: { select: { name: true, currentCompany: { select: { name: true, displayName: true } } } },
        },
      });
      return {
        quantidade: linhas.length,
        link: "/afastamentos",
        ...(medico ? {} : { aviso: "Motivo omitido: seu perfil não tem acesso a dados médicos." }),
        afastamentos: linhas.slice(0, LINHAS).map((a) => ({
          colaborador: a.person.name,
          empresa: a.person.currentCompany ? nomeExibicao(a.person.currentCompany) : null,
          tipo: a.type,
          status: a.status,
          inicio: data(a.startDate),
          retornoPrevisto: data(a.returnDate),
          diasPerdidos: a.lostDays,
          ...(medico ? { motivo: a.reason } : {}),
        })),
      };
    },
  },

  horas_extras_pendentes: {
    def: {
      nome: "horas_extras_pendentes",
      descricao: "Horas extras lançadas e ainda não enviadas para a folha (lançadas ou aguardando aprovação), com o total de horas por colaborador.",
      parametros: SO_EMPRESA as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModuloDoDp(ctx, "dp_horas_extras");
      const empresa = await empresaOpcional(args, ctx);
      const linhas = await getPrisma().overtimeEntry.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["LANCADO", "PENDENTE_APROVACAO"] },
          ...(empresa ? { person: { currentCompanyId: empresa.id } } : {}),
        },
        orderBy: { date: "asc" },
        take: 500,
        select: { overtimeHours: true, status: true, date: true, personId: true, person: { select: { name: true } } },
      });
      const porPessoa = new Map<string, { colaborador: string; horas: number; lancamentos: number; maisAntigo: string | null }>();
      for (const l of linhas) {
        const p = porPessoa.get(l.personId) ?? { colaborador: l.person.name, horas: 0, lancamentos: 0, maisAntigo: data(l.date) };
        p.horas += Number(l.overtimeHours ?? 0);
        p.lancamentos++;
        porPessoa.set(l.personId, p);
      }
      return {
        lancamentos: linhas.length,
        link: "/horas-extras",
        porColaborador: [...porPessoa.values()]
          .map((p) => ({ ...p, horas: Math.round(p.horas * 100) / 100 }))
          .sort((a, b) => b.horas - a.horas)
          .slice(0, LINHAS),
      };
    },
  },
};
