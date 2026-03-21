"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "../../components/AppLayout";
import MarkdownNotes from "../../components/MarkdownNotes";
import { getMe, listSessions, deleteSession } from "../../lib/api";

interface SessionItem {
  id: string;
  course_id?: number | null;
  course_code?: string | null;
  course_name?: string | null;
  started_at: string;
  ended_at?: string | null;
  final_notes_text?: string | null;
  student_notes_text?: string | null;
  live_notes_history?: { timestamp: number; notes: LiveNotesSnapshot }[];
}

interface LiveNotesSnapshot {
  nowTopic?: string;
  keyPoints?: string[];
  defs?: { term: string; def: string }[];
  missedCue?: string;
}

function SessionsPageContent() {
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authRequired, setAuthRequired] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const highlightedSessionId = searchParams.get("session");
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const init = async () => {
      const me = await getMe();
      if (!me) {
        setAuthRequired(true);
        return;
      }
      setAuthRequired(false);
      try {
        const items = await listSessions();
        setSessions(items);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Failed to load sessions");
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!highlightedSessionId) return;
    setQuery(highlightedSessionId);
  }, [highlightedSessionId]);

  useEffect(() => {
    if (!highlightedSessionId || !highlightedRef.current) return;
    highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedSessionId, sessions, query, courseFilter, statusFilter]);

  const courseOptions = Array.from(
    new Map(
      sessions
        .filter((item) => item.course_code || item.course_name)
        .map((item) => [
          item.course_id ?? item.course_code ?? item.course_name ?? item.id,
          {
            id: item.course_id ?? item.course_code ?? item.course_name ?? item.id,
            label: item.course_code
              ? `${item.course_code} — ${item.course_name ?? ""}`.trim()
              : item.course_name ?? "Unknown course"
          }
        ])
    ).values()
  );

  const filteredSessions = sessions.filter((item) => {
    if (statusFilter === "completed" && !item.ended_at) return false;
    if (statusFilter === "active" && item.ended_at) return false;
    if (courseFilter !== "all") {
      const key = String(item.course_id ?? item.course_code ?? item.course_name ?? "");
      if (key !== courseFilter) return false;
    }
    if (!query) return true;
    const q = query.toLowerCase();
    const haystack = [
      item.id,
      item.course_code ?? "",
      item.course_name ?? ""
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return (
    <AppLayout>
      <main className="page-shell">
        <div className="page-card">
          <div className="page-header">
            <h1>Session History</h1>
          </div>

          {authRequired && (
            <div className="context-card">
              <h3>Login required</h3>
              <p className="muted">Please sign in on the Profile page to view sessions.</p>
              <div className="form-actions">
                <a className="secondary-btn" href="/profile">
                  Go to Profile
                </a>
              </div>
            </div>
          )}

          {!authRequired && (
            <>
              <div className="filter-bar">
                <div className="form-row">
                  <label>Search</label>
                  <input
                    className="input"
                    placeholder="Search by course or session id"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>Course</label>
                  <select
                    className="input"
                    value={courseFilter}
                    onChange={(e) => setCourseFilter(e.target.value)}
                  >
                    <option value="all">All courses</option>
                    {courseOptions.map((option) => (
                      <option key={option.id} value={String(option.id)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Status</label>
                  <select
                    className="input"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="completed">Completed</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>

              <div className="list-card">
                {filteredSessions.length === 0 && (
                  <p className="muted">No sessions match your filters.</p>
                )}
                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    ref={session.id === highlightedSessionId ? highlightedRef : null}
                    className={`course-card ${session.id === highlightedSessionId ? "active" : ""}`}
                  >
                    <div>
                      <strong>Session {session.id.slice(0, 8)}</strong>
                    </div>
                    <div className="muted">
                      Course: {session.course_code ? `${session.course_code} — ${session.course_name}` : "(none)"}
                    </div>
                    <div className="muted">
                      Started: {new Date(session.started_at).toLocaleString()}
                    </div>
                    {session.ended_at && (
                      <div className="muted">
                        Ended: {new Date(session.ended_at).toLocaleString()}
                      </div>
                    )}
                    <div className="course-actions">
                      <a className="secondary-btn" href={`/sessions/${encodeURIComponent(session.id)}`}>
                        View Notes
                      </a>
                      <a
                        className="ghost-btn"
                        href={`/sessions/${encodeURIComponent(session.id)}?print=1`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF / Print
                      </a>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={async () => {
                          await deleteSession(session.id);
                          const items = await listSessions();
                          setSessions(items);
                        }}
                      >
                        Delete session
                      </button>
                    </div>
                    {session.live_notes_history && session.live_notes_history.length > 0 && (
                      <details className="session-notes-details">
                        <summary>
                          Live notes timeline ({session.live_notes_history.length})
                        </summary>
                        <div className="session-live-notes">
                          {session.live_notes_history.map((entry, idx) => (
                            <div key={`${session.id}-live-${entry.timestamp}-${idx}`} className="session-live-item">
                              <div className="muted">
                                {new Date(entry.timestamp).toLocaleString()}
                              </div>
                              <div>
                                <strong>{entry.notes?.nowTopic ?? "Topic update"}</strong>
                              </div>
                              {entry.notes?.keyPoints && entry.notes.keyPoints.length > 0 && (
                                <ul>
                                  {entry.notes.keyPoints.slice(0, 4).map((point, pointIdx) => (
                                    <li key={`${session.id}-point-${idx}-${pointIdx}`}>{point}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {session.final_notes_text && (
                      <div className="context-inline session-notes-render">
                        <MarkdownNotes content={session.final_notes_text} />
                      </div>
                    )}
                    {session.student_notes_text && (
                      <details className="session-notes-details">
                        <summary>Student notes</summary>
                        <pre className="context-inline">{session.student_notes_text}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {status && <div className="inline-error">{status}</div>}
        </div>
      </main>
    </AppLayout>
  );
}

export default function SessionsPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <main className="page-shell">
            <div className="page-card">
              <div className="page-header">
                <h1>Session History</h1>
              </div>
              <div className="context-card">
                <p className="muted">Loading sessions...</p>
              </div>
            </div>
          </main>
        </AppLayout>
      }
    >
      <SessionsPageContent />
    </Suspense>
  );
}
