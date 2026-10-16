-- Portal ligado direto às empresas (14/10/2026) — etapa 2 da saída do Cliente.
--
-- Até aqui o acesso ao portal (`portal_users`) era pendurado num Cliente
-- (`clientGroupId`, obrigatório) e via as empresas daquele cliente. Agora o
-- acesso é ligado direto a N empresas, com "incluir filiais" (decisão do Kauan
-- em 13/10: filiais entram por padrão). Comunicados vão para empresas, e o SPED
-- guarda as raízes que já sincroniza, sem depender do Cliente.
--
-- O que muda no banco:
-- 1. Três tabelas novas: `portal_user_companies` (acesso ↔ empresa),
--    `client_announcement_companies` (comunicado ↔ empresa) e
--    `sped_sync_roots` (as raízes de CNPJ que o SPED sincroniza).
-- 2. `portal_users.clientGroupId` passa a aceitar NULL (conta nova nasce sem
--    cliente). Mesmo tipo e collation da coluna criada em 20260904010000. A
--    chave vai de RESTRICT para SET NULL: excluir um cliente não leva mais os
--    acessos junto.
-- 3. Preenchimento, sem apagar nada:
--    - cada acesso existente ganha TODAS as empresas do cliente dele (mesmo
--      escritório), com "incluir filiais" — ninguém perde empresa; quem tem a
--      matriz passa a ver também as filiais que não estavam no cliente;
--    - cada comunicado antigo ganha as empresas dos clientes que o receberam,
--      para a leitura nova (por empresa) valer para o histórico;
--    - o SPED ganha as raízes que a regra de hoje dá: clientes ativos com raiz
--      de 8 caracteres (a mesma conta de `sincronizarTenant`).
--    Os INSERTs pulam o que já existe (NOT EXISTS): rodar de novo não duplica.
-- A tabela antiga dos comunicados (`client_announcement_groups`) fica como
-- está; sai na etapa 3, com o Cliente.
--
-- RODAR COM `migrate deploy` ANTES DO DEPLOY. Antes, rodar a prévia só de
-- leitura `scripts/previa-portal-por-empresa.ts`. Se o código subir antes da
-- migration, o portal não quebra: sem as tabelas novas, a leitura cai na regra
-- do Cliente (a de hoje), e criar acesso/comunicado avisa que falta atualizar
-- o banco.

-- CreateTable
CREATE TABLE `portal_user_companies` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `portalUserId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `incluiFiliais` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `portal_user_companies_companyId_idx`(`companyId`),
    UNIQUE INDEX `portal_user_companies_portalUserId_companyId_key`(`portalUserId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_announcement_companies` (
    `id` VARCHAR(191) NOT NULL,
    `announcementId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,

    INDEX `client_announcement_companies_companyId_idx`(`companyId`),
    UNIQUE INDEX `client_announcement_companies_announcementId_companyId_key`(`announcementId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_sync_roots` (
    `tenantId` VARCHAR(191) NOT NULL,
    `cnpjRaiz` VARCHAR(8) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`tenantId`, `cnpjRaiz`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- DropForeignKey
ALTER TABLE `portal_users` DROP FOREIGN KEY `portal_users_clientGroupId_fkey`;

-- AlterTable
ALTER TABLE `portal_users` MODIFY `clientGroupId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

-- AddForeignKey
ALTER TABLE `portal_users` ADD CONSTRAINT `portal_users_clientGroupId_fkey` FOREIGN KEY (`clientGroupId`) REFERENCES `client_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_user_companies` ADD CONSTRAINT `portal_user_companies_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_user_companies` ADD CONSTRAINT `portal_user_companies_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcement_companies` ADD CONSTRAINT `client_announcement_companies_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `client_announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcement_companies` ADD CONSTRAINT `client_announcement_companies_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: cada acesso existente vê as empresas do cliente dele, com as
-- filiais. Só empresas do mesmo escritório da conta (a regra de hoje,
-- `alcanceDoCliente`, também filtrava pelo escritório). Status da empresa não
-- entra: hoje a conta vê empresa inativa do cliente, e continua vendo.
INSERT INTO `portal_user_companies` (`id`, `tenantId`, `portalUserId`, `companyId`, `incluiFiliais`)
SELECT UUID(), par.`tenantId`, par.`portalUserId`, par.`companyId`, true
  FROM (
    SELECT DISTINCT pu.`tenantId` AS `tenantId`, pu.`id` AS `portalUserId`, c.`id` AS `companyId`
      FROM `portal_users` pu
      JOIN `companies` c ON c.`clientGroupId` = pu.`clientGroupId` AND c.`tenantId` = pu.`tenantId`
     WHERE pu.`clientGroupId` IS NOT NULL
  ) par
 WHERE NOT EXISTS (
    SELECT 1 FROM `portal_user_companies` x
     WHERE x.`portalUserId` = par.`portalUserId` AND x.`companyId` = par.`companyId`
 );

-- Backfill 2: os comunicados antigos ficam com as empresas dos clientes que os
-- receberam (do mesmo escritório do comunicado).
INSERT INTO `client_announcement_companies` (`id`, `announcementId`, `companyId`)
SELECT UUID(), par.`announcementId`, par.`companyId`
  FROM (
    SELECT DISTINCT g.`announcementId` AS `announcementId`, c.`id` AS `companyId`
      FROM `client_announcement_groups` g
      JOIN `client_announcements` a ON a.`id` = g.`announcementId`
      JOIN `companies` c ON c.`clientGroupId` = g.`clientGroupId` AND c.`tenantId` = a.`tenantId`
  ) par
 WHERE NOT EXISTS (
    SELECT 1 FROM `client_announcement_companies` x
     WHERE x.`announcementId` = par.`announcementId` AND x.`companyId` = par.`companyId`
 );

-- Backfill 3: as raízes que o SPED sincroniza hoje — a regra de
-- `sincronizarTenant` até 14/10/2026: clientes ativos com raiz preenchida de 8
-- caracteres, sem repetir por escritório.
INSERT INTO `sped_sync_roots` (`tenantId`, `cnpjRaiz`)
SELECT DISTINCT g.`tenantId`, g.`cnpjRoot`
  FROM `client_groups` g
 WHERE g.`active` = true
   AND g.`cnpjRoot` IS NOT NULL
   AND CHAR_LENGTH(g.`cnpjRoot`) = 8
   AND NOT EXISTS (
     SELECT 1 FROM `sped_sync_roots` r
      WHERE r.`tenantId` = g.`tenantId` AND r.`cnpjRaiz` = g.`cnpjRoot`
   );
