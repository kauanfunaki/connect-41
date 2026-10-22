import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  if (!/^[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(filename)) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const ext = filename.split(".").pop() as string;
  const filePath = path.join(process.cwd(), "public", "uploads", "workspaces", filename);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        // `public` desde 22/10/2026: o logo vai nos e-mails ao cliente, e o
        // proxy de imagens do leitor de e-mail (o do Gmail, por exemplo) só
        // guarda cópia do que é público. A rota já era aberta (proxy.ts), serve
        // só o logo do escritório, e a URL muda (`?v=`) quando o logo troca.
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo não encontrada" }, { status: 404 });
  }
}
