// A importação do histórico do 41 Hub para a Academia (10/11/2026, pedido do
// Kauan) — uma vez só; o Hub segue no ar como está. A parte pura: ler os CSVs
// que `scripts/academia/exportar-do-hub.sql` gera (psql `\copy … CSV HEADER`)
// e montar o plano do que entra. Quem lê a pasta e grava é
// `scripts/academia/importar-do-hub.ts`.
//
// - Pessoas casam pelo e-mail (sem diferença de maiúscula) com a equipe do
//   escritório no Connect. Quem não casa fica de fora e só entra na contagem.
// - Textos, questões e resultados levam o id do Hub (`origemHubId`): rodar de
//   novo não duplica.
// - Resultado importado entra valendo, no mês em que foi feito no Hub.
// - Questão com imagem entra **desligada** e sem a imagem: a imagem mora no
//   servidor do Hub (`/api/uploads/…`) e não vem no CSV. A contagem diz
//   quantas são, para reenviar a imagem pela Academia e ligar a questão.

import { parseCsv } from "@/lib/csv";
import { nivelDaDificuldadeDoHub, nivelDoHub, type Nivel, type Teste } from "./regras";

export const ARQUIVOS_DO_HUB = {
  textos: "typing_texts.csv",
  questoes: "logic_questions.csv",
  digitacao: "typing_scores.csv",
  logica: "logic_scores.csv",
  usuarios: "users.csv",
} as const;

type Registro = Record<string, string>;

/** O CSV como objetos, pelo nome da coluna. */
export function lerCsvDoHub(texto: string): Registro[] {
  const { headers, rows } = parseCsv(texto);
  const nomes = headers.map((h) => h.trim().toLowerCase());
  return rows.map((r) => Object.fromEntries(nomes.map((n, i) => [n, r[i] ?? ""])));
}

/** Booleano do Postgres no CSV: "t"/"f" (e "true"/"false", por garantia). */
const booleano = (v: string | undefined) => ["t", "true", "1"].includes((v ?? "").trim().toLowerCase());
const inteiro = (v: string | undefined) => {
  const n = Number.parseInt((v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
};
const decimal = (v: string | undefined) => {
  const n = Number.parseFloat((v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};
/** "2026-10-05 13:22:11.123+00" → Date; inválido → nulo. */
function instante(v: string | undefined): Date | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const iso = t.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
const ehMesValido = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export type TextoImportado = { origemHubId: string; nivel: Nivel; conteudo: string; ativo: boolean };
export type QuestaoImportada = {
  origemHubId: string; nivel: Nivel; enunciado: string; alternativas: { texto: string }[]; correta: number; ativo: boolean; tinhaImagem: boolean;
};
export type ResultadoImportado = {
  origemHubId: string; userId: string; sectorCode: string | null; teste: Teste; nivel: Nivel; mes: string;
  ppm: number | null; acertos: number | null; total: number | null; precisao: number; duracaoMs: number; createdAt: Date;
};

export type PessoaDoConnect = { id: string; sectorCode: string | null };

export type ResumoDaImportacao = {
  textos: { novos: number; jaImportados: number; descartados: number };
  questoes: { novas: number; jaImportadas: number; descartadas: number; comImagem: number };
  resultados: { novos: number; jaImportados: number; descartados: number; semPessoa: number };
  emailsSemPessoa: number;
};

export type PlanoDaImportacao = {
  textos: TextoImportado[];
  questoes: QuestaoImportada[];
  resultados: ResultadoImportado[];
  resumo: ResumoDaImportacao;
};

/** Só o português: o Connect não tem idioma no teste, e o Hub nasceu em "pt". */
const ehPortugues = (r: Registro) => !r.language || r.language.trim().toLowerCase().startsWith("pt");

export function textoDoHub(r: Registro): TextoImportado | null {
  const conteudo = (r.content ?? "").trim();
  const dificuldade = inteiro(r.difficulty);
  if (!r.id || !conteudo || dificuldade === null || !ehPortugues(r)) return null;
  return { origemHubId: r.id.trim(), nivel: nivelDaDificuldadeDoHub(dificuldade), conteudo, ativo: booleano(r.is_active) };
}

export function questaoDoHub(r: Registro): QuestaoImportada | null {
  const enunciado = (r.question ?? "").trim();
  const dificuldade = inteiro(r.difficulty);
  const correta = inteiro(r.correct_index);
  let opcoes: unknown;
  try {
    opcoes = JSON.parse(r.options ?? "");
  } catch {
    return null;
  }
  if (!r.id || !enunciado || dificuldade === null || correta === null || !Array.isArray(opcoes) || !ehPortugues(r)) return null;
  const alternativas = opcoes.filter((o): o is string => typeof o === "string" && o.trim() !== "").map((texto) => ({ texto: texto.trim() }));
  if (alternativas.length < 2 || correta < 0 || correta >= alternativas.length || alternativas.length !== opcoes.length) return null;
  const tinhaImagem = Boolean((r.image_url ?? "").trim());
  return {
    origemHubId: r.id.trim(), nivel: nivelDaDificuldadeDoHub(dificuldade), enunciado, alternativas, correta,
    ativo: booleano(r.is_active) && !tinhaImagem, tinhaImagem,
  };
}

/** O nível do resultado: o que o Hub gravou ("easy"…) e, sem ele, o da dificuldade. */
function nivelDoResultado(r: Registro): Nivel | null {
  const dificuldade = inteiro(r.difficulty);
  return nivelDoHub(r.level) ?? (dificuldade === null ? null : nivelDaDificuldadeDoHub(dificuldade));
}

export function resultadoDoHub(teste: Teste, r: Registro, pessoa: PessoaDoConnect): ResultadoImportado | null {
  const nivel = nivelDoResultado(r);
  const precisao = decimal(r.accuracy);
  const duracaoMs = inteiro(r.duration_ms);
  const mes = (r.month_key ?? "").trim();
  const createdAt = instante(r.created_at);
  if (!r.id || !nivel || precisao === null || precisao < 0 || precisao > 100 || duracaoMs === null || duracaoMs <= 0 || !ehMesValido(mes) || !createdAt) return null;
  const base = { userId: pessoa.id, sectorCode: pessoa.sectorCode, teste, nivel, mes, precisao: Math.round(precisao * 100) / 100, duracaoMs, createdAt };
  if (teste === "logica") {
    const acertos = inteiro(r.correct_count);
    const total = inteiro(r.total_questions);
    if (acertos === null || total === null || total <= 0 || acertos < 0 || acertos > total) return null;
    // O prefixo separa os ids das duas tabelas do Hub, que caem na mesma tabela aqui.
    return { ...base, origemHubId: `logic:${r.id.trim()}`, ppm: null, acertos, total };
  }
  const ppm = inteiro(r.wpm);
  if (ppm === null || ppm <= 0) return null;
  return { ...base, origemHubId: `typing:${r.id.trim()}`, ppm, acertos: null, total: null };
}

/**
 * O plano: o que entra, o que já tinha entrado e o que fica de fora. Nada de
 * dado pessoal no resumo — só contagens.
 */
export function planejarImportacao(entrada: {
  textos: Registro[];
  questoes: Registro[];
  digitacao: Registro[];
  logica: Registro[];
  usuariosDoHub: Registro[];
  /** E-mail em minúsculas → pessoa da equipe no Connect (deste escritório). */
  pessoasPorEmail: ReadonlyMap<string, PessoaDoConnect>;
  jaImportados: { textos: ReadonlySet<string>; questoes: ReadonlySet<string>; resultados: ReadonlySet<string> };
}): PlanoDaImportacao {
  const resumo: ResumoDaImportacao = {
    textos: { novos: 0, jaImportados: 0, descartados: 0 },
    questoes: { novas: 0, jaImportadas: 0, descartadas: 0, comImagem: 0 },
    resultados: { novos: 0, jaImportados: 0, descartados: 0, semPessoa: 0 },
    emailsSemPessoa: 0,
  };

  const textos: TextoImportado[] = [];
  for (const r of entrada.textos) {
    const t = textoDoHub(r);
    if (!t) resumo.textos.descartados++;
    else if (entrada.jaImportados.textos.has(t.origemHubId)) resumo.textos.jaImportados++;
    else textos.push(t);
  }
  resumo.textos.novos = textos.length;

  const questoes: QuestaoImportada[] = [];
  for (const r of entrada.questoes) {
    const q = questaoDoHub(r);
    if (!q) resumo.questoes.descartadas++;
    else if (entrada.jaImportados.questoes.has(q.origemHubId)) resumo.questoes.jaImportadas++;
    else {
      questoes.push(q);
      if (q.tinhaImagem) resumo.questoes.comImagem++;
    }
  }
  resumo.questoes.novas = questoes.length;

  // id do Hub → e-mail → pessoa do Connect.
  const emailDoHub = new Map(entrada.usuariosDoHub.map((u) => [(u.id ?? "").trim(), (u.email ?? "").trim().toLowerCase()]));
  const emailsSemPessoa = new Set<string>();
  const pessoaDoHub = (hubUserId: string): PessoaDoConnect | null => {
    const email = emailDoHub.get(hubUserId.trim());
    if (!email) return null;
    const p = entrada.pessoasPorEmail.get(email) ?? null;
    if (!p) emailsSemPessoa.add(email);
    return p;
  };

  const resultados: ResultadoImportado[] = [];
  const somar = (teste: Teste, linhas: Registro[]) => {
    for (const r of linhas) {
      const pessoa = pessoaDoHub(r.user_id ?? "");
      if (!pessoa) {
        resumo.resultados.semPessoa++;
        continue;
      }
      const res = resultadoDoHub(teste, r, pessoa);
      if (!res) resumo.resultados.descartados++;
      else if (entrada.jaImportados.resultados.has(res.origemHubId)) resumo.resultados.jaImportados++;
      else resultados.push(res);
    }
  };
  somar("digitacao", entrada.digitacao);
  somar("logica", entrada.logica);
  resumo.resultados.novos = resultados.length;
  resumo.emailsSemPessoa = emailsSemPessoa.size;

  return { textos, questoes, resultados, resumo };
}

/** O resumo em linhas, para o terminal (só números). */
export function resumoEmLinhas(r: ResumoDaImportacao): string[] {
  return [
    `Textos de digitação: ${r.textos.novos} novos, ${r.textos.jaImportados} já importados, ${r.textos.descartados} descartados (inválidos ou fora do português).`,
    `Questões de lógica: ${r.questoes.novas} novas, ${r.questoes.jaImportadas} já importadas, ${r.questoes.descartadas} descartadas. Novas com imagem: ${r.questoes.comImagem} (entram desligadas e sem a imagem — reenvie pela Academia e ligue).`,
    `Resultados: ${r.resultados.novos} novos, ${r.resultados.jaImportados} já importados, ${r.resultados.descartados} descartados, ${r.resultados.semPessoa} sem pessoa no Connect.`,
    `E-mails do Hub sem pessoa da equipe no Connect: ${r.emailsSemPessoa}.`,
  ];
}
