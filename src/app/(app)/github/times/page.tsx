import { GithubScreen } from "@/components/github/GithubScreen";

export default function TeamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GithubScreen view="teams" searchParams={searchParams} />;
}
