-- DP 2 · eSocial: o evento que retifica, exclui (S-3000) ou reabre (S-1298) aponta para o alvo (25/11/2026, funcionalidade-754). Só acrescenta a coluna, nula.
ALTER TABLE `dp2_eventos_esocial` ADD COLUMN `alvoId` VARCHAR(36) NULL;
