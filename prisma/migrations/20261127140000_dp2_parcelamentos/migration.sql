-- Parcelamento de encargos no DP 2 (funcionalidade-764)
CREATE TABLE `dp2_parcelamentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `numero` VARCHAR(40) NOT NULL,
    `valorConsolidado` DECIMAL(14, 2) NOT NULL,
    `quantidade` INTEGER NOT NULL,
    `primeiroVencimento` DATE NOT NULL,
    `observacao` VARCHAR(300) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_parcelamentos_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dp2_parcelas_de_parcelamento` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `parcelamentoId` VARCHAR(191) NOT NULL,
    `numero` INTEGER NOT NULL,
    `vencimento` DATE NOT NULL,
    `valor` DECIMAL(14, 2) NOT NULL,
    `pagaEm` DATE NULL,
    `valorPago` DECIMAL(14, 2) NULL,
    `pagaPorId` VARCHAR(191) NULL,

    UNIQUE INDEX `dp2_parcelas_de_parcelamento_parcelamentoId_numero_key`(`parcelamentoId`, `numero`),
    INDEX `dp2_parcelas_de_parcelamento_tenantId_vencimento_idx`(`tenantId`, `vencimento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_parcelas_de_parcelamento` ADD CONSTRAINT `dp2_parcelas_de_parcelamento_parcelamentoId_fkey` FOREIGN KEY (`parcelamentoId`) REFERENCES `dp2_parcelamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
