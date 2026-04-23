import { createAdminClient } from "@/lib/supabase/admin";

export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")       // strip extension
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
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
    console.error("[uploadAgentFile] upload error", { path, message: uploadError.message, name: uploadError.name });
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data, error: urlError } = await supabase.storage
    .from("agent-files")
    .createSignedUrl(path, 86400); // 24h

  if (urlError || !data) throw new Error(`Signed URL failed: ${urlError?.message}`);

  const sizeBytes = buffer.byteLength;
  // Append size as a non-validated query param so FileCard can display it
  const signedUrl = `${data.signedUrl}&_sz=${sizeBytes}`;

  return { signedUrl, storagePath: path, sizeBytes };
}
