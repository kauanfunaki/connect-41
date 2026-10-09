-- Regime tributário em campos (09/10/2026) — primeira peça da preparação para o
-- Serpro: saber, sem casar texto, qual guia buscar de cada cliente.
--
-- Rodar ANTES da publicação: o app passa a ler e gravar as quatro colunas novas
-- em `companies`, e sem elas a tela de empresas (e tudo que lista empresa) cai.
--
-- O UPDATE do fim preenche as empresas que já existem a partir do texto de
-- `taxRegime`, com as MESMAS regras de `camposDoRegime()` em
-- src/lib/taxRegime.ts. A tabela usa utf8mb4_unicode_ci, então o LIKE já ignora
-- maiúscula e acento: "Pró-Labóre" casa com 'pro%labore'. Rodar de novo não
-- muda nada — o UPDATE só recalcula a partir do texto, que ele não toca.

-- AlterTable
ALTER TABLE `companies` ADD COLUMN `taxRegimeKind` ENUM('SIMPLES_NACIONAL', 'MEI', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'IMUNE_ISENTA', 'PRODUTOR_RURAL', 'DOMESTICA') NULL,
    ADD COLUMN `taxNoMovement` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `taxHasEmployees` BOOLEAN NULL,
    ADD COLUMN `taxHasProLabore` BOOLEAN NULL;

-- CreateIndex
CREATE INDEX `companies_tenantId_taxRegimeKind_idx` ON `companies`(`tenantId`, `taxRegimeKind`);

-- Backfill (uma atribuição por linha; o regime olha só o trecho antes do primeiro " - ")
UPDATE `companies` SET
  `taxRegimeKind` = CASE
    WHEN `taxRegime` IS NULL OR TRIM(`taxRegime`) = '' THEN NULL
    WHEN TRIM(SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1)) = 'mei' OR TRIM(SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1)) LIKE 'mei %' THEN 'MEI'
    WHEN SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1) LIKE '%simples%' THEN 'SIMPLES_NACIONAL'
    WHEN SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1) LIKE '%presumido%' THEN 'LUCRO_PRESUMIDO'
    WHEN SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1) LIKE '%lucro real%' THEN 'LUCRO_REAL'
    WHEN SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1) LIKE '%imune%' OR SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1) LIKE '%isenta%' THEN 'IMUNE_ISENTA'
    WHEN SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1) LIKE '%produtor rural%' THEN 'PRODUTOR_RURAL'
    WHEN SUBSTRING_INDEX(TRIM(`taxRegime`), ' - ', 1) LIKE '%domestica%' THEN 'DOMESTICA'
    ELSE NULL
  END,
  `taxNoMovement` = CASE
    WHEN `taxRegime` LIKE '%sem movimento%' OR `taxRegime` LIKE '%inativ%' THEN TRUE
    ELSE FALSE
  END,
  `taxHasEmployees` = CASE
    WHEN `taxRegime` LIKE '%com funcionario%' THEN TRUE
    WHEN `taxRegime` LIKE '%sem funcionario%' THEN FALSE
    ELSE NULL
  END,
  `taxHasProLabore` = CASE
    WHEN `taxRegime` LIKE '%com pro%labore%' THEN TRUE
    WHEN `taxRegime` LIKE '%sem pro%labore%' THEN FALSE
    ELSE NULL
  END;
