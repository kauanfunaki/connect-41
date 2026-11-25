-- DP 2: rescisão gravada (25/11/2026, funcionalidade-746, entrega 2.3). Só cria a tabela.
CREATE TABLE `dp2_rescisoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `terminationId` VARCHAR(191) NULL,
    `desligamento` DATE NOT NULL,
    `motivo` VARCHAR(40) NOT NULL,
    `aviso` VARCHAR(12) NOT NULL,
    `periodosVencidos` INTEGER NOT NULL DEFAULT 0,
    `faltas` INTEGER NOT NULL DEFAULT 0,
    `saldoFgts` DECIMAL(12, 2) NULL,
    `decimoAdiantado` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `proventos` DECIMAL(12, 2) NOT NULL,
    `descontos` DECIMAL(12, 2) NOT NULL,
    `liquido` DECIMAL(12, 2) NOT NULL,
    `fgts` DECIMAL(12, 2) NOT NULL,
    `multaFgts` DECIMAL(12, 2) NULL,
    `linhas` JSON NOT NULL,
    `alertas` JSON NOT NULL,
    `eventoEsocialId` VARCHAR(191) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_rescisoes_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `dp2_rescisoes_personId_desligamento_key`(`personId`, `desligamento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_rescisoes` ADD CONSTRAINT `dp2_rescisoes_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
