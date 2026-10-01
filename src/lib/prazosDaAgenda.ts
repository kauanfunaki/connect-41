// Os prazos que a Agenda e o Meu dia mostram (30/09).
//
// A Agenda era só reunião, e só coordenador abria. O Kauan perguntou se ela
// servia aos outros setores para continuar no menu geral; serve: o Connect já
// guarda a data de quase tudo que um setor precisa cumprir. Aqui essas datas
// viram eventos de dia inteiro, com a mesma regra de acesso dos painéis da
// Home (`acessoDosPaineis`): o prazo só aparece para quem abre a tela de onde
// ele vem, e com setor ativo, só os do setor.

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

export type TipoDePrazo =
  | "tarefa"
  | "conta-pagar"
  | "conta-receber"
  | "pendencia"
  | "processo"
  | "ferias"
  | "exame"
  | "vaga"
  | "certificado";

export type PrazoDaAgenda = {
  chave: string;
  /** Dia do prazo, no calendário de Brasília (AAAA-MM-DD). */
  dia: string;
  tipo: TipoDePrazo;
  titulo: string;
  /** Segunda linha da dica: empresa, valor, quem. */
  detalhe?: string;
  /** Código do setor que responde pelo prazo — dá a cor. */
  setor: string;
  href: string;
  /** Quantos prazos esta entrada junta (1 quando é um só). */
  quantos: number;
};

export const ROTULO_DO_PRAZO: Record<TipoDePrazo, { um: string; varios: string }> = {
  tarefa: { um: "tarefa", varios: "tarefas" },
  "conta-pagar": { um: "conta a pagar", varios: "contas a pagar" },
  "conta-receber": { um: "conta a receber", varios: "contas a receber" },
  pendencia: { um: "pendência com o cliente", varios: "pendências com o cliente" },
  processo: { um: "processo com prazo combinado", varios: "processos com prazo combinado" },
  ferias: { um: "férias começando", varios: "férias começando" },
  exame: { um: "exame admissional", varios: "exames admissionais" },
  vaga: { um: "inscrição encerrando", varios: "inscrições encerrando" },
  certificado: { um: "certificado vencendo", varios: "certificados vencendo" },
};

/** Para onde leva a entrada que junta vários prazos do mesmo tipo. */
const TELA_DO_TIPO: Record<TipoDePrazo, string> = {
  tarefa: "/tarefas",
  "conta-pagar": "/pagar",
  "conta-receber": "/receber",
  pendencia: "/pendencias",
  processo: "/processos",
  ferias: "/ferias",
  exame: "/admissoes",
  vaga: "/vagas",
  certificado: "/certificados",
};

const MOEDA_CURTA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

/**
 * Junta os prazos do mesmo tipo no mesmo dia quando passam de `limite`: dez
 * tarefas vencendo na sexta viram "10 tarefas", que leva à lista. Conta a
 * pagar e a receber juntam sempre — uma célula com trinta boletos não se lê.
 * O valor em reais, quando há, vai somado no detalhe.
 */
export function agruparPrazos(
  prazos: (Omit<PrazoDaAgenda, "quantos"> & { centavos?: number })[],
  limite = 2
): PrazoDaAgenda[] {
  const grupos = new Map<string, typeof prazos>();
  for (const p of prazos) {
    const k = `${p.dia}|${p.tipo}|${p.setor}`;
    const lista = grupos.get(k) ?? [];
    lista.push(p);
    grupos.set(k, lista);
  }
  const saida: PrazoDaAgenda[] = [];
  for (const lista of grupos.values()) {
    const tipo = lista[0].tipo;
    const sempreJunta = tipo === "conta-pagar" || tipo === "conta-receber";
    if (!sempreJunta && lista.length <= limite) {
      for (const p of lista) {
        saida.push({ chave: p.chave, dia: p.dia, tipo: p.tipo, titulo: p.titulo, detalhe: p.detalhe, setor: p.setor, href: p.href, quantos: 1 });
      }
      continue;
    }
    const n = lista.length;
    const soma = lista.reduce((s, p) => s + (p.centavos ?? 0), 0);
    const r = ROTULO_DO_PRAZO[tipo];
    saida.push({
      chave: `${lista[0].dia}-${tipo}-${lista[0].setor}`,
      dia: lista[0].dia,
      tipo,
      setor: lista[0].setor,
      titulo: `${n} ${n === 1 ? r.um : r.varios}`,
      detalhe: soma > 0 ? MOEDA_CURTA.format(soma / 100) : undefined,
      href: TELA_DO_TIPO[tipo],
      quantos: n,
    });
  }
  return saida.sort((a, b) => a.dia.localeCompare(b.dia) || a.tipo.localeCompare(b.tipo) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/**
 * Os prazos de `de` a `ate` (chaves de dia, inclusive) que esta pessoa pode
 * ver. Tarefas seguem o escopo dos quadros; o resto, o acesso dos painéis.
 */
export async function prazosDoPeriodo(ctx: AuthContext, de: string, ate: string): Promise<PrazoDaAgenda[]> {
  if (!ctx.tenantId) return [];
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const inicio = saoPauloDateTimeToUtc(de, 0, 0);
  const fim = saoPauloDateTimeToUtc(ate, 23, 59);
  const noPeriodo = { gte: inicio, lte: fim };
  const acesso = await acessoDosPaineis(ctx);
  const dia = (d: Date) => saoPauloParts(d).dateKey;

  const contas = acesso.get("painel-contas");
  const pendencias = acesso.get("painel-pendencias");
  const processos = acesso.get("painel-processos");
  const dp = acesso.get("painel-dp");
  const vagas = acesso.get("painel-recrutamento");
  const certificados = acesso.get("painel-certificados");

  const kinds: ("PAGAR" | "RECEBER")[] = [];
  if (contas?.modulos.has("bpo_contas_pagar")) kinds.push("PAGAR");
  if (contas?.modulos.has("bpo_contas_receber")) kinds.push("RECEBER");

  const [cards, titulos, reqs, procs, ferias, exames, vagasAbertas, certs] = await Promise.all([
    prisma.pipelineItem.findMany({
      where: {
        tenantId,
        pipeline: { ...scopedPipelineWhere(ctx), active: true },
        stage: { isTerminal: false },
        candidatura: { is: null },
        dueDate: noPeriodo,
      },
      select: { id: true, title: true, dueDate: true, pipelineId: true, pipeline: { select: { name: true, sectorCode: true } } },
      take: 2000,
    }),
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
  ]);

  const brutos: (Omit<PrazoDaAgenda, "quantos"> & { centavos?: number })[] = [];
  for (const c of cards) {
    brutos.push({
      chave: `tarefa-${c.id}`,
      dia: dia(c.dueDate!),
      tipo: "tarefa",
      titulo: c.title ?? "Card sem título",
      detalhe: c.pipeline.name,
      setor: c.pipeline.sectorCode,
      href: `/kanban/${c.pipelineId}/itens/${c.id}`,
    });
  }
  for (const t of titulos) {
    brutos.push({
      chave: `conta-${t.id}`,
      dia: dia(t.dueDate),
      tipo: t.kind === "PAGAR" ? "conta-pagar" : "conta-receber",
      titulo: t.kind === "PAGAR" ? "Conta a pagar" : "Conta a receber",
      setor: contas!.setor,
      href: t.kind === "PAGAR" ? "/pagar" : "/receber",
      centavos: centavosDeDecimal(t.amount),
    });
  }
  for (const r of reqs) {
    brutos.push({
      chave: `pendencia-${r.id}`,
      dia: dia(r.dueDate!),
      tipo: "pendencia",
      titulo: r.title,
      detalhe: nomeExibicao(r.company),
      setor: pendencias!.setor,
      href: `/pendencias/${r.id}`,
    });
  }
  for (const p of procs) {
    brutos.push({
      chave: `processo-${p.id}`,
      dia: dia(p.dueAt!),
      tipo: "processo",
      titulo: p.type.name,
      detalhe: nomeExibicao(p.company),
      setor: processos!.setor,
      href: `/processos/${p.id}`,
    });
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
    brutos.push({
      chave: `exame-${e.id}`,
      dia: dia(e.scheduledAt!),
      tipo: "exame",
      titulo: `Exame de ${e.person.name}`,
      detalhe: e.clinicName ?? undefined,
      setor: dp!.setor,
      href: "/admissoes",
    });
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
    const hoje = new Date();
    for (const c of certs) {
      if (c.expiresAt < inicio || c.expiresAt > fim) continue;
      if (situacaoDoCertificado(c, atuais.get(c.documento), hoje) === "substituido") continue;
      brutos.push({
        chave: `certificado-${c.id}`,
        dia: dia(c.expiresAt),
        tipo: "certificado",
        titulo: `Certificado vence: ${c.titular}`,
        setor: certificados.setor,
        href: "/certificados",
      });
    }
  }
  return agruparPrazos(brutos);
}
