// O executor de portal — o par do observador.
//
// O observador **lê**: dado um protocolo, o que o site diz agora. O executor
// **faz**: preenche o formulário do órgão e devolve o protocolo que nasceu
// dali. Cinco dos seis procedimentos que o setor documentou são desse tipo —
// ida, não volta (ver `docs/fluxos/societario-robos.html`).
//
// ─── O risco que desenha esta peça ──────────────────────────────────────────
//
// Um robô que submete duas vezes abre **dois processos no órgão**. É o pior
// defeito possível aqui: custa taxa, gera protocolo órfão e alguém do setor
// precisa ligar para cancelar. Pior que não automatizar.
//
// Por isso a ordem é **reservar, submeter, preencher** — nunca submeter e
// depois gravar. A reserva usa o `@@unique([processId, organId, attempt])` do
// `ProcessProtocol`: se duas execuções tentarem a mesma tentativa, o banco
// recusa a segunda antes de qualquer requisição sair daqui.
//
// E se o adaptador morrer **depois** de submeter e antes de devolver o número,
// sobra uma reserva com `number` nulo e o erro registrado. Uma pessoa vê
// "submetido, número não capturado" e resolve — em vez de o robô tentar de
// novo e duplicar.
//
// ─── O que existe, e o que não ──────────────────────────────────────────────
//
// `EXECUTORES` nasce vazio, como `OBSERVADORES`. Escrever um exige o contrato
// da página do órgão, e em 11/09 o Kauan autorizou o robô a usar o certificado
// A1 e a ler a caixa de e-mail — o que destrava, mas não substitui, esse
// levantamento.

/** O que o robô precisa para autenticar, já decifrado da integração do cliente. */
export type CredencialDoRobo = Record<string, string>;

/**
 * Buscar um código de verificação na caixa de e-mail.
 *
 * Existe porque o Bombeiros manda código **duas vezes no mesmo fluxo**, e sem
 * isso aquele portal não automatiza. É passado como função, e não lido aqui
 * dentro, para que o executor continue testável sem caixa de e-mail — e para
 * que o acesso à correspondência fique num lugar só, auditável.
 *
 * `desde` evita o pior erro deste tipo de integração: pegar um código antigo
 * que ainda está na caixa e tentar validá-lo.
 */
export type BuscadorDeCodigo = (params: {
  desde: Date;
  assuntoContem?: string;
}) => Promise<string | null>;

export type ContextoDaSubmissao = {
  credencial: CredencialDoRobo;
  /** Os dados do formulário — CNPJ, endereço, CNAEs, o que o órgão pedir. */
  dados: Record<string, unknown>;
  buscarCodigo?: BuscadorDeCodigo;
};

export type ResultadoDaSubmissao =
  | { ok: true; numeroDoProtocolo: string; observacao?: string }
  /**
   * `recuperavel` separa "o site caiu, tente de novo" de "o órgão recusou o
   * dado, precisa de gente". Insistir no segundo é como um robô inunda um
   * órgão de tentativas idênticas; desistir do primeiro joga trabalho fora.
   */
  | { ok: false; motivo: string; recuperavel: boolean };

export type ExecutorDeOrgao = (ctx: ContextoDaSubmissao) => Promise<ResultadoDaSubmissao>;

/** Executores registrados, por sigla do órgão. Vazio — ver o cabeçalho. */
export const EXECUTORES: Record<string, ExecutorDeOrgao> = {};

export function executorPara(sigla: string | null): ExecutorDeOrgao | null {
  if (!sigla) return null;
  return EXECUTORES[sigla] ?? null;
}

export type EtapaParaSubmeter = {
  status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "DISPENSADA";
  siglaDoOrgao: string | null;
  /** Já existe protocolo aberto (sem desfecho) para esta etapa? */
  temProtocoloAberto: boolean;
  /** Itens obrigatórios do checklist ainda em aberto. */
  itensPendentes: number;
};

export type VereditoDeSubmissao =
  | { pode: true }
  | { pode: false; motivo: string };

/**
 * Esta etapa pode ser submetida por robô agora?
 *
 * Cinco recusas, e a ordem entre elas importa menos que o fato de existirem —
 * cada uma é uma forma de submeter o que não devia:
 *
 * - **etapa encerrada**: já foi, e reabrir pelo robô apagaria o histórico;
 * - **sem órgão**: etapa interna não protocola em lugar nenhum;
 * - **sem executor**: órgão que ainda não foi automatizado. Não é erro — é o
 *   setor seguindo à mão, como sempre fez;
 * - **protocolo aberto**: já há um esperando desfecho. Submeter de novo é
 *   exatamente a duplicata que esta peça existe para impedir;
 * - **checklist incompleto**: mandar documentação faltando ao órgão volta como
 *   exigência, com dias de atraso — é o retrabalho que o rodapé do fluxograma
 *   do setor manda evitar.
 */
export function podeSubmeter(etapa: EtapaParaSubmeter): VereditoDeSubmissao {
  if (etapa.status === "CONCLUIDA" || etapa.status === "DISPENSADA") {
    return { pode: false, motivo: "Etapa já encerrada." };
  }
  if (!etapa.siglaDoOrgao) {
    return { pode: false, motivo: "Esta etapa não protocola em órgão." };
  }
  if (!executorPara(etapa.siglaDoOrgao)) {
    return { pode: false, motivo: "Este órgão ainda não tem robô — siga à mão." };
  }
  if (etapa.temProtocoloAberto) {
    return { pode: false, motivo: "Já existe protocolo aguardando desfecho nesta etapa." };
  }
  if (etapa.itensPendentes > 0) {
    return {
      pode: false,
      motivo:
        etapa.itensPendentes === 1
          ? "Falta 1 item obrigatório no checklist."
          : `Faltam ${etapa.itensPendentes} itens obrigatórios no checklist.`,
    };
  }
  return { pode: true };
}

export type DesfechoDaReserva = {
  /** O que gravar no protocolo reservado. */
  protocolo: {
    number: string | null;
    checkError: string | null;
    lastCheckedAt: Date;
  };
  /** A etapa segue aguardando órgão, ou volta para trabalho humano? */
  etapaVoltaParaPendente: boolean;
  /** Vale tentar de novo automaticamente? */
  recuperavel: boolean;
};

/**
 * O que fazer com o resultado de uma submissão, sobre a reserva já criada.
 *
 * Função pura, separada da escrita, porque é aqui que se decide o destino de
 * uma reserva que já existe no banco — e errar significa ou duplicar processo
 * no órgão, ou deixar um protocolo fantasma parado para sempre.
 *
 * **A reserva nunca é apagada.** Mesmo quando a submissão falha antes de sair
 * daqui, a linha fica com o erro registrado: apagar devolveria a tentativa ao
 * pool e o robô a usaria de novo, que é como se perde a trilha de quantas
 * vezes tentamos.
 */
export function decidirAposSubmissao(
  resultado: ResultadoDaSubmissao,
  agora: Date
): DesfechoDaReserva {
  if (resultado.ok) {
    return {
      protocolo: {
        number: resultado.numeroDoProtocolo.trim() || null,
        checkError: null,
        lastCheckedAt: agora,
      },
      // Submetido: agora é o observador que assume, e a etapa fica aguardando.
      etapaVoltaParaPendente: false,
      recuperavel: false,
    };
  }

  return {
    protocolo: {
      number: null,
      checkError: resultado.motivo.slice(0, 500),
      lastCheckedAt: agora,
    },
    // Falhou sem protocolo: a etapa volta a ser trabalho de gente, porque
    // ninguém no órgão está esperando nada.
    etapaVoltaParaPendente: true,
    recuperavel: resultado.recuperavel,
  };
}

/**
 * Uma submissão bem-sucedida sem número é sucesso?
 *
 * **Não.** É o caso mais perigoso: o órgão recebeu, e nós não sabemos o
 * protocolo — então o observador não tem o que consultar e ninguém descobre o
 * desfecho. Tratar como falha faria o robô tentar de novo e duplicar; tratar
 * como sucesso silencioso deixaria o processo parado para sempre.
 *
 * A saída é a terceira: **sucesso que exige gente**. A reserva fica, sem
 * número, com a observação registrada, e a etapa continua aguardando.
 */
export function precisaDeNumeroAMao(resultado: ResultadoDaSubmissao): boolean {
  return resultado.ok && resultado.numeroDoProtocolo.trim() === "";
}
