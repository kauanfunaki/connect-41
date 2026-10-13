-- A última empresa aberta por pessoa e workspace (13/10/2026) — o padrão das telas
-- que mostram uma empresa por vez e das telas pesadas, quando a URL não diz qual.
-- Só cria a tabela nova `user_last_companies`; nenhuma tabela existente muda.
-- Sem chave estrangeira, de propósito: é preferência, conferida na leitura (ver o
-- model `UserLastCompany` no schema).
-- Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código subir antes, as
-- telas não quebram: sem a tabela, abrem pedindo para escolher a empresa.
-- CreateTable
CREATE TABLE `user_last_companies` (
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
