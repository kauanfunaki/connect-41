-- DP 2, fase 3c (12/11/2026, funcionalidade-637): os responsáveis de saúde e
-- segurança da empresa (médico do PCMSO e responsável pelos registros
-- ambientais), para os eventos S-2220 e S-2240. Uma coluna opcional.

-- AlterTable
ALTER TABLE `dp2_empresas_config` ADD COLUMN `sst` JSON NULL;

