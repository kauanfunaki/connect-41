// Abrir e encerrar execução de integração.
//
// ─── Por que isto é um módulo, e não três linhas em cada cron ────────────────
//
// Em 10/09 o `lastError` do SPED mentiu por dias: ele só era limpo dentro de um
// `if` específico, e raiz que voltou a funcionar mas não tinha nada a
// sincronizar nunca passava por lá. Vinte e cinco raízes saudáveis exibiam um
// 403 que não existia mais, e quem olhasse concluiria que a integração estava
// quebrada.
//
// O defeito não foi distração: foi **haver mais de um caminho para terminar uma
// rodada**. Aqui só existe um — `finalizarExecucao` — e ele grava os dois lados
// juntos, sempre. Sucesso sem nada a fazer continua sendo sucesso, e limpa o
// erro do mesmo jeito.

export type ContadoresDaExecucao = Record<string, number>;

export type DesfechoDaExecucao =
  | { ok: true; counters?: ContadoresDaExecucao }
  | { ok: false; erro: string };

export type GravacaoDoFim = {
  /** O que escrever na linha da execução. */
  run: {
    finishedAt: Date;
    ok: boolean;
    error: string | null;
    counters: ContadoresDaExecucao | null;
  };
  /** O que escrever no espelho da integração. */
  integracao: {
    lastRunAt: Date;
    /** **NULL em toda execução bem-sucedida**, inclusive na que não fez nada. */
    lastError: string | null;
    cursor?: string | null;
    watermark?: string | null;
  };
};

/** Erro guardado cabe em 500 caracteres; o resto vai para o log do servidor. */
const LIMITE_DO_ERRO = 500;

/**
 * O que gravar quando uma rodada termina.
 *
 * Função pura, separada da escrita, porque a regra que ela carrega é a que já
 * falhou uma vez: **sucesso limpa o erro anterior, sempre**. Testá-la é mais
 * barato que descobrir de novo em produção, com alguém desligando uma
 * integração saudável.
 *
 * O cursor só entra na gravação quando a execução deu certo. Avançar cursor
 * depois de falha é como se pula lote: a próxima rodada retomaria de um ponto
 * que ninguém processou.
 */
export function finalizarExecucao(
  desfecho: DesfechoDaExecucao,
  agora: Date,
  avanco?: { cursor?: string | null; watermark?: string | null }
): GravacaoDoFim {
  if (desfecho.ok) {
    return {
      run: {
        finishedAt: agora,
        ok: true,
        error: null,
        counters: desfecho.counters ?? null,
      },
      integracao: {
        lastRunAt: agora,
        lastError: null,
        ...(avanco?.cursor !== undefined ? { cursor: avanco.cursor } : {}),
        ...(avanco?.watermark !== undefined ? { watermark: avanco.watermark } : {}),
      },
    };
  }

  const erro = (desfecho.erro || "falha desconhecida").slice(0, LIMITE_DO_ERRO);
  return {
    run: { finishedAt: agora, ok: false, error: erro, counters: null },
    // Sem cursor: o progresso não avança sobre uma falha.
    integracao: { lastRunAt: agora, lastError: erro },
  };
}

export type EstadoDaIntegracao = {
  enabled: boolean;
  lastRunAt: Date | null;
  lastError: string | null;
};

export type Saude = "nunca_rodou" | "ok" | "com_erro" | "desligada" | "parada";

/**
 * Como a integração está, para a tela dizer em uma palavra.
 *
 * `parada` é o estado que só existe porque alguém precisa notá-lo: ligada, sem
 * erro, e sem rodar há mais tempo que o esperado. É o silêncio — a falha que
 * não levanta a mão, e que no SPED apareceu como um 200 em 0,11s por três dias.
 */
export function saudeDaIntegracao(
  estado: EstadoDaIntegracao,
  agora: Date,
  silencioMaximoEmHoras = 24
): Saude {
  if (!estado.enabled) return "desligada";
  if (estado.lastError) return "com_erro";
  if (estado.lastRunAt === null) return "nunca_rodou";

  const horas = (agora.getTime() - estado.lastRunAt.getTime()) / 3_600_000;
  if (horas > silencioMaximoEmHoras) return "parada";
  return "ok";
}

/**
 * Vale executar esta integração agora?
 *
 * Desligada não roda — e isso não é erro, é escolha do cliente. Configuração
 * incompleta também não: chamar o sistema de fora sem credencial gera um 401
 * que parece problema do terceiro e não é.
 */
export function podeExecutar(params: {
  enabled: boolean;
  camposFaltando: string[];
  temAdaptador: boolean;
}): { pode: boolean; motivo?: string } {
  if (!params.enabled) return { pode: false, motivo: "integração desligada pelo cliente" };
  if (!params.temAdaptador) return { pode: false, motivo: "sem adaptador registrado" };
  if (params.camposFaltando.length > 0) {
    return {
      pode: false,
      motivo: `configuração incompleta: ${params.camposFaltando.join(", ")}`,
    };
  }
  return { pode: true };
}
