import { getIntegration, githubResponse, postIntegration } from "@/lib/github/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => githubResponse(() => getIntegration(request));
export const POST = (request: Request) => githubResponse(() => postIntegration(request));
