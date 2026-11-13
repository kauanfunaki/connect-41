-- Telas em manutenção (13/11/2026): enquanto a Tech corrige um erro, a tela sai
-- do ar para os setores, e quem abre vê o aviso de manutenção.
-- Só cria a tabela nova `tenant_module_maintenance`, vazia; nenhuma tabela
-- existente muda. Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o
-- código subir antes, nada quebra: sem a tabela, nenhuma tela está em
-- manutenção, e só o botão de colocar em manutenção avisa que não consegue salvar.

-- CreateTable
CREATE TABLE `tenant_module_maintenance` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `moduleCode` VARCHAR(60) NOT NULL,
    `motivo` VARCHAR(280) NULL,
    `previsao` DATETIME(3) NULL,
    `porNome` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tenant_module_maintenance_tenantId_moduleCode_key`(`tenantId`, `moduleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_module_maintenance` ADD CONSTRAINT `tenant_module_maintenance_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

