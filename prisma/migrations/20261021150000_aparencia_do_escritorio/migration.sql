-- A aparência do escritório (21/10/2026): a cor principal do portal do cliente,
-- a cor de cada grupo de telas do portal e o logo do escritório no menu.
-- Administração › Empresa (tenant) › Aparência do portal.
--
-- Só cria a tabela nova `tenant_aparencias`; nenhuma tabela existente muda. Sem
-- linha, o portal fica como sempre foi (azul do Connect, cores de fábrica dos
-- grupos). Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código
-- subir antes, nada quebra: sem a tabela vale o padrão, e a tela da
-- administração avisa que falta a atualização do banco.

-- CreateTable
CREATE TABLE `tenant_aparencias` (
    `tenantId` VARCHAR(191) NOT NULL,
    `corPrincipal` VARCHAR(7) NULL,
    `coresDosGrupos` JSON NULL,
    `coresPorGrupo` BOOLEAN NOT NULL DEFAULT true,
    `logoNoPortal` BOOLEAN NOT NULL DEFAULT false,
    `noConnect` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_aparencias` ADD CONSTRAINT `tenant_aparencias_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
