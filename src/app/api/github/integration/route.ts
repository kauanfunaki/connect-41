import { getIntegration, githubResponse, postIntegration } from "@/lib/github/http";
export const dynamic = "force-dynamic";
export const GET = () => githubResponse(getIntegration);
export const POST = (request: Request) => githubResponse(() => postIntegration(request));
