-- Arquivos: busca em todas as empresas (09/11/2026). A busca lista os arquivos
-- mais recentes primeiro e para nos 50; com a data no índice, o MySQL anda nele
-- de trás para a frente e para no limite, em vez de ordenar todos os arquivos
-- do escritório a cada busca.
--
-- Só acrescenta um índice (o InnoDB cria sem travar a tabela). O app novo roda
-- sem ele, só mais devagar; rodar antes da publicação mesmo assim.

-- CreateIndex
CREATE INDEX `drive_files_tenantId_deletedAt_createdAt_idx` ON `drive_files`(`tenantId`, `deletedAt`, `createdAt`);
