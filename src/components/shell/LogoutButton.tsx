"use client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-[12px] text-fg-muted hover:text-danger transition-colors px-1.5 py-1 rounded"
    >
      Sair
    </button>
  );
}
