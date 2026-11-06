import { GithubScreen } from "@/components/github/GithubScreen";

export default function RepositoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GithubScreen view="repositories" searchParams={searchParams} />;
}
