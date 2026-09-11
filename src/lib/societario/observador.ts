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
// **Não existe: nenhum leitor de órgão de verdade.** Ler o site da JUCEPAR
// exige o contrato daquela página — onde fica o número, que texto significa
// deferido, como entra a credencial —, e isso não se adivinha. `OBSERVADORES`
// nasce vazio de propósito: inventar um seletor de HTML que ninguém conferiu
// seria pior que não ter robô, porque marcaria processo como deferido sem ser.
//
// Escrever o primeiro é preencher uma entrada deste mapa. Todo o resto já roda.

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
 * Vazio hoje. Ver o cabeçalho: a entrada só entra quando alguém tiver lido a
 * página do órgão e souber dizer o que significa cada estado.
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
