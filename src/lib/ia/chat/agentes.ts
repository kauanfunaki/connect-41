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
import { publicoPermite, type ContextoDaTela } from "./regras";

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

const CONFIGS: Config[] = [
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
 * O que dizer ao agente sobre a tela aberta, já conferido no servidor.
 *
 * Processo só vira contexto para o agente do Societário e só se estiver no
 * tenant — o id veio do navegador. Para os outros, só o caminho da tela.
 */
export async function contextoParaOAgente(
  tenantId: string,
  agentCode: string,
  tela: ContextoDaTela | null
): Promise<{ rotulo: string; texto: string } | null> {
  if (!tela) return null;
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
  return { rotulo: tela.caminho, texto: `A pessoa está na tela ${tela.caminho} do Connect.` };
}
