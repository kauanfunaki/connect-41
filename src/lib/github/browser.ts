export async function githubFetch<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Sessão indisponível. Entre novamente para continuar.");
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Não foi possível concluir a consulta.");
  return result as T;
}
