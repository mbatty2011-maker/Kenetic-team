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

  // RFC 6266: Content-Disposition with non-ASCII filenames must use the filename*=UTF-8''<pct-encoded>
  // form. The plain filename= is an ASCII fallback for legacy clients; raw non-ASCII there will cause
  // Node's HTTP layer to reject the response and the browser to surface "Site wasn't available".
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const encodedUtf8 = encodeURIComponent(filename);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
