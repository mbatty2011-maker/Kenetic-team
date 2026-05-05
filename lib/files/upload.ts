import { createAdminClient } from "@/lib/supabase/admin";

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")          // strip extension (re-appended by uploadAgentFile)
      .replace(/[^a-zA-Z0-9._-]/g, "-") // allowlist: em dashes, ampersands, whitespace, and any non-ASCII → "-"
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .toLowerCase() || "file"
  );
}

export async function uploadAgentFile(
  userId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<{ signedUrl: string; storagePath: string; sizeBytes: number }> {
  const supabase = createAdminClient();
  const date = new Date().toISOString().slice(0, 10);
  const uuid = crypto.randomUUID();
  const ext = filename.split(".").pop() ?? "";
  const base = sanitizeFilename(filename);
  const path = `${userId}/${date}/${uuid}-${base}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("agent-files")
    .upload(path, buffer, { contentType, upsert: false });

  if (uploadError) {
    console.error("[uploadAgentFile] storage upload failed", { path, error: uploadError.message });
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data, error: urlError } = await supabase.storage
    .from("agent-files")
    .createSignedUrl(path, 86400); // 24h

  if (urlError || !data) {
    // Clean up the orphaned upload
    await supabase.storage.from("agent-files").remove([path]).catch(() => {});
    console.error("[uploadAgentFile] signed URL failed", { path, error: urlError?.message });
    throw new Error(`Signed URL failed: ${urlError?.message ?? "unknown"}`);
  }

  const sizeBytes = buffer.byteLength;
  // Append size as a query param so FileCard can display it without an extra DB call
  const urlObj = new URL(data.signedUrl);
  urlObj.searchParams.set("_sz", String(sizeBytes));
  const signedUrl = urlObj.toString();

  return { signedUrl, storagePath: path, sizeBytes };
}
