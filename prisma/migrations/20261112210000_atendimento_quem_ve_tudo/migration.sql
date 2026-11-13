-- Atendimento (12/11/2026): pessoas e setores que veem todos os atendimentos,
-- com o aviso de conversa nova opcional. Nulo = ninguém além da triagem.
ALTER TABLE `atendimento_configs` ADD COLUMN `veemTudo` JSON NULL;
