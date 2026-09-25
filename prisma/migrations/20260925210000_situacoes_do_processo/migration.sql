-- Situações marcadas pela equipe no processo societário (25/09): aguardando cliente,
-- suspenso e indeferido, com motivo e data. Acrescenta valores ao enum e duas colunas
-- anuláveis; nenhum processo muda de status.
-- AlterTable
ALTER TABLE `processes` ADD COLUMN `statusChangedAt` DATETIME(3) NULL,
    ADD COLUMN `statusReason` VARCHAR(300) NULL,
    MODIFY `status` ENUM('EM_ANDAMENTO', 'AGUARDANDO_ORGAO', 'EM_EXIGENCIA', 'CONCLUIDO', 'CANCELADO', 'AGUARDANDO_CLIENTE', 'SUSPENSO', 'INDEFERIDO') NOT NULL DEFAULT 'EM_ANDAMENTO';

