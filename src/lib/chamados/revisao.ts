import { gerarEstruturado } from "@/lib/ai";
import { hit } from "@/lib/rateLimit";
import { getPrisma } from "@/lib/prisma";
import { exigirAbertura, exigirEscrita, type Contexto } from "./contexto";
import { rascunho } from "./consultas";
import { prepararCatalogo } from "./catalogo-servidor";
import { categoriasClassificaveis, caminhoDaCategoria } from "./catalogo";
import { PROMPT_CLASSIFICACAO, limparTags } from "./classificacao";
import { motivoDaFalha } from "./falhaDaIa";
import { dadosRascunhoSchema, MAXIMO_DE_PERGUNTAS, type Pergunta, type RevisaoDaIa } from "./regras";
import type { SetorDaLista } from "./setorSugerido";

// A revisão antes de abrir (16/11/2026, funcionalidade-702). Uma chamada só à
// IA, quando a pessoa termina o pedido: o título, a categoria e as perguntas
// que ajudam a equipe a começar. Nada é gravado aqui — a pessoa confere na
// tela, e o que ela aprovar segue com o envio do rascunho (`aberturaSchema`).
//
// Não é a conversa de 28/10 a 10/11: não há várias voltas, as perguntas são
// opcionais, e a tela deixa abrir o chamado sem esperar a resposta.

export const PROMPT_DA_REVISAO = `${PROMPT_CLASSIFICACAO}
Em questions, faça de zero a ${MAXIMO_DE_PERGUNTAS} perguntas a quem pediu, só sobre o que falta para a equipe começar e que só essa pessoa sabe: qual empresa ou cliente, qual sistema ou tela, desde quando acontece, a mensagem de erro, o prazo.
Quem atende é a equipe interna do escritório, que conhece os sistemas, as ferramentas e os arquivos usados. Não pergunte o que a equipe descobre sozinha, nem causa, diagnóstico ou solução técnica.
Se o pedido já diz o que precisa ser feito e onde, questions vazio: um pedido curto pode estar completo. Não repita o que o pedido já responde.
Nunca peça senha, usuário, token ou qualquer credencial.
Prefira perguntas fechadas: quando a resposta for sim ou não, ou uma escolha entre poucas alternativas, preencha options com duas a cinco respostas curtas. Nas perguntas abertas, options vazio.
As respostas são opcionais: a pessoa pode abrir o chamado sem responder.`;

/**
 * O setor que vai atender (16/11/2026, funcionalidade-709), só com dois ou mais
 * setores administrando. Na dúvida a IA não escolhe: pergunta, e a pessoa
 * escolhe na tela.
 */
export const PROMPT_DO_SETOR_NA_REVISAO = `setores lista os setores do escritório que atendem chamados, cada um com o código (code) e o nome.
Em sectorCode, escolha o setor cujo trabalho mais combina com o que o pedido quer, pelo sentido e não pelas palavras exatas, e em sectorReason uma frase curta dizendo por quê.
Se o pedido pode ser de mais de um setor e não dá para saber qual, sectorCode null e, em sectorQuestion, uma pergunta curta que ajude a pessoa a escolher o setor (ex.: "É sobre a folha de pagamento ou sobre o sistema que trava?"). Com o setor escolhido, sectorQuestion vazio.
Use somente códigos da lista.`;

const SCHEMA = (categorias: string[], setores: string[]) => ({
  type: "object", additionalProperties: false,
  properties: {
    categoryId: { anyOf: [{ type: "string", enum: categorias }, { type: "null" }] }, reason: { type: "string" }, title: { type: "string" }, tags: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, options: { type: "array", items: { type: "string" } } }, required: ["text", "options"] } },
    // Com um setor só, o esquema estrito ainda pede os campos, e só aceita nulo.
    sectorCode: setores.length > 1 ? { anyOf: [{ type: "string", enum: setores }, { type: "null" }] } : { type: "null" }, sectorReason: { type: "string" }, sectorQuestion: { type: "string" },
  }, required: ["categoryId", "reason", "title", "tags", "questions", "sectorCode", "sectorReason", "sectorQuestion"],
});

const texto = (v: unknown, limite: number) => typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, limite) : "";
/** Pergunta que pede credencial não vai à tela, mesmo que o modelo ignore a regra. */
const PEDE_CREDENCIAL = /\b(senha|password|token|credencia\w*|chave de api|api key)\b/i;

/**
 * Confere a resposta da IA: a categoria só vale se está na lista enviada
 * (fora dela, fica sem categoria, e a pessoa escolhe), e as perguntas saem
 * limpas, sem repetição, sem pedir credencial e no máximo três.
 */
export function lerRevisao(valor: unknown, categorias: readonly string[], setores: readonly string[] = []): RevisaoDaIa | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as { categoryId?: unknown; reason?: unknown; title?: unknown; tags?: unknown; questions?: unknown; sectorCode?: unknown; sectorReason?: unknown; sectorQuestion?: unknown };
  // O setor só vale da lista, e só com dois ou mais; escolhido, a dúvida não aparece.
  const setor = setores.length > 1 && typeof v.sectorCode === "string" && setores.includes(v.sectorCode) ? v.sectorCode : null;
  const perguntaDoSetor = setor || setores.length < 2 ? "" : texto(v.sectorQuestion, 300);
  const perguntas: Pergunta[] = [], vistas = new Set<string>();
  for (const q of Array.isArray(v.questions) ? v.questions : []) {
    if (!q || typeof q !== "object") continue;
    const text = texto((q as { text?: unknown }).text, 500), chave = text.toLocaleLowerCase("pt-BR");
    if (text.length < 5 || vistas.has(chave) || PEDE_CREDENCIAL.test(text)) continue;
    const bruto = (q as { options?: unknown }).options;
    const options = [...new Set((Array.isArray(bruto) ? bruto : []).map(o => texto(o, 120)).filter(Boolean))].slice(0, 5);
    vistas.add(chave); perguntas.push({ text, options: options.length >= 2 ? options : [] });
    if (perguntas.length === MAXIMO_DE_PERGUNTAS) break;
  }
  return {
    titulo: texto(v.title, 255),
    categoryId: typeof v.categoryId === "string" && categorias.includes(v.categoryId) ? v.categoryId : null,
    motivo: texto(v.reason, 300),
    tags: limparTags(Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === "string") : []),
    perguntas,
    setor,
    motivoDoSetor: setor ? texto(v.sectorReason, 300) : "",
    perguntaDoSetor: PEDE_CREDENCIAL.test(perguntaDoSetor) ? "" : perguntaDoSetor,
  };
}

/** A revisão do rascunho de quem está abrindo. Nulo = a IA não respondeu; a tela segue sem a sugestão. */
export async function revisarRascunho(c: Contexto, draftId: string): Promise<RevisaoDaIa | null> {
  exigirEscrita(c); exigirAbertura(c);
  const d = await rascunho(c, draftId);
  if (d.ticket) throw new Error("Este rascunho já virou chamado.");
  const dados = dadosRascunhoSchema.parse(d.payload), tenantId = c.ctx.tenantId;
  if (!dados.description.trim()) throw new Error("Descreva o pedido antes de continuar.");
  if (!hit(`helpdesk-revisao:${tenantId}:${c.ctx.userId}`, 10, 60_000).allowed) return null;
  try {
    await prepararCatalogo(tenantId);
    const linhas = await getPrisma().helpdeskCategory.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true, active: true } });
    const opcoes = categoriasClassificaveis(linhas);
    if (!opcoes.length) throw new Error("Sem categorias ativas para classificar.");
    const setores: SetorDaLista[] = c.config.sectorCodes.length > 1 ? await getPrisma().sector.findMany({ where: { tenantId, code: { in: c.config.sectorCodes }, active: true }, select: { code: true, label: true } }) : [];
    const entrada = JSON.stringify({
      chamado: { description: dados.description, requesterSectorCode: dados.requesterSectorCode, priority: dados.priority, requestData: dados.requestData },
      categorias: opcoes.map(cat => ({ categoryId: cat.id, caminho: caminhoDaCategoria(linhas, cat.id) })),
      ...(setores.length > 1 ? { setores: setores.map(st => ({ code: st.code, nome: st.label })) } : {}),
    });
    if (entrada.length > 100000) throw new Error("Pedido maior que o limite da revisão.");
    const { valor } = await gerarEstruturado({
      tenantId, agentCode: "triagem_chamados", sistema: setores.length > 1 ? `${PROMPT_DA_REVISAO}\n${PROMPT_DO_SETOR_NA_REVISAO}` : PROMPT_DA_REVISAO, texto: entrada, nome: "revisao_chamado", schema: SCHEMA(opcoes.map(cat => cat.id), setores.map(st => st.code)),
      maxTokens: 1500, estrito: true, timeoutMs: 25000, store: false,
      contexto: { trigger: "USUARIO", userId: c.ctx.userId, entityType: "HelpdeskDraft", entityId: draftId },
    });
    return lerRevisao(valor, opcoes.map(cat => cat.id), setores.map(st => st.code));
  } catch (err) {
    console.warn(`[chamados] a revisão do rascunho ${draftId} não saiu (escritório ${tenantId}): ${motivoDaFalha(err)}`);
    return null;
  }
}
