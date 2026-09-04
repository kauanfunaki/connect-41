-- Financeiro mínimo — etapa 7 da Fase 2.
--
-- É o lado que recebe o "lançamento provisório": três tabelas, não um módulo
-- financeiro inteiro. Centro de custo, conta bancária, conciliação e aprovação
-- ficam de fora de propósito — são o módulo, e a etapa 7 é a ponte até ele.
--
-- Duas respostas que vieram do protótipo do 41-BPO, que é a especificação
-- validada rodando:
--
-- 1. AS CONTAS SÃO DO CLIENTE, não do escritório. `companyId` aponta para a
--    empresa, igual ao documento fiscal — é BPO financeiro.
-- 2. VENCIMENTO PRESUMIDO = emissão + 30 dias, sobrescrevível na tela. A NF-e
--    não carrega vencimento; ele vive na duplicata/cobrança.
--
-- Três escolhas onde o Connect diverge do protótipo, que é single-tenant e
-- SQLite:
--
-- - `FinanceEntry` com `kind` em vez de `Payable` + `Receivable`. Os campos são
--   os mesmos e a diferença é o sinal; duas tabelas idênticas dobrariam toda
--   consulta de fluxo de caixa.
-- - `FinanceCounterparty` em vez de `Vendor` + `Customer`. O mesmo CNPJ costuma
--   ser os dois, e duas tabelas fariam duas fichas que envelhecem em separado.
-- - `amount` é Decimal(12,2), não Float.
--
-- O vínculo com o documento é 1:1 e o unique é quem garante: relançar o mesmo
-- documento duplicaria valor no financeiro.
--
-- Puramente aditiva.

-- CreateTable
CREATE TABLE `finance_categories` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `kind` ENUM('PAGAR', 'RECEBER') NOT NULL,
    `dreGroup` VARCHAR(120) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `finance_categories_tenantId_kind_idx`(`tenantId`, `kind`),
    UNIQUE INDEX `finance_categories_tenantId_name_kind_key`(`tenantId`, `name`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `finance_counterparties` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `document` VARCHAR(14) NULL,
    `defaultCategoryId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `finance_counterparties_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `finance_counterparties_tenantId_companyId_document_key`(`tenantId`, `companyId`, `document`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `finance_entries` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `kind` ENUM('PAGAR', 'RECEBER') NOT NULL,
    `status` ENUM('PROVISORIO', 'CONFERIDO', 'PAGO', 'CANCELADO') NOT NULL DEFAULT 'PROVISORIO',
    `counterpartyId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `competence` VARCHAR(7) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `paidAt` DATETIME(3) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `description` VARCHAR(255) NULL,
    `fiscalDocumentId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `finance_entries_fiscalDocumentId_key`(`fiscalDocumentId`),
    INDEX `finance_entries_tenantId_companyId_competence_idx`(`tenantId`, `companyId`, `competence`),
    INDEX `finance_entries_tenantId_companyId_kind_status_idx`(`tenantId`, `companyId`, `kind`, `status`),
    INDEX `finance_entries_tenantId_dueDate_idx`(`tenantId`, `dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_counterparties` ADD CONSTRAINT `finance_counterparties_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_counterparties` ADD CONSTRAINT `finance_counterparties_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_counterparties` ADD CONSTRAINT `finance_counterparties_defaultCategoryId_fkey` FOREIGN KEY (`defaultCategoryId`) REFERENCES `finance_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_counterpartyId_fkey` FOREIGN KEY (`counterpartyId`) REFERENCES `finance_counterparties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_fiscalDocumentId_fkey` FOREIGN KEY (`fiscalDocumentId`) REFERENCES `fiscal_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
