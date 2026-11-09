-- Pedido por link público (09/11/2026): o assunto da solicitação ganha a
-- opção "Aceita pedido por link público". Ligada, quem ainda não é cliente
-- preenche o formulário em /pedido/[slug]/[id do assunto], sem login, e o
-- pedido vira solicitação desse assunto.
--
-- `service_request_subjects.publicLink`: só uma coluna nova, desligada por
-- padrão — nenhum assunto existente passa a aceitar pedido sem alguém ligar.
-- Rodar ANTES do deploy: a tela de Assuntos e a página pública leem a coluna,
-- e sem ela a página cai.

-- AlterTable
ALTER TABLE `service_request_subjects` ADD COLUMN `publicLink` BOOLEAN NOT NULL DEFAULT false;
