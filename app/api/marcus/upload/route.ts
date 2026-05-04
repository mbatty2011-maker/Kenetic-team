import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAgentFile } from "@/lib/files/upload";
import { parseDocument, buildPreview, PDF_MIME, DOCX_MIME } from "@/lib/tools/documents";
import { getUserTier } from "@/lib/tier";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([PDF_MIME, DOCX_MIME]);

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tier = await getUserTier(supabase, user.id);
  if (tier === "free") {
    return NextResponse.json(
      { error: "tier_required", message: "Document upload requires a Solo plan or higher." },
      { status: 402 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}". Marcus accepts PDF and DOCX.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${Math.round(file.size / 1024 / 1024)} MB). Max 10 MB.`,
      },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let storage: { signedUrl: string; storagePath: string; sizeBytes: number };
  try {
    storage = await uploadAgentFile(user.id, file.name, buffer, file.type);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "upload failed";
    console.error("[marcus/upload] storage upload failed", { user: user.id, error: msg });
    return NextResponse.json({ error: `Storage upload failed: ${msg}` }, { status: 500 });
  }

  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  try {
    parsed = await parseDocument(buffer, file.type);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    console.error("[marcus/upload] parse failed", { user: user.id, mime: file.type, error: msg });
    return NextResponse.json(
      {
        error: `Could not parse this ${file.type === PDF_MIME ? "PDF" : "DOCX"}. ${msg}`,
      },
      { status: 422 }
    );
  }

  const preview = buildPreview(parsed.text, 2000);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error: insertError } = await (admin as any).rpc("create_marcus_document", {
    p_user_id: user.id,
    p_storage_path: storage.storagePath,
    p_original_filename: file.name,
    p_mime_type: file.type,
    p_size_bytes: storage.sizeBytes,
    p_page_count: parsed.pageCount || null,
    p_parsed_text: parsed.text,
    p_parsed_text_preview: preview,
  });
  if (insertError || !row) {
    console.error("[marcus/upload] document row insert failed", {
      error: insertError?.message,
    });
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to record document" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    document_id: row.id,
    storage_path: storage.storagePath,
    signed_url: storage.signedUrl,
    parsed_text_preview: preview,
    page_count: parsed.pageCount || null,
    mime_type: file.type,
    size_bytes: storage.sizeBytes,
    original_filename: file.name,
  });
}
