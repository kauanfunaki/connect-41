// A vigilância da inscrição estadual (robô 3 do Societário, 30/10/2026): o
// robô emite o CICAD na Receita do PR, lê o campo "Situação Atual" e o Connect
// guarda a situação na empresa, avisando o Societário quando ela muda.
//
// Aqui só a regra, sem banco: o que o texto lido quer dizer, quando avisar e
// quais empresas vigiar. A gravação está em ./inscricaoEstadualServidor.ts. A
// leitura da tela é do programa da máquina e só entra depois de testada contra
// a página real, como a do SIMA.

export const SITUACOES_DA_IE = ["ATIVA", "SUSPENSA", "BAIXADA", "CANCELADA"] as const;
export type SituacaoDaIE = (typeof SITUACOES_DA_IE)[number];

export const ROTULO_DA_SITUACAO_DA_IE: Record<SituacaoDaIE, string> = {
  ATIVA: "ativa",
  SUSPENSA: "suspensa",
  BAIXADA: "baixada",
  CANCELADA: "cancelada",
};

/** De quanto em quanto tempo a mesma empresa é lida de novo. */
export const INTERVALO_DA_VIGILANCIA_DIAS = 7;

/** A vigilância é da Receita do PR: a IE de outro estado fica de fora. */
export const UF_DA_VIGILANCIA = "PR";

// O CICAD escreve no masculino ou no feminino, com ou sem acento, às vezes com
// a data junto ("SUSPENSO DESDE 01/10/2026"). Vale o começo da palavra.
const RADICAIS: [string, SituacaoDaIE][] = [
  ["ATIV", "ATIVA"],
  ["HABILITAD", "ATIVA"],
  ["SUSPENS", "SUSPENSA"],
  ["BAIXAD", "BAIXADA"],
  ["CANCELAD", "CANCELADA"],
];

/**
 * O que o texto do campo "Situação Atual" quer dizer. Nulo quando não é
 * nenhuma das quatro: a situação gravada fica como estava, em vez de virar
 * palpite. "Inativa" não é "ativa": o radical precisa estar no começo.
 */
export function lerSituacaoDaIE(texto: string | null | undefined): SituacaoDaIE | null {
  const t = (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
  if (!t) return null;
  const primeira = t.split(/[^A-Z]+/).find(Boolean) ?? "";
  for (const [radical, situacao] of RADICAIS) if (primeira.startsWith(radical)) return situacao;
  return null;
}

export function ehSituacaoDaIE(valor: string | null | undefined): valor is SituacaoDaIE {
  return (SITUACOES_DA_IE as readonly string[]).includes(valor ?? "");
}

export type AvisoDaIE = { tom: "danger" | "success"; mensagem: string };

/**
 * Quando a leitura nova vale um aviso ao Societário. A primeira leitura ativa
 * não avisa (é o normal); a primeira fora de ativa avisa, porque ninguém sabia.
 * Voltar a ficar ativa também avisa, para quem estava tratando a suspensão.
 */
export function avisoDaMudancaDaIE(anterior: SituacaoDaIE | null, nova: SituacaoDaIE, empresa: string): AvisoDaIE | null {
  if (anterior === nova) return null;
  if (nova === "ATIVA") {
    if (anterior === null) return null;
    return { tom: "success", mensagem: `Inscrição estadual de ${empresa} voltou a ficar ativa` };
  }
  const de = anterior ? `passou de ${ROTULO_DA_SITUACAO_DA_IE[anterior]} para` : "está";
  return { tom: "danger", mensagem: `Inscrição estadual de ${empresa} ${de} ${ROTULO_DA_SITUACAO_DA_IE[nova]}` };
}

export type EmpresaParaVigiar = {
  stateRegistration: string | null;
  stateCode: string | null;
  stateRegistrationCheckedAt: Date | null;
};

/** Tem inscrição de verdade: "ISENTO" e afins não têm dígito. */
export function temInscricaoEstadual(ie: string | null | undefined): boolean {
  return /\d/.test(ie ?? "");
}

/** A empresa entra na próxima rodada: IE do PR, nunca lida ou lida há uma semana. */
export function precisaVigiarIE(e: EmpresaParaVigiar, agora: Date): boolean {
  if (!temInscricaoEstadual(e.stateRegistration)) return false;
  if ((e.stateCode ?? "").toUpperCase() !== UF_DA_VIGILANCIA) return false;
  if (!e.stateRegistrationCheckedAt) return true;
  return agora.getTime() - e.stateRegistrationCheckedAt.getTime() >= INTERVALO_DA_VIGILANCIA_DIAS * 86_400_000;
}
