"use client";

import type { SessionInfo } from "../lib/api";
import MarkdownNotes from "./MarkdownNotes";

interface SessionDocumentProps {
  session: SessionInfo;
  printMode?: boolean;
  includeStudentNotes?: boolean;
  includeTimeline?: boolean;
}

export default function SessionDocument({
  session,
  printMode = false,
  includeStudentNotes = true,
  includeTimeline = true
}: SessionDocumentProps) {
  return (
    <article className={`session-document${printMode ? " session-document--print" : ""}`}>
      {printMode && (
        <>
          <div className="session-print-watermark" aria-hidden="true">
            <img src="/Logo.jpeg" alt="" />
          </div>
          <div className="session-print-header" aria-hidden="true">
            <div className="session-print-header-brand">
              <img src="/Logo.jpeg" alt="" className="session-print-logo" />
              <div>
                <strong>LectureLens</strong>
                <span>{session.course_code ?? "Lecture session"}</span>
              </div>
            </div>
            <div className="session-print-header-meta">
              <span>{session.course_name ?? "Lecture Notes"}</span>
              <span>{new Date(session.started_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="session-print-footer" aria-hidden="true">
            <span>LectureLens</span>
            <span>{session.course_code ?? "Lecture session"}</span>
            <span className="session-print-page-number">Page </span>
          </div>
        </>
      )}

      <header className="session-document-hero">
        <div className="session-document-brand-row">
          <span className="session-document-brand">
            <img src="/Logo.jpeg" alt="" className="session-document-logo" />
            LectureLens Notes
          </span>
          <span className="session-document-session-id">Session {session.id.slice(0, 8)}</span>
        </div>
        <div className="session-document-head">
          <div>
            <p className="session-document-kicker">{session.course_code ?? "Lecture session"}</p>
            <h1>{session.course_name ?? "Lecture Notes"}</h1>
          </div>
          <div className="session-document-meta">
            <span>Started: {new Date(session.started_at).toLocaleString()}</span>
            {session.ended_at && (
              <span>Ended: {new Date(session.ended_at).toLocaleString()}</span>
            )}
          </div>
        </div>

        <div className="session-document-meta-grid">
          <div className="session-document-meta-card">
            <span className="session-document-meta-label">Course</span>
            <strong>{session.course_code ?? "Lecture session"}</strong>
            <span>{session.course_name ?? "Captured lecture notes"}</span>
          </div>
          <div className="session-document-meta-card">
            <span className="session-document-meta-label">Coverage</span>
            <strong>{session.ended_at ? "Completed session" : "In progress"}</strong>
            <span>
              {session.ended_at
                ? `${new Date(session.started_at).toLocaleDateString()} to ${new Date(
                    session.ended_at
                  ).toLocaleDateString()}`
                : new Date(session.started_at).toLocaleString()}
            </span>
          </div>
          <div className="session-document-meta-card">
            <span className="session-document-meta-label">Notes</span>
            <strong>{session.final_notes_text ? "Available" : "Pending"}</strong>
            <span>
              {session.final_notes_text
                ? "Final lecture summary with equations and diagrams inline."
                : "Final notes are still being prepared for this session."}
            </span>
          </div>
        </div>
      </header>

      <section className="session-document-block session-document-notes-block">
        <div className="session-document-section-intro">
          <span className="session-document-section-kicker">Final Notes</span>
          <p>Cleaned lecture summary with diagrams and equations rendered inline.</p>
        </div>
        {session.final_notes_text ? (
          <MarkdownNotes content={session.final_notes_text} />
        ) : (
          <p className="muted">Final notes are not available for this session yet.</p>
        )}
      </section>

      {includeStudentNotes && session.student_notes_text && (
        <section className="session-document-block">
          <h2>Student Notes</h2>
          <pre className="context-inline session-document-student">
            {session.student_notes_text}
          </pre>
        </section>
      )}

      {includeTimeline && session.live_notes_history && session.live_notes_history.length > 0 && (
        <section className="session-document-block">
          <h2>Live Notes Timeline</h2>
          <div className="course-history-timeline">
            {session.live_notes_history.map((entry, index) => {
              const notes = entry.notes as {
                nowTopic?: string;
                keyPoints?: string[];
              };
              return (
                <article
                  key={`${session.id}-${entry.timestamp}-${index}`}
                  className="course-history-timeline-item"
                >
                  <div className="course-history-timeline-time">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                  <strong>{notes.nowTopic ?? "Topic update"}</strong>
                  {notes.keyPoints && notes.keyPoints.length > 0 && (
                    <ul className="topic-bullets">
                      {notes.keyPoints.slice(0, 4).map((point, pointIndex) => (
                        <li key={`${session.id}-${index}-${pointIndex}`}>{point}</li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <footer className="session-document-footer">
        <span>Generated by LectureLens</span>
        <span>{session.course_code ?? "Lecture session"}</span>
        <span>{new Date().toLocaleDateString()}</span>
      </footer>
    </article>
  );
}
