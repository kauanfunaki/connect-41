-- Chamado criado na hora, como "Aguardando triagem" (10/11/2026): a tela Novo
-- chamado grava o chamado no envio e a triagem automática (Orquestrador e
-- classificação) roda depois da resposta. Ao terminar, o chamado vai para a
-- situação de abertura (Aberto ou Aguardando aprovação) e quem abriu é avisado.
--
-- `helpdesk_tickets.status` ganha o valor AGUARDANDO_TRIAGEM no fim do enum:
-- acrescentar no fim é só metadado no MySQL, sem reescrever a tabela. Nenhum
-- chamado existente muda de situação.
--
-- Rodar ANTES do deploy: a tela nova grava chamados nessa situação, e sem o
-- valor no enum a abertura de chamado falha.

-- AlterTable
ALTER TABLE `helpdesk_tickets` MODIFY `status` ENUM('ABERTO', 'NA_FILA', 'EM_ANDAMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_REQUERENTE', 'STANDBY', 'RESOLVIDO', 'CANCELADO', 'AGUARDANDO_TRIAGEM') NOT NULL DEFAULT 'ABERTO';
