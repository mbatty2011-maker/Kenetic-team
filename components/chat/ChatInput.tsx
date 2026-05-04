"use client";

import { useState, useRef, useEffect } from "react";
import { AGENTS } from "@/lib/agents";
import MarcusFileChip from "./MarcusFileChip";

const MAX_CHARS = 32000;
const WARN_AT = MAX_CHARS * 0.5;

export interface ChatInputAttachment {
  document_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  parsed_text_preview: string;
}

const ATTACH_ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export default function ChatInput({
  onSend,
  isLoading,
  agentKey,
  pendingValue,
}: {
  onSend: (message: string, attachments: ChatInputAttachment[]) => void;
  isLoading: boolean;
  agentKey: string;
  pendingValue?: { text: string } | null;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<ChatInputAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const agent = AGENTS.find((a) => a.key === agentKey);
  const charCount = value.length;
  const showCounter = charCount >= WARN_AT;
  const isOverLimit = charCount > MAX_CHARS;
  const supportsAttachments = agentKey === "marcus";

  useEffect(() => {
    adjustHeight();
  }, [value]);

  useEffect(() => {
    if (!pendingValue) return;
    setValue(pendingValue.text);
    textareaRef.current?.focus();
  }, [pendingValue]);

  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 20 * 5 + 24;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || isLoading || isOverLimit || uploading)
      return;
    onSend(trimmed, attachments);
    setValue("");
    setAttachments([]);
    setUploadError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ATTACH_ALLOWED_MIMES.includes(file.type)) {
      setUploadError("Marcus accepts PDF and DOCX files only.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File too large (10 MB max).");
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/marcus/upload", { method: "POST", body: form });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setAttachments((prev) => [
        ...prev,
        {
          document_id: data.document_id,
          name: data.original_filename ?? file.name,
          mime_type: data.mime_type ?? file.type,
          size_bytes: data.size_bytes ?? file.size,
          parsed_text_preview: data.parsed_text_preview ?? "",
        },
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-2">
      {supportsAttachments && (attachments.length > 0 || uploading || uploadError) && (
        <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
          {attachments.map((a) => (
            <MarcusFileChip
              key={a.document_id}
              name={a.name}
              sizeBytes={a.size_bytes}
              onRemove={() =>
                setAttachments((prev) =>
                  prev.filter((x) => x.document_id !== a.document_id)
                )
              }
            />
          ))}
          {uploading && <MarcusFileChip name="Uploading…" sizeBytes={0} uploading />}
          {uploadError && (
            <span
              className="text-xs text-red-400"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {uploadError}
            </span>
          )}
        </div>
      )}
      <div
        className={`bg-black border flex items-end gap-2 px-3 py-2 ${
          isOverLimit ? "border-red-500" : "border-white"
        }`}
      >
        {supportsAttachments && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || uploading}
              aria-label="Attach a PDF or DOCX"
              title="Attach PDF or DOCX (max 10 MB)"
              className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white border border-white/20 hover:border-white transition-colors duration-200 disabled:opacity-30 mb-0.5"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M9.5 4l-5 5a2 2 0 1 0 2.83 2.83l5-5a3.5 3.5 0 0 0-4.95-4.95l-5 5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder={`Message ${agentKey === "boardroom" ? "Boardroom" : (agent?.name ?? "")}...`}
          rows={1}
          className="flex-1 text-sm text-white placeholder:text-white/30 leading-5 py-1 bg-transparent disabled:opacity-50 focus:outline-none resize-none"
          style={{ minHeight: "28px", maxHeight: "120px" }}
        />

        <div className="flex items-center gap-2 flex-shrink-0 mb-0.5">
          {showCounter && (
            <span
              className={`text-[10px] tabular-nums transition-colors ${
                isOverLimit ? "text-red-400 font-bold" : "text-white/40"
              }`}
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {charCount.toLocaleString()}/{MAX_CHARS.toLocaleString()}
            </span>
          )}
          <button
            onClick={handleSend}
            disabled={
              (!value.trim() && attachments.length === 0) ||
              isLoading ||
              isOverLimit ||
              uploading
            }
            className="w-8 h-8 flex items-center justify-center text-black bg-white border border-white hover:bg-black hover:text-white transition-colors duration-200 disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7L7 2L12 7M7 2V12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <p
        className="text-center text-xs text-white/30 mt-1.5"
        style={{ fontFamily: "var(--font-space-mono), monospace" }}
      >
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
