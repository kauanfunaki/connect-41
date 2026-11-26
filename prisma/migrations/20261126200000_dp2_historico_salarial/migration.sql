-- Histórico salarial do DP 2 (funcionalidade-760)
CREATE TABLE `dp2_historico_salarial` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `data` DATE NOT NULL,
    `salarioAnterior` DECIMAL(12, 2) NULL,
    `salario` DECIMAL(12, 2) NOT NULL,
    `motivo` VARCHAR(120) NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_historico_salarial_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_historico_salarial_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_historico_salarial` ADD CONSTRAINT `dp2_historico_salarial_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
