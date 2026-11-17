-- DCTFWeb do mês pelo Serpro (17/11/2026, funcionalidade-734): a rotina que
-- baixa sozinha o recibo e o DARF da DCTFWeb das empresas marcadas.
-- Três tabelas novas, sem mexer nas existentes. A tela Autorizações › DCTFWeb
-- do mês e o agendador leem as tabelas: rodar ANTES do deploy.

-- CreateTable
CREATE TABLE `serpro_dctfweb_rotina` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ligada` BOOLEAN NOT NULL DEFAULT false,
    `diaSemEvento` INTEGER NOT NULL DEFAULT 16,
    `tetoCentavos` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `serpro_dctfweb_rotina_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serpro_dctfweb_empresas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `serpro_dctfweb_empresas_companyId_key`(`companyId`),
    INDEX `serpro_dctfweb_empresas_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serpro_dctfweb` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competencia` VARCHAR(7) NOT NULL,
    `situacao` VARCHAR(16) NOT NULL,
    `reciboArquivoId` VARCHAR(191) NULL,
    `darfArquivoId` VARCHAR(191) NULL,
    `consultasCobradas` INTEGER NOT NULL DEFAULT 0,
    `emissoesCobradas` INTEGER NOT NULL DEFAULT 0,
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `ultimaTentativa` DATETIME(3) NULL,
    `proximaTentativa` DATETIME(3) NULL,
    `travadaAte` DATETIME(3) NULL,
    `erro` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serpro_dctfweb_tenantId_competencia_idx`(`tenantId`, `competencia`),
    UNIQUE INDEX `serpro_dctfweb_tenantId_companyId_competencia_key`(`tenantId`, `companyId`, `competencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `serpro_dctfweb_rotina` ADD CONSTRAINT `serpro_dctfweb_rotina_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serpro_dctfweb_empresas` ADD CONSTRAINT `serpro_dctfweb_empresas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serpro_dctfweb_empresas` ADD CONSTRAINT `serpro_dctfweb_empresas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serpro_dctfweb` ADD CONSTRAINT `serpro_dctfweb_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serpro_dctfweb` ADD CONSTRAINT `serpro_dctfweb_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

