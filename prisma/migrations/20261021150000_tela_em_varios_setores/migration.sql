-- Uma tela em mais de um setor (21/10/2026): os setores que também usam uma
-- tela, além do setor dono.
-- Só cria a tabela nova `tenant_module_sectors`, vazia; nenhuma tabela
-- existente muda. O setor atual de cada tela fica onde está
-- (`tenant_modules.sectorCode` ou o catálogo, em código): ninguém ganha nem
-- perde acesso por causa desta migration.
-- Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código subir antes,
-- nada quebra: sem a tabela, cada tela fica só no setor dono, como hoje, e só
-- a tela de configuração avisa que não consegue salvar.

-- CreateTable
CREATE TABLE `tenant_module_sectors` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `moduleCode` VARCHAR(60) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_module_sectors_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `tenant_module_sectors_tenantId_moduleCode_sectorCode_key`(`tenantId`, `moduleCode`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_module_sectors` ADD CONSTRAINT `tenant_module_sectors_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
