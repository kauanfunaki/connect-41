-- Atendimento (13/11/2026): pedir para assumir a conversa de quem está com ela,
-- e os movimentos de iniciar, pedir, ceder e a triagem tirar alguém da conversa.
ALTER TABLE `atendimento_ciclos`
    ADD COLUMN `pedidoAssumirPorId` VARCHAR(191) NULL,
    ADD COLUMN `pedidoAssumirEm` DATETIME(3) NULL;

ALTER TABLE `atendimento_movimentos` MODIFY `tipo` ENUM('CHEGOU', 'ASSUMIU', 'ENCAMINHOU', 'TRANSFERIU', 'PEDIU', 'APROVOU', 'RECUSOU', 'AGUARDANDO', 'ENCERROU', 'REABRIU', 'VINCULOU', 'INICIOU', 'PEDIU_ASSUMIR', 'CEDEU', 'TIROU') NOT NULL;
