-- CreateTable
CREATE TABLE `hon_acessorias_operacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `conta` VARCHAR(150) NOT NULL,
    `ativoTenantId` VARCHAR(36) NULL,
    `iniciadaEm` DATETIME(3) NOT NULL,
    `atualizadaEm` DATETIME(3) NOT NULL,
    `concluidaEm` DATETIME(3) NULL,
    `total` INTEGER NULL,
    `feitos` INTEGER NOT NULL DEFAULT 0,
    `erros` INTEGER NOT NULL DEFAULT 0,
    `mensagem` VARCHAR(500) NULL,
    `resultados` JSON NULL,

    UNIQUE INDEX `hon_acessorias_operacoes_ativoTenantId_key`(`ativoTenantId`),
    INDEX `hon_acessorias_operacoes_tenantId_iniciadaEm_idx`(`tenantId`, `iniciadaEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
