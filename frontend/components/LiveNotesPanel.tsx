"use client";

import type { LiveNotesPayload } from "../lib/types";
import RichNoteText from "./RichNoteText";

interface LiveNotesPanelProps {
  notes: LiveNotesPayload | null;
  history: { id: string; ts: number; notes: LiveNotesPayload }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function LiveNotesPanel({
  notes,
  history,
  selectedId,
  onSelect,
}: LiveNotesPanelProps) {
  void selectedId;
  void onSelect;
  const entries =
    history.length > 0
      ? [...history].reverse()
      : notes
        ? [{ id: "current", ts: Date.now(), notes }]
        : [];

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-heading">
        <h2>Live Notes</h2>
        <span className="pill muted">{entries.length} cards</span>
      </div>
      <div className="panel-scroll live-notes-feed">
        {entries.length === 0 && (
          <div style={{ color: "#92400e" }}>Live notes will appear here...</div>
        )}
        {entries.length > 0 && (
          <div className="live-notes-stack">
            {entries.map((entry, index) => {
              const item = entry.notes;
              return (
                <article
                  key={entry.id}
                  className={`live-note-feed-card ${index === 0 ? "latest" : ""}`}
                >
                  <div className="live-note-feed-head">
                    <span className="live-note-feed-time">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    {index === 0 && <span className="pill muted">Latest</span>}
                  </div>
                  <div className="live-notes-topic">
                    <RichNoteText text={item.nowTopic || "(listening...)"} className="markdown-notes--compact live-note-rich" />
                  </div>
                  {item.keyPoints?.length > 0 && (
                    <ul className="topic-bullets">
                      {item.keyPoints.map((point, pointIndex) => (
                        <li key={`${entry.id}-point-${pointIndex}`}>
                          <RichNoteText text={point} className="markdown-notes--compact live-note-rich" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.defs?.length > 0 && (
                    <div className="notes-section">
                      <div className="section-header">
                        <h3>Quick defs</h3>
                      </div>
                      <ul className="topic-bullets">
                        {item.defs.map((def, defIndex) => (
                          <li key={`${entry.id}-def-${defIndex}`}>
                            <strong>{def.term}:</strong>{" "}
                            <RichNoteText text={def.def} className="markdown-notes--compact live-note-rich live-note-rich--inline" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.missedCue && (
                    <div className="missed-cue">
                      <RichNoteText text={item.missedCue} className="markdown-notes--compact live-note-rich" />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
