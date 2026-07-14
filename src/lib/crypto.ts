import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Criptografia simétrica para segredos guardados no banco (hoje só a senha SMTP
// por tenant em TenantSmtpConfig.passwordEnc). Diferente dos segredos de app
// (JWT_ACCESS_SECRET etc.), que ficam só em env — aqui o segredo pertence ao
// tenant e precisa ser lido de volta em runtime para autenticar no SMTP dele.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM

function getKey(): Buffer {
  const secret = process.env.SECRETS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("SECRETS_ENCRYPTION_KEY não configurada — necessária para criptografar/decriptar segredos de tenant.");
  }
  // scrypt deriva uma chave de 32 bytes de qualquer string configurada, sem
  // exigir que o operador gere um hex de tamanho exato.
  return scryptSync(secret, "connect41-tenant-secrets", 32);
}

// Formato: <iv>:<authTag>:<ciphertext>, tudo em hex.
export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivHex, authTagHex, dataHex] = payload.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Payload criptografado em formato inválido.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
