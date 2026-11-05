import { GithubScreen } from "@/components/github/GithubScreen";

export default function DevelopersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GithubScreen view="developers" searchParams={searchParams} />;
}
