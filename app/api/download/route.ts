import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") ?? "download";

  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  if (!url.includes("/storage/v1/object/sign/agent-files/"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const res = await fetch(url);
  if (!res.ok)
    return NextResponse.json({ error: "Fetch failed" }, { status: res.status });

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
