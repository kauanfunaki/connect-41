-- A publicação da DRE para o cliente (05/11/2026, decisão D4): a foto de cada
-- empresa e mês que o portal mostra, e a marca da foto inicial da empresa.
-- Só tabelas novas; nada muda nas existentes.

-- CreateTable
CREATE TABLE `dre_publicacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competencia` CHAR(7) NOT NULL,
    `foto` JSON NOT NULL,
    `inicial` BOOLEAN NOT NULL DEFAULT false,
    `publicadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publicadoPorId` VARCHAR(191) NULL,
    `publicadoPorNome` VARCHAR(120) NULL,

    INDEX `dre_publicacoes_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `dre_publicacoes_companyId_competencia_key`(`companyId`, `competencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dre_publicacao_empresas` (
    `companyId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `fotoInicialEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dre_publicacao_empresas_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dre_publicacoes` ADD CONSTRAINT `dre_publicacoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dre_publicacoes` ADD CONSTRAINT `dre_publicacoes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dre_publicacao_empresas` ADD CONSTRAINT `dre_publicacao_empresas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dre_publicacao_empresas` ADD CONSTRAINT `dre_publicacao_empresas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

