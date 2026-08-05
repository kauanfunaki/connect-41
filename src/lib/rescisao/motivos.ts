// Motivo canônico da rescisão + matriz de quais verbas são devidas em cada um.
//
// Por que um motivo canônico em vez do TerminationType cru: o enum tem
// INVOLUNTARIO e SEM_JUSTA_CAUSA descrevendo a MESMA hipótese jurídica, e o
// motor não pode ter dois caminhos pro mesmo direito. O mapa abaixo colapsa
// isso num vocabulário único.

import type { TerminationType } from "@/generated/prisma/enums";
import { FUNDAMENTO } from "./constantes";

export type MotivoCanonico =
  | "DISPENSA_SEM_JUSTA_CAUSA"
  | "PEDIDO_DEMISSAO"
  | "DISPENSA_JUSTA_CAUSA"
  | "TERMINO_PRAZO_DETERMINADO"
  | "TERMINO_EXPERIENCIA"
  | "ACORDO_MUTUO"
  | "RESCISAO_INDIRETA";

export const MOTIVO_LABEL: Record<MotivoCanonico, string> = {
  DISPENSA_SEM_JUSTA_CAUSA: "Dispensa sem justa causa",
  PEDIDO_DEMISSAO: "Pedido de demissão",
  DISPENSA_JUSTA_CAUSA: "Dispensa por justa causa",
  TERMINO_PRAZO_DETERMINADO: "Término de contrato a prazo",
  TERMINO_EXPERIENCIA: "Término do contrato de experiência",
  ACORDO_MUTUO: "Acordo entre as partes (art. 484-A)",
  RESCISAO_INDIRETA: "Rescisão indireta",
};

export function motivoCanonico(type: TerminationType): MotivoCanonico {
  switch (type) {
    case "INVOLUNTARIO":
    case "SEM_JUSTA_CAUSA":
      return "DISPENSA_SEM_JUSTA_CAUSA";
    case "VOLUNTARIO":
      return "PEDIDO_DEMISSAO";
    case "JUSTA_CAUSA":
      return "DISPENSA_JUSTA_CAUSA";
    case "TERMINO_CONTRATO":
      return "TERMINO_PRAZO_DETERMINADO";
    case "EXPERIENCIA":
      return "TERMINO_EXPERIENCIA";
    case "ACORDO_484A":
      return "ACORDO_MUTUO";
    case "RESCISAO_INDIRETA":
      return "RESCISAO_INDIRETA";
  }
}

// ─── Matriz legal ────────────────────────────────────────────────────────────

/** Como o aviso prévio entra na rescisão, por motivo. */
export type TratamentoAviso =
  | "A_RECEBER" // empregado recebe (indenizado) ou cumpre trabalhando
  | "DESCONTO" // empregado deve e não cumpriu → desconta
  | "METADE" // acordo 484-A: metade do indenizado
  | "NAO_HA"; // não existe aviso nessa hipótese

export type RegraVerba = {
  devida: boolean;
  /** Preenchido quando NÃO devida — vai direto pra tela. */
  motivo?: string;
  fundamento?: string;
};

export type MatrizMotivo = {
  saldo_salario: RegraVerba;
  ferias_vencidas: RegraVerba;
  ferias_proporcionais: RegraVerba;
  terco_constitucional: RegraVerba;
  decimo_terceiro: RegraVerba;
  aviso_previo: RegraVerba & { tratamento: TratamentoAviso };
  fgts_deposito: RegraVerba;
  fgts_multa: RegraVerba;
};

const DEVIDA: RegraVerba = { devida: true };

// Saldo de salário e férias vencidas são devidos em TODAS as hipóteses,
// inclusive justa causa (CLT art. 146 caput) — é o erro mais comum na prática.
export const MATRIZ: Record<MotivoCanonico, MatrizMotivo> = {
  DISPENSA_SEM_JUSTA_CAUSA: {
    saldo_salario: DEVIDA,
    ferias_vencidas: DEVIDA,
    ferias_proporcionais: DEVIDA,
    terco_constitucional: DEVIDA,
    decimo_terceiro: DEVIDA,
    aviso_previo: { devida: true, tratamento: "A_RECEBER" },
    fgts_deposito: DEVIDA,
    fgts_multa: DEVIDA,
  },

  RESCISAO_INDIRETA: {
    saldo_salario: DEVIDA,
    ferias_vencidas: DEVIDA,
    ferias_proporcionais: DEVIDA,
    terco_constitucional: DEVIDA,
    decimo_terceiro: DEVIDA,
    // Equipara-se à dispensa sem justa causa (CLT art. 483).
    aviso_previo: { devida: true, tratamento: "A_RECEBER" },
    fgts_deposito: DEVIDA,
    fgts_multa: DEVIDA,
  },

  PEDIDO_DEMISSAO: {
    saldo_salario: DEVIDA,
    ferias_vencidas: DEVIDA,
    // Devidas mesmo com menos de 12 meses de casa.
    ferias_proporcionais: { devida: true, fundamento: FUNDAMENTO.FERIAS_PEDIDO_DEMISSAO },
    terco_constitucional: DEVIDA,
    decimo_terceiro: DEVIDA,
    // Quem pede demissão DEVE o aviso; se não cumpre nem é dispensado, desconta.
    aviso_previo: { devida: true, tratamento: "DESCONTO", fundamento: FUNDAMENTO.AVISO_DESCONTO },
    fgts_deposito: DEVIDA,
    fgts_multa: {
      devida: false,
      motivo: "Não há multa rescisória em pedido de demissão.",
      fundamento: FUNDAMENTO.FGTS_MULTA,
    },
  },

  DISPENSA_JUSTA_CAUSA: {
    saldo_salario: DEVIDA,
    // Vencidas continuam devidas — o direito já estava adquirido.
    ferias_vencidas: { devida: true, fundamento: FUNDAMENTO.FERIAS_VENCIDAS },
    ferias_proporcionais: {
      devida: false,
      motivo: "Férias proporcionais não são devidas em dispensa por justa causa.",
      fundamento: FUNDAMENTO.FERIAS_JUSTA_CAUSA,
    },
    // Incide só sobre as vencidas — o cálculo trata isso.
    terco_constitucional: DEVIDA,
    decimo_terceiro: {
      devida: false,
      motivo: "13º proporcional não é devido em dispensa por justa causa.",
      fundamento: FUNDAMENTO.DECIMO_TERCEIRO_JUSTA_CAUSA,
    },
    aviso_previo: { devida: false, tratamento: "NAO_HA", motivo: "Não há aviso prévio em justa causa." },
    fgts_deposito: DEVIDA,
    fgts_multa: {
      devida: false,
      motivo: "Não há multa rescisória em dispensa por justa causa.",
      fundamento: FUNDAMENTO.FGTS_MULTA,
    },
  },

  ACORDO_MUTUO: {
    saldo_salario: DEVIDA,
    ferias_vencidas: DEVIDA,
    ferias_proporcionais: DEVIDA,
    terco_constitucional: DEVIDA,
    decimo_terceiro: DEVIDA,
    aviso_previo: { devida: true, tratamento: "METADE", fundamento: FUNDAMENTO.ACORDO },
    fgts_deposito: DEVIDA,
    // 20% em vez de 40%.
    fgts_multa: { devida: true, fundamento: FUNDAMENTO.ACORDO },
  },

  TERMINO_PRAZO_DETERMINADO: {
    saldo_salario: DEVIDA,
    ferias_vencidas: DEVIDA,
    ferias_proporcionais: DEVIDA,
    terco_constitucional: DEVIDA,
    decimo_terceiro: DEVIDA,
    // Chegando ao termo final não há aviso (Súm. 163 TST cobre só o caso de
    // cláusula assecuratória, que o motor v1 assume inexistente).
    aviso_previo: {
      devida: false,
      tratamento: "NAO_HA",
      motivo: "Não há aviso prévio no término normal do contrato a prazo.",
    },
    fgts_deposito: DEVIDA,
    fgts_multa: {
      devida: false,
      motivo: "Não há multa quando o contrato a prazo chega ao termo final.",
      fundamento: FUNDAMENTO.FGTS_MULTA,
    },
  },

  TERMINO_EXPERIENCIA: {
    saldo_salario: DEVIDA,
    ferias_vencidas: DEVIDA,
    ferias_proporcionais: DEVIDA,
    terco_constitucional: DEVIDA,
    decimo_terceiro: DEVIDA,
    aviso_previo: {
      devida: false,
      tratamento: "NAO_HA",
      motivo: "Não há aviso prévio no término normal do contrato de experiência.",
    },
    fgts_deposito: DEVIDA,
    fgts_multa: {
      devida: false,
      motivo: "Não há multa quando a experiência chega ao termo final.",
      fundamento: FUNDAMENTO.FGTS_MULTA,
    },
  },
};

export function regraDaVerba<K extends keyof MatrizMotivo>(motivo: MotivoCanonico, verba: K): MatrizMotivo[K] {
  return MATRIZ[motivo][verba];
}
