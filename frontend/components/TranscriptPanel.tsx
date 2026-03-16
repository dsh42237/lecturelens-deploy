"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "../lib/types";

interface TranscriptPanelProps {
  lines: TranscriptLine[];
  partialLine?: TranscriptLine | null;
}

export default function TranscriptPanel({ lines, partialLine }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines.length, partialLine?.text]);

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-heading">
        <h2>Live Transcript</h2>
        <span className="pill muted">Streaming</span>
      </div>
      <div className="panel-scroll" ref={scrollRef}>
        {lines.length === 0 && !partialLine && (
          <div style={{ color: "#64748b" }}>Waiting for transcript...</div>
        )}
        {lines.map((line) => (
          <div key={line.id} className="transcript-line">
            {line.text}
          </div>
        ))}
        {partialLine && (
          <div className="transcript-line partial">{partialLine.text}</div>
        )}
      </div>
    </section>
  );
}
