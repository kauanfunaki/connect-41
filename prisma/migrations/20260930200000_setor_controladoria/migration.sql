-- Setor Controladoria (30/09/2026): dono do módulo Conversas.
--
-- Só dado, nenhuma coluna. Entra nos tenants que já têm setores e ainda não
-- têm este — tenant sem nenhum setor ainda vai ser semeado pelo
-- ensureDefaultSectors, que já inclui a Controladoria, e criar uma linha aqui
-- impediria essa semeadura (ela só roda com zero setores).
INSERT INTO `sectors` (`id`, `tenantId`, `code`, `label`, `color`, `active`, `order`, `createdAt`, `updatedAt`)
SELECT UUID(), t.`id`, 'controladoria', 'Controladoria', '#B8327A', true,
       (SELECT COALESCE(MAX(s.`order`), -1) + 1 FROM `sectors` s WHERE s.`tenantId` = t.`id`),
       NOW(3), NOW(3)
FROM `tenants` t
WHERE EXISTS (SELECT 1 FROM `sectors` s1 WHERE s1.`tenantId` = t.`id`)
  AND NOT EXISTS (SELECT 1 FROM `sectors` s2 WHERE s2.`tenantId` = t.`id` AND s2.`code` = 'controladoria');
