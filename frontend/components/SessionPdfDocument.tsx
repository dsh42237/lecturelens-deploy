"use client";

import type { SessionInfo } from "../lib/api";
import MarkdownNotes from "./MarkdownNotes";

interface SessionPdfDocumentProps {
  session: SessionInfo;
}

export default function SessionPdfDocument({ session }: SessionPdfDocumentProps) {
  return (
    <article className="pdf-export-document">
      <header className="pdf-export-hero">
        <div className="pdf-export-brand">
          <img src="/Logo.jpg" alt="" className="pdf-export-logo" />
          <div>
            <span className="pdf-export-kicker">LiveLecture Study Pack</span>
            <h1>{session.course_name ?? "Lecture Notes"}</h1>
            <p>{session.course_code ?? "Lecture session"}</p>
          </div>
        </div>

        <div className="pdf-export-meta-grid">
          <div className="pdf-export-meta-card">
            <span>Session</span>
            <strong>{session.id.slice(0, 8)}</strong>
          </div>
          <div className="pdf-export-meta-card">
            <span>Started</span>
            <strong>{new Date(session.started_at).toLocaleString()}</strong>
          </div>
          <div className="pdf-export-meta-card">
            <span>Ended</span>
            <strong>
              {session.ended_at ? new Date(session.ended_at).toLocaleString() : "In progress"}
            </strong>
          </div>
        </div>
      </header>

      <section className="pdf-export-section">
        <div className="pdf-export-section-head">
          <span className="pdf-export-label">Final Notes</span>
          <p>Structured lecture summary with equations and diagrams prepared for study.</p>
        </div>
        {session.final_notes_text ? (
          <MarkdownNotes content={session.final_notes_text} className="pdf-export-markdown" />
        ) : (
          <p>Final notes are not available for this session yet.</p>
        )}
      </section>
    </article>
  );
}
