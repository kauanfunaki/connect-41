-- Cobrança: contatos, acordos, eventos, régua de lembretes e baixa por perda.
-- Aditiva: colunas novas anuláveis em finance_entries e finance_counterparties,
-- tabelas e índices novos. Nenhum dado existente muda — o CANCELADO de antes
-- fica com closeReason nulo, e a aplicação lê nulo como cancelado comum.
-- Sem linha em collection_reminder_configs, a régua de um tenant está desligada.

-- AlterTable
ALTER TABLE `finance_counterparties` ADD COLUMN `email` VARCHAR(180) NULL;

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `agreementId` VARCHAR(191) NULL,
    ADD COLUMN `closeReason` ENUM('CANCELADO', 'RENEGOCIADO', 'PERDA') NULL,
    ADD COLUMN `collectionOwnerId` VARCHAR(191) NULL,
    ADD COLUMN `lossAt` DATETIME(3) NULL,
    ADD COLUMN `lossById` VARCHAR(191) NULL,
    ADD COLUMN `lossReason` VARCHAR(500) NULL,
    ADD COLUMN `renegotiatedAgreementId` VARCHAR(191) NULL,
    ADD COLUMN `statusBeforeClose` ENUM('PROVISORIO', 'CONFERIDO', 'PAGO', 'CANCELADO') NULL;

-- CreateTable
CREATE TABLE `collection_contacts` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `contactedAt` DATETIME(3) NOT NULL,
    `channel` ENUM('TELEFONE', 'WHATSAPP', 'EMAIL', 'PRESENCIAL', 'OUTRO') NOT NULL,
    `outcome` ENUM('SEM_RESPOSTA', 'PROMETEU_PAGAR', 'CONTESTOU', 'NEGOCIANDO', 'OUTRO') NOT NULL,
    `notes` TEXT NULL,
    `nextActionAt` DATETIME(3) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `collection_contacts_entryId_contactedAt_idx`(`entryId`, `contactedAt`),
    INDEX `collection_contacts_tenantId_nextActionAt_idx`(`tenantId`, `nextActionAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collection_agreements` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `counterpartyId` VARCHAR(191) NOT NULL,
    `originalAmount` DECIMAL(12, 2) NOT NULL,
    `agreedAmount` DECIMAL(12, 2) NOT NULL,
    `installments` INTEGER NOT NULL,
    `firstDueDate` DATETIME(3) NOT NULL,
    `intervalMonths` INTEGER NOT NULL DEFAULT 1,
    `agreedAt` DATETIME(3) NOT NULL,
    `status` ENUM('ATIVO', 'CUMPRIDO', 'QUEBRADO', 'DESFEITO') NOT NULL DEFAULT 'ATIVO',
    `notes` TEXT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `closedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `collection_agreements_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `collection_agreements_tenantId_companyId_agreedAt_idx`(`tenantId`, `companyId`, `agreedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collection_events` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `kind` ENUM('RESPONSAVEL_ALTERADO', 'RENEGOCIADO', 'DEVOLVIDO_AO_ABERTO', 'PERDA', 'PERDA_REVERTIDA', 'ACORDO_QUEBRADO') NOT NULL,
    `agreementId` VARCHAR(191) NULL,
    `reason` VARCHAR(500) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `collection_events_entryId_createdAt_idx`(`entryId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collection_reminder_logs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `step` INTEGER NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `to` VARCHAR(180) NOT NULL,
    `ok` BOOLEAN NOT NULL DEFAULT false,
    `error` VARCHAR(500) NULL,

    INDEX `collection_reminder_logs_tenantId_sentAt_idx`(`tenantId`, `sentAt`),
    UNIQUE INDEX `collection_reminder_logs_entryId_step_key`(`entryId`, `step`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collection_reminder_configs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `steps` VARCHAR(60) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `collection_reminder_configs_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collection_reminder_opt_outs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `collection_reminder_opt_outs_companyId_key`(`companyId`),
    INDEX `collection_reminder_opt_outs_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `finance_entries_agreementId_idx` ON `finance_entries`(`agreementId`);

-- CreateIndex
CREATE INDEX `finance_entries_renegotiatedAgreementId_idx` ON `finance_entries`(`renegotiatedAgreementId`);

-- CreateIndex
CREATE INDEX `finance_entries_tenantId_companyId_closeReason_lossAt_idx` ON `finance_entries`(`tenantId`, `companyId`, `closeReason`, `lossAt`);

-- CreateIndex
CREATE INDEX `finance_entries_tenantId_collectionOwnerId_idx` ON `finance_entries`(`tenantId`, `collectionOwnerId`);

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `collection_agreements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_renegotiatedAgreementId_fkey` FOREIGN KEY (`renegotiatedAgreementId`) REFERENCES `collection_agreements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_lossById_fkey` FOREIGN KEY (`lossById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_collectionOwnerId_fkey` FOREIGN KEY (`collectionOwnerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_contacts` ADD CONSTRAINT `collection_contacts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_contacts` ADD CONSTRAINT `collection_contacts_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_contacts` ADD CONSTRAINT `collection_contacts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_agreements` ADD CONSTRAINT `collection_agreements_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_agreements` ADD CONSTRAINT `collection_agreements_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_agreements` ADD CONSTRAINT `collection_agreements_counterpartyId_fkey` FOREIGN KEY (`counterpartyId`) REFERENCES `finance_counterparties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_agreements` ADD CONSTRAINT `collection_agreements_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_agreements` ADD CONSTRAINT `collection_agreements_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_events` ADD CONSTRAINT `collection_events_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_events` ADD CONSTRAINT `collection_events_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_events` ADD CONSTRAINT `collection_events_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `collection_agreements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_events` ADD CONSTRAINT `collection_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_reminder_logs` ADD CONSTRAINT `collection_reminder_logs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_reminder_logs` ADD CONSTRAINT `collection_reminder_logs_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_reminder_configs` ADD CONSTRAINT `collection_reminder_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_reminder_configs` ADD CONSTRAINT `collection_reminder_configs_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_reminder_opt_outs` ADD CONSTRAINT `collection_reminder_opt_outs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_reminder_opt_outs` ADD CONSTRAINT `collection_reminder_opt_outs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_reminder_opt_outs` ADD CONSTRAINT `collection_reminder_opt_outs_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

