-- Chamados atendidos por um ou mais setores (12/11/2026, funcionalidade-640):
-- cada chamado guarda o setor que o atende. Os existentes ficam com o setor
-- que opera o módulo hoje no escritório (o transferido em `tenant_modules`,
-- senão o do catálogo, "tech").

-- AlterTable
ALTER TABLE `helpdesk_tickets` ADD COLUMN `handlingSectorCode` VARCHAR(40) NULL;

UPDATE `helpdesk_tickets` t
LEFT JOIN `tenant_modules` m ON m.`tenantId` = t.`tenantId` AND m.`moduleCode` = 'helpdesk'
SET t.`handlingSectorCode` = COALESCE(NULLIF(TRIM(m.`sectorCode`), ''), 'tech');

ALTER TABLE `helpdesk_tickets` MODIFY `handlingSectorCode` VARCHAR(40) NOT NULL;

-- CreateIndex
CREATE INDEX `helpdesk_tickets_tenantId_handlingSectorCode_status_idx` ON `helpdesk_tickets`(`tenantId`, `handlingSectorCode`, `status`);
