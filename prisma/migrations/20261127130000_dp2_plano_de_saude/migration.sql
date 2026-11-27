-- Plano de saúde e S-1210 (funcionalidade-762)
CREATE TABLE `dp2_planos_de_saude` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `tipo` VARCHAR(6) NOT NULL,
    `cnpjOperadora` VARCHAR(14) NOT NULL,
    `registroAns` VARCHAR(6) NULL,
    `valorTitular` DECIMAL(12, 2) NOT NULL,
    `valorDependente` DECIMAL(12, 2) NOT NULL,
    `faixas` JSON NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_planos_de_saude_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dp2_adesoes_ao_plano` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `planoId` VARCHAR(191) NOT NULL,
    `inicio` DATE NOT NULL,
    `fim` DATE NULL,
    `dependentes` JSON NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_adesoes_ao_plano_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_adesoes_ao_plano_personId_idx`(`personId`),
    INDEX `dp2_adesoes_ao_plano_planoId_idx`(`planoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_adesoes_ao_plano` ADD CONSTRAINT `dp2_adesoes_ao_plano_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dp2_adesoes_ao_plano` ADD CONSTRAINT `dp2_adesoes_ao_plano_planoId_fkey` FOREIGN KEY (`planoId`) REFERENCES `dp2_planos_de_saude`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `dp2_vinculos` ADD COLUMN `previdenciaCnpj` VARCHAR(14) NULL;
