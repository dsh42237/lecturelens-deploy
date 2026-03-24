"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "../../components/AppLayout";
import {
  generateSessionFlashcards,
  getMe,
  listSessions,
  type FlashcardInfo,
  type SessionInfo,
} from "../../lib/api";

function stripMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptSession(session: SessionInfo | null) {
  if (!session?.final_notes_text) {
    return "Select a session and generate a deck from its notes, transcript, and live-note history.";
  }
  const cleaned = stripMarkdown(session.final_notes_text);
  if (cleaned.length <= 220) {
    return cleaned;
  }
  return `${cleaned.slice(0, 219).trimEnd()}...`;
}

function FlashcardsPageContent() {
  const searchParams = useSearchParams();
  const highlightedSessionId = searchParams.get("session");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [requestText, setRequestText] = useState("");
  const [cardCount, setCardCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [generatedDeck, setGeneratedDeck] = useState<FlashcardInfo[]>([]);
  const [generatedForSessionId, setGeneratedForSessionId] = useState<string | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

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
    void init();
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }

    if (highlightedSessionId && sessions.some((session) => session.id === highlightedSessionId)) {
      setSelectedSessionId(highlightedSessionId);
      return;
    }

    if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) {
      return;
    }

    setSelectedSessionId(sessions[0].id);
  }, [highlightedSessionId, selectedSessionId, sessions]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );

  const currentCard = generatedDeck[currentCardIndex] ?? null;
  const selectedSessionSummary = excerptSession(selectedSession);

  useEffect(() => {
    setCurrentCardIndex(0);
    setRevealed(false);
  }, [generatedDeck, selectedSessionId]);

  useEffect(() => {
    setRevealed(false);
  }, [currentCardIndex]);

  const handleGenerate = async () => {
    if (!selectedSessionId) {
      setStatus("Select a session first.");
      return;
    }
    try {
      setGenerating(true);
      setStatus(null);
      const response = await generateSessionFlashcards(selectedSessionId, {
        request: requestText.trim() || undefined,
        count: cardCount,
      });
      setGeneratedDeck(response.flashcards);
      setGeneratedForSessionId(selectedSessionId);
      setCurrentCardIndex(0);
      setRevealed(false);
      setStatus(`Generated ${response.flashcards.length} flashcards for session ${selectedSessionId.slice(0, 8)}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to generate flashcards");
    } finally {
      setGenerating(false);
    }
  };

  const moveCard = (direction: -1 | 1) => {
    if (generatedDeck.length === 0) {
      return;
    }
    setCurrentCardIndex((prev) => (prev + direction + generatedDeck.length) % generatedDeck.length);
  };

  return (
    <AppLayout>
      <main className="page-shell session-history-shell">
        <div className="page-card session-history-main">
          <div className="page-header">
            <h1>Flashcards</h1>
          </div>

          {authRequired && (
            <div className="context-card">
              <h3>Login required</h3>
              <p className="muted">Please sign in on the Profile page to generate flashcards.</p>
              <div className="form-actions">
                <a className="secondary-btn" href="/profile">
                  Go to Profile
                </a>
              </div>
            </div>
          )}

          {!authRequired && (
            <>
              <section className="flashcards-page-panel">
                <div className="flashcards-page-header">
                  <div>
                    <span className="pill">Study Generator</span>
                    <h2>Pick a session and ask for the deck you want</h2>
                    <p>
                      Generate AI flashcards from one saved lecture. You can bias the deck toward
                      formulas, definitions, likely exam prompts, or any other study angle.
                    </p>
                  </div>
                  <a
                    className="ghost-btn"
                    href={selectedSessionId ? `/sessions/${encodeURIComponent(selectedSessionId)}` : "/sessions"}
                  >
                    View Session Notes
                  </a>
                </div>

                <div className="filter-bar">
                  <div className="form-row">
                    <label>Session</label>
                    <select
                      className="input"
                      value={selectedSessionId ?? ""}
                      onChange={(event) => setSelectedSessionId(event.target.value || null)}
                    >
                      <option value="">Select a session</option>
                      {sessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {(session.course_code
                            ? `${session.course_code} — ${session.course_name ?? ""}`
                            : `Session ${session.id.slice(0, 8)}`) +
                            ` • ${new Date(session.started_at).toLocaleDateString()}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Deck Size</label>
                    <select
                      className="input"
                      value={cardCount}
                      onChange={(event) => setCardCount(Number(event.target.value))}
                    >
                      {[6, 8, 10, 12, 15].map((count) => (
                        <option key={count} value={count}>
                          {count} cards
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row flashcards-request-row">
                    <label>Focus Request</label>
                    <textarea
                      className="input flashcard-textarea"
                      value={requestText}
                      onChange={(event) => setRequestText(event.target.value)}
                      placeholder="Example: focus on definitions and derivations most likely to appear on the midterm"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flashcards-session-summary">
                  <div className="flashcards-session-summary-copy">
                    <span className="session-document-section-kicker">Selected Session</span>
                    <strong>
                      {selectedSession
                        ? selectedSession.course_code ?? `Session ${selectedSession.id.slice(0, 8)}`
                        : "No session selected"}
                    </strong>
                    <p>{selectedSessionSummary}</p>
                  </div>
                  <div className="flashcards-session-summary-meta">
                    {selectedSession && (
                      <>
                        <span>Session {selectedSession.id.slice(0, 8)}</span>
                        <span>{new Date(selectedSession.started_at).toLocaleString()}</span>
                        <span>{selectedSession.ended_at ? "Completed" : "In progress"}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => void handleGenerate()}
                    disabled={!selectedSessionId || generating}
                  >
                    {generating ? "Generating..." : "Generate Flashcards"}
                  </button>
                </div>
              </section>

              <section className="session-flashcards">
                <div className="session-flashcards-top">
                  <div className="session-document-section-intro">
                    <span className="session-document-section-kicker">Practice Deck</span>
                    <h2>Review the generated cards</h2>
                    <p>
                      The deck below reflects the selected session and your current focus request.
                    </p>
                  </div>
                  {generatedForSessionId && (
                    <span className="pill muted">Built from session {generatedForSessionId.slice(0, 8)}</span>
                  )}
                </div>

                <div className="session-flashcards-stats">
                  <article className="session-flashcards-stat">
                    <span>Total Deck</span>
                    <strong>{generatedDeck.length}</strong>
                    <p>Cards currently in the generated practice set.</p>
                  </article>
                  <article className="session-flashcards-stat">
                    <span>Focus</span>
                    <strong>{requestText.trim() ? "Custom" : "General"}</strong>
                    <p>{requestText.trim() || "Broad review across the session."}</p>
                  </article>
                  <article className="session-flashcards-stat">
                    <span>Session</span>
                    <strong>{selectedSession ? selectedSession.id.slice(0, 8) : "None"}</strong>
                    <p>{selectedSession?.course_code ?? "Choose a session to generate a deck."}</p>
                  </article>
                </div>

                <div className="session-flashcards-workspace">
                  <div className="flashcard-practice-panel">
                    <div className="panel-heading">
                      <h2>Practice Mode</h2>
                      <span className="pill muted">
                        {generatedDeck.length === 0 ? "No deck yet" : `${currentCardIndex + 1} / ${generatedDeck.length}`}
                      </span>
                    </div>

                    {currentCard ? (
                      <div className="flashcard-practice-shell">
                        <div className={`flashcard-practice-card${revealed ? " revealed" : ""}`}>
                          <button
                            type="button"
                            className="flashcard-practice-card-inner"
                            onClick={() => setRevealed((prev) => !prev)}
                          >
                            <div className="flashcard-practice-face flashcard-practice-front">
                              <span className="pill">Prompt</span>
                              <h3>{currentCard.front}</h3>
                              <p>Click to reveal the answer.</p>
                            </div>
                            <div className="flashcard-practice-face flashcard-practice-back">
                              <span className="pill muted">Answer</span>
                              <h3>{currentCard.front}</h3>
                              <p>{currentCard.back}</p>
                            </div>
                          </button>
                        </div>

                        <div className="flashcard-practice-controls">
                          <button type="button" className="ghost-btn" onClick={() => moveCard(-1)}>
                            Previous
                          </button>
                          <button
                            type="button"
                            className="ghost-btn active"
                            onClick={() => setRevealed((prev) => !prev)}
                          >
                            {revealed ? "Hide Answer" : "Flip Card"}
                          </button>
                          <button type="button" className="ghost-btn" onClick={() => moveCard(1)}>
                            Next
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flashcard-empty">
                        <h3>No deck generated</h3>
                        <p>Select a session, add an optional request, and generate the deck.</p>
                      </div>
                    )}
                  </div>

                  <div className="flashcard-builder-panel">
                    <div className="panel-heading">
                      <h2>Deck List</h2>
                      <span className="pill muted">{generatedDeck.length} cards</span>
                    </div>

                    <div className="flashcard-list">
                      {generatedDeck.length === 0 && (
                        <div className="flashcard-list-empty">
                          <h3>Nothing to review yet</h3>
                          <p>The generated flashcards will appear here after the AI call completes.</p>
                        </div>
                      )}

                      {generatedDeck.map((card, index) => (
                        <article
                          key={`${card.front}-${index}`}
                          className={`flashcard-list-item${index === currentCardIndex ? " active" : ""}`}
                        >
                          <button
                            type="button"
                            className="flashcard-list-trigger"
                            onClick={() => setCurrentCardIndex(index)}
                          >
                            <div className="flashcard-list-copy">
                              <div className="flashcard-list-head">
                                <strong>{card.front}</strong>
                                <span className="pill muted">Card {index + 1}</span>
                              </div>
                              <p>{card.back}</p>
                            </div>
                          </button>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {status && <div className="inline-error">{status}</div>}
        </div>

        {!authRequired && (
          <aside className="session-history-rail-shell">
            <div className="session-history-rail-card">
              <div className="session-history-rail-header">
                <span className="pill">Sessions</span>
                <h2>Select Source Session</h2>
                <p>Choose which lecture to turn into an AI-generated practice deck.</p>
                <div className="session-history-rail-meta">
                  <span>{sessions.length} saved sessions</span>
                  {selectedSession && <span>{selectedSession.course_name ?? "Lecture session"}</span>}
                </div>
              </div>

              {sessions.length === 0 && (
                <div className="session-history-rail-empty">
                  <h3>No sessions saved</h3>
                  <p>Run a live session first so there is material to generate flashcards from.</p>
                </div>
              )}

              {sessions.length > 0 && (
                <div className="flashcards-session-list">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={`flashcards-session-item${session.id === selectedSessionId ? " active" : ""}`}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <strong>
                        {session.course_code ?? `Session ${session.id.slice(0, 8)}`}
                      </strong>
                      <span>{session.course_name ?? "Saved lecture session"}</span>
                      <span>{new Date(session.started_at).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </main>
    </AppLayout>
  );
}

export default function FlashcardsPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <main className="page-shell">
            <div className="page-card">
              <div className="page-header">
                <h1>Flashcards</h1>
              </div>
              <div className="context-card">
                <p className="muted">Loading flashcards workspace...</p>
              </div>
            </div>
          </main>
        </AppLayout>
      }
    >
      <FlashcardsPageContent />
    </Suspense>
  );
}
