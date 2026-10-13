-- Exclusão de verdade (13/10): a trilha de auditoria sobrevive ao usuário.
--
-- Até aqui `audit_logs.userId` era obrigatório e RESTRICT: nenhum usuário que
-- tivesse feito uma única ação no Connect podia ser excluído, só inativado.
-- Agora a linha da trilha fica, sem o vínculo (SET NULL), e o nome de quem
-- agiu vai junto em `actorName`.
--
-- Aditiva no dado: nenhuma linha é apagada. O preenchimento do nome das linhas
-- antigas é um UPDATE por chave primária, a partir da tabela de usuários.
--
-- RODAR COM `migrate deploy` ANTES DO DEPLOY: o código novo grava `actorName`
-- em toda ação registrada, e sem a coluna a gravação falha (o log é
-- best-effort, então a ação do usuário passa — mas a trilha fica sem a linha).

-- DropForeignKey
ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_userId_fkey`;

-- AlterTable
ALTER TABLE `audit_logs` ADD COLUMN `actorName` VARCHAR(120) NULL,
    MODIFY `userId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: o nome de quem agiu nas linhas que já existem.
UPDATE `audit_logs` a
  JOIN `users` u ON u.`id` = a.`userId`
  SET a.`actorName` = u.`name`
  WHERE a.`actorName` IS NULL;
