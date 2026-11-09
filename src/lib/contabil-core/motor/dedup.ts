// Porte de `_calcular_hash` (`src/domain/extrato/service.py`) do Contábil Core: a chave contra
// duplicidade de transação.
//
// SHA-256 de `json.dumps({"empresa_id", "agencia_id", "fitid"}, sort_keys=True)`. No OFX o FITID vem
// do banco e é a identidade estável; data, valor e histórico podem mudar numa reexportação e não
// entram. No PDF o FITID é gerado pelo leitor e já carrega data, histórico, valor e posição.
//
// Tem de dar exatamente o mesmo resultado do Python: os dados de produção são migrados com o hash
// gravado (decisão de 06/11/2026), e um extrato já importado no Contábil Core precisa continuar sendo
// reconhecido como duplicado aqui. Por isso o texto é o do `json.dumps` do Python (ver `unicodePy`),
// e os ids são os UUIDs originais, em minúsculas e com hífens, como o `str(uuid)`.

import { createHash } from "node:crypto";
import { jsonDumpsOrdenado } from "./unicodePy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Hash de duplicidade de uma transação de extrato. */
export function hashDedup(empresaId: string, agenciaId: string, fitid: string): string {
  // `str(UUID)` do Python sempre sai em minúsculas: um id em maiúsculas daria outro hash em silêncio.
  if (!UUID.test(empresaId) || !UUID.test(agenciaId)) {
    throw new Error("hashDedup: empresa e agência precisam ser UUID em minúsculas.");
  }
  const chave = jsonDumpsOrdenado({ empresa_id: empresaId, agencia_id: agenciaId, fitid });
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

/** SHA-256 dos bytes do arquivo: responde "este arquivo já subiu?" sem abrir o lote. */
export function hashDoArquivo(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}
