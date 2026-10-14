-- Telas do portal do cliente que o escritório ainda não liberou (14/10/2026):
-- Administração › Portal do cliente › Telas liberadas.
-- Só cria a tabela nova `portal_telas_bloqueadas`; nenhuma tabela existente muda.
-- Sem chave estrangeira, de propósito (ver o model `PortalTelaBloqueada` no schema).
-- Sem linha, a tela está liberada: logo depois da migration, nada muda para ninguém.
-- Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código subir antes, o
-- portal não quebra: sem a tabela, nenhuma tela fica bloqueada (o portal de hoje),
-- e a tela da administração avisa que falta a atualização do banco.
-- CreateTable
CREATE TABLE `portal_telas_bloqueadas` (
    `tenantId` VARCHAR(191) NOT NULL,
    `href` VARCHAR(80) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`tenantId`, `href`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
