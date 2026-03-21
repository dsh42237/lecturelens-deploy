"use client";

import { useEffect } from "react";
import Highlight from "@tiptap/extension-highlight";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon
} from "lucide-react";

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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3]
        }
      }),
      Placeholder.configure({
        placeholder:
          "Add your own reminders, examples, confusions, and callouts while the lecture is running."
      }),
      Underline,
      Highlight
    ],
    immediatelyRender: false,
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "student-notes-editor"
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    }
  });

  const plainText = editor?.getText().replace(/\u00a0/g, " ").trim() ?? extractText(value);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const nextHtml = value || "";
    if (editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml, { emitUpdate: false });
    }
  }, [editor, value]);

  const runCommand = (command: () => void) => {
    if (!editor || disabled) return;
    command();
    editor.commands.focus();
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-heading">
        <h2>Student Notes</h2>
        <span className="pill muted">Sent on stop</span>
      </div>

      <div className="student-notes-toolbar">
        <button
          type="button"
          className={`ghost-btn ${editor?.isActive("bold") ? "active" : ""}`}
          onClick={() => runCommand(() => editor?.chain().focus().toggleBold().run())}
          disabled={disabled || !editor}
          title="Bold"
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className={`ghost-btn ${editor?.isActive("italic") ? "active" : ""}`}
          onClick={() => runCommand(() => editor?.chain().focus().toggleItalic().run())}
          disabled={disabled || !editor}
          title="Italic"
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className={`ghost-btn ${editor?.isActive("underline") ? "active" : ""}`}
          onClick={() => runCommand(() => editor?.chain().focus().toggleUnderline().run())}
          disabled={disabled || !editor}
          title="Underline"
        >
          <UnderlineIcon size={15} />
        </button>
        <button
          type="button"
          className={`ghost-btn ${editor?.isActive("heading", { level: 3 }) ? "active" : ""}`}
          onClick={() =>
            runCommand(() => editor?.chain().focus().toggleHeading({ level: 3 }).run())
          }
          disabled={disabled || !editor}
          title="Heading"
        >
          <Heading3 size={15} />
        </button>
        <button
          type="button"
          className={`ghost-btn ${editor?.isActive("bulletList") ? "active" : ""}`}
          onClick={() => runCommand(() => editor?.chain().focus().toggleBulletList().run())}
          disabled={disabled || !editor}
          title="Bullet list"
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className={`ghost-btn ${editor?.isActive("orderedList") ? "active" : ""}`}
          onClick={() => runCommand(() => editor?.chain().focus().toggleOrderedList().run())}
          disabled={disabled || !editor}
          title="Numbered list"
        >
          <ListOrdered size={15} />
        </button>
        <button
          type="button"
          className={`ghost-btn ${editor?.isActive("highlight") ? "active" : ""}`}
          onClick={() => runCommand(() => editor?.chain().focus().toggleHighlight().run())}
          disabled={disabled || !editor}
          title="Highlight"
        >
          <Highlighter size={15} />
        </button>
      </div>

      <div className="panel-scroll student-notes-shell">
        <div
          className="student-notes-editor-shell"
          data-empty={plainText ? "false" : "true"}
          data-placeholder="Add your own reminders, examples, confusions, and callouts while the lecture is running."
        >
          <EditorContent editor={editor} />
        </div>
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
