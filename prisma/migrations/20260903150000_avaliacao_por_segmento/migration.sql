-- Avaliação de atendimento em dois segmentos: triagem e tratativa.
--
-- Decidido em 2026-09-03. Nesta operação todo atendimento entra pela recepção e
-- só depois vai ao setor; uma nota só media os dois trabalhos como se fossem
-- um. A barreira é a primeira resposta ao cliente de quem não é da recepção —
-- marcada agora em `chatwoot_agent_links.isReception`.
--
-- Sobre os dados existentes: as 705 avaliações herdam `segment = 'TRATATIVA'`
-- pelo DEFAULT e `handlerLabel` nulo. Elas estão pontuadas pela régua antiga
-- (conversa inteira) e serão **substituídas** pelo script de repontuação
-- `scripts/repontuar-avaliacoes.ts`, que apaga e recria por conversa. O DEFAULT
-- existe só para a coluna poder ser NOT NULL sem quebrar a tabela no caminho.
--
-- A troca de índice é o que permite a segunda linha por conversa: o unique
-- deixa de ser em `conversationId` e passa a ser no par com o segmento.

-- DropForeignKey
ALTER TABLE `conversation_evaluations` DROP FOREIGN KEY `conversation_evaluations_conversationId_fkey`;

-- DropIndex
DROP INDEX `conversation_evaluations_conversationId_key` ON `conversation_evaluations`;

-- AlterTable
ALTER TABLE `chatwoot_agent_links` ADD COLUMN `isReception` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `conversation_evaluations` ADD COLUMN `handlerLabel` VARCHAR(120) NULL,
    ADD COLUMN `segment` ENUM('TRIAGEM', 'TRATATIVA') NOT NULL DEFAULT 'TRATATIVA';

-- CreateIndex
CREATE INDEX `conversation_evaluations_tenantId_segment_idx` ON `conversation_evaluations`(`tenantId`, `segment`);

-- CreateIndex
CREATE UNIQUE INDEX `conversation_evaluations_conversationId_segment_key` ON `conversation_evaluations`(`conversationId`, `segment`);

-- AddForeignKey
ALTER TABLE `conversation_evaluations` ADD CONSTRAINT `conversation_evaluations_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chatwoot_conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
