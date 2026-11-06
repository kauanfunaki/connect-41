-- Controle interno (06/11/2026): o PR e o commit da mudança, informados ao
-- concluir o item. Colunas novas e opcionais; não altera registros existentes.
-- AlterTable
ALTER TABLE `tech_internal_items` ADD COLUMN `prUrl` VARCHAR(500) NULL,
    ADD COLUMN `commitSha` VARCHAR(64) NULL;
