-- BPO › Tabela dinâmica: modelos salvos, do próprio ou do setor (25/11/2026,
-- funcionalidade-816). Só acrescenta uma tabela nova; nenhuma linha antiga é
-- alterada.
--
-- Rodar ANTES da publicação: a tela da Tabela dinâmica passa a ler os modelos
-- de quem está vendo e os do setor.

-- CreateTable
CREATE TABLE `bpo_modelos_da_tabela` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `criadoPorId` VARCHAR(191) NOT NULL,
    `setor` VARCHAR(40) NULL,
    `nome` VARCHAR(80) NOT NULL,
    `parametros` JSON NOT NULL,
    `periodo` VARCHAR(10) NOT NULL,
    `comFiltros` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `bpo_modelos_da_tabela_tenantId_criadoPorId_idx`(`tenantId`, `criadoPorId`),
    INDEX `bpo_modelos_da_tabela_tenantId_setor_idx`(`tenantId`, `setor`),
    INDEX `bpo_modelos_da_tabela_criadoPorId_idx`(`criadoPorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bpo_modelos_da_tabela` ADD CONSTRAINT `bpo_modelos_da_tabela_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bpo_modelos_da_tabela` ADD CONSTRAINT `bpo_modelos_da_tabela_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
