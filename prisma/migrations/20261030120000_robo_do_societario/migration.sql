-- A fila do robô do Societário (30/10/2026): as tarefas que a máquina do TI
-- busca e executa nos portais dos órgãos. Tabela nova; não altera registros
-- existentes.
-- CreateTable
CREATE TABLE `robot_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `licenseId` VARCHAR(191) NULL,
    `payload` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    `openKey` VARCHAR(160) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `machineSlug` VARCHAR(60) NULL,
    `claimedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `result` TEXT NULL,
    `reason` VARCHAR(500) NULL,
    `fileId` VARCHAR(191) NULL,
    `requestedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `robot_tasks_openKey_key`(`openKey`),
    INDEX `robot_tasks_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `robot_tasks_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `robot_tasks` ADD CONSTRAINT `robot_tasks_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
