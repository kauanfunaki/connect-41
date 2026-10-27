-- O lembrete de não lido padrão dos envios ao cliente (23/10/2026): o prazo
-- que um envio novo já traz escolhido. Administração › Portal do cliente ›
-- Envios.
--
-- Só cria a tabela nova `tenant_envios_configs`; nenhuma tabela existente muda.
-- Sem linha, o envio novo vem "sem lembrete", como sempre foi. Rodar ANTES do
-- deploy (`npx prisma migrate deploy`). Se o código subir antes, nada quebra:
-- sem a tabela vale "sem lembrete", e a tela da administração avisa que falta
-- a atualização do banco.

-- CreateTable
CREATE TABLE `tenant_envios_configs` (
    `tenantId` VARCHAR(191) NOT NULL,
    `lembreteDias` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_envios_configs` ADD CONSTRAINT `tenant_envios_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
