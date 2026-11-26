-- Horários de trabalho do DP 2 (funcionalidade-752)
ALTER TABLE `dp2_vinculos` ADD COLUMN `horarioId` VARCHAR(191) NULL;

CREATE TABLE `dp2_horarios` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(80) NOT NULL,
    `dias` VARCHAR(7) NOT NULL,
    `entrada` VARCHAR(5) NOT NULL,
    `saida` VARCHAR(5) NOT NULL,
    `intervaloMinutos` INTEGER NOT NULL DEFAULT 60,
    `tipoJornada` VARCHAR(1) NOT NULL DEFAULT '9',
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_horarios_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
