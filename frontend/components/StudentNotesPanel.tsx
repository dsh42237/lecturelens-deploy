"use client";

import { useEffect, useRef } from "react";

interface StudentNotesPanelProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

function extractText(html: string): string {
  if (typeof window === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  const text = container.innerText || container.textContent || "";
  return text.replace(/\u00a0/g, " ").trim();
}

export default function StudentNotesPanel({
  value,
  onChange,
  onClear,
  disabled = false
}: StudentNotesPanelProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const plainText = extractText(value);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    if (node.innerHTML !== value) {
      node.innerHTML = value;
    }
  }, [value]);

  const runCommand = (command: string, commandValue?: string) => {
    if (disabled) return;
    const editor = editorRef.current;
    editor?.focus();
    document.execCommand(command, false, commandValue);
    onChange(editor?.innerHTML ?? "");
  };

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML ?? "");
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-heading">
        <h2>Student Notes</h2>
        <span className="pill muted">Sent on stop</span>
      </div>

      <div className="student-notes-toolbar">
        <button type="button" className="ghost-btn" onClick={() => runCommand("bold")} disabled={disabled}>
          Bold
        </button>
        <button type="button" className="ghost-btn" onClick={() => runCommand("italic")} disabled={disabled}>
          Italic
        </button>
        <button type="button" className="ghost-btn" onClick={() => runCommand("insertUnorderedList")} disabled={disabled}>
          Bullets
        </button>
        <button type="button" className="ghost-btn" onClick={() => runCommand("insertOrderedList")} disabled={disabled}>
          Numbers
        </button>
        <button type="button" className="ghost-btn" onClick={() => runCommand("formatBlock", "<h3>")} disabled={disabled}>
          Heading
        </button>
      </div>

      <div className="panel-scroll student-notes-shell">
        <div
          ref={editorRef}
          className="student-notes-editor"
          contentEditable={!disabled}
          suppressContentEditableWarning
          data-placeholder="Add your own reminders, examples, confusions, and callouts while the lecture is running."
          onInput={handleInput}
        />
        <div className="student-notes-meta">
          <p className="student-notes-hint">
            Rich formatting helps while writing here. Final note generation still uses the clean text content.
          </p>
          <span className="pill muted">{plainText ? `${plainText.length} chars` : "empty"}</span>
        </div>
      </div>

      <div className="student-notes-actions">
        <button type="button" className="ghost-btn" onClick={onClear} disabled={disabled || !plainText}>
          Clear
        </button>
      </div>
    </section>
  );
}
