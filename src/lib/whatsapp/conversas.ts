// O que a tela de conversas precisa decidir, sem tocar no banco.
//
// A regra que importa aqui é a mesma do robô, aplicada a gente: **opt-out vale
// para todo mundo**. Quem pediu para parar não recebe mensagem nem de uma
// pessoa clicando — se valesse só para o robô, o pedido do candidato não teria
// significado nenhum, e a tela seria o jeito mais fácil de furá-lo.

import { dentroDaJanelaLivre } from "@/lib/whatsapp/decisao";

export type ConversaParaTela = {
  optedOutAt: Date | null;
  handoffAt: Date | null;
  lastInboundAt: Date | null;
  candidaturaId: string | null;
  /** Janela de mensagem livre do provedor desta conversa. `null` = sem janela. */
  janelaLivreHoras: number | null;
  /**
   * Quando o último atendimento foi encerrado, se não há outro aberto. Nulo é
   * atendimento em curso. Ver `WhatsappAtendimento`.
   */
  atendimentoEncerradoEm: Date | null;
};

export type SituacaoDaConversa =
  /** Transferida e aguardando alguém. É a fila da tela. */
  | "precisa_atencao"
  /** O robô está conduzindo. */
  | "com_robo"
  /** Alguém encerrou o atendimento; a próxima mensagem do candidato abre outro. */
  | "encerrada"
  /** Pediu para não receber mais. */
  | "nao_quer"
  /** Transferida, mas passou da janela do provedor: só template resolve. */
  | "fora_da_janela";

export function situacaoDaConversa(c: ConversaParaTela, agora: Date): SituacaoDaConversa {
  if (c.optedOutAt) return "nao_quer";
  if (c.atendimentoEncerradoEm) return "encerrada";
  if (!c.handoffAt) return "com_robo";
  // Transferida: a pergunta seguinte é se ainda dá para responder. Separar os
  // dois estados existe porque a ação da pessoa é diferente — num caso ela
  // responde, no outro precisa ligar ou mandar template.
  return dentroDaJanelaLivre(c.lastInboundAt, agora, c.janelaLivreHoras) ? "precisa_atencao" : "fora_da_janela";
}

export const SITUACAO_LABEL: Record<SituacaoDaConversa, string> = {
  precisa_atencao: "Precisa de você",
  com_robo: "Com o assistente",
  encerrada: "Encerrado",
  nao_quer: "Não quer mensagens",
  fora_da_janela: "Fora da janela",
};

/**
 * O tom do `Selo` de cada situação. Era a variante do `Badge` (pílula de
 * categoria) — a situação de uma linha é o `Selo` (auditoria DRG-05,
 * 07/10/2026). O azul do `info` virou `marca`; a encerrada saiu de cena e é
 * neutra, como o atendimento resolvido nas Conversas.
 */
export const SITUACAO_TOM: Record<SituacaoDaConversa, "perigo" | "atencao" | "marca" | "sucesso" | "neutro"> = {
  precisa_atencao: "perigo",
  com_robo: "sucesso",
  encerrada: "neutro",
  nao_quer: "marca",
  fora_da_janela: "atencao",
};

export type VereditoDeResposta = { pode: true } | { pode: false; motivo: string };

/**
 * Esta pessoa pode responder nesta conversa agora?
 *
 * Fora da janela a Meta simplesmente recusa a mensagem livre, e o erro dela não
 * explica isso para quem clicou — então a recusa é nossa, com o motivo em
 * português, antes de gastar a viagem.
 */
export function podeResponder(
  c: Pick<ConversaParaTela, "optedOutAt" | "lastInboundAt" | "janelaLivreHoras">,
  agora: Date
): VereditoDeResposta {
  if (c.optedOutAt) {
    return { pode: false, motivo: "O candidato pediu para não receber mais mensagens por aqui." };
  }
  if (!dentroDaJanelaLivre(c.lastInboundAt, agora, c.janelaLivreHoras)) {
    if (c.janelaLivreHoras === null || !c.lastInboundAt) {
      return { pode: false, motivo: "Ele ainda não escreveu nesta conversa." };
    }
    return {
      pode: false,
      motivo: `Passaram-se mais de ${c.janelaLivreHoras}h desde a última mensagem dele. O WhatsApp só permite retomar por modelo aprovado — ligue ou aguarde ele escrever.`,
    };
  }
  return { pode: true };
}

/**
 * Devolver a conversa ao robô é permitido?
 *
 * Só o que está transferido volta, e o que foi encerrado a pedido do candidato
 * nunca volta — devolver ao robô uma conversa de quem pediu silêncio é
 * exatamente o que o opt-out existe para impedir.
 */
export function podeDevolverAoRobo(c: Pick<ConversaParaTela, "optedOutAt" | "handoffAt">): VereditoDeResposta {
  if (c.optedOutAt) {
    return { pode: false, motivo: "O candidato pediu para não receber mais mensagens." };
  }
  if (!c.handoffAt) return { pode: false, motivo: "Esta conversa já está com o assistente." };
  return { pode: true };
}

/**
 * Dá para encerrar o atendimento?
 *
 * Qualquer atendimento aberto se encerra — com o assistente ou com uma pessoa.
 * O de quem pediu para parar já está encerrado, pelo próprio candidato.
 */
export function podeEncerrar(
  c: Pick<ConversaParaTela, "optedOutAt" | "atendimentoEncerradoEm">
): VereditoDeResposta {
  if (c.optedOutAt) return { pode: false, motivo: "O candidato pediu para parar — o atendimento já foi encerrado." };
  if (c.atendimentoEncerradoEm) return { pode: false, motivo: "Este atendimento já foi encerrado." };
  return { pode: true };
}

// ─── Quem assume ────────────────────────────────────────────────────────────

/**
 * Esta pessoa pode assumir a conversa?
 *
 * Assumir de quem já assumiu é permitido — alguém sai de férias, a conversa não
 * pode ficar presa —, mas fica no log. Assumir conversa que está com o
 * assistente também: é o jeito de tirá-la dele antes de escrever. A única
 * recusa é quem pediu para não receber mensagens: não há o que atender.
 */
export function podeAssumir(
  c: { optedOutAt: Date | null; assignedToId: string | null },
  userId: string
): VereditoDeResposta {
  if (c.optedOutAt) return { pode: false, motivo: "O candidato pediu para não receber mais mensagens." };
  if (c.assignedToId === userId) return { pode: false, motivo: "Esta conversa já está com você." };
  return { pode: true };
}

/**
 * Dá para passar a conversa para esta pessoa? (02/10/2026)
 *
 * Como o assumir, mas por outra pessoa: tira do assistente se estava com ele, e
 * a conversa passa a ser de quem recebeu. Atendimento encerrado não se
 * transfere — não há o que atender até o candidato escrever de novo, e a
 * próxima mensagem já abre outro.
 */
export function podeTransferir(
  c: { optedOutAt: Date | null; atendimentoEncerradoEm: Date | null; assignedToId: string | null },
  paraId: string
): VereditoDeResposta {
  if (c.optedOutAt) return { pode: false, motivo: "O candidato pediu para não receber mais mensagens." };
  if (c.atendimentoEncerradoEm) return { pode: false, motivo: "O atendimento está encerrado." };
  if (c.assignedToId === paraId) return { pode: false, motivo: "Já está com essa pessoa." };
  return { pode: true };
}

// ─── Em lote (02/10/2026) ───────────────────────────────────────────────────

/** Conversas por ação em lote — a lista da tela mostra até 200. */
export const MAX_NO_LOTE = 100;

export type AcaoEmLote =
  | { tipo: "encerrar"; desfecho: string }
  | { tipo: "devolver" }
  | { tipo: "transferir"; paraId: string };

/** O que voltou de uma ação em lote: quantas foram, e as que ficaram de fora com o motivo. */
export type ResultadoDoLote = { feitas: number; puladas: { nome: string; motivo: string }[] };

/** O resultado em uma frase, para a tela. */
export function resumoDoLote(r: ResultadoDoLote, acao: AcaoEmLote["tipo"]): string {
  const verbo = { encerrar: ["encerrada", "encerradas"], devolver: ["devolvida ao assistente", "devolvidas ao assistente"], transferir: ["transferida", "transferidas"] }[acao];
  const feitas = r.feitas === 0 ? "Nenhuma conversa mudou" : `${r.feitas} ${r.feitas === 1 ? `conversa ${verbo[0]}` : `conversas ${verbo[1]}`}`;
  if (r.puladas.length === 0) return `${feitas}.`;
  return `${feitas}; ${r.puladas.length} ${r.puladas.length === 1 ? "ficou" : "ficaram"} de fora.`;
}

/** Soltar devolve a conversa à fila, sem responsável. Só quem está com ela solta. */
export function podeSoltar(c: { assignedToId: string | null }, userId: string): VereditoDeResposta {
  if (!c.assignedToId) return { pode: false, motivo: "Ninguém assumiu esta conversa." };
  if (c.assignedToId !== userId) return { pode: false, motivo: "Só quem assumiu a conversa pode soltá-la." };
  return { pode: true };
}

/**
 * Quem é avisado quando a conversa pede alguém.
 *
 * Quem assumiu, se houver — a conversa é dele. Senão, o responsável pela vaga
 * da candidatura ligada, que é quem conhece o processo. Sem nenhum dos dois, o
 * setor inteiro: alguém precisa ver, e a fila é de todos.
 */
export function destinoDoAviso(c: {
  assignedToId: string | null;
  responsavelDaVagaId: string | null;
}): { usuario: string } | { setor: true } {
  if (c.assignedToId) return { usuario: c.assignedToId };
  if (c.responsavelDaVagaId) return { usuario: c.responsavelDaVagaId };
  return { setor: true };
}

/** Intervalo mínimo entre avisos de mensagem nova na mesma conversa. */
export const INTERVALO_ENTRE_AVISOS_MS = 15 * 60_000;

/**
 * Mensagem nova numa conversa que já está com gente: avisa?
 *
 * Só quando ela reabre a conversa depois de um silêncio. Candidato escreve em
 * rajada — "oi", "tudo bem?", "sobre a vaga…" —, e um aviso por linha faz o
 * recrutador desligar os avisos, que é pior que não ter.
 */
export function avisarMensagemNova(ultimaAntes: Date | null, agora: Date): boolean {
  if (!ultimaAntes) return true;
  return agora.getTime() - ultimaAntes.getTime() >= INTERVALO_ENTRE_AVISOS_MS;
}

/** Os recortes da lista de conversas. */
export type RecorteDaLista = "todas" | "minhas" | "sem_responsavel";

export function recorteDaUrl(v: string | undefined): RecorteDaLista {
  return v === "minhas" || v === "sem_responsavel" ? v : "todas";
}

/**
 * "Sem responsável" é a fila de verdade: transferidas que ninguém assumiu. As
 * que estão com o assistente não entram — não esperam ninguém.
 */
export function filtrarConversas<T extends ConversaParaTela & { responsavel: { id: string } | null }>(
  conversas: T[],
  recorte: RecorteDaLista,
  userId: string
): T[] {
  if (recorte === "minhas") return conversas.filter((c) => c.responsavel?.id === userId);
  if (recorte === "sem_responsavel") {
    return conversas.filter((c) => c.handoffAt && !c.optedOutAt && !c.responsavel);
  }
  return conversas;
}

/**
 * A ordem da fila.
 *
 * Quem precisa de gente primeiro, e dentro disso a espera mais longa no topo —
 * é a conversa que está sem resposta há mais tempo, e a que mais custa deixar
 * parada. Encerradas vão para o fim: não há o que fazer com elas — e as de
 * quem pediu para parar, depois delas.
 */
export function ordenarConversas<T extends ConversaParaTela>(conversas: T[], agora: Date): T[] {
  const peso: Record<SituacaoDaConversa, number> = {
    precisa_atencao: 0,
    fora_da_janela: 1,
    com_robo: 2,
    encerrada: 3,
    nao_quer: 4,
  };
  return [...conversas].sort((a, b) => {
    const da = peso[situacaoDaConversa(a, agora)];
    const db = peso[situacaoDaConversa(b, agora)];
    if (da !== db) return da - db;
    // Sem mensagem recebida vai para o fim do grupo: não há espera a medir.
    const ta = a.lastInboundAt?.getTime() ?? Infinity;
    const tb = b.lastInboundAt?.getTime() ?? Infinity;
    return ta - tb;
  });
}

/** Formata o telefone (DDI + número, sem "+") como as pessoas leem. */
export function telefoneLegivel(waPhone: string): string {
  const d = waPhone.replace(/\D/g, "");
  const semPais = d.startsWith("55") ? d.slice(2) : d;
  if (semPais.length === 11) return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`;
  if (semPais.length === 10) return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  // Número que não tem cara de brasileiro sai como veio: inventar máscara
  // esconderia que o número é estrangeiro, e isso importa para quem vai ligar.
  return `+${d}`;
}

// ── Paginação da conversa (10/11/2026) ─────────────────────────────────────
//
// A conversa lia as mensagens em ordem crescente com teto de 300: numa conversa
// longa, a tela mostrava as 300 MAIS ANTIGAS e as novas sumiam. Agora ela abre
// nas mais novas e traz as anteriores sob pedido, por cursor.

/** Quantas mensagens a conversa traz de cada vez. */
export const MENSAGENS_POR_VEZ = 100;

/**
 * Quantas das mais novas de cada conversa a lista lê para a última mensagem e
 * as sem resposta. Mais de 20 seguidas sem resposta já é "muitas"; a 21ª só
 * deixa o número passar de 20.
 */
export const MENSAGENS_DO_RESUMO = 21;

/** Onde a página carregada começa: a mensagem mais antiga dela. */
export type CursorDeMensagem = { em: Date; id: string };

/**
 * O filtro das mensagens anteriores ao cursor, na mesma ordem da tela (data,
 * depois id). O id desempata: duas mensagens no mesmo milissegundo (o robô
 * responde em lote) não podem sumir nem aparecer duas vezes entre as páginas.
 */
export function anterioresAo(c: CursorDeMensagem): { OR: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] } {
  return { OR: [{ createdAt: { lt: c.em } }, { createdAt: c.em, id: { lt: c.id } }] };
}

/**
 * Uma página a partir das mais novas. Recebe até `porVez + 1` mensagens em
 * ordem decrescente (a sobra só diz se há anteriores) e devolve `porVez` em
 * ordem crescente, como a tela mostra.
 */
export function paginaDeMensagens<T>(maisNovasPrimeiro: T[], porVez = MENSAGENS_POR_VEZ): { mensagens: T[]; temAnteriores: boolean } {
  return { mensagens: maisNovasPrimeiro.slice(0, porVez).reverse(), temAnteriores: maisNovasPrimeiro.length > porVez };
}

/** As mensagens de ENTRADA no fim da conversa, depois da última SAIDA. Em ordem decrescente. */
export function contarSemResposta(maisNovasPrimeiro: { direction: string }[]): number {
  let n = 0;
  for (const m of maisNovasPrimeiro) {
    if (m.direction !== "ENTRADA") break;
    n++;
  }
  return n;
}

/**
 * A última mensagem e as sem resposta de cada conversa, para a lista. As
 * mensagens de cada conversa vêm em ordem decrescente (as de conversas
 * diferentes podem vir misturadas).
 */
export function resumoPorConversa(
  maisNovasPrimeiro: { threadId: string; body: string; createdAt: Date; direction: string }[]
): Map<string, { ultima: { body: string; createdAt: Date }; naoRespondidas: number }> {
  const resumo = new Map<string, { ultima: { body: string; createdAt: Date }; naoRespondidas: number }>();
  // `respondida` marca onde parar de contar: as de ENTRADA antes da primeira
  // SAIDA são exatamente as que ninguém respondeu.
  const respondida = new Set<string>();
  for (const m of maisNovasPrimeiro) {
    let r = resumo.get(m.threadId);
    if (!r) {
      r = { ultima: { body: m.body, createdAt: m.createdAt }, naoRespondidas: 0 };
      resumo.set(m.threadId, r);
    }
    if (respondida.has(m.threadId)) continue;
    if (m.direction === "ENTRADA") r.naoRespondidas++;
    else respondida.add(m.threadId);
  }
  return resumo;
}

/**
 * Junta as mensagens já carregadas com as que chegaram, sem repetir: a versão
 * mais nova de cada id vence (a situação de envio muda depois), e a ordem é a
 * da tela — data, depois id.
 */
export function mesclarMensagens<T extends { id: string; createdAt: Date }>(antigas: T[], novas: T[]): T[] {
  const porId = new Map<string, T>();
  for (const m of antigas) porId.set(m.id, m);
  for (const m of novas) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * As mensagens intercaladas com as marcas de fim de atendimento, em ordem.
 * Enquanto há mensagens anteriores por carregar, as marcas de antes da
 * primeira carregada ficam de fora: não dá para saber onde caem, e elas
 * apareceriam todas empilhadas no topo.
 */
export function intercalarEncerramentos<M extends { createdAt: Date }, E extends { em: Date }>(
  mensagens: M[],
  encerramentos: E[],
  temAnteriores: boolean
): ({ tipo: "mensagem"; mensagem: M } | { tipo: "encerramento"; encerramento: E; indice: number })[] {
  const itens: ({ tipo: "mensagem"; mensagem: M } | { tipo: "encerramento"; encerramento: E; indice: number })[] = [];
  let k = 0;
  const primeira = mensagens[0];
  if (temAnteriores && primeira) {
    while (k < encerramentos.length && encerramentos[k]!.em <= primeira.createdAt) k++;
  }
  for (const m of mensagens) {
    while (k < encerramentos.length && encerramentos[k]!.em <= m.createdAt) {
      itens.push({ tipo: "encerramento", encerramento: encerramentos[k]!, indice: k });
      k++;
    }
    itens.push({ tipo: "mensagem", mensagem: m });
  }
  while (k < encerramentos.length) {
    itens.push({ tipo: "encerramento", encerramento: encerramentos[k]!, indice: k });
    k++;
  }
  return itens;
}
