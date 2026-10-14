// O resultado do DISC explicado (14/10/2026, escolha "Teste · 2 — A + B" do
// Kauan: barras com o nome de cada letra, o gráfico de teia e um quadro que
// traduz o perfil). Regras puras e os textos fixos de cada perfil.
//
// O perfil sai de `scoreDisc` (src/lib/disc.ts): a letra mais forte e, quando
// a segunda fica a até `PROFILE_MARGIN` pontos dela, a segunda junto — "S",
// "SI", "DC"… São 4 perfis de uma letra e 12 de duas (a ordem importa: em
// "SI" a Estabilidade vem na frente, em "IS" a Influência). Os 16 têm texto
// aqui, escrito uma vez, em português simples — quem lê é contador, não
// psicólogo.
//
// O DISC descreve o jeito de trabalhar; não mede competência nem serve para
// aprovar ou reprovar. A tela diz isso embaixo do resultado (`AVISO_DO_DISC`).

import { DISC_DIMENSIONS, DISC_LABEL, type DiscDimension, type DiscScores } from "@/lib/disc";

export const AVISO_DO_DISC = "O DISC mostra o jeito de trabalhar. Não serve para aprovar ou reprovar.";

/** "SI" — a letra principal e, se houver, a segunda. */
export function codigoDoPerfil(principal: DiscDimension, segunda: DiscDimension | null): string {
  return principal + (segunda ?? "");
}

/** "Estabilidade / Influência". */
export function nomeDoPerfil(principal: DiscDimension, segunda: DiscDimension | null): string {
  return segunda ? `${DISC_LABEL[principal]} / ${DISC_LABEL[segunda]}` : DISC_LABEL[principal];
}

export type ExplicacaoDoPerfil = {
  /** O que o perfil quer dizer, em uma ou duas frases. */
  resumo: string;
  pontosFortes: string[];
  pontosDeAtencao: string[];
};

/** Os 16 perfis que `scoreDisc` pode dar — ver o comentário do arquivo. */
export const EXPLICACOES_DO_DISC: Record<string, ExplicacaoDoPerfil> = {
  D: {
    resumo: "Direto e decidido. Gosta de desafio, de resolver rápido e de ver resultado. Prefere ter autonomia para agir.",
    pontosFortes: ["Toma decisão sem enrolar", "Encara problema e prazo apertado", "Assume a responsabilidade"],
    pontosDeAtencao: ["Pode atropelar quem tem outro ritmo", "Tende a ter pouca paciência com rotina e detalhe"],
  },
  I: {
    resumo: "Comunicativo e animado. Gosta de gente, de conversar e de convencer. Rende mais em ambiente leve, com contato com pessoas.",
    pontosFortes: ["Facilidade para atender e se relacionar", "Anima a equipe", "Bom para apresentar ideias"],
    pontosDeAtencao: ["Pode se dispersar com conversa", "Tende a deixar detalhe e controle para depois"],
  },
  S: {
    resumo: "Calmo, paciente e constante. Gosta de rotina, de equipe estável e de ajudar os colegas.",
    pontosFortes: ["Constante no dia a dia", "Bom ouvinte e colega de confiança", "Segue o combinado até o fim"],
    pontosDeAtencao: ["Pode estranhar mudança brusca", "Evita conflito e cobrança direta"],
  },
  C: {
    resumo: "Cuidadoso e organizado. Gosta de regra clara, de fazer certo e de conferir antes de entregar.",
    pontosFortes: ["Atenção aos detalhes", "Segue procedimento e norma", "Entrega com qualidade e poucos erros"],
    pontosDeAtencao: ["Pode demorar para decidir sem todas as informações", "Tende a ser exigente demais consigo e com os outros"],
  },
  DI: {
    resumo: "Decidido e comunicativo. Gosta de liderar, de convencer e de ver as coisas acontecendo depressa.",
    pontosFortes: ["Toma a frente e leva o grupo junto", "Bom para negociar e abrir portas", "Lida bem com pressão e mudança"],
    pontosDeAtencao: ["Pode prometer mais do que dá para cumprir", "Tende a pular etapas e detalhes"],
  },
  DS: {
    resumo: "Firme e persistente. Quer resultado, mas com constância: vai até o fim do que começou, no seu ritmo.",
    pontosFortes: ["Não desiste diante de dificuldade", "Assume o que é dele e cumpre", "Mantém a calma sob pressão"],
    pontosDeAtencao: ["Pode ser teimoso depois que decide", "Pode falar pouco sobre o andamento do trabalho"],
  },
  DC: {
    resumo: "Exigente e objetivo. Quer resultado e quer feito do jeito certo. Decide com base em fatos.",
    pontosFortes: ["Alto padrão de qualidade", "Resolve problema com lógica", "Independente e focado"],
    pontosDeAtencao: ["Pode ser duro na cobrança", "Tende a ter pouca paciência com erro dos outros"],
  },
  ID: {
    resumo: "Comunicativo e determinado. Gosta de conversar e de convencer, e assume a frente quando precisa.",
    pontosFortes: ["Entusiasmado e persuasivo", "Toma iniciativa", "Bom em atendimento e vendas"],
    pontosDeAtencao: ["Pode assumir compromisso demais", "Tende a deixar organização e detalhe de lado"],
  },
  IS: {
    resumo: "Simpático e prestativo. Gosta de gente e de ajudar, e cria um clima bom na equipe.",
    pontosFortes: ["Bom com colegas e clientes", "Paciente para ouvir e explicar", "Ajuda sem precisar pedir"],
    pontosDeAtencao: ["Pode ter dificuldade em dizer não", "Evita conversa difícil"],
  },
  IC: {
    resumo: "Comunicativo e caprichoso. Gosta de conversar, mas também de fazer bem feito e bem explicado.",
    pontosFortes: ["Explica com clareza", "Equilibra bom relacionamento e qualidade", "Bom para treinar e orientar"],
    pontosDeAtencao: ["Pode se abalar com crítica", "Pode oscilar entre empolgação e cuidado demais"],
  },
  SD: {
    resumo: "Constante e firme. Trabalha no seu ritmo, sem pressa, mas não abre mão de entregar o que assumiu.",
    pontosFortes: ["Confiável e persistente", "Mantém a calma em situação difícil", "Cumpre o combinado"],
    pontosDeAtencao: ["Pode resistir a mudança de planos", "Pode guardar insatisfação em vez de falar na hora"],
  },
  SI: {
    resumo: "Tende a ser calmo, paciente e fácil de lidar. Gosta de rotina e de equipe estável, e conversa bem com as pessoas.",
    pontosFortes: ["Constante no dia a dia", "Bom com colegas e clientes", "Ajuda a manter o clima da equipe"],
    pontosDeAtencao: ["Pode estranhar mudança brusca", "Evita conflito e cobrança direta"],
  },
  SC: {
    resumo: "Calmo e metódico. Gosta de rotina bem definida, de seguir o processo e de fazer com cuidado.",
    pontosFortes: ["Organizado e cuidadoso", "Segue o processo sem pular etapa", "Confiável em tarefa repetitiva"],
    pontosDeAtencao: ["Pode demorar a se adaptar a mudanças", "Prefere não decidir sozinho"],
  },
  CD: {
    resumo: "Detalhista e exigente. Quer as coisas certas e bem feitas, e cobra resultado com firmeza.",
    pontosFortes: ["Analisa com cuidado antes de agir", "Alto padrão de qualidade", "Objetivo e direto"],
    pontosDeAtencao: ["Pode parecer frio ou crítico demais", "Tende a centralizar para garantir que saia certo"],
  },
  CI: {
    resumo: "Cuidadoso e cordial. Gosta de fazer certo e de explicar como se faz, com boa conversa.",
    pontosFortes: ["Atenção aos detalhes com bom trato", "Bom para orientar e documentar", "Equilibra qualidade e relacionamento"],
    pontosDeAtencao: ["Pode se preocupar demais com a opinião dos outros", "Pode demorar a concluir por cuidado demais"],
  },
  CS: {
    resumo: "Organizado, preciso e paciente. Gosta de rotina clara e de trabalho bem conferido.",
    pontosFortes: ["Preciso e caprichoso", "Cumpre regra e prazo", "Estável e confiável"],
    pontosDeAtencao: ["Pode estranhar mudança sem aviso", "Prefere não se expor em conflito ou improviso"],
  },
};

/**
 * A explicação do perfil. Um código fora da lista (dado antigo, gravado à
 * mão) cai no texto da letra principal — melhor que um quadro vazio.
 */
export function explicacaoDoPerfil(principal: DiscDimension, segunda: DiscDimension | null): ExplicacaoDoPerfil {
  return EXPLICACOES_DO_DISC[codigoDoPerfil(principal, segunda)] ?? EXPLICACOES_DO_DISC[principal];
}

/** A nota de cada letra, de 0 a 100 — a das barras e a da teia. */
export function notaDaLetra(scores: DiscScores, dim: DiscDimension): number {
  const pct = Number(scores?.[dim]?.pct);
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
}

/**
 * As letras da mais forte para a mais fraca, com o mesmo desempate do
 * `scoreDisc` (a ordem D, I, S, C) — para o destaque das barras bater com o
 * perfil que o teste deu.
 */
export function letrasPorForca(scores: DiscScores): DiscDimension[] {
  return [...DISC_DIMENSIONS].sort((a, b) => {
    const diferenca = notaDaLetra(scores, b) - notaDaLetra(scores, a);
    return diferenca !== 0 ? diferenca : DISC_DIMENSIONS.indexOf(a) - DISC_DIMENSIONS.indexOf(b);
  });
}

/** As duas letras mais fortes — as barras em destaque. */
export function duasMaisFortes(scores: DiscScores): DiscDimension[] {
  return letrasPorForca(scores).slice(0, 2);
}

// ─── A teia ────────────────────────────────────────────────────────────────

/**
 * O eixo de cada letra na teia, em losango: D em cima, I à direita, S embaixo
 * e C à esquerda — a ordem em que as letras se leem, no sentido do relógio.
 */
const DIRECAO: Record<DiscDimension, { x: number; y: number }> = {
  D: { x: 0, y: -1 },
  I: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  C: { x: -1, y: 0 },
};

export type GeometriaDaTeia = { cx: number; cy: number; raio: number };

export type PontoDaTeia = { dim: DiscDimension; x: number; y: number };

const umaCasa = (n: number) => Math.round(n * 10) / 10;

/** Um ponto a `fracao` do raio no eixo da letra (0 é o centro, 1 é a ponta). */
export function pontoNoEixo(dim: DiscDimension, fracao: number, g: GeometriaDaTeia): PontoDaTeia {
  const d = DIRECAO[dim];
  return { dim, x: umaCasa(g.cx + d.x * g.raio * fracao), y: umaCasa(g.cy + d.y * g.raio * fracao) };
}

/** Os quatro cantos da área da nota, em escala: 50% fica no meio do eixo. */
export function pontosDaTeia(scores: DiscScores, g: GeometriaDaTeia): PontoDaTeia[] {
  return DISC_DIMENSIONS.map((dim) => pontoNoEixo(dim, notaDaLetra(scores, dim) / 100, g));
}

/** O `points` de um `<polygon>` do SVG. */
export function pontosDoPoligono(pontos: { x: number; y: number }[]): string {
  return pontos.map((p) => `${p.x},${p.y}`).join(" ");
}

/** O que o leitor de tela ouve no lugar do desenho. */
export function rotuloDaTeia(scores: DiscScores): string {
  return `Gráfico de teia do DISC: ${DISC_DIMENSIONS.map((d) => `${DISC_LABEL[d]} ${notaDaLetra(scores, d)}%`).join(", ")}.`;
}
