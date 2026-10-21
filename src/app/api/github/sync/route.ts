import { githubResponse, postSync } from "@/lib/github/http";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => githubResponse(() => postSync(request));
