// O Fiscal usa exclusivamente a integração configurada do escritório.
export type ModoFiscal = "motor" | "indisponivel";
export function escolherModo(fontes: { motorConfigurado: boolean; previaLocal?: boolean }): ModoFiscal {
  return fontes.motorConfigurado ? "motor" : "indisponivel";
}
