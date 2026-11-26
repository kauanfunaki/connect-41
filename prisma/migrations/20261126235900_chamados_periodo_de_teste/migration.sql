-- Chamados: período de teste antes de concluir (26/11/2026, funcionalidade-853).
-- Quem atende pede o teste da entrega com um prazo; o chamado fica "Em teste"
-- até quem pediu responder como foi (deu certo, encontrou um problema, não
-- conseguiu testar ou outro).
--
-- `helpdesk_tickets.status` ganha o valor EM_TESTE no fim do enum: acrescentar
-- no fim é só metadado no MySQL, sem reescrever a tabela. As colunas novas são
-- nulas, sem padrão a preencher. Nenhum chamado existente muda.
--
-- Rodar ANTES do deploy: a tela nova lê as colunas do teste em todo chamado.

-- AlterTable
ALTER TABLE `helpdesk_tickets` MODIFY `status` ENUM('ABERTO', 'NA_FILA', 'EM_ANDAMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_REQUERENTE', 'STANDBY', 'RESOLVIDO', 'CANCELADO', 'AGUARDANDO_TRIAGEM', 'EM_TESTE') NOT NULL DEFAULT 'ABERTO';

-- AlterTable
ALTER TABLE `helpdesk_tickets` ADD COLUMN `testDueAt` DATETIME(3) NULL,
    ADD COLUMN `testStartedAt` DATETIME(3) NULL,
    ADD COLUMN `testInstructions` TEXT NULL,
    ADD COLUMN `testFeedback` VARCHAR(20) NULL;
