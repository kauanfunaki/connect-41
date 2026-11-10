// O som da notificação e o aviso no computador (09/11/2026) — as escolhas da
// pessoa e os cinco sons, para o sino (que toca) e a tela de Notificações
// (que ajusta).
//
// Os sons são feitos na hora pelo próprio navegador (Web Audio), sem arquivo
// de áudio: nada para baixar, e o volume vale igual para os cinco.
//
// A escolha fica no navegador (localStorage), e não na conta: som e volume
// são do aparelho — o computador do escritório com caixa de som e o notebook
// em reunião pedem ajustes diferentes —, e a permissão de aviso no computador
// já é do navegador de qualquer jeito.

export type Nota = {
  tipo: OscillatorType;
  /** Hz. */
  freq: number;
  /** Hz ao fim da nota, para o som que escorrega (a gota). */
  freqFinal?: number;
  /** Segundos depois do começo do som. */
  inicio: number;
  /** Segundos. */
  duracao: number;
  /** 0 a 1, antes do volume da pessoa. */
  ganho: number;
};

export const SONS = [
  {
    chave: "sino",
    rotulo: "Sino",
    notas: [
      { tipo: "sine", freq: 880, inicio: 0, duracao: 0.9, ganho: 0.5 },
      { tipo: "sine", freq: 1320, inicio: 0, duracao: 0.6, ganho: 0.25 },
    ],
  },
  {
    chave: "acorde",
    rotulo: "Acorde",
    notas: [
      { tipo: "triangle", freq: 523.25, inicio: 0, duracao: 0.35, ganho: 0.5 },
      { tipo: "triangle", freq: 659.25, inicio: 0.11, duracao: 0.35, ganho: 0.5 },
      { tipo: "triangle", freq: 783.99, inicio: 0.22, duracao: 0.5, ganho: 0.5 },
    ],
  },
  {
    chave: "gota",
    rotulo: "Gota",
    notas: [{ tipo: "sine", freq: 1400, freqFinal: 520, inicio: 0, duracao: 0.22, ganho: 0.6 }],
  },
  {
    chave: "toque",
    rotulo: "Toque duplo",
    notas: [
      { tipo: "sine", freq: 740, inicio: 0, duracao: 0.12, ganho: 0.55 },
      { tipo: "sine", freq: 740, inicio: 0.18, duracao: 0.16, ganho: 0.55 },
    ],
  },
  {
    chave: "digital",
    rotulo: "Digital",
    notas: [
      { tipo: "square", freq: 987.77, inicio: 0, duracao: 0.09, ganho: 0.22 },
      { tipo: "square", freq: 1318.51, inicio: 0.09, duracao: 0.3, ganho: 0.22 },
    ],
  },
] as const satisfies readonly { chave: string; rotulo: string; notas: readonly Nota[] }[];

export type ChaveDoSom = (typeof SONS)[number]["chave"];

export type PreferenciasDeSom = {
  /** Toca som quando chega notificação. */
  ligado: boolean;
  som: ChaveDoSom;
  /** 0 a 100. */
  volume: number;
  /** Mostra o aviso do computador (o do Windows/navegador), além do canto da tela. */
  noComputador: boolean;
};

export const PREFERENCIAS_PADRAO: PreferenciasDeSom = { ligado: true, som: "sino", volume: 60, noComputador: true };

export const CHAVE_DAS_PREFERENCIAS = "connect:som-das-notificacoes";

export function ehSom(valor: unknown): valor is ChaveDoSom {
  return SONS.some((s) => s.chave === valor);
}

/** O que está guardado, com o padrão no lugar do que falta ou não faz sentido. */
export function lerPreferencias(texto: string | null | undefined): PreferenciasDeSom {
  if (!texto) return PREFERENCIAS_PADRAO;
  let lido: unknown;
  try {
    lido = JSON.parse(texto);
  } catch {
    return PREFERENCIAS_PADRAO;
  }
  if (!lido || typeof lido !== "object") return PREFERENCIAS_PADRAO;
  const p = lido as Record<string, unknown>;
  const volume = typeof p.volume === "number" && Number.isFinite(p.volume) ? Math.round(Math.min(100, Math.max(0, p.volume))) : PREFERENCIAS_PADRAO.volume;
  return {
    ligado: typeof p.ligado === "boolean" ? p.ligado : PREFERENCIAS_PADRAO.ligado,
    som: ehSom(p.som) ? p.som : PREFERENCIAS_PADRAO.som,
    volume,
    noComputador: typeof p.noComputador === "boolean" ? p.noComputador : PREFERENCIAS_PADRAO.noComputador,
  };
}

/** Com som de verdade: ligado e com volume. */
export function tocaSom(p: PreferenciasDeSom): boolean {
  return p.ligado && p.volume > 0;
}

/**
 * O volume da pessoa (0 a 100) no ganho do áudio (0 a 1). Em curva, e não em
 * linha reta: o ouvido percebe volume em proporção, e em linha reta metade do
 * controle quase não mudava nada.
 */
export function ganhoDoVolume(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v * v;
}

/** Quanto dura o som inteiro, em segundos. */
export function duracaoDoSom(chave: ChaveDoSom): number {
  const som = SONS.find((s) => s.chave === chave) ?? SONS[0];
  return Math.max(...som.notas.map((n) => n.inicio + n.duracao));
}

// ─── No navegador ──────────────────────────────────────────────────────────

export function lerPreferenciasDoNavegador(): PreferenciasDeSom {
  try {
    return lerPreferencias(localStorage.getItem(CHAVE_DAS_PREFERENCIAS));
  } catch {
    return PREFERENCIAS_PADRAO;
  }
}

export function gravarPreferenciasNoNavegador(parcial: Partial<PreferenciasDeSom>): PreferenciasDeSom {
  const novas = { ...lerPreferenciasDoNavegador(), ...parcial };
  try {
    localStorage.setItem(CHAVE_DAS_PREFERENCIAS, JSON.stringify(novas));
  } catch {
    // Sem armazenamento (navegação privada restrita): vale só nesta tela.
  }
  return novas;
}

let contexto: AudioContext | null = null;

function pegarContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (contexto) return contexto;
  const Classe = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Classe) return null;
  try {
    contexto = new Classe();
  } catch {
    return null;
  }
  return contexto;
}

/**
 * O navegador só deixa a página fazer som depois que a pessoa mexe nela (um
 * clique, uma tecla). O sino chama isto no primeiro gesto: dali em diante o
 * som toca sozinho, inclusive com a aba em segundo plano.
 */
export function destravarAudio(): void {
  const ctx = pegarContexto();
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
}

/** O áudio já pode tocar sem gesto da pessoa. */
export function audioPronto(): boolean {
  return contexto?.state === "running";
}

/** Toca o som. Devolve se tocou — `false` quando o navegador ainda não deixa. */
export async function tocarSom(chave: ChaveDoSom, volume: number): Promise<boolean> {
  const ctx = pegarContexto();
  if (!ctx || volume <= 0) return false;
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
    // `resume()` muda o estado; o TypeScript ainda o vê como o de antes.
    if ((ctx.state as AudioContextState) !== "running") return false;
  }
  const som = SONS.find((s) => s.chave === chave) ?? SONS[0];
  const saida = ctx.createGain();
  saida.gain.value = ganhoDoVolume(volume);
  saida.connect(ctx.destination);
  const agora = ctx.currentTime + 0.02;
  for (const nota of som.notas as readonly Nota[]) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const t0 = agora + nota.inicio;
    const t1 = t0 + nota.duracao;
    osc.type = nota.tipo;
    osc.frequency.setValueAtTime(nota.freq, t0);
    if (nota.freqFinal) osc.frequency.exponentialRampToValueAtTime(nota.freqFinal, t1);
    // Ataque curto (sem estalo) e a nota morrendo até o fim.
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(nota.ganho, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(env).connect(saida);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
  return true;
}
