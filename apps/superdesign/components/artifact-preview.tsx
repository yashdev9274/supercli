"use client"

import { useState } from "react"

interface ArtifactContent {
  framework?: string
  files?: Record<string, string>
  html?: string
}

interface ArtifactPreviewProps {
  html?: string | null
  content?: ArtifactContent | null
}

function filenameFromPath(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] ?? path
}

export function ArtifactPreview({ html, content }: ArtifactPreviewProps) {
  const files = content?.files
  const fileEntries = files ? Object.entries(files) : []
  const hasFiles = fileEntries.length > 0
  const [selectedFile, setSelectedFile] = useState(
    fileEntries.length > 0 ? fileEntries[0][0] : null,
  )
  const [showCode, setShowCode] = useState(hasFiles)

  if (!html && !hasFiles) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-[var(--muted-foreground)] gap-2">
        <svg
          className="w-10 h-10 opacity-20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
        <span>No content to preview</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {(hasFiles || html) && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
          {hasFiles && (
            <button
              onClick={() => setShowCode(true)}
              className={`text-xs px-2 py-1 rounded-[var(--radius-sm)] transition-colors duration-[var(--dur-quick)] ${
                showCode
                  ? "bg-[var(--primary-muted)] text-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Code
            </button>
          )}
          {html && (
            <button
              onClick={() => setShowCode(false)}
              className={`text-xs px-2 py-1 rounded-[var(--radius-sm)] transition-colors duration-[var(--dur-quick)] ${
                !showCode
                  ? "bg-[var(--primary-muted)] text-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Preview
            </button>
          )}
        </div>
      )}

      {showCode && hasFiles ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] overflow-y-auto text-xs">
            {fileEntries.map(([path]) => (
              <button
                key={path}
                onClick={() => setSelectedFile(path)}
                className={`w-full text-left px-3 py-2 truncate border-b border-[var(--border)] transition-colors duration-[var(--dur-quick)] active:scale-[0.98] ${
                  selectedFile === path
                    ? "bg-[var(--primary-muted)] text-[var(--primary)] font-medium"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                {filenameFromPath(path)}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto bg-[#0d1117]">
            <pre className="text-[13px] leading-relaxed p-4 text-[#e6edf3] font-[--font-mono] overflow-x-auto">
              <code>
                {selectedFile && files
                  ? files[selectedFile]
                  : fileEntries[0]?.[1] ?? ""}
              </code>
            </pre>
          </div>
        </div>
      ) : html ? (
        <iframe
          srcDoc={html}
          className="w-full flex-1 border-0 bg-white"
          title="Artifact preview"
          sandbox="allow-scripts"
        />
      ) : null}
    </div>
  )
}
