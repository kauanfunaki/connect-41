-- Ponte com o SPED — etapa 6 da Fase 2.
--
-- O Connect NÃO fala com o MySQL do SPED. Consome os endpoints
-- `/api/integracao/` do painel de lá, com token de serviço no `.env` — nenhuma
-- credencial de banco atravessa, e a descompressão zstd com dicionário treinado
-- fica do lado que já a resolve.
--
-- `sped_sync_states` guarda UMA coisa por raiz de CNPJ: o `cursor_retomada`,
-- opaco em base64, devolvido verbatim. Ele carrega o instante E o desempate por
-- (tipo, identificador). Sincronizar só por instante foi medido do lado de lá:
-- um delta que devia vir vazio trouxe 91.435 documentos, porque um lote carimba
-- dezenas de milhares no mesmo segundo e o corte é `>=` de propósito.
--
-- `amount` passa a ser ANULÁVEL, e isso não é relaxamento: linha `PARCIAL` do
-- índice vem sem valor, montada só do que a chave de acesso carrega. Gravar zero
-- ali inventaria um número que ninguém apurou — e zero soma no fechamento.
--
-- `spedTipo` + `spedIdentificador` são a identidade do documento do lado de lá.
-- Sem eles não há como pedir o PDF de uma NFS-e, que não tem chave nacional.
--
-- `removedAtOrigin` é a lápide MARCADA, não apagada: da listagem o documento
-- some, mas a linha sobrevive porque a reimportação ressuscita (vira update, não
-- recriação) e porque é ela que vai carregar o sinal de "origem cancelada" para
-- o lançamento da etapa 7.
--
-- Aditiva, fora o MODIFY do `amount`, que só afrouxa a coluna: nenhuma linha
-- existente deixa de ser válida.

-- AlterTable
ALTER TABLE `fiscal_documents` ADD COLUMN `completude` ENUM('COMPLETO', 'PARCIAL') NOT NULL DEFAULT 'COMPLETO',
    ADD COLUMN `removedAtOrigin` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `removedAtOriginAt` DATETIME(3) NULL,
    ADD COLUMN `renderizavel` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `spedIdentificador` VARCHAR(120) NULL,
    ADD COLUMN `spedTipo` VARCHAR(8) NULL,
    MODIFY `amount` DECIMAL(12, 2) NULL;
-- CreateTable
CREATE TABLE `sped_sync_states` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `cnpjRaiz` VARCHAR(8) NOT NULL,
    `cursorRetomada` TEXT NULL,
    `watermark` VARCHAR(60) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `sped_sync_states_tenantId_cnpjRaiz_key`(`tenantId`, `cnpjRaiz`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateIndex
CREATE INDEX `fiscal_documents_tenantId_spedTipo_spedIdentificador_idx` ON `fiscal_documents`(`tenantId`, `spedTipo`, `spedIdentificador`);
-- AddForeignKey
ALTER TABLE `sped_sync_states` ADD CONSTRAINT `sped_sync_states_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
