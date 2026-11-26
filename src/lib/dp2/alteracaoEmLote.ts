// Alteração de contratos em lote (26/11/2026, funcionalidade-765, entrega 1).
//
// Mudar o mesmo campo do contrato de vários colaboradores de uma vez, como a
// Domínio faz em Utilitários › Alterar Cadastros: o horário de trabalho, o
// centro de custo, o vale-transporte e a autorização da contribuição
// sindical. A tela manda a escolha num valor só ("campo:valor") e a lista de
// pessoas.
//
// Puro, sem banco.

export type CampoEmLote = "HORARIO" | "CENTRO" | "VALE_TRANSPORTE" | "CONTRIBUICAO_SINDICAL";

export const NOME_DO_CAMPO: Record<CampoEmLote, string> = {
  HORARIO: "Horário de trabalho",
  CENTRO: "Centro de custo",
  VALE_TRANSPORTE: "Vale-transporte",
  CONTRIBUICAO_SINDICAL: "Contribuição sindical autorizada",
};

export type AlteracaoEmLote =
  | { campo: "HORARIO"; horarioId: string }
  | { campo: "CENTRO"; costCenterId: string | null }
  | { campo: "VALE_TRANSPORTE"; ligado: boolean }
  | { campo: "CONTRIBUICAO_SINDICAL"; ligado: boolean };

/** O valor do seletor ("HORARIO:<id>", "CENTRO:<id>" ou "CENTRO:", "VALE_TRANSPORTE:sim"…). */
export function lerAlteracao(valor: string): { ok: true; alteracao: AlteracaoEmLote } | { ok: false; erro: string } {
  const [campo, ...resto] = valor.split(":");
  const v = resto.join(":");
  switch (campo) {
    case "HORARIO":
      return v ? { ok: true, alteracao: { campo, horarioId: v } } : { ok: false, erro: "Escolha o horário." };
    case "CENTRO":
      return { ok: true, alteracao: { campo, costCenterId: v || null } };
    case "VALE_TRANSPORTE":
    case "CONTRIBUICAO_SINDICAL":
      if (v !== "sim" && v !== "nao") return { ok: false, erro: "Escolha ligar ou desligar." };
      return { ok: true, alteracao: { campo, ligado: v === "sim" } };
    default:
      return { ok: false, erro: "Escolha o que mudar." };
  }
}

/** Como a mudança aparece na mensagem e na auditoria. */
export function descreverAlteracao(a: AlteracaoEmLote, nome: (a: AlteracaoEmLote) => string | null = () => null): string {
  switch (a.campo) {
    case "HORARIO":
      return `${NOME_DO_CAMPO.HORARIO}: ${nome(a) ?? "o escolhido"}`;
    case "CENTRO":
      return a.costCenterId ? `${NOME_DO_CAMPO.CENTRO}: ${nome(a) ?? "o escolhido"}` : `${NOME_DO_CAMPO.CENTRO}: sem centro de custo`;
    case "VALE_TRANSPORTE":
    case "CONTRIBUICAO_SINDICAL":
      return `${NOME_DO_CAMPO[a.campo]}: ${a.ligado ? "sim" : "não"}`;
  }
}
