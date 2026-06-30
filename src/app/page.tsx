import { redirect } from "next/navigation";

// Rota raiz redireciona para /home (dentro do grupo (app) que tem o shell).
export default function RootPage() {
  redirect("/home");
}
