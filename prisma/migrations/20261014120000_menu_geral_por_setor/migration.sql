-- O menu Geral por setor (14/10/2026): quais telas do grupo "Geral" do menu
-- lateral ficam escondidas para cada setor (o Recrutamento sem Solicitações e
-- Transferências, por exemplo).
-- Só cria a tabela nova `sector_menu_views`; nenhuma tabela existente muda.
-- Sem backfill: ausência de linha significa "nada escondido", que é exatamente
-- o menu de antes desta tabela.
-- Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código subir antes,
-- nada quebra: sem a tabela, o menu mostra tudo, como hoje, e só a tela de
-- configuração avisa que não consegue salvar.

-- CreateTable
CREATE TABLE `sector_menu_views` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `hiddenScreens` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sector_menu_views_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `sector_menu_views_tenantId_sectorCode_key`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sector_menu_views` ADD CONSTRAINT `sector_menu_views_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
