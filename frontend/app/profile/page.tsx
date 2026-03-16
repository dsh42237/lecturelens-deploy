"use client";

import { useEffect, useState } from "react";
import AppLayout from "../../components/AppLayout";
import {
  register,
  login,
  logout,
  getMe,
  getProfile,
  updateProfile,
  enrichProfile
} from "../../lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<{ id: number; email: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [programName, setProgramName] = useState("");
  const [institution, setInstitution] = useState("");
  const [context, setContext] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadProfile = async () => {
    try {
      const profile = await getProfile();
      setFullName(profile.full_name ?? "");
      setProgramName(profile.program_name ?? "");
      setInstitution(profile.institution ?? "");
      setContext(profile.context_summary ?? null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load profile");
    }
  };

  useEffect(() => {
    const init = async () => {
      const me = await getMe();
      if (me) {
        setUser(me);
        await loadProfile();
      } else {
        setUser(null);
      }
    };
    init();
  }, []);

  const handleRegister = async () => {
    setStatus(null);
    try {
      const me = await register(email, password);
      setUser(me);
      await loadProfile();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Register failed");
    }
  };

  const handleLogin = async () => {
    setStatus(null);
    try {
      const me = await login(email, password);
      setUser(me);
      await loadProfile();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleLogout = async () => {
    setStatus(null);
    await logout();
    setUser(null);
    setContext(null);
    setFullName("");
    setProgramName("");
    setInstitution("");
  };

  const handleSave = async () => {
    setStatus(null);
    try {
      const profile = await updateProfile({ full_name: fullName, program_name: programName, institution });
      setFullName(profile.full_name ?? "");
      setProgramName(profile.program_name ?? "");
      setInstitution(profile.institution ?? "");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleEnrich = async () => {
    setStatus(null);
    try {
      const profile = await enrichProfile();
      setContext(profile.context_summary ?? null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Enrich failed");
    }
  };

  return (
    <AppLayout>
      <main className="page-shell">
        <div className="page-card">
          <div className="page-header">
            <h1>Student Profile</h1>
            {user && (
              <button className="ghost-btn" type="button" onClick={handleLogout}>
                Log out
              </button>
            )}
          </div>

          {!user && (
            <div className="form-section">
              <h2>Sign in</h2>
              <div className="form-row">
                <label>Email</label>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
              </div>
              <div className="form-row">
                <label>Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="form-actions">
                <button className="primary-btn" type="button" onClick={handleLogin}>
                  Log in
                </button>
                <button className="secondary-btn" type="button" onClick={handleRegister}>
                  Create account
                </button>
              </div>
            </div>
          )}

          {user && (
            <div className="form-section">
              <h2>Profile details</h2>
              <div className="form-row">
                <label>Full name</label>
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="form-row">
                <label>Program name</label>
                <input
                  className="input"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="Computer Science / Psychology"
                />
              </div>
              <div className="form-row">
                <label>Institution</label>
                <input
                  className="input"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="University / College"
                />
              </div>
              <div className="form-actions">
                <button className="primary-btn" type="button" onClick={handleSave}>
                  Save profile
                </button>
                <button className="secondary-btn" type="button" onClick={handleEnrich}>
                  Enrich with AI
                </button>
              </div>
            </div>
          )}

          {context && (
            <div className="context-card">
              <h3>Profile context</h3>
              <pre>{context}</pre>
            </div>
          )}

          {status && <div className="inline-error">{status}</div>}
        </div>
      </main>
    </AppLayout>
  );
}
