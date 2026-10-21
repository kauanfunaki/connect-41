-- Saída do Cliente, etapa 3 (21/10/2026): o Cliente sai do schema e do código.
--
-- Desde a etapa 2 (20261014210000_portal_por_empresa) nada decide pelo
-- Cliente: o acesso ao portal é ligado às empresas, os comunicados vão para
-- empresas e o SPED lê `sped_sync_roots`. Agora `ClientGroup`,
-- `ClientAnnouncementGroup`, `Company.clientGroupId` e
-- `PortalUser.clientGroupId` saem do schema.
--
-- O que muda no banco: só saem as cinco chaves estrangeiras que prendiam as
-- tabelas do Cliente ao resto. Nenhuma linha, coluna ou tabela é apagada.
-- Por quê: uma chave que o schema não conhece fica invisível para a exclusão
-- (`src/lib/exclusao`), e foi assim que `canvas_pages` passou a travar a
-- exclusão de usuário depois de sair do schema. Aqui, sem tirar as chaves,
-- `client_groups_tenantId_fkey` (RESTRICT) travaria a exclusão do escritório.
--
-- Os dados ficam onde estão, só para consulta, até a etapa 4 apagar:
-- `client_groups`, `client_announcement_groups`, `companies.clientGroupId` e
-- `portal_users.clientGroupId` (com os índices). A remoção física fica para a
-- etapa 4 porque é irreversível e porque, se for preciso voltar o código para
-- a etapa 2, ele ainda lê essas colunas: sem elas, empresas e portal quebram.
--
-- Pode rodar antes ou depois do deploy: o código da etapa 2 não depende das
-- chaves, e o da etapa 3 não lê as colunas. DROP FOREIGN KEY no InnoDB só mexe
-- no dicionário (não copia a tabela).

-- DropForeignKey
ALTER TABLE `companies` DROP FOREIGN KEY `companies_clientGroupId_fkey`;

-- DropForeignKey
ALTER TABLE `portal_users` DROP FOREIGN KEY `portal_users_clientGroupId_fkey`;

-- DropForeignKey
ALTER TABLE `client_announcement_groups` DROP FOREIGN KEY `client_announcement_groups_announcementId_fkey`;

-- DropForeignKey
ALTER TABLE `client_announcement_groups` DROP FOREIGN KEY `client_announcement_groups_clientGroupId_fkey`;

-- DropForeignKey
ALTER TABLE `client_groups` DROP FOREIGN KEY `client_groups_tenantId_fkey`;
