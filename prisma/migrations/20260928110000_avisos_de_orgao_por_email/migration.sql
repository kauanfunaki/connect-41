-- Avisos de órgão por e-mail (Junta/Empresa Fácil), em modo sugestão (28/09).
-- CreateTable
CREATE TABLE `organ_notices` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `organAcronym` VARCHAR(20) NOT NULL,
    `messageId` VARCHAR(255) NOT NULL,
    `sender` VARCHAR(255) NULL,
    `subject` VARCHAR(500) NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `body` TEXT NOT NULL,
    `protocolNumber` VARCHAR(80) NULL,
    `protocolId` VARCHAR(191) NULL,
    `processId` VARCHAR(191) NULL,
    `suggestion` ENUM('EXIGENCIA', 'DEFERIDO', 'CANCELADO', 'REVISAR') NOT NULL,
    `suggestionDetail` TEXT NULL,
    `status` ENUM('PENDENTE', 'APLICADO', 'DESCARTADO') NOT NULL DEFAULT 'PENDENTE',
    `reviewedByUserId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `organ_notices_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `organ_notices_processId_idx`(`processId`),
    UNIQUE INDEX `organ_notices_tenantId_messageId_key`(`tenantId`, `messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organ_notices` ADD CONSTRAINT `organ_notices_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organ_notices` ADD CONSTRAINT `organ_notices_protocolId_fkey` FOREIGN KEY (`protocolId`) REFERENCES `process_protocols`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organ_notices` ADD CONSTRAINT `organ_notices_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organ_notices` ADD CONSTRAINT `organ_notices_reviewedByUserId_fkey` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

