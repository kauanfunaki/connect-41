-- Índices para a listagem do acervo fiscal SEM filtro de empresa.
--
-- ─── O que estava acontecendo ────────────────────────────────────────────────
--
-- Medido em 2026-09-09 contra produção, com 244.558 linhas em
-- `fiscal_documents`. A tela `/documentos-fiscais` dispara quatro consultas em
-- paralelo e nenhuma delas tinha índice utilizável:
--
--   34.647 ms  findMany 50 + ORDER BY issuedAt DESC, id DESC
--   32.083 ms  GROUP BY competence      (competências disponíveis)
--   25.102 ms  GROUP BY destination     (resumo por destino)
--    1.743 ms  COUNT(*)
--
-- Os quatro índices que já existem começam em `(tenantId, companyId)`, e a tela
-- abre sem filtro de empresa — então nenhum servia, e o banco varria a tabela
-- inteira quatro vezes ao mesmo tempo. A página nunca terminava de carregar; um
-- refresh "às vezes dava certo" porque o buffer pool estava quente.
--
-- Quando o acervo tinha 16 mil linhas isto passava despercebido. Cresceu 15x em
-- um dia, com o cron do SPED rodando de dez em dez minutos.
--
-- ─── Por que estes três ──────────────────────────────────────────────────────
--
-- `(tenantId, issuedAt, id)` cobre a ordenação da listagem. Ascendente serve:
-- o MySQL percorre índice de trás para frente para ORDER BY ... DESC.
--
-- `(tenantId, competence)` e `(tenantId, situation, destination)` cobrem os dois
-- agrupamentos, que hoje são varredura pura.
--
-- ─── Segurança ───────────────────────────────────────────────────────────────
--
-- Puramente aditiva: só CREATE INDEX, nenhuma coluna ou dado tocado. No MySQL 8+
-- criação de índice é ALGORITHM=INPLACE com LOCK=NONE, então leitura e escrita
-- seguem durante a criação. Em 244 mil linhas leva segundos, não minutos.
CREATE INDEX `fiscal_documents_tenantId_issuedAt_id_idx`
  ON `fiscal_documents` (`tenantId`, `issuedAt`, `id`);

CREATE INDEX `fiscal_documents_tenantId_competence_idx`
  ON `fiscal_documents` (`tenantId`, `competence`);

CREATE INDEX `fiscal_documents_tenantId_situation_destination_idx`
  ON `fiscal_documents` (`tenantId`, `situation`, `destination`);
