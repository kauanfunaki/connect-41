ALTER TABLE `pipeline_items` ADD COLUMN `order` INTEGER NOT NULL DEFAULT 0;

UPDATE `pipeline_items` pi
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY pipelineId, stageId, parentItemId ORDER BY createdAt) - 1 AS rn
  FROM `pipeline_items`
) t ON t.id = pi.id
SET pi.`order` = t.rn;

CREATE INDEX `pipeline_items_pipelineId_stageId_parentItemId_order_idx` ON `pipeline_items`(`pipelineId`, `stageId`, `parentItemId`, `order`);
