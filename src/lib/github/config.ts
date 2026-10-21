import { z } from "zod";
import { GithubError } from "./rules";

export const credentialsSchema = z.object({
  action: z.literal("credentials"), generation: z.number().int().nonnegative(),
  clientId: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9_.-]+$/),
  clientSecret: z.string().trim().max(1024).regex(/^\S*$/).default(""),
});
export type OAuthCredentials = { clientId: string; clientSecret: string };

export function oauthCredentials(config: Record<string, string>): OAuthCredentials {
  if (!config.clientId || !config.clientSecret) throw new GithubError("Preencha o Client ID e o Client Secret em Integrações → GitHub.");
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

// Campos vazios preservam o segredo apenas quando o aplicativo é o mesmo.
export function mergeCredentials(input: z.infer<typeof credentialsSchema>, previous: Record<string, string>): OAuthCredentials {
  const clientSecret = input.clientSecret || (input.clientId === previous.clientId ? previous.clientSecret : "");
  if (!clientSecret) throw new GithubError("Informe o Client Secret deste OAuth App.");
  return { clientId: input.clientId, clientSecret };
}
