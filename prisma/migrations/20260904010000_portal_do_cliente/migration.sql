-- Portal do cliente — etapa 4 da Fase 2.
--
-- `PortalUser` é tabela SEPARADA de `User`, e não um papel novo nele. A primeira
-- tentativa foi pelo papel e foi revertida em 2026-09-03, a pedido. Três coisas
-- que a separação compra e o papel não comprava:
--
-- 1. NÃO EXISTE PAPEL PARA ATRIBUIR ERRADO. Com papel novo em `User`, um clique
--    errado no cadastro daria acesso interno a um cliente. Aqui o pior caso de
--    um erro é o cliente não conseguir entrar.
-- 2. `clientGroupId` É OBRIGATÓRIO. Com o papel ele teria de ser anulável (conta
--    interna não tem grupo), e "conta de portal sem grupo" viraria um estado a
--    defender em toda consulta. Aqui esse estado não é representável.
-- 3. SESSÃO PRÓPRIA. Cookie e token separados, com `kind: "portal"` recusado
--    pelo verificador interno — uma sessão não vira a outra nem por engano.
--
-- `password_reset_tokens.subject` discrimina de quem é o token. Discriminador em
-- vez de segunda tabela: expiração, uso único e limpeza são idênticos nos dois
-- casos, e duplicar a tabela duplicaria as três regras. As linhas existentes
-- viram USER pelo DEFAULT, que é o que já eram.
--
-- Puramente aditiva.

-- AlterTable
ALTER TABLE `password_reset_tokens` ADD COLUMN `subject` ENUM('USER', 'PORTAL_USER') NOT NULL DEFAULT 'USER';
-- CreateTable
CREATE TABLE `portal_users` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientGroupId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(120) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `portal_users_tenantId_clientGroupId_idx`(`tenantId`, `clientGroupId`),
    UNIQUE INDEX `portal_users_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `portal_users` ADD CONSTRAINT `portal_users_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `portal_users` ADD CONSTRAINT `portal_users_clientGroupId_fkey` FOREIGN KEY (`clientGroupId`) REFERENCES `client_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
