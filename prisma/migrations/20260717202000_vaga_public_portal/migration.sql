-- Portal público de vagas (/carreiras/[slug])
ALTER TABLE `vagas` ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `vagas` ADD COLUMN `publicDescription` TEXT NULL;
