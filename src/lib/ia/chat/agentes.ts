// Quais agentes atendem no chat do canto da tela, e para quem.
//
// Cada agente do chat é um agente do catálogo (`src/lib/ia/catalogo.ts`) — com
// o mesmo teto, a mesma chave e a mesma trilha — mais o que só o chat precisa:
// o prompt, as sugestões de pergunta e **quem pode abrir**.
//
// A regra de acesso é a da tela do setor, conferida no servidor: a IA só
// enxerga o que a pessoa enxerga. Um agente de chat é uma segunda porta para
// os dados, e porta sem essa checagem vaza.

import { getPrisma } from "@/lib/prisma";
import { canActOnSector, canViewSector, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import { estadoDosAgentes } from "@/lib/ia/data";
import { SISTEMA_DO_SOCIETARIO } from "@/lib/societario/assistente";
import { nomeExibicao } from "@/lib/companyName";
import { publicoPermite, type ContextoDaTela, type PropostaGravada } from "./regras";
import { MODULOS_DO_BPO } from "@/lib/ia/ferramentas-bpo";

export type AgenteDoChat = {
  code: string;
  /** Nome curto no topo do chat. */
  titulo: string;
  sugestoes: string[];
  /** O setor que a pessoa precisa operar — `null` na Ajuda, que serve a todos. */
  setor: string | null;
};

type Config = {
  code: string;
  titulo: string;
  sugestoes: string[];
  /** Módulo cujo setor decide o acesso (segue a transferência de módulo). */
  modulo: string | null;
  sistema: string;
};

const GUARDA_DO_CHAT =
  "\n\nVocê está no chat do canto da tela do Connect, conversando com uma pessoa da equipe do escritório. " +
  "Responda curto e em texto simples: frases diretas e, quando for lista, uma linha por item começando com '- '. " +
  "Não use tabelas nem títulos.";

const AJUDA =
  "Você é a Ajuda do Connect, a plataforma interna do escritório de contabilidade 41. Você explica como usar o " +
  "sistema: onde fica cada função, o que cada tela faz e o que dizem os manuais que o próprio escritório escreveu. " +
  "Consulte as ferramentas antes de responder — use listar_minhas_telas para dizer onde fica algo (cite o caminho, " +
  "ex.: /pagar) e buscar_nos_manuais para procedimentos. Nunca invente tela, botão ou procedimento: se não achar, " +
  "diga que não achou e sugira a quem perguntar.\n" +
  "Você NÃO tem acesso aos dados do escritório (empresas, lançamentos, processos). Se a pergunta for sobre os dados " +
  "de um setor, diga que a IA daquele setor responde isso, quando estiver disponível no chat.";

const RECRUTAMENTO =
  "Você é a IA do Recrutamento de um escritório de contabilidade. Você ajuda o recrutador a enxergar as vagas e " +
  "os candidatos do setor: o que está parado, quem chegou, quem ainda não foi triado, onde está cada candidato. " +
  "Consulte as ferramentas antes de responder — comece por listar_vagas; para achar alguém pelo nome, use " +
  "buscar_candidato. Nunca invente candidato, nota, etapa ou vaga.\n" +
  "Responda em português do Brasil, direto, citando candidato e vaga pelo nome. A nota da triagem é de 0 a 100 e " +
  "foi dada por outra IA a partir dos requisitos da vaga: trate como indício, não como veredito.\n" +
  "Você NÃO altera nada: quando fizer sentido mover ou encerrar alguém, use as ferramentas de proposta e deixe " +
  "claro que é sugestão a confirmar. Nunca sugira reprovar alguém só pela nota da triagem.";

const FISCAL =
  "Você é a IA do Fiscal de um escritório de contabilidade. Você responde sobre o acervo de documentos fiscais " +
  "(NF-e, NFC-e, CT-e e NFS-e) das empresas clientes: o que cada empresa emitiu e recebeu no mês, o que ainda está " +
  "pendente de lançamento no financeiro, notas canceladas e com XML incompleto.\n" +
  "Consulte as ferramentas antes de responder — nunca invente número, valor ou nota. Para qualquer pergunta sobre " +
  "uma empresa, ache o id com buscar_empresa; se não souber o mês, veja competencias_da_empresa. Competência é " +
  "AAAA-MM. Valores em reais, no formato R$ 1.234,56. Quando houver link da tela, termine com ele para a pessoa " +
  "conferir.\n" +
  "Você só lê: lançar ou ignorar documento é feito na tela /documentos-fiscais. O acervo é grande — não tente " +
  "somar o escritório inteiro; trabalhe por empresa e competência.";

const BPO =
  "Você é a IA do BPO de um escritório de contabilidade que faz o financeiro terceirizado de empresas clientes. " +
  "Você responde sobre contas a pagar e a receber, o DRE do mês, as pendências com o cliente, a conciliação " +
  "bancária e as contas aguardando aprovação do cliente.\n" +
  "Consulte as ferramentas antes de responder — nunca invente valor, conta ou prazo. Para perguntas sobre uma " +
  "empresa, ache o id com buscar_empresa. Competência é AAAA-MM. Valores em reais, no formato R$ 1.234,56. Quando " +
  "houver link da tela, termine com ele para a pessoa conferir. Se uma ferramenta disser que a pessoa não tem " +
  "acesso a uma tela, diga isso — não tente outro caminho.\n" +
  "Você só lê: baixar, conciliar, aprovar e cobrar são feitos nas telas. Se o financeiro de uma empresa estiver " +
  "vazio, diga que os dados ainda não estão no Connect (a importação do Omie traz).";

const CONFIGS: Config[] = [
  {
    code: "assistente_do_bpo",
    titulo: "IA do BPO",
    modulo: "bpo_contas_pagar",
    sistema: BPO,
    sugestoes: [
      "O que está vencido nas contas a pagar?",
      "Quais pendências estão esperando o cliente?",
      "Quais contas estão aguardando aprovação?",
    ],
  },
  {
    code: "assistente_do_fiscal",
    titulo: "IA do Fiscal",
    modulo: "fiscal_documentos",
    sistema: FISCAL,
    sugestoes: [
      "Quantas notas estão pendentes de lançamento?",
      "Resumo fiscal do último mês de uma empresa",
      "Quais notas da empresa estão com XML incompleto?",
    ],
  },
  {
    code: "assistente_do_recrutamento",
    titulo: "IA do Recrutamento",
    modulo: "recrutamento_vagas",
    sistema: RECRUTAMENTO,
    sugestoes: [
      "Quais vagas estão abertas há mais tempo?",
      "Quem chegou esta semana e ainda não foi triado?",
      "Quais candidatos estão em entrevista?",
    ],
  },
  {
    code: "assistente_do_societario",
    titulo: "IA do Societário",
    modulo: "societario_processos",
    sistema: SISTEMA_DO_SOCIETARIO,
    sugestoes: [
      "O que está parado há mais tempo?",
      "Quais processos estão em exigência?",
      "O que dá para destravar hoje?",
    ],
  },
  {
    code: "ajuda_do_connect",
    titulo: "Ajuda do Connect",
    modulo: null,
    sistema: AJUDA,
    sugestoes: ["Onde eu vejo as contas a pagar?", "Como faço uma transferência para outro setor?", "O que tem nos manuais do meu setor?"],
  },
];

export function configDoChat(code: string): Config | undefined {
  return CONFIGS.find((c) => c.code === code);
}

export function sistemaDoChat(code: string): string {
  return (configDoChat(code)?.sistema ?? AJUDA) + GUARDA_DO_CHAT;
}

/** O público do chat neste escritório. Tabela ausente (migration não rodou) = chat escondido. */
export async function audienciaDoChat(tenantId: string) {
  try {
    const linha = await getPrisma().aiChatSettings.findUnique({ where: { tenantId }, select: { audience: true } });
    return linha?.audience ?? "COORDENADORES";
  } catch (err) {
    console.error("[chat-ia] configuração do chat indisponível", err);
    return null;
  }
}

/**
 * Os agentes que esta pessoa pode abrir no chat, com o do setor ativo primeiro.
 *
 * Fica de fora: agente desligado ou sem chave (estado do catálogo), agente de
 * setor sem acesso ou com o módulo desligado, e todo mundo fora do público do
 * piloto. Lista vazia = sem botão.
 */
export async function agentesDoChat(ctx: AuthContext): Promise<AgenteDoChat[]> {
  if (!ctx.tenantId || !ctx.userId) return [];
  const audiencia = await audienciaDoChat(ctx.tenantId);
  if (!audiencia || !publicoPermite(ctx.role, audiencia)) return [];

  const estados = await estadoDosAgentes(ctx.tenantId, CONFIGS.map((c) => c.code));
  const disponiveis: AgenteDoChat[] = [];
  for (const c of CONFIGS) {
    if (!agenteDoCatalogo(c.code)) continue;
    const estado = estados.get(c.code);
    if (!estado?.ligado || !estado.temChave) continue;
    let setor: string | null = null;
    if (c.modulo) {
      setor = (await setorDoModulo(ctx.tenantId, c.modulo)) ?? getModuleDef(c.modulo)?.sectorCode ?? null;
      if (!setor || !canActOnSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, c.modulo))) continue;
    }
    disponiveis.push({ code: c.code, titulo: c.titulo, sugestoes: c.sugestoes, setor });
  }
  const ativo = ctx.activeSector;
  return disponiveis.sort((a, b) => Number(b.setor !== null && b.setor === ativo) - Number(a.setor !== null && a.setor === ativo));
}

/** Os setores que a pessoa enxerga — o recorte da Ajuda. */
export function setoresVisiveis(ctx: AuthContext, todos: string[]): string[] {
  return todos.filter((s) => canViewSector(ctx, s));
}

/**
 * O recorte que segue com a conversa — nunca vem do modelo.
 *
 * Ajuda: os setores que a pessoa **vê** (telas e manuais). Recrutamento: os
 * setores em que ela **atua** — é a mesma regra das actions de vaga
 * (`canActOnSector(vaga.sectorCode)`), então a IA não lê vaga que a pessoa não
 * poderia mexer.
 */
export async function escopoDoAgente(
  ctx: AuthContext,
  agentCode: string,
  todosOsSetores: string[]
): Promise<Record<string, string>> {
  if (agentCode === "ajuda_do_connect") return { setores: setoresVisiveis(ctx, todosOsSetores).join(",") };
  if (agentCode === "assistente_do_bpo") {
    // Por módulo, e não pelo setor do agente: o DRE pode estar transferido
    // para o Financeiro, e quem opera contas a pagar não herda o DRE por isso.
    const modulos: string[] = [];
    for (const modulo of Object.keys(MODULOS_DO_BPO)) {
      const setor = (await setorDoModulo(ctx.tenantId, modulo)) ?? getModuleDef(modulo)?.sectorCode ?? null;
      if (setor && canActOnSector(ctx, setor) && (await isModuleEnabled(ctx.tenantId, modulo))) modulos.push(modulo);
    }
    return { modulos: modulos.join(",") };
  }
  if (agentCode === "assistente_do_recrutamento") {
    return { setores: todosOsSetores.filter((s) => canActOnSector(ctx, s)).join(",") };
  }
  return {};
}

/**
 * O que dizer ao agente sobre a tela aberta, já conferido no servidor.
 *
 * Processo só vira contexto para o agente do Societário e só se estiver no
 * tenant — o id veio do navegador. Para os outros, só o caminho da tela.
 */
export async function contextoParaOAgente(
  ctx: AuthContext,
  agentCode: string,
  tela: ContextoDaTela | null
): Promise<{ rotulo: string; texto: string } | null> {
  if (!tela || !ctx.tenantId) return null;
  const tenantId = ctx.tenantId;
  if (tela.tipo === "empresa" || tela.tipo === "documento_fiscal") {
    if (tela.tipo === "empresa" && agentCode !== "assistente_do_fiscal" && agentCode !== "assistente_do_bpo") return null;
    if (tela.tipo === "documento_fiscal" && agentCode !== "assistente_do_fiscal") return null;
    if (tela.tipo === "empresa") {
      const e = await getPrisma().company.findFirst({ where: { id: tela.id, tenantId }, select: { id: true, name: true, displayName: true } });
      if (!e) return null;
      return {
        rotulo: `Empresa: ${nomeExibicao(e)}`.slice(0, 200),
        texto: `A pessoa está com a ficha da empresa "${nomeExibicao(e)}" aberta (empresaId ${e.id}). Quando ela disser "esta empresa", é essa.`,
      };
    }
    const d = await getPrisma().fiscalDocument.findFirst({
      where: { id: tela.id, tenantId },
      select: { type: true, number: true, competence: true, company: { select: { id: true, name: true, displayName: true } } },
    });
    if (!d) return null;
    return {
      rotulo: `Nota ${d.type} ${d.number}`.slice(0, 200),
      texto:
        `A pessoa está com o documento ${d.type} nº ${d.number} aberto, da empresa "${nomeExibicao(d.company)}" ` +
        `(empresaId ${d.company.id}), competência ${d.competence}. "Esta nota" é essa; "esta empresa" é a dela.`,
    };
  }
  if (tela.tipo === "vaga" || tela.tipo === "candidato") {
    if (agentCode !== "assistente_do_recrutamento") return null;
    if (tela.tipo === "vaga") {
      const v = await getPrisma().vaga.findFirst({
        where: { id: tela.id, tenantId },
        select: { id: true, title: true, sectorCode: true },
      });
      if (!v || !canActOnSector(ctx, v.sectorCode)) return null;
      return {
        rotulo: `Vaga: ${v.title}`.slice(0, 200),
        texto: `A pessoa está com a vaga "${v.title}" aberta (vagaId ${v.id}). Quando ela disser "esta vaga", é essa.`,
      };
    }
    const pessoa = await getPrisma().person.findFirst({ where: { id: tela.id, tenantId }, select: { name: true } });
    if (!pessoa) return null;
    return {
      rotulo: `Candidato: ${pessoa.name}`.slice(0, 200),
      texto: `A pessoa está com a ficha do candidato "${pessoa.name}" aberta. Quando ela disser "este candidato", é esse — use buscar_candidato com o nome.`,
    };
  }
  if (tela.tipo === "processo") {
    if (agentCode !== "assistente_do_societario") return null;
    const p = await getPrisma().process.findFirst({
      where: { id: tela.id, tenantId },
      select: { id: true, title: true, type: { select: { name: true } }, company: { select: { name: true, displayName: true } } },
    });
    if (!p) return null;
    const nome = `${p.title || p.type.name} — ${nomeExibicao(p.company)}`;
    return {
      rotulo: `Processo: ${nome}`.slice(0, 200),
      texto: `A pessoa está com a tela do processo "${nome}" aberta (processoId ${p.id}). Quando ela disser "este processo" ou "este", é esse — use ver_processo com esse id.`,
    };
  }
  if (tela.tipo !== "tela") return null;
  return { rotulo: tela.caminho, texto: `A pessoa está na tela ${tela.caminho} do Connect.` };
}

/**
 * O nome de quem cada proposta afeta — o candidato, a etapa do processo —
 * resolvido no servidor, no tenant. O cartão diz "Mover Maria Souza para
 * Entrevista" em vez de "Mover o candidato", e a pessoa confere antes de
 * aplicar. Id que não existe no tenant fica sem nome (e a aplicação recusa).
 */
export async function rotularPropostas(tenantId: string, propostas: PropostaGravada[]): Promise<PropostaGravada[]> {
  const candidaturas = [...new Set(propostas.map((p) => p.argumentos.candidaturaId).filter((v): v is string => typeof v === "string"))];
  const etapas = [...new Set(propostas.map((p) => p.argumentos.stepId).filter((v): v is string => typeof v === "string"))];
  if (candidaturas.length === 0 && etapas.length === 0) return propostas;
  const prisma = getPrisma();
  const [cs, es] = await Promise.all([
    candidaturas.length
      ? prisma.candidatura.findMany({ where: { id: { in: candidaturas }, tenantId }, select: { id: true, person: { select: { name: true } } } })
      : [],
    etapas.length
      ? prisma.processStep.findMany({ where: { id: { in: etapas }, tenantId }, select: { id: true, templateStep: { select: { label: true } } } })
      : [],
  ]);
  const nomes = new Map<string, string>([
    ...cs.map((c) => [c.id, c.person.name] as [string, string]),
    ...es.map((e) => [e.id, e.templateStep.label] as [string, string]),
  ]);
  return propostas.map((p) => {
    const id = p.argumentos.candidaturaId ?? p.argumentos.stepId;
    const alvo = typeof id === "string" ? nomes.get(id) : undefined;
    return alvo ? { ...p, alvo } : p;
  });
}
