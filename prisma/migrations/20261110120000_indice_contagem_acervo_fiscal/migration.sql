-- Contagem exata do acervo fiscal (10/11/2026): o total, os cartões e a última
-- página de Documentos fiscais paravam em 1000 porque contar abria cada linha
-- para ler `removedAtOrigin`, que nenhum índice tinha. Com este índice, `count`
-- e o `groupBy` por destino de uma empresa leem só o índice.
--
-- Só cria índice: o InnoDB monta sem travar a tabela (ALGORITHM=INPLACE).
CREATE INDEX `fiscal_documents_contagem_idx` ON `fiscal_documents`(`tenantId`, `companyId`, `removedAtOrigin`, `competence`, `destination`, `situation`, `type`);
