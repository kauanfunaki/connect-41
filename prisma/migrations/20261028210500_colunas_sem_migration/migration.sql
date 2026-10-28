-- O banco do zero pelas migrations (lote 5, 28/10/2026), segunda parte:
-- colunas e índices que a produção ganhou por fora, sem migration. Montando
-- um banco vazio pela cadeia e comparando com o schema (colunas, índices e
-- chaves), faltavam estes.
--
-- Cada passo confere na information_schema e só age se faltar: na produção,
-- onde tudo já existe, esta migration não muda nada. O MySQL 8 não tem
-- "ADD COLUMN IF NOT EXISTS", por isso o SQL montado e o PREPARE.
--
-- Ficam de fora de propósito: `canvas_pages` (saiu do schema; não se apaga
-- tabela por migration de alinhamento) e dois índices com nome diferente do
-- schema (`handoff_sector_assignees_userId_idx`, `companies_tenantId_parentCompanyId_idx`),
-- que não mudam o que o banco faz.

-- people.isInternal
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND COLUMN_NAME = 'isInternal') = 0,
  'ALTER TABLE `people` ADD COLUMN `isInternal` BOOLEAN NOT NULL DEFAULT false', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

-- people.linkedUserId
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND COLUMN_NAME = 'linkedUserId') = 0,
  'ALTER TABLE `people` ADD COLUMN `linkedUserId` VARCHAR(191) NULL', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND INDEX_NAME = 'people_linkedUserId_key') = 0,
  'CREATE UNIQUE INDEX `people_linkedUserId_key` ON `people`(`linkedUserId`)', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND INDEX_NAME = 'people_tenantId_isInternal_idx') = 0,
  'CREATE INDEX `people_tenantId_isInternal_idx` ON `people`(`tenantId`, `isInternal`)', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'people' AND CONSTRAINT_NAME = 'people_linkedUserId_fkey') = 0,
  'ALTER TABLE `people` ADD CONSTRAINT `people_linkedUserId_fkey` FOREIGN KEY (`linkedUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

-- chatwoot_conversations.assigneeId e resolvedAt
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chatwoot_conversations' AND COLUMN_NAME = 'assigneeId') = 0,
  'ALTER TABLE `chatwoot_conversations` ADD COLUMN `assigneeId` INTEGER NULL', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chatwoot_conversations' AND COLUMN_NAME = 'resolvedAt') = 0,
  'ALTER TABLE `chatwoot_conversations` ADD COLUMN `resolvedAt` DATETIME(3) NULL', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chatwoot_conversations' AND INDEX_NAME = 'chatwoot_conversations_tenantId_resolvedAt_idx') = 0,
  'CREATE INDEX `chatwoot_conversations_tenantId_resolvedAt_idx` ON `chatwoot_conversations`(`tenantId`, `resolvedAt`)', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

-- pipeline_stages.type
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pipeline_stages' AND COLUMN_NAME = 'type') = 0,
  'ALTER TABLE `pipeline_stages` ADD COLUMN `type` ENUM(''NOT_STARTED'', ''IN_PROGRESS'', ''PENDING'', ''DONE'') NOT NULL DEFAULT ''NOT_STARTED''', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;

-- companies.taxRegime: o schema tem 100; só alarga, nunca encurta.
SET @sql := IF((SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'taxRegime') < 100,
  'ALTER TABLE `companies` MODIFY `taxRegime` VARCHAR(100) NULL', 'DO 0');
PREPARE passo FROM @sql; EXECUTE passo; DEALLOCATE PREPARE passo;
