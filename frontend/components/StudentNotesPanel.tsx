"use client";

interface StudentNotesPanelProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function StudentNotesPanel({
  value,
  onChange,
  onClear,
  disabled = false
}: StudentNotesPanelProps) {
  const trimmed = value.trim();

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-heading">
        <h2>Student Notes</h2>
        <span className="pill muted">Included on stop</span>
      </div>
      <div className="panel-scroll student-notes-shell">
        <textarea
          className="student-notes-area"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Add your own reminders, examples, confusions, or professor callouts while the lecture is running."
          disabled={disabled}
        />
        <div className="student-notes-meta">
          <p className="student-notes-hint">
            These notes are sent with the transcript when final notes are generated.
          </p>
          <span className="pill muted">{trimmed ? `${trimmed.length} chars` : "empty"}</span>
        </div>
      </div>
      <div className="student-notes-actions">
        <button
          type="button"
          className="ghost-btn"
          onClick={onClear}
          disabled={disabled || !trimmed}
        >
          Clear
        </button>
      </div>
    </section>
  );
}
