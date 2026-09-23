-- Conta do candidato no portal de vagas: credenciais de acesso (link por
-- e-mail e sessão) e a marca de pedido de exclusão de dados (LGPD).
--
-- Aditiva: uma tabela nova e uma coluna opcional em `people`.

-- AlterTable
ALTER TABLE `people` ADD COLUMN `dataDeletionRequestedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `candidato_acessos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(120) NOT NULL,
    `tipo` ENUM('LINK', 'SESSAO') NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `candidato_acessos_tokenHash_key`(`tokenHash`),
    INDEX `candidato_acessos_tenantId_email_idx`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `candidato_acessos` ADD CONSTRAINT `candidato_acessos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
