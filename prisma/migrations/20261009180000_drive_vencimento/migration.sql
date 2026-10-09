-- Vencimento nos arquivos do Drive (09/10/2026): a aba Documentos da empresa
-- se juntou aos Arquivos, e o vencimento com alerta veio junto.
--
-- Coluna nova em tabela que o app já lê (drive_files): rodar ANTES da
-- publicação, ou a tela dos Arquivos cai. Só acrescenta; nada é preenchido.

-- AlterTable
ALTER TABLE `drive_files` ADD COLUMN `expiresAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `drive_files_tenantId_expiresAt_idx` ON `drive_files`(`tenantId`, `expiresAt`);

