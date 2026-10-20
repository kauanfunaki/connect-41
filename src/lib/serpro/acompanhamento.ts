// O acompanhamento da carteira na Receita pelo Serpro (Fase 1 do Integra
// Contador, 20/10/2026): os Eventos de Atualização do dia e a Caixa Postal.
//
// Uma vez por dia, a partir das 7h, o agendador pede os três eventos (DCTFWeb,
// Caixa Postal, pagamento) da carteira inteira, em lotes de até 1.000 — de
// graça — e guarda o último dia de cada um em `serpro_eventos`. O "x" de quem
// não tem autorização vira o sinal "sem acesso" em Autorizações.
//
// A Caixa Postal reage ao evento E0601 (mensagem nova): o indicador (grátis)
// confirma e, se houver mensagem não lida, a lista (R$ 0,24) traz assunto, data
// e relevância. Decisão do Kauan em 20/10/2026: a lista vem sozinha só para quem
// tem mensagem nova, dentro do teto; abrir (que dá ciência da intimação) só a
// coordenação do Fiscal, por clique e com confirmação — o agendador nunca abre.
//
// Nada disso roda na demonstração: o trial só responde aos exemplos fictícios.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifySector } from "@/lib/notifications";
import { hojeIso } from "@/lib/datas/calendario";
import { carteiraDasAutorizacoes, representantesDasChaves, setorDasAutorizacoes } from "@/lib/autorizacoes/servidor";
import { efeitoDoErro } from "@/lib/autorizacoes/serpro";
import { chamarSerpro, configuracaoDoSerpro, prontidaoDoSerpro } from "./cliente";
import type { Transporte } from "./transporte";
import { chaveDoContribuinte } from "./servicos";
import {
  EVENTOS,
  eventoNovo,
  gruposDeEventos,
  lerMatriz,
  lerSolicitacao,
  lerTipoDoPedido,
  pedidoDeObtencao,
  pedidoDeSolicitacao,
  ROTULO_DO_EVENTO,
  tipoDoPedido,
  type Evento,
  type LinhaDaMatriz,
} from "./eventos";
import { lerDetalhe, lerIndicador, lerLista, limparCorpo, pedidoDaLista, pedidoDoDetalhe, pedidoDoIndicador, type MensagemDaLista } from "./caixaPostal";
import { ultimoSitfisDaEmpresa, type OpcoesDoSerpro, type SitfisNaTela } from "./situacaoFiscal";
import { chaveDaAutorizacao } from "@/lib/autorizacoes/regras";

/** Os eventos do dia saem a partir desta hora (São Paulo): pega a noite e o começo do expediente. */
export const HORA_DOS_EVENTOS = 7;
/** O resultado dos eventos fica guardado no Serpro por 20 minutos. */
const VALIDADE_DO_RESULTADO_MS = 20 * 60_000;
/** O agendador segura o pedido por este tempo enquanto trabalha nele (a trava). */
const TRAVA_MS = 5 * 60_000;
/** Quanto o ciclo espera o resultado dos eventos que acabou de pedir. */
const ESPERA_NO_CICLO_MS = 15_000;
/** Clientes com mensagem nova tratados por ciclo (cada um, até duas chamadas). */
const CAIXA_POR_CICLO = 40;

const esperarDeVerdade = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const paraIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function horaEmSaoPaulo(agora: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora));
}

/** As chaves que o acompanhamento cobre: a carteira, menos o que o setor marcou como "não se aplica". */
async function documentosDaCarteira(tenantId: string): Promise<{ chave: string; documento: string }[]> {
  const [{ linhas }, reps] = await Promise.all([carteiraDasAutorizacoes(tenantId), representantesDasChaves(tenantId)]);
  return linhas
    .filter((l) => l.situacao !== "nao_se_aplica")
    .map((l) => ({ chave: l.chave, documento: reps.get(l.chave)?.documento.replace(/[^0-9A-Za-z]/g, "") ?? "" }))
    .filter((l) => l.documento);
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

/** Pede os eventos do dia, um pedido por evento e por lote, se ainda não pediu hoje. */
async function pedirEventosDoDia(tenantId: string, o: Required<Pick<OpcoesDoSerpro, "agora">> & OpcoesDoSerpro): Promise<number> {
  const agora = o.agora();
  if (horaEmSaoPaulo(agora) < HORA_DOS_EVENTOS) return 0;
  const prisma = getPrisma();
  const hoje = hojeIso(agora);
  const jaPedidos = new Set(
    (
      await prisma.serproPedido.findMany({
        where: { tenantId, tipo: { startsWith: "EVENTOS:" }, dia: hoje, situacao: { not: "FALHOU" } },
        select: { tipo: true },
      })
    ).map((p) => p.tipo)
  );
  if (jaPedidos.size === EVENTOS.length * 2) return 0;

  const grupos = gruposDeEventos((await documentosDaCarteira(tenantId)).map((d) => d.documento));
  let pedidos = 0;
  for (const evento of EVENTOS) {
    for (const grupo of grupos) {
      const tipo = tipoDoPedido(evento, grupo.tipo);
      if (jaPedidos.has(tipo)) continue;
      const r = await chamarSerpro(tenantId, pedidoDeSolicitacao(evento, grupo), { origem: "eventos", transporte: o.transporte });
      if (!r.ok) {
        // A cota do dia (429) ou o Serpro fora: o próximo ciclo tenta de novo.
        if (efeitoDoErro(r) !== "seguir") return pedidos;
        continue;
      }
      const lida = lerSolicitacao(r.resposta);
      if (!lida.ok) continue;
      await prisma.serproPedido.create({
        data: {
          tenantId,
          tipo,
          contribuinte: `lote:${grupo.documentos.length}`,
          protocolo: lida.dados.protocolo,
          situacao: "RESULTADO",
          proximaTentativa: new Date(o.agora().getTime() + lida.dados.esperaMs),
          dia: hoje,
        },
      });
      pedidos++;
    }
  }
  return pedidos;
}

/** Grava a matriz: o último dia de cada um, o "sem acesso" e, no E0601 novo, a Caixa Postal pendente. */
export async function aplicarMatriz(tenantId: string, evento: Evento, linhas: LinhaDaMatriz[], agora = new Date()): Promise<number> {
  const prisma = getPrisma();
  const atuais = new Map(
    (await prisma.serproEvento.findMany({ where: { tenantId, evento }, select: { chave: true, ultimoEm: true, pendente: true } })).map((e) => [e.chave, e])
  );
  let novos = 0;
  for (const l of linhas) {
    const chave = chaveDoContribuinte(l.documento);
    const atual = atuais.get(chave);
    const anterior = paraIso(atual?.ultimoEm ?? null);
    const novo = !l.semAcesso && eventoNovo(anterior, l.ultimoEm);
    if (novo) novos++;
    // "x" não diz o dia: fica o que se sabia. Vazio = nenhum evento nos 60 dias.
    const ultimoEm = l.semAcesso ? (atual?.ultimoEm ?? null) : l.ultimoEm ? paraData(l.ultimoEm) : null;
    const dados = {
      documento: l.documento,
      ultimoEm,
      semAcesso: l.semAcesso,
      // Sem acesso, a Caixa Postal nem abre: não fica pendente.
      pendente: evento === "E0601" && !l.semAcesso && (novo || !!atual?.pendente),
      lidoEm: agora,
    };
    await prisma.serproEvento.upsert({
      where: { tenantId_chave_evento: { tenantId, chave, evento } },
      create: { tenantId, chave, evento, ...dados },
      update: dados,
    });
  }
  return novos;
}

/** Busca o resultado dos eventos pedidos. Espera um pouco pelos que acabaram de sair. */
async function obterEventos(tenantId: string, o: Required<Pick<OpcoesDoSerpro, "agora" | "esperar">> & OpcoesDoSerpro): Promise<number> {
  const prisma = getPrisma();
  const abertos = await prisma.serproPedido.findMany({
    where: { tenantId, tipo: { startsWith: "EVENTOS:" }, situacao: "RESULTADO" },
    select: { id: true, tipo: true, protocolo: true, proximaTentativa: true, createdAt: true },
  });
  const falta = Math.max(0, ...abertos.map((p) => p.proximaTentativa.getTime() - o.agora().getTime()).filter((ms) => ms <= ESPERA_NO_CICLO_MS));
  if (falta > 0) await o.esperar(falta);

  let feitos = 0;
  for (const p of abertos) {
    const agora = o.agora();
    if (p.proximaTentativa.getTime() > agora.getTime()) continue;
    const tipo = lerTipoDoPedido(p.tipo);
    if (!tipo || !p.protocolo || agora.getTime() - p.createdAt.getTime() > VALIDADE_DO_RESULTADO_MS) {
      await prisma.serproPedido.update({ where: { id: p.id }, data: { situacao: "EXPIRADO", erro: "O resultado dos eventos fica no Serpro só por 20 minutos." } });
      continue;
    }
    const { count } = await prisma.serproPedido.updateMany({
      where: { id: p.id, situacao: "RESULTADO", proximaTentativa: p.proximaTentativa },
      data: { proximaTentativa: new Date(agora.getTime() + TRAVA_MS) },
    });
    if (count !== 1) continue;
    const r = await chamarSerpro(tenantId, pedidoDeObtencao(tipo.evento, tipo.tipo, p.protocolo), { origem: "eventos", transporte: o.transporte });
    if (!r.ok) {
      if (efeitoDoErro(r) === "seguir") await prisma.serproPedido.update({ where: { id: p.id }, data: { situacao: "FALHOU", erro: r.erro.slice(0, 500) } });
      continue;
    }
    const matriz = lerMatriz(r.resposta);
    if (matriz.tipo === "processando") continue;
    if (matriz.tipo === "erro") {
      await prisma.serproPedido.update({ where: { id: p.id }, data: { situacao: "FALHOU", erro: matriz.erro.slice(0, 500) } });
      continue;
    }
    await aplicarMatriz(tenantId, tipo.evento, matriz.linhas, agora);
    await prisma.serproPedido.update({ where: { id: p.id }, data: { situacao: "PRONTO", erro: null } });
    feitos++;
  }
  return feitos;
}

// ─── Caixa Postal ────────────────────────────────────────────────────────────

/** Guarda a lista e devolve as mensagens que o Connect ainda não conhecia. */
async function guardarMensagens(tenantId: string, chave: string, documento: string, mensagens: MensagemDaLista[]): Promise<MensagemDaLista[]> {
  const prisma = getPrisma();
  const conhecidas = new Set(
    (await prisma.serproMensagem.findMany({ where: { tenantId, chave, isn: { in: mensagens.map((m) => m.isn) } }, select: { isn: true } })).map((m) => m.isn)
  );
  const novas = mensagens.filter((m) => !conhecidas.has(m.isn));
  if (novas.length) {
    await prisma.serproMensagem.createMany({
      data: novas.map((m) => ({
        tenantId,
        chave,
        documento,
        isn: m.isn,
        assunto: m.assunto,
        enviadaEm: m.enviadaEm,
        relevante: m.relevante,
        origem: m.origem,
        numeroControle: m.numeroControle,
        validaAte: m.validaAte,
        cienciaEm: m.cienciaEm,
        lidaNoSerpro: m.lida,
      })),
      skipDuplicates: true,
    });
  }
  for (const m of mensagens.filter((x) => conhecidas.has(x.isn))) {
    await prisma.serproMensagem.updateMany({ where: { tenantId, chave, isn: m.isn }, data: { cienciaEm: m.cienciaEm, lidaNoSerpro: m.lida } });
  }
  return novas;
}

export function textoDoAvisoDaCaixaPostal(empresa: string, novas: Pick<MensagemDaLista, "assunto" | "relevante">[]): string {
  const relevantes = novas.filter((m) => m.relevante).length;
  const quantas = novas.length === 1 ? "mensagem nova" : `${novas.length} mensagens novas`;
  const destaque = relevantes ? ` (${relevantes === novas.length && novas.length === 1 ? "relevante" : `${relevantes} relevante${relevantes > 1 ? "s" : ""}`})` : "";
  return `Caixa Postal da Receita: ${quantas} de ${empresa}${destaque}: ${novas[0].assunto}`.slice(0, 255);
}

/**
 * O erro é deste cliente e o ciclo segue: aqui o 403 é a falta da autorização
 * dele (no lote das procurações, era da ligação), e o portão barra antes de pagar.
 */
function doCliente(r: Extract<Awaited<ReturnType<typeof chamarSerpro>>, { ok: false }>): boolean {
  if (r.motivo === "sem_autorizacao" || r.status === 403) return true;
  return r.motivo !== "teto" && efeitoDoErro(r) === "seguir";
}

/** Os clientes com mensagem nova (E0601): o indicador confirma e a lista traz o que chegou. */
async function tratarCaixaPostal(tenantId: string, o: OpcoesDoSerpro): Promise<number> {
  const prisma = getPrisma();
  const pendentes = await prisma.serproEvento.findMany({
    where: { tenantId, evento: "E0601", pendente: true },
    orderBy: { ultimoEm: "desc" },
    take: CAIXA_POR_CICLO,
    select: { id: true, chave: true, documento: true },
  });
  if (!pendentes.length) return 0;
  const [reps, setor] = await Promise.all([representantesDasChaves(tenantId), setorDasAutorizacoes(tenantId)]);
  const devolver = (id: string) => prisma.serproEvento.updateMany({ where: { id }, data: { pendente: true } });

  let feitos = 0;
  for (const e of pendentes) {
    // A trava: só trata quem conseguiu tirar o "pendente" — a lista é paga.
    const { count } = await prisma.serproEvento.updateMany({ where: { id: e.id, pendente: true }, data: { pendente: false } });
    if (count !== 1) continue;

    const indicador = await chamarSerpro(tenantId, pedidoDoIndicador(e.documento), { origem: "caixa-postal", transporte: o.transporte });
    if (!indicador.ok) {
      if (doCliente(indicador)) continue;
      // Cota, tempo esgotado ou Serpro fora: volta para a fila e o ciclo acaba aqui.
      await devolver(e.id);
      break;
    }
    const lido = lerIndicador(indicador.resposta);
    if (!lido.ok || lido.dados.novas === 0) continue;

    const lista = await chamarSerpro(tenantId, pedidoDaLista(e.documento), { origem: "caixa-postal", transporte: o.transporte });
    if (!lista.ok) {
      if (doCliente(lista)) continue;
      // O teto do mês também: a lista espera o mês virar (ou um teto maior).
      await devolver(e.id);
      break;
    }
    const mensagens = lerLista(lista.resposta);
    if (!mensagens.ok) continue;
    const novas = await guardarMensagens(tenantId, e.chave, e.documento, mensagens.dados.mensagens);
    feitos++;
    if (!novas.length) continue;
    const rep = reps.get(e.chave);
    await notifySector(setor, {
      tenantId,
      type: "SERPRO_CAIXA_POSTAL",
      message: textoDoAvisoDaCaixaPostal(rep?.nome ?? "um cliente", novas),
      ...(rep ? { entityType: "COMPANY" as const, entityId: rep.id } : {}),
    });
  }
  return feitos;
}

/** O ciclo do agendador (a cada 10 minutos): eventos do dia, resultado dos eventos e a Caixa Postal. */
export async function acompanharNoSerpro(tenantId: string, opcoes: OpcoesDoSerpro = {}): Promise<number> {
  const o = { ...opcoes, agora: opcoes.agora ?? (() => new Date()), esperar: opcoes.esperar ?? esperarDeVerdade };
  const cfg = await configuracaoDoSerpro(tenantId);
  if (!cfg || cfg.ambiente !== "producao" || !prontidaoDoSerpro(cfg).pronta) return 0;
  const pedidos = await pedirEventosDoDia(tenantId, o);
  const obtidos = await obterEventos(tenantId, o);
  const caixas = await tratarCaixaPostal(tenantId, o);
  return pedidos + obtidos + caixas;
}

// ─── Abrir uma mensagem ──────────────────────────────────────────────────────

export type MensagemAberta = { id: string; assunto: string; corpo: string; abertaEm: string; abertaPor: string | null };

async function nomeDe(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return (await getPrisma().user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? null;
}

/**
 * Abre a mensagem — o ato que DÁ CIÊNCIA da intimação. Quem chama já conferiu
 * que é a coordenação do Fiscal e que a pessoa confirmou; aqui o Serpro é
 * chamado uma vez só: aberta, a mensagem é lida do banco, sem nova chamada.
 */
export async function abrirMensagem(tenantId: string, userId: string, mensagemId: string, opcoes: { transporte?: Transporte } = {}): Promise<{ ok: true; mensagem: MensagemAberta } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const m = await prisma.serproMensagem.findFirst({
    where: { id: mensagemId, tenantId },
    select: { id: true, chave: true, documento: true, isn: true, assunto: true, corpo: true, abertaEm: true, abertaPorId: true },
  });
  if (!m) return { ok: false, erro: "Mensagem não encontrada." };
  if (m.abertaEm && m.corpo !== null) {
    return { ok: true, mensagem: { id: m.id, assunto: m.assunto, corpo: limparCorpo(m.corpo), abertaEm: m.abertaEm.toISOString(), abertaPor: await nomeDe(m.abertaPorId) } };
  }
  const r = await chamarSerpro(tenantId, pedidoDoDetalhe(m.documento, m.isn), { userId, origem: "caixa-postal:abrir", transporte: opcoes.transporte, cienciaConfirmada: true });
  if (!r.ok) return { ok: false, erro: r.erro };
  const lida = lerDetalhe(r.resposta);
  if (!lida.ok) return { ok: false, erro: lida.erro };
  const abertaEm = new Date();
  await prisma.serproMensagem.update({
    where: { id: m.id },
    data: { corpo: lida.dados.corpo, abertaEm, abertaPorId: userId, cienciaEm: lida.dados.cienciaEm ?? abertaEm, lidaNoSerpro: true },
  });
  await logAudit({
    tenantId,
    userId,
    action: "autorizacoes.serpro_caixa_postal",
    entityType: "SerproMensagem",
    entityId: m.id,
    metadata: { chave: m.chave, isn: m.isn, assunto: m.assunto },
  });
  return { ok: true, mensagem: { id: m.id, assunto: m.assunto, corpo: lida.dados.corpo, abertaEm: abertaEm.toISOString(), abertaPor: await nomeDe(userId) } };
}

/** Uma mensagem já aberta, lida do banco (não chama o Serpro, não dá ciência). */
export async function mensagemJaAberta(tenantId: string, mensagemId: string): Promise<MensagemAberta | null> {
  const m = await getPrisma().serproMensagem.findFirst({
    where: { id: mensagemId, tenantId, abertaEm: { not: null } },
    select: { id: true, assunto: true, corpo: true, abertaEm: true, abertaPorId: true },
  });
  if (!m || m.corpo === null || !m.abertaEm) return null;
  return { id: m.id, assunto: m.assunto, corpo: limparCorpo(m.corpo), abertaEm: m.abertaEm.toISOString(), abertaPor: await nomeDe(m.abertaPorId) };
}

// ─── Para a tela ─────────────────────────────────────────────────────────────

export type MensagemNaTela = {
  id: string;
  assunto: string;
  enviadaEm: string;
  relevante: boolean;
  origem: string | null;
  validaAte: string | null;
  cienciaEm: string | null;
  abertaEm: string | null;
  abertaPor: string | null;
};

export type EventoNaTela = { evento: Evento; rotulo: string; ultimoEm: string | null; semAcesso: boolean; lidoEm: string };

export type ReceitaDaEmpresa = {
  chave: string;
  eventos: EventoNaTela[];
  /** O Serpro negou o acesso no último pedido de eventos (falta a autorização). */
  semAcesso: boolean;
  mensagens: MensagemNaTela[];
  sitfis: SitfisNaTela | null;
};

async function nomesDosUsuarios(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const users = await getPrisma().user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

const SELECT_MENSAGEM = {
  id: true,
  chave: true,
  assunto: true,
  enviadaEm: true,
  relevante: true,
  origem: true,
  validaAte: true,
  cienciaEm: true,
  abertaEm: true,
  abertaPorId: true,
} as const;

type LinhaDaMensagem = {
  id: string;
  chave: string;
  assunto: string;
  enviadaEm: Date;
  relevante: boolean;
  origem: string | null;
  validaAte: Date | null;
  cienciaEm: Date | null;
  abertaEm: Date | null;
  abertaPorId: string | null;
};

function mensagemNaTela(m: LinhaDaMensagem, nomes: Map<string, string>): MensagemNaTela {
  return {
    id: m.id,
    assunto: m.assunto,
    enviadaEm: m.enviadaEm.toISOString(),
    relevante: m.relevante,
    origem: m.origem,
    validaAte: m.validaAte?.toISOString() ?? null,
    cienciaEm: m.cienciaEm?.toISOString() ?? null,
    abertaEm: m.abertaEm?.toISOString() ?? null,
    abertaPor: m.abertaPorId ? (nomes.get(m.abertaPorId) ?? null) : null,
  };
}

/** O que o Serpro disse da empresa: eventos, Caixa Postal e o último Sitfis. null = sem documento. */
export async function receitaDaEmpresa(tenantId: string, companyId: string): Promise<ReceitaDaEmpresa | null> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { kind: true, cnpj: true, cpf: true } });
  const chave = empresa ? chaveDaAutorizacao(empresa) : null;
  if (!chave) return null;
  const [eventos, mensagens, sitfis] = await Promise.all([
    prisma.serproEvento.findMany({ where: { tenantId, chave }, select: { evento: true, ultimoEm: true, semAcesso: true, lidoEm: true } }),
    prisma.serproMensagem.findMany({ where: { tenantId, chave }, orderBy: { enviadaEm: "desc" }, take: 30, select: SELECT_MENSAGEM }),
    ultimoSitfisDaEmpresa(tenantId, companyId),
  ]);
  const nomes = await nomesDosUsuarios(mensagens.map((m) => m.abertaPorId));
  const porEvento = new Map(eventos.map((e) => [e.evento, e]));
  return {
    chave,
    eventos: EVENTOS.filter((ev) => porEvento.has(ev)).map((ev) => {
      const e = porEvento.get(ev)!;
      return { evento: ev, rotulo: ROTULO_DO_EVENTO[ev], ultimoEm: paraIso(e.ultimoEm), semAcesso: e.semAcesso, lidoEm: e.lidoEm.toISOString() };
    }),
    semAcesso: eventos.some((e) => e.semAcesso),
    mensagens: mensagens.map((m) => mensagemNaTela(m, nomes)),
    sitfis,
  };
}

export type MensagemDaCarteira = MensagemNaTela & { empresa: { id: string; nome: string } | null };

/** As mensagens da Caixa Postal de todos os clientes, as mais recentes primeiro. */
export async function mensagensDaCarteira(tenantId: string, limite = 200): Promise<MensagemDaCarteira[]> {
  const [mensagens, reps] = await Promise.all([
    getPrisma().serproMensagem.findMany({ where: { tenantId }, orderBy: { enviadaEm: "desc" }, take: limite, select: SELECT_MENSAGEM }),
    representantesDasChaves(tenantId),
  ]);
  const nomes = await nomesDosUsuarios(mensagens.map((m) => m.abertaPorId));
  return mensagens.map((m) => {
    const rep = reps.get(m.chave);
    return { ...mensagemNaTela(m, nomes), empresa: rep ? { id: rep.id, nome: rep.nome } : null };
  });
}

/** As chaves que o Serpro recusou no último pedido de eventos: falta a Autorização de Acesso. */
export async function chavesSemAcessoNoSerpro(tenantId: string): Promise<Set<string>> {
  const linhas = await getPrisma().serproEvento.findMany({ where: { tenantId, semAcesso: true }, select: { chave: true }, distinct: ["chave"] });
  return new Set(linhas.map((l) => l.chave));
}
