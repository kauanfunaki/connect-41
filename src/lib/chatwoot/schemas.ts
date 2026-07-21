import { z } from "zod";

// Validação defensiva do payload de webhook — o Chatwoot não garante schema
// versionado, então validamos só o mínimo necessário para processar com
// segurança (rejeita payload claramente fora do formato esperado antes de
// tocar no banco).
export const chatwootWebhookEventSchema = z.object({
  event: z.enum([
    "conversation_created",
    "conversation_updated",
    "conversation_status_changed",
    "message_created",
    "message_updated",
    "contact_created",
    "contact_updated",
  ]),
  id: z.number().optional(),
  account: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
  conversation: z
    .object({
      id: z.number(),
      inbox_id: z.number(),
      status: z.string(),
      account_id: z.union([z.number(), z.string()]).optional(),
    })
    .passthrough()
    .optional(),
  content: z.string().nullable().optional(),
  message_type: z.number().optional(),
  content_type: z.string().optional(),
  private: z.boolean().optional(),
  sender: z.object({ id: z.number(), name: z.string().optional(), type: z.string().optional() }).optional(),
  attachments: z
    .array(z.object({ id: z.number(), file_type: z.string(), file_size: z.number().optional(), data_url: z.string() }))
    .optional(),
  created_at: z.union([z.string(), z.number()]).optional(),
  updated_at: z.union([z.string(), z.number()]).optional(),
});

// Limite defensivo contra payload excessivo (Etapa 7 do pedido original) —
// aplicado ANTES de fazer JSON.parse no corpo bruto do webhook.
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
