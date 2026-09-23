-- Valora (precificação de honorários): ajustes do escritório e propostas simuladas.
--
-- Aditiva: só cria duas tabelas, nenhuma existente muda. Pode rodar antes do
-- deploy; deploy que chegue antes dela quebra só as telas do Valora.

-- CreateTable
CREATE TABLE `valora_config` (
    `tenantId` VARCHAR(191) NOT NULL,
    `ajustes` JSON NOT NULL,
    `parametros` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `valora_propostas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `cliente` VARCHAR(160) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `perfil` JSON NOT NULL,
    `resultado` JSON NOT NULL,
    `precoAlvo` DECIMAL(12, 2) NULL,
    `precoOferecido` DECIMAL(12, 2) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    `motivo` VARCHAR(500) NULL,
    `precoConcorrente` DECIMAL(12, 2) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `valora_propostas_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `valora_config` ADD CONSTRAINT `valora_config_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `valora_propostas` ADD CONSTRAINT `valora_propostas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `valora_propostas` ADD CONSTRAINT `valora_propostas_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
