-- Duas correções na Avaliação de Atendimentos.
--
-- `isAutomation`: a conta dona do token da integração recebe a autoria de tudo
-- que o sistema manda (LGPD, fora de horário, pedido de avaliação,
-- agradecimento final) e, por causa disso, era creditada como quem atendeu.
-- Medido: 347 das 494 mensagens públicas dela são template. As outras 147 são
-- atendimento de outras pessoas, entregues por gateway de WhatsApp que carimba
-- o autor no texto — essas voltam para o dono certo.
--
-- `excludedFromEvaluation`: atendimento de teste tirado da avaliação por um
-- SUPER_ADMIN. Não apaga conversa nem mensagem; só sai da média.
--
-- Puramente aditiva, com default que preserva o comportamento atual.

-- AlterTable
ALTER TABLE `chatwoot_conversations` ADD COLUMN `excludedFromEvaluation` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `chatwoot_agent_links` ADD COLUMN `isAutomation` BOOLEAN NOT NULL DEFAULT false;
