"use client";

import { Suspense, useEffect, useState } from "react";
import AppLayout from "../../../components/AppLayout";
import SessionDocument from "../../../components/SessionDocument";
import {
  getMe,
  getSession,
  regenerateSessionFinalNotes,
  type SessionInfo
} from "../../../lib/api";
import { exportSessionPdf } from "../../../lib/pdf";

function SessionDocumentPageContent({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<string | null>("Loading session...");
  const [authRequired, setAuthRequired] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<"idle" | "open" | "download">("idle");
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      const me = await getMe();
      if (!isMounted) return;
      if (!me) {
        setAuthRequired(true);
        setStatus(null);
        return;
      }
      try {
        const item = await getSession(sessionId);
        if (!isMounted) return;
        setSession(item);
        setStatus(null);
      } catch (err) {
        if (!isMounted) return;
        setStatus(err instanceof Error ? err.message : "Failed to load session");
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handlePdf = async (mode: "open" | "download") => {
    if (!session) return;
    const previewWindow =
      mode === "open" ? window.open("about:blank", "_blank", "noopener,noreferrer") : null;
    setPdfBusy(mode);
    try {
      await exportSessionPdf(session, mode, previewWindow);
    } catch (err) {
      previewWindow?.close();
      setStatus(err instanceof Error ? err.message : "Failed to export PDF");
    } finally {
      setPdfBusy("idle");
    }
  };

  const handleRegenerate = async () => {
    if (!session) return;
    setIsRegenerating(true);
    try {
      const updated = await regenerateSessionFinalNotes(session.id);
      setSession(updated);
      setStatus("Final notes regenerated.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to regenerate final notes");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <AppLayout>
      <main className="page-shell">
        <div className="page-card session-document-page">
          <div className="session-document-actions">
            <a className="ghost-btn" href="/sessions">
              Back to history
            </a>
            {session && (
              <>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handlePdf("open")}
                  disabled={pdfBusy !== "idle"}
                >
                  {pdfBusy === "open" ? "Opening PDF..." : "Open PDF"}
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void handlePdf("download")}
                  disabled={pdfBusy !== "idle"}
                >
                  {pdfBusy === "download" ? "Building PDF..." : "Download PDF"}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void handleRegenerate()}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? "Regenerating..." : "Regenerate Notes"}
                </button>
              </>
            )}
          </div>

          {authRequired && (
            <div className="context-card">
              <h3>Login required</h3>
              <p className="muted">Please sign in on the Profile page to view this session.</p>
            </div>
          )}

          {!authRequired && status && <div className="context-card"><p className="muted">{status}</p></div>}

          {!authRequired && session && (
            <SessionDocument
              session={session}
              includeStudentNotes
              includeTimeline
            />
          )}
        </div>
      </main>
    </AppLayout>
  );
}

export default function SessionDocumentPage({
  params
}: {
  params: { sessionId: string };
}) {
  return (
    <Suspense fallback={null}>
      <SessionDocumentPageContent sessionId={params.sessionId} />
    </Suspense>
  );
}
