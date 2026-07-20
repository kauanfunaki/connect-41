-- Config de provedor de IA por tenant (Anthropic ou OpenAI), configurável em
-- Integrações → Inteligência Artificial. Chave criptografada (AES-256-GCM,
-- mesmo padrão de tenant_smtp_configs.passwordEnc). Ausência de linha = usa o
-- fallback global via env (ANTHROPIC_API_KEY/OPENAI_API_KEY).

-- CreateTable
CREATE TABLE `tenant_ai_configs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `provider` ENUM('ANTHROPIC', 'OPENAI') NOT NULL,
    `apiKeyEnc` TEXT NOT NULL,
    `model` VARCHAR(80) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_ai_configs_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_ai_configs` ADD CONSTRAINT `tenant_ai_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
