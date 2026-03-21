"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "../lib/types";

interface TranscriptPanelProps {
  lines: TranscriptLine[];
  partialLine?: TranscriptLine | null;
}

export default function TranscriptPanel({ lines, partialLine }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const transcriptText = [...lines.map((line) => line.text.trim()).filter(Boolean)];
  if (partialLine?.text?.trim()) {
    transcriptText.push(partialLine.text.trim());
  }
  const tickerText = transcriptText.join("   •   ");

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollLeft = node.scrollWidth;
  }, [tickerText]);

  return (
    <section className="transcript-ticker-shell">
      <div className="transcript-ticker-head">
        <span className="transcript-ticker-label">Live Transcript</span>
        <span className="pill muted">Streaming</span>
      </div>
      <div className="transcript-ticker-track" ref={scrollRef}>
        {tickerText ? (
          <div className="transcript-ticker-line">{tickerText}</div>
        ) : (
          <div className="transcript-ticker-placeholder">Waiting for transcript...</div>
        )}
      </div>
    </section>
  );
}
