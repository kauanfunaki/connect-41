-- Quadros no modelo do ClickUp (05/11/2026): cada espaço ganha ícone, descrição
-- e a permissão padrão de quem é do setor sem coordená-lo.

-- AlterTable
ALTER TABLE `spaces` ADD COLUMN `defaultPermission` ENUM('TOTAL', 'EDITAR', 'COMENTAR', 'EXIBIR') NOT NULL DEFAULT 'EDITAR',
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `icon` VARCHAR(40) NULL;

-- O bloqueio por setor (28/10/2026) vira a permissão dos espaços: nos setores
-- em que o coordenador tinha bloqueado os colaboradores, eles passam a só
-- comentar. Nos outros fica EDITAR (o padrão acima), que é o que já faziam.
UPDATE `spaces` s
JOIN `quadros_bloqueados_por_setor` b ON b.`tenantId` = s.`tenantId` AND b.`sectorCode` = s.`sectorCode`
SET s.`defaultPermission` = 'COMENTAR';
