import { getDayEvents, githubResponse } from "@/lib/github/http";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => githubResponse(() => getDayEvents(request));
