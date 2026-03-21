"use client";

import type { SessionInfo } from "../lib/api";
import MarkdownNotes from "./MarkdownNotes";

interface SessionDocumentProps {
  session: SessionInfo;
}

export default function SessionDocument({ session }: SessionDocumentProps) {
  return (
    <article className="session-document">
      <header className="session-document-head">
        <div>
          <p className="session-document-kicker">{session.course_code ?? "Lecture session"}</p>
          <h1>{session.course_name ?? "Lecture Notes"}</h1>
        </div>
        <div className="session-document-meta">
          <span>Started: {new Date(session.started_at).toLocaleString()}</span>
          {session.ended_at && <span>Ended: {new Date(session.ended_at).toLocaleString()}</span>}
        </div>
      </header>

      <section className="session-document-block">
        {session.final_notes_text ? (
          <MarkdownNotes content={session.final_notes_text} />
        ) : (
          <p className="muted">Final notes are not available for this session yet.</p>
        )}
      </section>

      {session.student_notes_text && (
        <section className="session-document-block">
          <h2>Student Notes</h2>
          <pre className="context-inline session-document-student">
            {session.student_notes_text}
          </pre>
        </section>
      )}

      {session.live_notes_history && session.live_notes_history.length > 0 && (
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
    </article>
  );
}
