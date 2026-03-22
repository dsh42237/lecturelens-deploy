"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "../../components/AppLayout";
import MarkdownNotes from "../../components/MarkdownNotes";
import SavedLiveNotesRail from "../../components/SavedLiveNotesRail";
import { getMe, listSessions, deleteSession, regenerateSessionFinalNotes } from "../../lib/api";

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
  final_notes_versions_count?: number;
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
  const [regeneratingSessionId, setRegeneratingSessionId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const highlightedSessionId = searchParams.get("session");
  const selectedRef = useRef<HTMLDivElement | null>(null);

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
    if (!highlightedSessionId) return;
    setSelectedSessionId(highlightedSessionId);
  }, [highlightedSessionId]);

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

  const hasLiveNotes = (item: SessionItem) =>
    Array.isArray(item.live_notes_history) && item.live_notes_history.length > 0;

  useEffect(() => {
    if (filteredSessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }

    const selectedSession = filteredSessions.find((item) => item.id === selectedSessionId);
    if (selectedSession && hasLiveNotes(selectedSession)) {
      return;
    }

    const highlightedLiveSession =
      highlightedSessionId &&
      filteredSessions.find((item) => item.id === highlightedSessionId && hasLiveNotes(item));
    const firstLiveSession = filteredSessions.find((item) => hasLiveNotes(item));
    const highlightedSession =
      highlightedSessionId && filteredSessions.find((item) => item.id === highlightedSessionId);
    const fallbackSession =
      highlightedLiveSession ?? firstLiveSession ?? highlightedSession ?? filteredSessions[0];

    if (fallbackSession && fallbackSession.id !== selectedSessionId) {
      setSelectedSessionId(fallbackSession.id);
    }
  }, [filteredSessions, highlightedSessionId, selectedSessionId]);

  useEffect(() => {
    if (!selectedRef.current) return;
    selectedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedSessionId]);

  const selectedSession =
    filteredSessions.find((item) => item.id === selectedSessionId) ?? null;
  const selectedEntries = selectedSession?.live_notes_history?.map((entry, idx) => ({
    id: `${selectedSession.id}-live-${entry.timestamp}-${idx}`,
    ts: entry.timestamp,
    notes: entry.notes,
  })) ?? [];

  return (
    <AppLayout>
      <main className="page-shell session-history-shell">
        <div className="page-card session-history-main">
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
                    ref={session.id === selectedSessionId ? selectedRef : null}
                    className={`course-card ${session.id === selectedSessionId ? "active" : ""}`}
                    onClick={() => setSelectedSessionId(session.id)}
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
                      <a
                        className="secondary-btn"
                        href={`/sessions/${encodeURIComponent(session.id)}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Notes
                      </a>
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={regeneratingSessionId === session.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            setStatus(null);
                            setRegeneratingSessionId(session.id);
                            const updated = await regenerateSessionFinalNotes(session.id);
                            setSessions((prev) =>
                              prev.map((item) => (item.id === updated.id ? updated : item))
                            );
                            setStatus(`Final notes regenerated for session ${session.id.slice(0, 8)}.`);
                          } catch (err) {
                            setStatus(
                              err instanceof Error
                                ? err.message
                                : "Failed to regenerate final notes"
                            );
                          } finally {
                            setRegeneratingSessionId(null);
                          }
                        }}
                      >
                        {regeneratingSessionId === session.id ? "Regenerating..." : "Regenerate Notes"}
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await deleteSession(session.id);
                          const items = await listSessions();
                          setSessions(items);
                        }}
                      >
                        Delete session
                      </button>
                    </div>
                    {session.final_notes_text && (
                      <div className="context-inline session-notes-render">
                        <MarkdownNotes content={session.final_notes_text} />
                      </div>
                    )}
                    {typeof session.final_notes_versions_count === "number" &&
                      session.final_notes_versions_count > 0 && (
                        <div className="muted">
                          Previous final-note versions saved: {session.final_notes_versions_count}
                        </div>
                      )}
                    {session.student_notes_text && (
                      <details className="session-notes-details" onClick={(e) => e.stopPropagation()}>
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

        {!authRequired && (
          <aside className="session-history-rail-shell">
            <div className="session-history-rail-card">
              {filteredSessions.length === 0 && (
                <div className="session-history-rail-empty">
                  <h3>No sessions in view</h3>
                  <p>Adjust your filters or search to load a session into the live-notes rail.</p>
                </div>
              )}

              {filteredSessions.length > 0 && selectedSession && (
                <>
                  <div className="session-history-rail-header">
                    <span className="pill">Live Notes</span>
                    <h2>{selectedSession.course_code ?? `Session ${selectedSession.id.slice(0, 8)}`}</h2>
                    <p>
                      {selectedSession.course_name ?? "Saved lecture session"}
                    </p>
                    <div className="session-history-rail-meta">
                      <span>Session {selectedSession.id.slice(0, 8)}</span>
                      <span>{new Date(selectedSession.started_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedEntries.length > 0 ? (
                    <SavedLiveNotesRail entries={selectedEntries} title="Live Notes" />
                  ) : (
                    <div className="session-history-rail-empty">
                      <h3>No live notes saved</h3>
                      <p>This session does not have saved live-note cards to display in the rail.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        )}
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
