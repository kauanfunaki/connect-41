-- DP 2: férias gravadas (25/11/2026, funcionalidade-745, entrega 2.1). Só cria a tabela.
CREATE TABLE `dp2_ferias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `aquisitivoInicio` DATE NOT NULL,
    `aquisitivoFim` DATE NOT NULL,
    `inicioGozo` DATE NOT NULL,
    `diasGozo` INTEGER NOT NULL,
    `diasAbono` INTEGER NOT NULL DEFAULT 0,
    `faltas` INTEGER NOT NULL DEFAULT 0,
    `dataPagamento` DATE NOT NULL,
    `remuneracao` DECIMAL(12, 2) NOT NULL,
    `ferias` DECIMAL(12, 2) NOT NULL,
    `terco` DECIMAL(12, 2) NOT NULL,
    `abono` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `tercoAbono` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `inss` DECIMAL(12, 2) NOT NULL,
    `irrf` DECIMAL(12, 2) NOT NULL,
    `liquido` DECIMAL(12, 2) NOT NULL,
    `fgts` DECIMAL(12, 2) NOT NULL,
    `recibo` JSON NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_ferias_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_ferias_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_ferias` ADD CONSTRAINT `dp2_ferias_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
