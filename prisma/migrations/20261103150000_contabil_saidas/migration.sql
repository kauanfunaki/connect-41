-- As contas dos lançamentos de saída do Contábil (passo 6, 03/11/2026).
-- CreateTable
CREATE TABLE `contabil_contas_saida` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `chave` VARCHAR(10) NOT NULL,
    `debito` VARCHAR(20) NOT NULL,
    `credito` VARCHAR(20) NOT NULL,
    `historico` VARCHAR(10) NOT NULL DEFAULT '',
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contabil_contas_saida_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `contabil_contas_saida_companyId_chave_key`(`companyId`, `chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contabil_contas_saida` ADD CONSTRAINT `contabil_contas_saida_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
