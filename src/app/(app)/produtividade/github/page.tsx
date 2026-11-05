import { GithubScreen } from "@/components/github/GithubScreen";

export default function GithubPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GithubScreen view="general" searchParams={searchParams} />;
}
