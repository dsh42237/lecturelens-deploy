"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "../../../components/AppLayout";
import SessionDocument from "../../../components/SessionDocument";
import { getMe, getSession, type SessionInfo } from "../../../lib/api";

function SessionDocumentPageContent({ sessionId }: { sessionId: string }) {
  const searchParams = useSearchParams();
  const isPrintMode = searchParams.get("print") === "1";
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<string | null>("Loading session...");
  const [authRequired, setAuthRequired] = useState(false);

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

  useEffect(() => {
    if (!session) return;
    if (!isPrintMode) return;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, [isPrintMode, session]);

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
                <a
                  className="secondary-btn"
                  href={`/sessions/${encodeURIComponent(session.id)}?print=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Print View
                </a>
                <button type="button" className="primary-btn" onClick={() => window.print()}>
                  Download PDF
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
              printMode={isPrintMode}
              includeStudentNotes={!isPrintMode}
              includeTimeline={!isPrintMode}
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
