// Qual fonte as telas fiscais usam (22/10/2026). Puro.
//
// O motor real tem precedência: com a integração `sped` ligada e completa
// (URL + token de leitura), as telas leem e operam o motor. Sem ela, fica a
// prévia do banco local de desenvolvimento (`bancoFiscalLocal`); e sem as duas,
// o estado "Processamento fiscal indisponível".

export type ModoFiscal = "motor" | "local" | "indisponivel";

export function escolherModo(fontes: { motorConfigurado: boolean; previaLocal: boolean }): ModoFiscal {
  if (fontes.motorConfigurado) return "motor";
  if (fontes.previaLocal) return "local";
  return "indisponivel";
}
