"use client";

import RichNoteText from "./RichNoteText";

export interface SavedLiveNotesSnapshot {
  nowTopic?: string;
  keyPoints?: string[];
  defs?: { term: string; def: string }[];
  missedCue?: string;
}

interface SavedLiveNotesRailProps {
  entries: { id: string; ts: number; notes: SavedLiveNotesSnapshot }[];
  title?: string;
  showLatestBadge?: boolean;
  compact?: boolean;
}

export default function SavedLiveNotesRail({
  entries,
  title = "Live Notes",
  showLatestBadge = true,
  compact = false,
}: SavedLiveNotesRailProps) {
  const orderedEntries = [...entries].reverse();

  return (
    <section className={`saved-live-notes-rail${compact ? " saved-live-notes-rail--compact" : ""}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span className="pill muted">{orderedEntries.length} cards</span>
      </div>
      <div className="panel-scroll live-notes-feed saved-live-notes-feed">
        {orderedEntries.length === 0 && (
          <div style={{ color: "#92400e" }}>No live notes were saved for this session.</div>
        )}
        {orderedEntries.length > 0 && (
          <div className="live-notes-stack">
            {orderedEntries.map((entry, index) => {
              const item = entry.notes;
              return (
                <article
                  key={entry.id}
                  className={`live-note-feed-card ${index === 0 ? "latest" : ""}`}
                >
                  <div className="live-note-feed-head">
                    <span className="live-note-feed-time">
                      {new Date(entry.ts).toLocaleString()}
                    </span>
                    {showLatestBadge && index === 0 && <span className="pill muted">Latest</span>}
                  </div>
                  <div className="live-notes-topic">
                    <RichNoteText
                      text={item.nowTopic || "(listening...)"}
                      className="markdown-notes--compact live-note-rich"
                    />
                  </div>
                  {item.keyPoints?.length ? (
                    <ul className="topic-bullets">
                      {item.keyPoints.map((point, pointIndex) => (
                        <li key={`${entry.id}-point-${pointIndex}`}>
                          <RichNoteText
                            text={point}
                            className="markdown-notes--compact live-note-rich"
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.defs?.length ? (
                    <div className="notes-section">
                      <div className="section-header">
                        <h3>Quick defs</h3>
                      </div>
                      <ul className="topic-bullets">
                        {item.defs.map((def, defIndex) => (
                          <li key={`${entry.id}-def-${defIndex}`}>
                            <strong>{def.term}:</strong>{" "}
                            <RichNoteText
                              text={def.def}
                              className="markdown-notes--compact live-note-rich live-note-rich--inline"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {item.missedCue ? (
                    <div className="missed-cue">
                      <RichNoteText
                        text={item.missedCue}
                        className="markdown-notes--compact live-note-rich"
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
