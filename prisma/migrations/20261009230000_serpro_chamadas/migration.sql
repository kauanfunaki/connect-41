-- Registro de cada chamada ao Integra Contador do Serpro (custo do mês e teto).
-- As telas de Autorizações e de Integrações leem a tabela: rodar ANTES do deploy.
-- CreateTable
CREATE TABLE `serpro_calls` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `caminho` VARCHAR(12) NOT NULL,
    `idSistema` VARCHAR(40) NOT NULL,
    `idServico` VARCHAR(60) NOT NULL,
    `contribuinte` VARCHAR(14) NOT NULL,
    `httpStatus` INTEGER NULL,
    `cobrada` BOOLEAN NOT NULL,
    `tipoDeCobranca` VARCHAR(12) NULL,
    `mensagens` VARCHAR(500) NULL,
    `duracaoMs` INTEGER NOT NULL,
    `userId` VARCHAR(191) NULL,
    `origem` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `serpro_calls_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `serpro_calls_tenantId_idServico_contribuinte_idx`(`tenantId`, `idServico`, `contribuinte`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `serpro_calls` ADD CONSTRAINT `serpro_calls_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

