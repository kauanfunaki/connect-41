// Os dados societários da ficha da empresa e o quadro societário por data
// (27/11/2026, melhoria-892): objeto social, capital, responsável legal, NIRE
// com a data do registro, e a foto dos sócios depois de cada ato na Junta — o
// que o Domínio guarda nas abas Atividades, Responsável Legal e Quadro
// Societário. Regra pura, sem banco.

import { lerDocumentoFiscal } from "@/lib/companyTaxId";
import { lerDataDoCampo } from "./datas";

/** Os tipos de processo que terminam num registro na Junta (códigos de ProcessType). */
export const TIPOS_COM_REGISTRO_NA_JUNTA: ReadonlySet<string> = new Set([
  "constituicao",
  "alteracao_contratual",
  "distrato_sucessao",
  "reorganizacao_societaria",
  "baixa",
]);

export const LIMITE_DO_OBJETO_SOCIAL = 5000;

// ─── Valores ────────────────────────────────────────────────────────────────

/** "10.000,00", "10000", "10000.5" → reais. Vazio é nulo; o resto que não é número, `undefined`. */
export function lerReais(texto: string | null | undefined): number | null | undefined {
  const t = (texto ?? "").trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  // Com vírgula, o ponto é de milhar ("10.000,50"); sem vírgula, só o último
  // ponto com 1 ou 2 casas depois é decimal ("10000.5").
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /\.\d{1,2}$/.test(t) && (t.match(/\./g) ?? []).length === 1 ? t : t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(normal)) return undefined;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/** O que falta integralizar. Nulo quando falta um dos dois. */
export function aIntegralizar(capitalSocial: number | null, capitalIntegralizado: number | null): number | null {
  if (capitalSocial === null || capitalIntegralizado === null) return null;
  return Math.round((capitalSocial - capitalIntegralizado) * 100) / 100;
}

// ─── O formulário dos dados societários ─────────────────────────────────────

export type DadosSocietarios = {
  nire: string | null;
  juntaRegistradoEm: Date | null;
  objetoSocial: string | null;
  capitalSocial: number | null;
  capitalIntegralizado: number | null;
  responsavelLegalNome: string | null;
  responsavelLegalCpf: string | null;
  responsavelLegalRg: string | null;
  responsavelLegalCargo: string | null;
  responsavelLegalEmail: string | null;
};

const texto = (form: FormData, campo: string, max: number): string | null => {
  const v = String(form.get(campo) ?? "").trim();
  return v ? v.slice(0, max) : null;
};

/** Lê e confere o formulário. A mensagem de erro vai para a tela como está. */
export function lerDadosSocietarios(form: FormData): { ok: true; dados: DadosSocietarios } | { ok: false; erro: string } {
  const nire = (texto(form, "nire", 30) ?? "").replace(/\D/g, "") || null;
  if (nire && (nire.length < 8 || nire.length > 20)) return { ok: false, erro: "O NIRE tem só números (11 na maioria das Juntas)." };

  const data = lerDataDoCampo(form.get("juntaRegistradoEm"));
  if (!data.ok) return { ok: false, erro: "Data do registro inválida." };

  const objeto = String(form.get("objetoSocial") ?? "").trim();
  if (objeto.length > LIMITE_DO_OBJETO_SOCIAL) return { ok: false, erro: `O objeto social passa de ${LIMITE_DO_OBJETO_SOCIAL} caracteres.` };

  const social = lerReais(texto(form, "capitalSocial", 30));
  const integralizado = lerReais(texto(form, "capitalIntegralizado", 30));
  if (social === undefined) return { ok: false, erro: "Capital social deve ser um valor em reais, como 10.000,00." };
  if (integralizado === undefined) return { ok: false, erro: "Capital integralizado deve ser um valor em reais, como 10.000,00." };
  if (social !== null && integralizado !== null && integralizado > social) {
    return { ok: false, erro: "O capital integralizado não pode passar do capital social." };
  }

  const cpfBruto = texto(form, "responsavelLegalCpf", 20);
  let cpf: string | null = null;
  if (cpfBruto) {
    const lido = lerDocumentoFiscal(cpfBruto);
    if (lido?.tipo !== "CPF") return { ok: false, erro: "O CPF do responsável legal não é válido." };
    cpf = cpfBruto.replace(/\D/g, "");
  }
  const email = texto(form, "responsavelLegalEmail", 120)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "O e-mail do responsável legal não parece certo." };

  return {
    ok: true,
    dados: {
      nire,
      juntaRegistradoEm: data.data,
      objetoSocial: objeto || null,
      capitalSocial: social,
      capitalIntegralizado: integralizado,
      responsavelLegalNome: texto(form, "responsavelLegalNome", 180),
      responsavelLegalCpf: cpf,
      responsavelLegalRg: texto(form, "responsavelLegalRg", 30),
      responsavelLegalCargo: texto(form, "responsavelLegalCargo", 80),
      responsavelLegalEmail: email,
    },
  };
}

// ─── A foto do quadro ───────────────────────────────────────────────────────

export type SocioNaFoto = {
  nome: string;
  /** Só dígitos, ou nulo. */
  documento: string | null;
  qualificacao: string | null;
  administrador: boolean;
  percentual: number | null;
  quotas: number | null;
  capital: number | null;
};

type SocioDoBanco = {
  name: string;
  document: string | null;
  qualification: string | null;
  administrator: boolean;
  sharePercent: { toNumber(): number } | null;
  quotas: number | null;
  capitalAmount: { toNumber(): number } | null;
  exitDate: Date | null;
};

/** A foto dos sócios que estão na sociedade agora (sem quem já saiu), administradores primeiro. */
export function fotoDosSocios(socios: SocioDoBanco[]): SocioNaFoto[] {
  return socios
    .filter((s) => s.exitDate === null)
    .map((s) => ({
      nome: s.name,
      documento: s.document,
      qualificacao: s.qualification,
      administrador: s.administrator,
      percentual: s.sharePercent === null ? null : s.sharePercent.toNumber(),
      quotas: s.quotas,
      capital: s.capitalAmount === null ? null : s.capitalAmount.toNumber(),
    }))
    .sort((a, b) => Number(b.administrador) - Number(a.administrador) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O capital da foto: o da ficha, quando informado; senão a soma do capital dos sócios. */
export function capitalDaFoto(capitalDaFicha: number | null, socios: SocioNaFoto[]): number | null {
  if (capitalDaFicha !== null) return capitalDaFicha;
  return socios.some((s) => s.capital !== null) ? Math.round(socios.reduce((t, s) => t + (s.capital ?? 0), 0) * 100) / 100 : null;
}

const numeroOuNulo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const textoOuNulo = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Lê a foto guardada no JSON, sem confiar no formato (linha estranha sai fora). */
export function lerFoto(json: unknown): SocioNaFoto[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((x): SocioNaFoto[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const nome = textoOuNulo(o.nome);
    if (!nome) return [];
    return [
      {
        nome,
        documento: textoOuNulo(o.documento),
        qualificacao: textoOuNulo(o.qualificacao),
        administrador: o.administrador === true,
        percentual: numeroOuNulo(o.percentual),
        quotas: numeroOuNulo(o.quotas),
        capital: numeroOuNulo(o.capital),
      },
    ];
  });
}

export type MudancaNoQuadro = { tipo: "entrou" | "saiu" | "mudou"; nome: string };

/** O que mudou de uma foto para a seguinte, pelo documento (ou pelo nome, sem documento). */
export function mudancasEntre(antes: SocioNaFoto[], depois: SocioNaFoto[]): MudancaNoQuadro[] {
  const chave = (s: SocioNaFoto) => s.documento ?? `nome:${s.nome.trim().toUpperCase()}`;
  const a = new Map(antes.map((s) => [chave(s), s]));
  const d = new Map(depois.map((s) => [chave(s), s]));
  const r: MudancaNoQuadro[] = [];
  for (const [k, s] of d) {
    const velho = a.get(k);
    if (!velho) r.push({ tipo: "entrou", nome: s.nome });
    else if (velho.quotas !== s.quotas || velho.capital !== s.capital || velho.percentual !== s.percentual || velho.administrador !== s.administrador) {
      r.push({ tipo: "mudou", nome: s.nome });
    }
  }
  for (const [k, s] of a) if (!d.has(k)) r.push({ tipo: "saiu", nome: s.nome });
  return r;
}
