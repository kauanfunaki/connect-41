-- BPO no lugar do Omie, lote B (19/10): emissão e número do documento no
-- lançamento, projeto por empresa, e a ficha completa da contraparte.
--
-- Aditiva: uma tabela nova e colunas anuláveis. O único dado escrito é o
-- preenchimento da emissão e do número nas contas que vieram de nota fiscal —
-- copiados da própria nota, que é de onde a tela de agora em diante os tira.
-- As contas do Omie ganham a emissão na próxima leitura (`dDtEmissao`).
-- Projeto nunca é apagado (inativa-se); o SET NULL da chave só existe para não
-- travar uma limpeza manual, como no centro de custo.

-- AlterTable
ALTER TABLE `finance_counterparties`
    ADD COLUMN `tradeName` VARCHAR(180) NULL,
    ADD COLUMN `phone` VARCHAR(30) NULL,
    ADD COLUMN `zipCode` VARCHAR(10) NULL,
    ADD COLUMN `addressStreet` VARCHAR(180) NULL,
    ADD COLUMN `addressNumber` VARCHAR(20) NULL,
    ADD COLUMN `addressComplement` VARCHAR(80) NULL,
    ADD COLUMN `neighborhood` VARCHAR(80) NULL,
    ADD COLUMN `city` VARCHAR(80) NULL,
    ADD COLUMN `stateCode` VARCHAR(2) NULL,
    ADD COLUMN `bankCode` VARCHAR(3) NULL,
    ADD COLUMN `bankAgency` VARCHAR(10) NULL,
    ADD COLUMN `bankAccount` VARCHAR(30) NULL,
    ADD COLUMN `pixKey` VARCHAR(140) NULL;

-- AlterTable
ALTER TABLE `finance_entries`
    ADD COLUMN `projectId` VARCHAR(191) NULL,
    ADD COLUMN `issueDate` DATETIME(3) NULL,
    ADD COLUMN `documentNumber` VARCHAR(60) NULL;

-- CreateTable
CREATE TABLE `finance_projects` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `finance_projects_tenantId_companyId_active_idx`(`tenantId`, `companyId`, `active`),
    UNIQUE INDEX `finance_projects_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `finance_entries_tenantId_companyId_projectId_idx` ON `finance_entries`(`tenantId`, `companyId`, `projectId`);

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_projects` ADD CONSTRAINT `finance_projects_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_projects` ADD CONSTRAINT `finance_projects_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Emissão e número das contas que vieram de nota, tirados da nota. Só onde
-- ainda estão vazios: rodar de novo não muda nada.
UPDATE `finance_entries` AS fe
  INNER JOIN `fiscal_documents` AS fd ON fd.`id` = fe.`fiscalDocumentId`
SET fe.`issueDate` = fd.`issuedAt`,
    fe.`documentNumber` = LEFT(CONCAT(fd.`number`, IF(fd.`series` IS NULL OR fd.`series` = '', '', CONCAT('/', fd.`series`))), 60)
WHERE fe.`issueDate` IS NULL;
