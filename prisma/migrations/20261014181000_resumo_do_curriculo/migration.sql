-- Resumo do currículo lido pela IA na ficha do candidato (14/10/2026):
-- Candidatos › ficha › bloco Currículo › "Ler com IA".
-- Só cria a tabela nova `candidate_resume_summaries`; nenhuma tabela existente muda.
-- Sem chave estrangeira, de propósito (ver o model `CandidateResumeSummary` no schema).
-- Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código subir antes, a
-- ficha não quebra: sem a tabela, o "Ler com IA" funciona como hoje, e o resumo
-- só não fica guardado depois de recarregar a página.
-- CreateTable
CREATE TABLE `candidate_resume_summaries` (
    `personId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `filledFields` JSON NOT NULL,
    `sourceDocumentId` VARCHAR(191) NULL,
    `sourceCandidaturaId` VARCHAR(191) NULL,
    `sourceFileName` VARCHAR(180) NULL,
    `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `candidate_resume_summaries_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`personId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
