-- DP 2 (13/11/2026, funcionalidade-671): a busca de colaboradores no eSocial
-- por CPF e admissão, com os acessos ao eSocial por dia (limite de 10 por
-- empregador). Uma tabela nova, sem mexer nas existentes.

-- CreateTable
CREATE TABLE `dp2_buscas_esocial` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `itens` JSON NOT NULL,
    `acessos` JSON NOT NULL,
    `concluida` BOOLEAN NOT NULL DEFAULT false,
    `criadaPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dp2_buscas_esocial_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
