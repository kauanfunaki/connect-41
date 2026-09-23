// Triagem de currículos (R1) — a parte que não é IA.
//
// A IA faz duas coisas estreitas: (1) lê o PDF e devolve o perfil profissional,
// num formato sem campo para nome, idade, cidade, foto ou gênero; (2) diz, para
// cada requisito da vaga, se o perfil atende e onde está a evidência. **A nota
// sai daqui, do código**: média ponderada dos veredictos, e a faixa pelos cortes
// da vaga. Nota que o modelo inventa inteira é número que ninguém explica;
// esta se refaz na mão a partir da tabela de requisitos.
//
// Duas regras de 01/09 (ver Demanda-Recrutamento no vault):
// - a nota **ordena, nunca descarta** — quem reprova é gente (LGPD, art. 20);
// - o pontuador **não recebe atributo protegido** — por isso a localidade não é
//   requisito que a IA avalia (cidade é proxy de classe).

export type TipoDeRequisito = "OBRIGATORIO" | "DESEJAVEL";

export type Requisito = {
  id: string; // estável dentro da versão: r1, r2…
  tipo: TipoDeRequisito;
  texto: string;
  /** 1 = pouco, 2 = médio, 3 = muito. Obrigatório ainda dobra. */
  peso: 1 | 2 | 3;
};

export type Requisitos = {
  itens: Requisito[];
  /** Nota a partir da qual o candidato é Compatível. */
  corteCompativel: number;
  /** Nota a partir da qual é Parcial; abaixo, Incompatível. */
  corteParcial: number;
};

export const CORTES_PADRAO = { corteCompativel: 75, corteParcial: 45 } as const;
export const MAX_REQUISITOS = 20;

export type Veredito = "SIM" | "PARCIAL" | "NAO" | "SEM_EVIDENCIA";
export type AvaliacaoDeRequisito = { requisitoId: string; veredito: Veredito; evidencia: string };

export type Faixa = "COMPATIVEL" | "PARCIAL" | "INCOMPATIVEL";
export const ROTULO_DA_FAIXA: Record<Faixa, string> = {
  COMPATIVEL: "Compatível",
  PARCIAL: "Parcial",
  INCOMPATIVEL: "Incompatível",
};
export const ROTULO_DO_VEREDITO: Record<Veredito, string> = {
  SIM: "Atende",
  PARCIAL: "Atende em parte",
  NAO: "Não atende",
  SEM_EVIDENCIA: "Sem evidência no currículo",
};

const VALOR: Record<Veredito, number> = { SIM: 1, PARCIAL: 0.5, NAO: 0, SEM_EVIDENCIA: 0 };

export function pesoEfetivo(r: Requisito): number {
  return r.peso * (r.tipo === "OBRIGATORIO" ? 2 : 1);
}

export type Nota = {
  score: number; // 0–100
  faixa: Faixa;
  /** Obrigatórios que o currículo mostra que o candidato NÃO atende. */
  obrigatoriosNaoAtendidos: string[];
};

/**
 * A nota a partir dos veredictos.
 *
 * **Obrigatório com "não atende" limita a faixa a Parcial**, por mais alta que
 * seja a média — senão um candidato ótimo em tudo menos no que a vaga exige
 * apareceria no topo como Compatível. "Sem evidência" não limita: currículo
 * omite muita coisa, e o recrutador confirma na conversa. Requisito sem
 * veredito conta como sem evidência.
 */
export function calcularNota(req: Requisitos, avaliacoes: AvaliacaoDeRequisito[]): Nota {
  const porId = new Map(avaliacoes.map((a) => [a.requisitoId, a.veredito]));
  let total = 0;
  let obtido = 0;
  const obrigatoriosNaoAtendidos: string[] = [];
  for (const r of req.itens) {
    const v = porId.get(r.id) ?? "SEM_EVIDENCIA";
    const p = pesoEfetivo(r);
    total += p;
    obtido += p * VALOR[v];
    if (r.tipo === "OBRIGATORIO" && v === "NAO") obrigatoriosNaoAtendidos.push(r.id);
  }
  const score = total > 0 ? Math.round((obtido / total) * 100) : 0;
  let faixa: Faixa = score >= req.corteCompativel ? "COMPATIVEL" : score >= req.corteParcial ? "PARCIAL" : "INCOMPATIVEL";
  if (faixa === "COMPATIVEL" && obrigatoriosNaoAtendidos.length > 0) faixa = "PARCIAL";
  return { score, faixa, obrigatoriosNaoAtendidos };
}

const ORDEM_DA_FAIXA: Record<Faixa, number> = { COMPATIVEL: 0, PARCIAL: 1, INCOMPATIVEL: 2 };

type ComNota = { nota: Pick<Nota, "score" | "faixa"> | null };

/** Ordena para a triagem: faixa, depois nota; sem nota vai para o fim, sem sumir. */
export function compararParaTriagem(a: ComNota, b: ComNota): number {
  if (!a.nota || !b.nota) return a.nota ? -1 : b.nota ? 1 : 0;
  return ORDEM_DA_FAIXA[a.nota.faixa] - ORDEM_DA_FAIXA[b.nota.faixa] || b.nota.score - a.nota.score;
}

/**
 * Requisitos válidos, ou a mensagem do que está errado. Ids são refeitos em
 * ordem (r1, r2…): o id vale dentro de uma versão, e cada gravação é versão nova.
 */
export function normalizarRequisitos(v: unknown): Requisitos | { erro: string } {
  if (!v || typeof v !== "object") return { erro: "Requisitos inválidos." };
  const o = v as Record<string, unknown>;
  const brutos = Array.isArray(o.itens) ? o.itens : [];
  const itens: Requisito[] = [];
  for (const b of brutos) {
    if (!b || typeof b !== "object") continue;
    const x = b as Record<string, unknown>;
    const texto = String(x.texto ?? "").trim().replace(/\s+/g, " ");
    if (!texto) continue;
    if (texto.length > 300) return { erro: "Cada requisito tem no máximo 300 caracteres." };
    const peso = Number(x.peso);
    itens.push({
      id: `r${itens.length + 1}`,
      tipo: x.tipo === "OBRIGATORIO" ? "OBRIGATORIO" : "DESEJAVEL",
      texto,
      peso: peso === 1 || peso === 3 ? peso : 2,
    });
  }
  if (itens.length === 0) return { erro: "Cadastre ao menos um requisito." };
  if (itens.length > MAX_REQUISITOS) return { erro: `No máximo ${MAX_REQUISITOS} requisitos por vaga.` };
  const corteCompativel = Math.round(Number(o.corteCompativel ?? CORTES_PADRAO.corteCompativel));
  const corteParcial = Math.round(Number(o.corteParcial ?? CORTES_PADRAO.corteParcial));
  if (!Number.isFinite(corteCompativel) || !Number.isFinite(corteParcial) || corteParcial < 1 || corteCompativel > 100 || corteParcial >= corteCompativel) {
    return { erro: "Cortes inválidos: o de Parcial tem de ficar abaixo do de Compatível, entre 1 e 100." };
  }
  return { itens, corteCompativel, corteParcial };
}

// ─── Perfil profissional (saída da 1ª chamada de IA) ──────────────────────

/**
 * O que o pontuador enxerga do candidato. **Não tem campo para nome, idade,
 * data de nascimento, cidade, endereço, foto, gênero, estado civil, filhos,
 * religião ou deficiência** — o formato é a trava, não a instrução.
 */
export type PerfilProfissional = {
  formacao: { nivel: string; curso: string; situacao: string }[];
  experiencias: { cargo: string; area: string; meses: number | null; atividades: string }[];
  habilidades: string[];
  certificacoes: string[];
  idiomas: { idioma: string; nivel: string }[];
};

const corta = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const lista = <T>(x: unknown, max: number, f: (i: Record<string, unknown>) => T): T[] =>
  Array.isArray(x) ? x.filter((i) => i && typeof i === "object").slice(0, max).map((i) => f(i as Record<string, unknown>)) : [];

/** Normaliza o que a IA devolveu: corta tamanho e descarta qualquer campo fora do formato. */
export function normalizarPerfil(v: unknown): PerfilProfissional {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const textos = (x: unknown, max: number, n: number) =>
    Array.isArray(x) ? x.map((s) => corta(s, n)).filter(Boolean).slice(0, max) : [];
  return {
    formacao: lista(o.formacao, 10, (i) => ({ nivel: corta(i.nivel, 60), curso: corta(i.curso, 120), situacao: corta(i.situacao, 40) })),
    experiencias: lista(o.experiencias, 15, (i) => {
      const m = i.meses === null || i.meses === undefined || i.meses === "" ? NaN : Number(i.meses);
      return { cargo: corta(i.cargo, 120), area: corta(i.area, 80), meses: Number.isFinite(m) && m >= 0 ? Math.round(m) : null, atividades: corta(i.atividades, 600) };
    }),
    habilidades: textos(o.habilidades, 40, 80),
    certificacoes: textos(o.certificacoes, 20, 120),
    idiomas: lista(o.idiomas, 8, (i) => ({ idioma: corta(i.idioma, 40), nivel: corta(i.nivel, 40) })),
  };
}

/** Normaliza os veredictos: só requisitos que existem, um por requisito, evidência curta. */
export function normalizarAvaliacoes(v: unknown, req: Requisitos): AvaliacaoDeRequisito[] {
  const ids = new Set(req.itens.map((r) => r.id));
  const vistos = new Set<string>();
  const out: AvaliacaoDeRequisito[] = [];
  for (const i of Array.isArray(v) ? v : []) {
    if (!i || typeof i !== "object") continue;
    const x = i as Record<string, unknown>;
    const id = String(x.requisitoId ?? "");
    if (!ids.has(id) || vistos.has(id)) continue;
    const veredito = (["SIM", "PARCIAL", "NAO", "SEM_EVIDENCIA"] as const).find((k) => k === x.veredito) ?? "SEM_EVIDENCIA";
    vistos.add(id);
    out.push({ requisitoId: id, veredito, evidencia: corta(x.evidencia, 400) });
  }
  return out;
}

/**
 * A falha é do agente (teto do mês, agente desligado, sem chave) e não da
 * candidatura? Aí não adianta seguir com a próxima — e não se marca a
 * candidatura como problemática, porque o currículo dela não tem culpa.
 * Os textos vêm de `TEXTO` em src/lib/ia/execucao.ts.
 */
export function ehBloqueioDoAgente(erro: string): boolean {
  return /teto de|agente está desligado|chave de IA/i.test(erro);
}
