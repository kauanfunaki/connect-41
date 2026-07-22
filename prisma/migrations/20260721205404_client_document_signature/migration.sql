-- AlterTable
ALTER TABLE `client_document_recipients` ADD COLUMN `signedAt` DATETIME(3) NULL,
    ADD COLUMN `signerIp` VARCHAR(64) NULL,
    ADD COLUMN `signerName` VARCHAR(180) NULL;

-- AlterTable
ALTER TABLE `client_document_views` MODIFY `action` ENUM('VIEWED', 'DOWNLOADED', 'SIGNED') NOT NULL DEFAULT 'VIEWED';

-- AlterTable
ALTER TABLE `client_documents` ADD COLUMN `requiresSignature` BOOLEAN NOT NULL DEFAULT false;
