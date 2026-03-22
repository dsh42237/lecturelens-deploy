"use client";

import type { WhiteboardInsightPayload } from "../lib/types";
import RichNoteText from "./RichNoteText";

interface WhiteboardInsightPanelProps {
  insight: WhiteboardInsightPayload | null;
}

export default function WhiteboardInsightPanel({ insight }: WhiteboardInsightPanelProps) {
  const status = insight?.status ?? "ready";
  const hasContent = Boolean(
    insight?.summary ||
      insight?.title ||
      insight?.equationsLatex?.length ||
      insight?.steps?.length ||
      insight?.diagramHints?.length
  );
  const capturedAt = insight?.captureTimestamp
    ? new Date(insight.captureTimestamp).toLocaleTimeString()
    : null;

  return (
    <section className="panel-card whiteboard-panel">
      <div className="panel-heading">
        <div>
          <h2>Board Insights</h2>
          <p className="whiteboard-panel-copy">
            Phone camera snapshots are sampled in the background and condensed into math, steps, and diagram clues for final notes.
          </p>
        </div>
        <span className={`pill muted ${status === "analyzing" ? "pill-live" : ""}`}>
          {status === "analyzing"
            ? "Analyzing board"
            : status === "error"
              ? "Vision issue"
              : capturedAt
                ? `Updated ${capturedAt}`
                : "Waiting"}
        </span>
      </div>

      {status === "error" && (
        <div className="course-history-empty">
          {insight?.error || "Board capture analysis failed for the latest snapshot."}
        </div>
      )}

      {status !== "error" && !hasContent && (
        <div className="course-history-empty">
          Point the phone at the whiteboard. Once a meaningful board snapshot is analyzed, equations and solve steps will appear here.
        </div>
      )}

      {status !== "error" && hasContent && (
        <div className="whiteboard-panel-grid">
          {(insight?.title || insight?.summary || insight?.subjectGuess) && (
            <div className="whiteboard-block">
              {insight?.title && <h3>{insight.title}</h3>}
              {insight?.subjectGuess && <div className="whiteboard-subject">{insight.subjectGuess}</div>}
              {insight?.summary && <RichNoteText text={insight.summary} className="markdown-notes--compact" />}
            </div>
          )}

          {Boolean(insight?.equationsLatex?.length) && (
            <div className="whiteboard-block">
              <h3>Equations</h3>
              <div className="whiteboard-equations">
                {insight?.equationsLatex?.map((equation, index) => (
                  <RichNoteText
                    key={`${equation}-${index}`}
                    text={`$${equation}$`}
                    className="markdown-notes--compact whiteboard-equation-line"
                  />
                ))}
              </div>
            </div>
          )}

          {Boolean(insight?.steps?.length) && (
            <div className="whiteboard-block">
              <h3>Detected steps</h3>
              <ul className="whiteboard-list">
                {insight?.steps?.map((step, index) => (
                  <li key={`${step}-${index}`}>
                    <RichNoteText text={step} className="markdown-notes--compact" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Boolean(insight?.diagramHints?.length) && (
            <div className="whiteboard-block">
              <h3>Diagram clues</h3>
              <ul className="whiteboard-list">
                {insight?.diagramHints?.map((hint, index) => (
                  <li key={`${hint}-${index}`}>
                    <RichNoteText text={hint} className="markdown-notes--compact" />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Boolean(insight?.uncertainReadings?.length) && (
            <div className="whiteboard-block">
              <h3>Uncertain readings</h3>
              <ul className="whiteboard-list">
                {insight?.uncertainReadings?.map((hint, index) => (
                  <li key={`${hint}-${index}`}>{hint}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
