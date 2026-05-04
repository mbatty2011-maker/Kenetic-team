"use client";

interface Props {
  name: string;
  sizeBytes: number;
  onRemove?: () => void;
  uploading?: boolean;
}

export default function MarcusFileChip({ name, sizeBytes, onRemove, uploading }: Props) {
  const kb = Math.round(sizeBytes / 1024);
  const sizeLabel = sizeBytes === 0 ? "" : kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
  return (
    <div
      className="inline-flex items-center gap-2 px-2 py-1 border border-white/40 bg-black text-white text-xs"
      style={{ fontFamily: "var(--font-space-mono), monospace" }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 1h4l2 2v6H2V1z" stroke="currentColor" strokeWidth="0.8" />
      </svg>
      <span className="truncate max-w-[180px]">{name}</span>
      {sizeLabel && <span className="text-white/50">· {sizeLabel}</span>}
      {uploading ? (
        <svg width="10" height="10" viewBox="0 0 10 10" className="animate-spin text-white/60">
          <circle
            cx="5"
            cy="5"
            r="3.5"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="10 6"
            fill="none"
          />
        </svg>
      ) : onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="text-white/60 hover:text-white"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
