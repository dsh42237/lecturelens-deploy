"use client";

import { useEffect, useRef, useState } from "react";
import type { FinalNotesPayload } from "../lib/types";

interface FinalNotesPanelProps {
  notes: FinalNotesPayload | null;
}

export default function FinalNotesPanel({ notes }: FinalNotesPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = 0;
  }, [notes]);

  useEffect(() => {
    if (notes?.text) {
      setExpanded(true);
    }
  }, [notes?.text]);

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-heading">
        <h2>Final Notes</h2>
        <span className="pill muted">After stop</span>
      </div>
      <div className={`panel-scroll final-notes ${expanded ? "expanded" : "collapsed"}`} ref={scrollRef}>
        {!notes?.text && <div style={{ color: "#64748b" }}>Final notes will appear here after you stop.</div>}
        {notes?.text && <div className="final-notes-text">{notes.text}</div>}
      </div>
      {notes?.text && (
        <button
          type="button"
          className="ghost-btn final-toggle"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </section>
  );
}
