// A candidatura em passos do 41 Carreiras (15/10/2026): Dados → Currículo →
// Perguntas → Revisão. A validação de cada passo, em funções puras, com as
// MESMAS regras da rota `/api/carreiras/apply` — o candidato fica sabendo do
// problema no passo em que ele está, e não só depois de enviar. A rota
// continua conferindo tudo de novo: isto é ajuda, não defesa.

import { MAX_BYTES_DO_CURRICULO, MAX_MB_DO_CURRICULO } from "@/lib/curriculo";
import { UFS } from "@/lib/ufs";

export const PASSOS_DA_CANDIDATURA = [
  { chave: "dados", rotulo: "Seus dados" },
  { chave: "curriculo", rotulo: "Currículo" },
  { chave: "perguntas", rotulo: "Perguntas" },
  { chave: "revisao", rotulo: "Revisão" },
] as const;

export type PassoDaCandidatura = (typeof PASSOS_DA_CANDIDATURA)[number]["chave"];

/** As opções de "Quando pode começar?" — as mesmas do formulário de antes e do WhatsApp. */
export const DISPONIBILIDADES = ["Imediata", "Em até 15 dias", "Em até 30 dias", "Mais de 30 dias"] as const;

/** O que o formulário guarda enquanto o candidato avança. */
export type DadosDaCandidatura = {
  name: string;
  email: string;
  phone: string;
  city: string;
  stateCode: string;
  /** O currículo escolhido (ou null): só o que a validação precisa saber. */
  resume: { nome: string; tipo: string; bytes: number } | null;
  pretensaoSalarial: string;
  disponibilidade: string;
  deslocamentoMinutos: string;
  consent: boolean;
};

export const CANDIDATURA_VAZIA: DadosDaCandidatura = {
  name: "",
  email: "",
  phone: "",
  city: "",
  stateCode: "",
  resume: null,
  pretensaoSalarial: "",
  disponibilidade: "",
  deslocamentoMinutos: "",
  consent: false,
};

export type ErrosDaCandidatura = Partial<Record<keyof DadosDaCandidatura, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UFS_VALIDAS = new Set(UFS.map((u) => u.value));

/** "3.500,00", "3500", "3500.5" → número; vazio ou inválido → NaN. */
export function lerValorEmReais(texto: string): number {
  const s = texto.trim().replace(/^R\$\s*/i, "");
  if (!s) return Number.NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

/** O currículo é aceitável? A rota confere os bytes; aqui, o tipo e o tamanho que o navegador informa. */
export function problemaNoCurriculo(arquivo: { nome: string; tipo: string; bytes: number } | null): string | null {
  if (!arquivo) return null;
  const pdf = arquivo.tipo === "application/pdf" || /\.pdf$/i.test(arquivo.nome);
  if (!pdf) return "O currículo precisa ser um arquivo PDF.";
  if (arquivo.bytes > MAX_BYTES_DO_CURRICULO) return `O currículo tem mais de ${MAX_MB_DO_CURRICULO} MB. Envie um PDF menor.`;
  if (arquivo.bytes === 0) return "Este arquivo está vazio. Escolha outro PDF.";
  return null;
}

/** Os erros de um passo (vazio = pode seguir). */
export function validarPasso(passo: PassoDaCandidatura, d: DadosDaCandidatura): ErrosDaCandidatura {
  const e: ErrosDaCandidatura = {};
  if (passo === "dados") {
    const nome = d.name.trim();
    if (nome.length < 3) e.name = "Informe seu nome completo.";
    else if (nome.length > 120) e.name = "O nome pode ter até 120 caracteres.";
    const email = d.email.trim();
    if (!email) e.email = "Informe seu e-mail.";
    else if (email.length > 120 || !EMAIL.test(email)) e.email = "Confira o e-mail: ele precisa ter o formato nome@provedor.com.";
    if (d.phone.trim().length > 30) e.phone = "O telefone pode ter até 30 caracteres.";
    // Com DDD: 10 ou 11 dígitos no Brasil; até 15 com o código do país.
    else if (d.phone.trim() && (d.phone.replace(/\D/g, "").length < 10 || d.phone.replace(/\D/g, "").length > 15)) {
      e.phone = "Confira o telefone: inclua o DDD (ex.: 41 99999-0000).";
    }
    if (d.city.trim().length > 80) e.city = "A cidade pode ter até 80 caracteres.";
    if (d.stateCode && !UFS_VALIDAS.has(d.stateCode)) e.stateCode = "Escolha o estado na lista.";
  }
  if (passo === "curriculo") {
    const problema = problemaNoCurriculo(d.resume);
    if (problema) e.resume = problema;
  }
  if (passo === "perguntas") {
    const pretensao = lerValorEmReais(d.pretensaoSalarial);
    if (!d.pretensaoSalarial.trim()) e.pretensaoSalarial = "Informe sua pretensão salarial mensal.";
    else if (!Number.isFinite(pretensao) || pretensao <= 0 || pretensao >= 1_000_000) {
      e.pretensaoSalarial = "Informe um valor mensal em reais, maior que zero.";
    }
    if (!d.disponibilidade.trim()) e.disponibilidade = "Diga quando você pode começar.";
    if (d.deslocamentoMinutos.trim()) {
      const n = Number(d.deslocamentoMinutos.trim().replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 600) e.deslocamentoMinutos = "Informe o tempo em minutos, entre 0 e 600.";
    }
  }
  if (passo === "revisao") {
    if (!d.consent) e.consent = "Para enviar, marque a autorização de uso dos dados.";
  }
  return e;
}

/** O primeiro passo com erro (para voltar a ele ao enviar), ou null se está tudo certo. */
export function primeiroPassoComErro(d: DadosDaCandidatura): PassoDaCandidatura | null {
  for (const p of PASSOS_DA_CANDIDATURA) {
    if (Object.keys(validarPasso(p.chave, d)).length > 0) return p.chave;
  }
  return null;
}

/**
 * Os campos que vão para a rota, com os nomes que ela lê. A pretensão vai
 * como número com ponto ("3500.5"), que é o que `validarRespostas` aceita.
 */
export function camposParaEnvio(d: DadosDaCandidatura): Record<string, string> {
  const pretensao = lerValorEmReais(d.pretensaoSalarial);
  return {
    name: d.name.trim(),
    email: d.email.trim(),
    phone: d.phone.trim(),
    city: d.city.trim(),
    stateCode: d.stateCode,
    pretensaoSalarial: Number.isFinite(pretensao) ? String(pretensao) : d.pretensaoSalarial.trim(),
    disponibilidade: d.disponibilidade,
    deslocamentoMinutos: d.deslocamentoMinutos.trim().replace(",", "."),
    consent: d.consent ? "true" : "false",
  };
}

/** "2,4 MB", "312 KB" — o tamanho do currículo escolhido. */
export function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
