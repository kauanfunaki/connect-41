// Os prazos que a Agenda e o Meu dia mostram (30/09).
//
// A Agenda era só reunião, e só coordenador abria. O Kauan perguntou se ela
// servia aos outros setores para continuar no menu geral; serve: o Connect já
// guarda a data de quase tudo que um setor precisa cumprir. Aqui essas datas
// viram eventos de dia inteiro, com a mesma regra de acesso dos painéis da
// Home (`acessoDosPaineis`): o prazo só aparece para quem abre a tela de onde
// ele vem, e com setor ativo, só os do setor.
//
// 10/11/2026 (pedido do Kauan): os prazos passam a ter FONTE (fontesDaAgenda.ts)
// — a pessoa liga e desliga cada uma, e fonte desligada nem chega a ser buscada.
// Entram duas fontes novas, cada uma com a regra da própria tela: a data legal
// das obrigações (pelo escopo do quadro da atividade) e o vencimento das guias
// (pelo acesso de Autorizações › Guias do mês). As regras puras — juntar,
// atrasar, risco de multa — estão em prazosDaAgendaRegras.ts.

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { scopedPipelineWhere, scopedVagaWhere } from "@/lib/auth/scope";
import { saoPauloParts, saoPauloDateTimeToUtc } from "@/lib/agenda";
import { acessoDosPaineis } from "@/lib/home/acessoDosPaineis";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { nomeExibicao } from "@/lib/companyName";
import { listarCertificados } from "@/lib/certificados/servidor";
import { atuaisPorDocumento, situacaoDoCertificado } from "@/lib/certificados/certificados";
import { soDoSetorPadrao, whereDoRecorteDeSetor } from "@/lib/financeiro/pendencias/setor";
import { podeNoModulo } from "@/lib/auth/modulo";
import { setoresDoModulo } from "@/lib/modules";
import { setorParaMostrar } from "@/lib/modulo-setor";
import { EM_ABERTO, MODULO_TECH_INTERNO, enderecoDoItem } from "@/lib/tech-interno/regras";
import { acessoAsAutorizacoes, setorDasAutorizacoes } from "@/lib/autorizacoes/servidor";
import { MODULO_AUTORIZACOES } from "@/lib/autorizacoes/regras";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { hojeIso } from "@/lib/datas/calendario";
import { FONTES_DA_AGENDA, type FonteDaAgenda } from "@/lib/fontesDaAgenda";
import {
  agruparPrazos,
  estaAtrasado,
  prazoDaGuia,
  prazoDaObrigacao,
  type PrazoBruto,
  type PrazoDaAgenda,
} from "@/lib/prazosDaAgendaRegras";

export type { PrazoDaAgenda, TipoDePrazo } from "@/lib/prazosDaAgendaRegras";
export { agruparPrazos, ROTULO_DO_PRAZO } from "@/lib/prazosDaAgendaRegras";

/**
 * O que a pessoa alcança, fonte a fonte, pela regra da tela de onde cada uma
 * vem. Uma vez por requisição: a Agenda pergunta para montar os botões e de
 * novo para buscar.
 */
export const acessoAsFontes = cache(async (ctx: AuthContext) => {
  const tenantId = ctx.tenantId;
  const [paineis, guias, tech, temObrigacao] = await Promise.all([
    acessoDosPaineis(ctx),
    acessoAsGuias(ctx),
    acessoAoControleInterno(ctx),
    // A fonte só aparece no escritório que gera obrigações — um botão que
    // nunca traz nada só confunde. Uma linha basta, sem contar.
    tenantId
      ? getPrisma()
          .modeloDeObrigacao.findFirst({ where: { tenantId, active: true }, select: { id: true } })
          .then((m) => m !== null)
      : Promise.resolve(false),
  ]);
  const pendencias = paineis.get("painel-pendencias");
  const alcanca: Record<FonteDaAgenda, boolean> = {
    obrigacoes: temObrigacao,
    guias: guias !== null,
    tarefas: true,
    contas: paineis.has("painel-contas"),
    pendencias: !!pendencias?.modulos.has("bpo_pendencias"),
    societario: paineis.has("painel-processos"),
    dp: paineis.has("painel-dp"),
    vagas: paineis.has("painel-recrutamento"),
    certificados: paineis.has("painel-certificados"),
    "controle-interno": tech !== null,
  };
  return {
    paineis,
    guias,
    tech,
    /** As fontes que a pessoa vê, na ordem do catálogo — os botões da Agenda. */
    fontes: FONTES_DA_AGENDA.map((f) => f.chave).filter((f) => alcanca[f]),
  };
});

/**
 * Guias do mês: o acesso da própria tela (`acessoAsAutorizacoes` — módulo
 * ligado e setor visível) e, com setor ativo, só se a tela é dele, como os
 * painéis.
 */
async function acessoAsGuias(ctx: AuthContext): Promise<{ setor: string } | null> {
  if (!ctx.tenantId || !(await acessoAsAutorizacoes(ctx))) return null;
  const setores = (await setoresDoModulo(ctx.tenantId, MODULO_AUTORIZACOES)) ?? [await setorDasAutorizacoes(ctx.tenantId)];
  if (ctx.activeSector && !setores.includes(ctx.activeSector)) return null;
  return { setor: setorParaMostrar(setores, ctx) };
}

async function acessoAoControleInterno(ctx: AuthContext): Promise<{ setor: string } | null> {
  if (!ctx.tenantId || !(await podeNoModulo(ctx, MODULO_TECH_INTERNO, "ver"))) return null;
  return { setor: (await setoresDoModulo(ctx.tenantId, MODULO_TECH_INTERNO))?.[0] ?? "tech" };
}

export type OpcoesDosPrazos = {
  /** As fontes ligadas; sem isto, todas as que a pessoa alcança. Fonte desligada não é buscada. */
  fontes?: readonly FonteDaAgenda[];
  /** Hoje em "AAAA-MM-DD" (São Paulo) — para o atraso e o risco de multa. */
  hoje?: string;
};

/**
 * Os prazos de `de` a `ate` (chaves de dia, inclusive) que esta pessoa pode
 * ver. Tarefas e obrigações seguem o escopo dos quadros; guias, o de Guias do
 * mês; o resto, o acesso dos painéis. Todas as buscas são pelo período, em
 * coluna com índice ou já limitadas, com teto de linhas.
 */
export async function prazosDoPeriodo(ctx: AuthContext, de: string, ate: string, opcoes: OpcoesDosPrazos = {}): Promise<PrazoDaAgenda[]> {
  if (!ctx.tenantId) return [];
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const hoje = opcoes.hoje ?? hojeIso();
  const inicio = saoPauloDateTimeToUtc(de, 0, 0);
  const fim = saoPauloDateTimeToUtc(ate, 23, 59);
  const noPeriodo = { gte: inicio, lte: fim };
  const acesso = await acessoAsFontes(ctx);
  const ligadas = new Set(opcoes.fontes ?? acesso.fontes);
  const liga = (f: FonteDaAgenda) => ligadas.has(f) && acesso.fontes.includes(f);
  const dia = (d: Date) => saoPauloParts(d).dateKey;

  const contas = liga("contas") ? acesso.paineis.get("painel-contas") : undefined;
  const pendencias = liga("pendencias") ? acesso.paineis.get("painel-pendencias") : undefined;
  const processos = liga("societario") ? acesso.paineis.get("painel-processos") : undefined;
  const dp = liga("dp") ? acesso.paineis.get("painel-dp") : undefined;
  const vagas = liga("vagas") ? acesso.paineis.get("painel-recrutamento") : undefined;
  const certificados = liga("certificados") ? acesso.paineis.get("painel-certificados") : undefined;
  const guias = liga("guias") ? acesso.guias : null;

  const kinds: ("PAGAR" | "RECEBER")[] = [];
  if (contas?.modulos.has("bpo_contas_pagar")) kinds.push("PAGAR");
  if (contas?.modulos.has("bpo_contas_receber")) kinds.push("RECEBER");

  const [cards, titulos, reqs, procs, ferias, exames, vagasAbertas, certs, exigencias, taxas, licencas, obrigacoes, guiasAbertas] = await Promise.all([
    liga("tarefas")
      ? prisma.pipelineItem.findMany({
          where: {
            tenantId,
            pipeline: { ...scopedPipelineWhere(ctx), active: true },
            stage: { isTerminal: false },
            candidatura: { is: null },
            dueDate: noPeriodo,
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            pipelineId: true,
            entityType: true,
            entityId: true,
            pipeline: { select: { name: true, sectorCode: true } },
            // Quem faz: a segunda linha da lista ("empresa · pessoa"), como no desenho A.
            assignees: { select: { user: { select: { name: true } } }, take: 2 },
          },
          take: 2000,
        })
      : Promise.resolve([]),
    kinds.length
      ? prisma.financeEntry.findMany({
          where: { tenantId, kind: { in: kinds }, paidAt: null, status: { not: "CANCELADO" }, dueDate: noPeriodo },
          select: { id: true, kind: true, dueDate: true, amount: true },
          take: 5000,
        })
      : Promise.resolve([]),
    pendencias?.modulos.has("bpo_pendencias")
      ? prisma.clientRequest.findMany({
          // Só as do setor do painel (e as sem setor, de antes de 01/10): as dos
          // outros setores ainda não entram na agenda.
          where: {
            tenantId,
            status: { in: ["ABERTA", "RESPONDIDA"] },
            dueDate: noPeriodo,
            ...whereDoRecorteDeSetor(soDoSetorPadrao(pendencias.setor)),
          },
          select: { id: true, title: true, dueDate: true, company: { select: { name: true, displayName: true } } },
          take: 1000,
        })
      : Promise.resolve([]),
    processos
      ? prisma.process.findMany({
          where: { tenantId, status: { notIn: ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] }, dueAt: noPeriodo },
          select: { id: true, dueAt: true, type: { select: { name: true } }, company: { select: { name: true, displayName: true } } },
          take: 1000,
        })
      : Promise.resolve([]),
    dp
      ? prisma.vacation.findMany({
          where: { tenantId, status: { in: ["APROVADA", "PROGRAMADA"] }, startDate: noPeriodo },
          select: { id: true, startDate: true, person: { select: { name: true } } },
          take: 500,
        })
      : Promise.resolve([]),
    dp
      ? prisma.exameAdmissional.findMany({
          where: { tenantId, status: { in: ["SOLICITADO", "AGENDADO"] }, scheduledAt: noPeriodo },
          select: { id: true, scheduledAt: true, clinicName: true, person: { select: { name: true } } },
          take: 500,
        })
      : Promise.resolve([]),
    vagas
      ? prisma.vaga.findMany({
          where: { AND: [scopedVagaWhere(ctx), { status: { in: ["ABERTA", "EM_ANDAMENTO"] }, applicationDeadline: noPeriodo }] },
          select: { id: true, title: true, applicationDeadline: true },
          take: 500,
        })
      : Promise.resolve([]),
    certificados ? listarCertificados(tenantId) : Promise.resolve([]),
    // Os prazos do Societário que antes só a Minha área mostrava (fila única,
    // lote 7, 28/10/2026): exigência do órgão, taxa e licença vencendo.
    processos
      ? prisma.processRequirement.findMany({
          where: { tenantId, resolvedAt: null, dueAt: noPeriodo, protocol: { process: { status: { notIn: ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] } } } },
          select: {
            id: true,
            description: true,
            dueAt: true,
            protocol: { select: { process: { select: { id: true, company: { select: { name: true, displayName: true } } } } } },
          },
          take: 1000,
        })
      : Promise.resolve([]),
    processos
      ? prisma.processFee.findMany({
          where: { tenantId, paidAt: null, dueDate: noPeriodo },
          select: { id: true, description: true, dueDate: true, processId: true, amountCents: true, company: { select: { name: true, displayName: true } } },
          take: 1000,
        })
      : Promise.resolve([]),
    processos
      ? prisma.license.findMany({
          where: { tenantId, revokedAt: null, expiresAt: noPeriodo },
          select: { id: true, kind: true, expiresAt: true, company: { select: { name: true, displayName: true } } },
          take: 1000,
        })
      : Promise.resolve([]),
    // A data legal das obrigações (10/11/2026): pelo índice (tenantId,
    // dataLegal), só as que têm a atividade aberta num quadro que a pessoa vê
    // — a mesma régua da atividade, que é onde a obrigação se cumpre.
    liga("obrigacoes")
      ? prisma.obrigacaoGerada.findMany({
          where: {
            tenantId,
            dataLegal: { gte: de, lte: ate },
            pipelineItem: {
              is: { pipeline: { ...scopedPipelineWhere(ctx), active: true }, stage: { isTerminal: false, type: { not: "DONE" } } },
            },
          },
          select: {
            id: true,
            dataLegal: true,
            prazoInterno: true,
            modelo: { select: { nome: true, sectorCode: true } },
            company: { select: { name: true, displayName: true } },
            pipelineItem: { select: { id: true, pipelineId: true } },
          },
          take: 3000,
        })
      : Promise.resolve([]),
    // As guias ainda não pagas (10/11/2026), pelo índice (tenantId,
    // vencimento); a DCTFWeb e a parcela, sem vencimento, pelo "válido até".
    guias
      ? prisma.guia.findMany({
          where: {
            tenantId,
            pagaEm: null,
            OR: [{ vencimento: { gte: de, lte: ate } }, { vencimento: null, validoAte: { gte: de, lte: ate } }],
          },
          select: {
            id: true,
            descricao: true,
            vencimento: true,
            validoAte: true,
            valor: true,
            company: { select: { name: true, displayName: true } },
          },
          take: 2000,
        })
      : Promise.resolve([]),
  ]);

  // As empresas das atividades: a entidade é polimórfica (sem chave), então
  // vem numa busca só, pelos ids.
  const idsDeEmpresa = [...new Set(cards.filter((c) => c.entityType === "COMPANY" && c.entityId).map((c) => c.entityId!))];
  const empresas = idsDeEmpresa.length
    ? new Map(
        (
          await prisma.company.findMany({ where: { tenantId, id: { in: idsDeEmpresa } }, select: { id: true, name: true, displayName: true } })
        ).map((c) => [c.id, nomeExibicao(c)]),
      )
    : new Map<string, string>();

  const brutos: PrazoBruto[] = [];
  const atrasa = (p: PrazoBruto): PrazoBruto => (estaAtrasado(p.tipo, p.dia, hoje) ? { ...p, atrasada: true } : p);
  for (const c of cards) {
    const empresa = c.entityType === "COMPANY" && c.entityId ? empresas.get(c.entityId) : undefined;
    const pessoas = c.assignees.map((a) => a.user.name).join(", ");
    brutos.push(
      atrasa({
        chave: `tarefa-${c.id}`,
        dia: dia(c.dueDate!),
        tipo: "tarefa",
        titulo: c.title ?? empresa ?? "Atividade sem título",
        detalhe: [c.title ? empresa : undefined, pessoas || c.pipeline.name].filter(Boolean).join(" · "),
        setor: c.pipeline.sectorCode,
        href: `/kanban/${c.pipelineId}/itens/${c.id}`,
      }),
    );
  }
  for (const t of titulos) {
    brutos.push(
      atrasa({
        chave: `conta-${t.id}`,
        dia: dia(t.dueDate),
        tipo: t.kind === "PAGAR" ? "conta-pagar" : "conta-receber",
        titulo: t.kind === "PAGAR" ? "Conta a pagar" : "Conta a receber",
        setor: contas!.setor,
        href: t.kind === "PAGAR" ? "/pagar" : "/receber",
        centavos: centavosDeDecimal(t.amount),
      }),
    );
  }
  for (const r of reqs) {
    brutos.push(
      atrasa({
        chave: `pendencia-${r.id}`,
        dia: dia(r.dueDate!),
        tipo: "pendencia",
        titulo: r.title,
        detalhe: nomeExibicao(r.company),
        setor: pendencias!.setor,
        href: `/pendencias/${r.id}`,
      }),
    );
  }
  for (const p of procs) {
    brutos.push(
      atrasa({
        chave: `processo-${p.id}`,
        dia: dia(p.dueAt!),
        tipo: "processo",
        titulo: p.type.name,
        detalhe: nomeExibicao(p.company),
        setor: processos!.setor,
        href: `/processos/${p.id}`,
      }),
    );
  }
  for (const e of exigencias) {
    brutos.push(
      atrasa({
        chave: `exigencia-${e.id}`,
        dia: dia(e.dueAt!),
        tipo: "exigencia",
        titulo: e.description,
        detalhe: nomeExibicao(e.protocol.process.company),
        setor: processos!.setor,
        href: `/processos/${e.protocol.process.id}`,
      }),
    );
  }
  for (const t of taxas) {
    brutos.push(
      atrasa({
        chave: `taxa-${t.id}`,
        dia: dia(t.dueDate!),
        tipo: "taxa",
        titulo: t.description,
        detalhe: nomeExibicao(t.company),
        setor: processos!.setor,
        href: t.processId ? `/processos/${t.processId}` : "/processos",
        centavos: t.amountCents,
      }),
    );
  }
  for (const l of licencas) {
    brutos.push(
      atrasa({
        chave: `licenca-${l.id}`,
        dia: dia(l.expiresAt!),
        tipo: "licenca",
        titulo: `${l.kind} vence`,
        detalhe: nomeExibicao(l.company),
        setor: processos!.setor,
        href: "/licencas",
      }),
    );
  }
  for (const f of ferias) {
    brutos.push({
      chave: `ferias-${f.id}`,
      dia: dia(f.startDate!),
      tipo: "ferias",
      titulo: `Férias de ${f.person.name}`,
      setor: dp!.setor,
      href: "/ferias",
    });
  }
  for (const e of exames) {
    brutos.push(
      atrasa({
        chave: `exame-${e.id}`,
        dia: dia(e.scheduledAt!),
        tipo: "exame",
        titulo: `Exame de ${e.person.name}`,
        detalhe: e.clinicName ?? undefined,
        setor: dp!.setor,
        href: "/admissoes",
      }),
    );
  }
  for (const v of vagasAbertas) {
    brutos.push({
      chave: `vaga-${v.id}`,
      dia: dia(v.applicationDeadline!),
      tipo: "vaga",
      titulo: `Inscrições encerram: ${v.title}`,
      setor: vagas!.setor,
      href: `/vagas/${v.id}`,
    });
  }
  if (certificados) {
    const atuais = atuaisPorDocumento(certs);
    const agora = new Date();
    for (const c of certs) {
      if (c.expiresAt < inicio || c.expiresAt > fim) continue;
      if (situacaoDoCertificado(c, atuais.get(c.documento), agora) === "substituido") continue;
      brutos.push(
        atrasa({
          chave: `certificado-${c.id}`,
          dia: dia(c.expiresAt),
          tipo: "certificado",
          titulo: `Certificado vence: ${c.titular}`,
          setor: certificados.setor,
          href: "/certificados?aba=renovar",
        }),
      );
    }
  }
  if (obrigacoes.length > 0) {
    // Os feriados do escritório só quando há obrigação: a régua do risco de multa é em dias úteis.
    const feriados = new Set((await feriadosDoEscritorio(tenantId)).keys());
    for (const o of obrigacoes) {
      if (!o.pipelineItem) continue;
      brutos.push(
        prazoDaObrigacao(
          {
            id: o.id,
            dataLegal: o.dataLegal,
            prazoInterno: o.prazoInterno,
            modelo: o.modelo.nome,
            setor: o.modelo.sectorCode,
            empresa: nomeExibicao(o.company),
            pipelineId: o.pipelineItem.pipelineId,
            itemId: o.pipelineItem.id,
          },
          hoje,
          feriados,
        ),
      );
    }
  }
  for (const g of guiasAbertas) {
    const p = prazoDaGuia(
      {
        id: g.id,
        descricao: g.descricao,
        vencimento: g.vencimento,
        validoAte: g.validoAte,
        centavos: g.valor === null ? null : centavosDeDecimal(g.valor),
        empresa: nomeExibicao(g.company),
        setor: guias!.setor,
      },
      hoje,
    );
    if (p) brutos.push(p);
  }
  if (liga("controle-interno") && acesso.tech) brutos.push(...(await prazosDoTech(tenantId, acesso.tech.setor, de, ate, hoje)));
  return agruparPrazos(brutos);
}

/**
 * Os itens em aberto do controle interno do Tech com prazo no período (lote C
 * dos ajustes de 03/11/2026: a agenda própria do controle interno saiu, e os
 * prazos vêm para cá). Só para quem vê o módulo. O prazo é `@db.Date` — o dia
 * é o da parte UTC, e não o de São Paulo.
 */
async function prazosDoTech(tenantId: string, setor: string, de: string, ate: string, hoje: string): Promise<PrazoBruto[]> {
  const itens = await getPrisma().techInternalItem.findMany({
    where: {
      tenantId,
      status: { in: [...EM_ABERTO] },
      dueDate: { gte: new Date(`${de}T00:00:00Z`), lte: new Date(`${ate}T00:00:00Z`) },
    },
    select: { id: true, number: true, type: true, title: true, dueDate: true, assignee: { select: { name: true } } },
    take: 500,
  });
  return itens.map((t) => {
    const diaDoItem = t.dueDate!.toISOString().slice(0, 10);
    return {
      chave: `tech-${t.id}`,
      dia: diaDoItem,
      tipo: "tech" as const,
      titulo: t.title,
      detalhe: t.assignee?.name ?? "sem responsável",
      setor,
      // O endereço curto do item (10/11/2026).
      href: enderecoDoItem(t),
      ...(estaAtrasado("tech", diaDoItem, hoje) ? { atrasada: true } : {}),
    };
  });
}
