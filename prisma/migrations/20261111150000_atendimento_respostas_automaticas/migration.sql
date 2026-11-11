-- Atendimento (11/11/2026): chave das respostas automáticas. Nasce desligada:
-- o número pode ser ligado só para acompanhar, sem o Connect mandar nada sozinho.
ALTER TABLE `atendimento_configs` ADD COLUMN `respostasAutomaticas` BOOLEAN NOT NULL DEFAULT false;
