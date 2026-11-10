-- Controle interno (10/11/2026): o número do item no escritório, para o
-- endereço curto (/controle-interno/bug-123). Uma sequência só por escritório,
-- para todos os tipos. A coluna entra vazia, os itens que já existem recebem o
-- número na ordem em que foram criados (o id desempata dois itens do mesmo
-- instante) e só depois ela passa a obrigatória, com o número único no
-- escritório. Item novo recebe o número na criação, pelo app.
-- AlterTable
ALTER TABLE `tech_internal_items` ADD COLUMN `number` INTEGER NULL;

-- Preenche os itens existentes, de 1 em diante em cada escritório.
UPDATE `tech_internal_items` ti
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `tech_internal_items`
) t ON t.id = ti.id
SET ti.`number` = t.n;

-- AlterTable
ALTER TABLE `tech_internal_items` MODIFY `number` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `tech_internal_items_tenantId_number_key` ON `tech_internal_items`(`tenantId`, `number`);
