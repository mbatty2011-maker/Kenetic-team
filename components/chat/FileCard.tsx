"use client";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXT_ICONS: Record<string, string> = {
  docx: "📄",
  xlsx: "📊",
  pdf:  "📋",
};

// Storage paths are `{userId}/{date}/{uuid}-{base}.{ext}` (see lib/files/upload.ts).
// Deriving from the URL guarantees an ASCII-safe download filename, regardless of
// whatever the markdown link label happens to contain.
function deriveDownloadFilename(href: string): string {
  try {
    const last = new URL(href).pathname.split("/").pop() ?? "";
    return last.replace(/^[0-9a-f-]{36}-/, "") || last || "download";
  } catch {
    return "download";
  }
}

export default function FileCard({ href, filename }: { href: string; filename: string }) {
  const downloadFilename = deriveDownloadFilename(href);
  const ext = downloadFilename.split(".").pop()?.toLowerCase() ?? "";
  const icon = EXT_ICONS[ext] ?? "📎";
  const label = ext.toUpperCase();

  let sizeLabel: string | null = null;
  try {
    const url = new URL(href);
    const sz = parseInt(url.searchParams.get("_sz") ?? "0", 10);
    if (sz > 0) sizeLabel = formatBytes(sz);
  } catch {
    // ignore malformed URL
  }

  const proxyHref = `/api/download?url=${encodeURIComponent(href)}&filename=${encodeURIComponent(downloadFilename)}`;

  return (
    <span className="inline-flex items-center gap-3 border border-apple-gray-200 rounded-apple-lg px-4 py-3 bg-white shadow-sm my-1 max-w-xs">
      <span className="text-xl flex-shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-apple-gray-950 truncate">{filename}</span>
        <span className="block text-xs text-apple-gray-500">
          {label}{sizeLabel ? ` · ${sizeLabel}` : ""} · Expires in 24h
        </span>
      </span>
      <a
        href={proxyHref}
        download={downloadFilename}
        className="ml-1 text-xs font-medium text-white bg-apple-gray-950 hover:bg-apple-gray-800 rounded-apple-md px-3 py-1.5 transition-colors flex-shrink-0 no-underline"
        onClick={(e) => e.stopPropagation()}
      >
        Download
      </a>
    </span>
  );
}
