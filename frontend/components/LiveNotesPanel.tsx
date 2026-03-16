"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveNotesPayload } from "../lib/types";

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [notes]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollLeft = node.scrollWidth;
  }, [history.length]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const active = node.querySelector<HTMLButtonElement>(".history-chip.active");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedId, history.length]);

  const selected =
    history.find((entry) => entry.id === selectedId)?.notes ??
    history[history.length - 1]?.notes ??
    notes;
  const recent = history.slice(-5);
  const olderCount = Math.max(0, history.length - recent.length);

  return (
    <section
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <div className="panel-heading">
        <h2>Live Notes</h2>
        <span className="pill muted">In-session</span>
      </div>
      <div className="panel-scroll live-notes-scroll" ref={scrollRef}>
        {history.length === 0 && !notes && (
          <div style={{ color: "#92400e" }}>Live notes will appear here...</div>
        )}
        {history.length > 0 && (
          <div className="live-notes-layout">
            <div className="live-notes-detail">
              {selected && (
                <div className="live-notes live-notes-main-card">
                  <div className="live-notes-topic">
                    Now: {selected.nowTopic || "(listening...)"}
                  </div>
                  {selected.keyPoints?.length > 0 && (
                    <ul className="topic-bullets">
                      {selected.keyPoints.map((point, index) => (
                        <li key={`live-point-${index}`}>{point}</li>
                      ))}
                    </ul>
                  )}
                  {selected.defs?.length > 0 && (
                    <div className="notes-section">
                      <div className="section-header">
                        <h3>Quick defs</h3>
                      </div>
                      <ul className="topic-bullets">
                        {selected.defs.map((item, index) => (
                          <li key={`live-def-${index}`}>
                            <strong>{item.term}:</strong> {item.def}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selected.missedCue && (
                    <div className="missed-cue">{selected.missedCue}</div>
                  )}
                </div>
              )}
            </div>
            <div className="live-notes-history-bar">
              <div className="history-row" ref={listRef}>
                {recent.map((entry, index) => {
                  const isActive =
                    entry.id === selectedId ||
                    (!selectedId && index === recent.length - 1);
                  const label = new Date(entry.ts).toLocaleTimeString();
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`history-chip ${isActive ? "active" : ""}`}
                      onClick={() => onSelect(entry.id)}
                      title={entry.notes.nowTopic || "Live note"}
                    >
                      <span className="history-time">{label}</span>
                      <span className="history-topic">
                        {entry.notes.nowTopic || "Live note"}
                      </span>
                    </button>
                  );
                })}
                {olderCount > 0 && (
                  <span className="history-more">+{olderCount} more</span>
                )}
              </div>
              <button
                type="button"
                className="history-toggle"
                onClick={() => setShowHistory((prev) => !prev)}
              >
                {showHistory ? "Hide history" : `History (${history.length})`}
              </button>
            </div>
            {showHistory && (
              <div className="history-drawer">
                {history.map((entry) => {
                  const isActive = entry.id === selectedId;
                  const label = new Date(entry.ts).toLocaleTimeString();
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`history-item ${isActive ? "active" : ""}`}
                      onClick={() => onSelect(entry.id)}
                    >
                      <span className="history-time">{label}</span>
                      <span className="history-topic">
                        {entry.notes.nowTopic || "Live note"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {history.length === 0 && notes && (
          <div className="live-notes">
            <div className="live-notes-topic">
              Now: {notes.nowTopic || "(listening...)"}
            </div>
            {notes.keyPoints?.length > 0 && (
              <ul className="topic-bullets">
                {notes.keyPoints.map((point, index) => (
                  <li key={`live-point-${index}`}>{point}</li>
                ))}
              </ul>
            )}
            {notes.defs?.length > 0 && (
              <div className="notes-section">
                <div className="section-header">
                  <h3>Quick defs</h3>
                </div>
                <ul className="topic-bullets">
                  {notes.defs.map((item, index) => (
                    <li key={`live-def-${index}`}>
                      <strong>{item.term}:</strong> {item.def}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notes.missedCue && (
              <div className="missed-cue">{notes.missedCue}</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
