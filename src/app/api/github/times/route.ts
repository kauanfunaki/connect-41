import { getTimes, githubResponse, postTimes } from "@/lib/github/http";
export const dynamic = "force-dynamic";
export const GET = () => githubResponse(getTimes);
export const POST = (request: Request) => githubResponse(() => postTimes(request));
