-- Capa colorida nos cartões do quadro, como no Trello (27/11/2026, funcionalidade-845).
-- `coverColor` é a capa escolhida no cartão; `color` é a cor do tipo de processo,
-- escolhida pelo setor em Processos > Roteiros. As duas guardam a chave de uma cor
-- da paleta fixa (src/lib/kanban/capa.ts), não o hex.
--
-- Só duas colunas opcionais; não altera registros existentes nem pré-preenche cor.

-- AlterTable
ALTER TABLE `pipeline_items` ADD COLUMN `coverColor` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `process_types` ADD COLUMN `color` VARCHAR(20) NULL;
