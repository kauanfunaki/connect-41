import { githubResponse, validCronToken } from "@/lib/github/http";
import { processGithubCron } from "@/lib/github/sync";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  if (!validCronToken(request)) return Response.json({ error: "Não autorizado" }, { status: 401 });
  return githubResponse(processGithubCron);
}
