"use client";

import { useEffect, useRef, useState } from "react";
import type { NotesState } from "../lib/types";

interface NotesPanelProps {
  notes: NotesState;
}

export default function NotesPanel({ notes }: NotesPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showKeyTerms, setShowKeyTerms] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [notes]);

  return (
    <section style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="panel-heading">
        <h2>Structured Notes</h2>
        <span className="pill muted">Batching</span>
      </div>
      <div className="panel-scroll notes" ref={scrollRef}>
        {notes.topics.length === 0 &&
          notes.keyTerms.length === 0 &&
          notes.questions.length === 0 &&
          notes.definitions.length === 0 &&
          notes.steps.length === 0 && (
          <div style={{ color: "#92400e" }}>Notes will appear here...</div>
        )}
        {notes.topics.map((topic) => (
          <div key={topic.title} className="topic-block">
            <div className="topic-title">{topic.title}</div>
            {topic.bullets.length > 0 && (
              <ul className="topic-bullets">
                {topic.bullets.map((bullet, index) => (
                  <li key={`${topic.title}-bullet-${index}`}>{bullet}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {notes.keyTerms.length > 0 && (
          <div className="notes-section">
            <div className="section-header">
              <h3>Key Terms</h3>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setShowKeyTerms((prev) => !prev)}
              >
                {showKeyTerms ? "Hide" : "Show"} ({notes.keyTerms.length})
              </button>
            </div>
            {showKeyTerms && (
              <div className="chip-scroll">
                <div className="chip-row">
                  {notes.keyTerms.map((term) => (
                    <span key={term.term} className="chip">
                      {term.term} <span style={{ opacity: 0.7 }}>· {term.weight.toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {notes.definitions.length > 0 && (
          <div className="notes-section">
            <div className="section-header">
              <h3>Definitions</h3>
            </div>
            <ul className="topic-bullets">
              {notes.definitions.map((item) => (
                <li key={item.term}>
                  <strong>{item.term}:</strong> {item.definition}
                </li>
              ))}
            </ul>
          </div>
        )}
        {notes.steps.length > 0 && (
          <div className="notes-section">
            <div className="section-header">
              <h3>Steps</h3>
            </div>
            <ol className="topic-bullets">
              {notes.steps.map((step, index) => (
                <li key={`step-${index}`}>{step}</li>
              ))}
            </ol>
          </div>
        )}
        {notes.questions.length > 0 && (
          <div className="notes-section">
            <div className="section-header">
              <h3>Open Questions</h3>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setShowQuestions((prev) => !prev)}
              >
                {showQuestions ? "Hide" : "Show"} ({notes.questions.length})
              </button>
            </div>
            {showQuestions && (
              <ul className="topic-bullets">
                {notes.questions.map((question, index) => (
                  <li key={`question-${index}`}>{question}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
