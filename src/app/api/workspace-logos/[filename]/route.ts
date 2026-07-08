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
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo não encontrada" }, { status: 404 });
  }
}
