// O observador de protocolo: o robô que olha o órgão no lugar de uma pessoa.
//
// É a automação de maior valor do fluxo do societário. Hoje alguém abre o site
// da Junta todo dia para saber se o registro saiu — e essa checagem diária é
// trabalho puro, sem decisão nenhuma dentro.
//
// ─── O que existe aqui, e o que não existe ───────────────────────────────────
//
// Existe: a máquina inteira em volta — quem verificar, o que fazer com a
// leitura, como gravar sem mentir, e o laço do cron.
//
// Existe também, desde 18/09, **a decisão de dois órgãos**: o painel da Junta
// Comercial (`orgaos/junta.ts`) e a lista do SIMA (`orgaos/sima.ts`). Dado o que
// a tela mostra, os dois já dizem se o processo está deferido, em exigência ou
// andando — com os textos que o setor levantou em 15/09, e com teste.
//
// **Não existe: a navegação até essa tela.** Nenhum dos dois tem o HTML lido: o
// SIMA vive atrás do e-Cidadão e depende do certificado, e do painel da Junta
// não temos nem a URL. Inventar seletor seria pior que não ter robô, porque
// marcaria processo como deferido sem ser.
//
// Por isso `OBSERVADORES` segue **vazio**: a entrada só entra quando a leitura
// tiver rodado uma vez contra a página real. Registrar aqui é prometer que o
// robô lê de verdade, e o cron pula o que não está prometido — que é o
// comportamento certo enquanto isso.

export type LeituraDoOrgao = {
  desfecho: "PENDENTE" | "DEFERIDO" | "EXIGENCIA";
  /** O que o órgão escreveu. Obrigatório quando o desfecho é exigência. */
  detalhe?: string;
};

export type DadosDoProtocolo = {
  numero: string | null;
  trackingUrl: string | null;
};

/** Um leitor de órgão. Recebe o protocolo, devolve o que o site diz. */
export type ObservadorDeOrgao = (protocolo: DadosDoProtocolo) => Promise<LeituraDoOrgao>;

/**
 * Leitores registrados, por sigla do órgão.
 *
 * Vazio hoje. Ver o cabeçalho: o que significa cada estado já está escrito para
 * a Junta (`JUCEPAR`) e o SIMA (`MA`) — o que falta é chegar até a tela.
 */
export const OBSERVADORES: Record<string, ObservadorDeOrgao> = {};

export function observadorPara(sigla: string | null): ObservadorDeOrgao | null {
  if (!sigla) return null;
  return OBSERVADORES[sigla] ?? null;
}

export type ProtocoloParaVerificar = {
  id: string;
  outcome: "PENDENTE" | "DEFERIDO" | "EXIGENCIA";
  numero: string | null;
  trackingUrl: string | null;
  siglaDoOrgao: string | null;
};

export type Decisao =
  | { tipo: "pular"; motivo: string }
  | { tipo: "segue_pendente" }
  | { tipo: "deferir" }
  | { tipo: "exigir"; descricao: string };

/**
 * O que fazer com a leitura de um órgão.
 *
 * Função pura, separada da escrita, porque as recusas são a parte que precisa
 * de teste — e cada recusa aqui evita um estrago específico:
 *
 * - **protocolo já resolvido**: reprocessar criaria exigência duplicada ou
 *   reabriria um deferimento que alguém já usou para seguir o processo;
 * - **exigência sem texto**: exigência é o que a pessoa vai ler para saber o
 *   que corrigir. Gravar uma vazia é pior que não gravar — o processo volta
 *   para a fila sem dizer por quê;
 * - **sem número de protocolo**: não há o que consultar. Não é erro, é cedo
 *   demais — alguém protocolou sem anotar o número ainda.
 */
export function decidir(
  protocolo: ProtocoloParaVerificar,
  leitura: LeituraDoOrgao
): Decisao {
  if (protocolo.outcome !== "PENDENTE") {
    return { tipo: "pular", motivo: "protocolo já resolvido" };
  }
  if (!protocolo.numero) {
    return { tipo: "pular", motivo: "sem número de protocolo para consultar" };
  }

  if (leitura.desfecho === "DEFERIDO") return { tipo: "deferir" };

  if (leitura.desfecho === "EXIGENCIA") {
    const descricao = leitura.detalhe?.trim();
    if (!descricao) {
      return { tipo: "pular", motivo: "órgão indicou exigência sem descrever o que falta" };
    }
    return { tipo: "exigir", descricao };
  }

  return { tipo: "segue_pendente" };
}

/** Um protocolo é verificável quando há como consultar e quem consulte. */
export function podeVerificar(p: ProtocoloParaVerificar): boolean {
  return (
    p.outcome === "PENDENTE" &&
    p.numero !== null &&
    p.trackingUrl !== null &&
    observadorPara(p.siglaDoOrgao) !== null
  );
}
