-- Endereço curto nas telas de detalhe (10/11/2026, pedido do Kauan): o número
-- de cada registro no escritório, para /empresas/empresa-301,
-- /pessoas/pessoa-12, /chamados/chamado-45, /processos/processo-12,
-- /transferencias/transferencia-8, /pendencias/pendencia-9 e
-- /kanban/itens/tarefa-77 — o mesmo desenho do Controle interno
-- (20261110170000_numero_do_item_tech). A solicitação não entra: ela já tem o
-- número do protocolo (service_requests.number), que vira o endereço.
--
-- Em cada tabela, a coluna entra vazia, os registros que já existem recebem o
-- número na ordem em que foram criados, de 1 em diante em cada escritório (o
-- id desempata dois do mesmo instante), e só depois ela passa a obrigatória,
-- com o número único no escritório. Registro novo recebe o número na criação,
-- pelo app (`proximoNumero`, src/lib/enderecoCurtoNumeracao.ts).

-- Empresas
ALTER TABLE `companies` ADD COLUMN `number` INTEGER NULL;
UPDATE `companies` c
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `companies`
) t ON t.id = c.id
SET c.`number` = t.n;
ALTER TABLE `companies` MODIFY `number` INTEGER NOT NULL;
CREATE UNIQUE INDEX `companies_tenantId_number_key` ON `companies`(`tenantId`, `number`);

-- Pessoas
ALTER TABLE `people` ADD COLUMN `number` INTEGER NULL;
UPDATE `people` p
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `people`
) t ON t.id = p.id
SET p.`number` = t.n;
ALTER TABLE `people` MODIFY `number` INTEGER NOT NULL;
CREATE UNIQUE INDEX `people_tenantId_number_key` ON `people`(`tenantId`, `number`);

-- Chamados
ALTER TABLE `helpdesk_tickets` ADD COLUMN `number` INTEGER NULL;
UPDATE `helpdesk_tickets` h
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `helpdesk_tickets`
) t ON t.id = h.id
SET h.`number` = t.n;
ALTER TABLE `helpdesk_tickets` MODIFY `number` INTEGER NOT NULL;
CREATE UNIQUE INDEX `helpdesk_tickets_tenantId_number_key` ON `helpdesk_tickets`(`tenantId`, `number`);

-- Processos
ALTER TABLE `processes` ADD COLUMN `number` INTEGER NULL;
UPDATE `processes` p
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `processes`
) t ON t.id = p.id
SET p.`number` = t.n;
ALTER TABLE `processes` MODIFY `number` INTEGER NOT NULL;
CREATE UNIQUE INDEX `processes_tenantId_number_key` ON `processes`(`tenantId`, `number`);

-- Transferências
ALTER TABLE `handoffs` ADD COLUMN `number` INTEGER NULL;
UPDATE `handoffs` h
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `handoffs`
) t ON t.id = h.id
SET h.`number` = t.n;
ALTER TABLE `handoffs` MODIFY `number` INTEGER NOT NULL;
CREATE UNIQUE INDEX `handoffs_tenantId_number_key` ON `handoffs`(`tenantId`, `number`);

-- Pendências ao cliente
ALTER TABLE `client_requests` ADD COLUMN `number` INTEGER NULL;
UPDATE `client_requests` r
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `client_requests`
) t ON t.id = r.id
SET r.`number` = t.n;
ALTER TABLE `client_requests` MODIFY `number` INTEGER NOT NULL;
CREATE UNIQUE INDEX `client_requests_tenantId_number_key` ON `client_requests`(`tenantId`, `number`);

-- Tarefas dos Quadros
ALTER TABLE `pipeline_items` ADD COLUMN `number` INTEGER NULL;
UPDATE `pipeline_items` i
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenantId ORDER BY createdAt, id) AS n
  FROM `pipeline_items`
) t ON t.id = i.id
SET i.`number` = t.n;
ALTER TABLE `pipeline_items` MODIFY `number` INTEGER NOT NULL;
CREATE UNIQUE INDEX `pipeline_items_tenantId_number_key` ON `pipeline_items`(`tenantId`, `number`);
