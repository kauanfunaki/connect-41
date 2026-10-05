-- Leads do Comercial e a ficha "Quero ser cliente" do portal (05/10/2026).
--
-- Só uma tabela nova: nada muda em tabela que o app já lê. Ainda assim, rodar
-- ANTES da publicação — a tela /leads e a ficha pública consultam `leads`, e a
-- tabela ausente derruba as duas.
--
-- O "lembrar de mim" do portal não precisou de coluna: a sessão longa é só a
-- validade do token e do cookie (ver src/lib/auth/sessaoDoPortal.ts). O nome
-- da migration ficou como combinado.

-- CreateTable
CREATE TABLE `leads` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NULL,
    `phone` VARCHAR(20) NULL,
    `companyName` VARCHAR(160) NULL,
    `cnpj` VARCHAR(14) NULL,
    `message` TEXT NULL,
    `source` VARCHAR(40) NOT NULL,
    `status` ENUM('NOVO', 'EM_CONTATO', 'CONVERTIDO', 'DESCARTADO') NOT NULL DEFAULT 'NOVO',
    `assigneeId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `privacyAcceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leads_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `leads_tenantId_assigneeId_status_idx`(`tenantId`, `assigneeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
