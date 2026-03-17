"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* ── Nav ── */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 48px", borderBottom: "1px solid var(--border)",
        background: "var(--card)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <span className="sidebar-brand" style={{ fontSize: "1.2rem", color: "var(--accent)" }}>LectureLens</span>
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <a href="#features" style={{ color: "var(--muted)", textDecoration: "none", fontSize: "0.9rem" }}>Features</a>
          <a href="#how-it-works" style={{ color: "var(--muted)", textDecoration: "none", fontSize: "0.9rem" }}>How it works</a>
          <button className="primary-btn" style={{ padding: "9px 22px" }} onClick={() => router.push("/profile")}>
            Get started
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        maxWidth: "1200px", margin: "0 auto", padding: "80px 48px 60px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center",
      }}>
        {/* Left */}
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "var(--accent-soft)", color: "var(--accent)",
            padding: "5px 14px", borderRadius: "100px", fontSize: "0.8rem",
            fontWeight: 500, marginBottom: "24px", letterSpacing: "0.04em",
          }}>
            ✦ Your AI lecture companion
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', 'DM Sans', sans-serif",
            fontSize: "clamp(2.2rem, 4vw, 3.4rem)", fontWeight: 700,
            lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--ink)",
            marginBottom: "20px",
          }}>
            Capture every<br />
            <span style={{ color: "var(--accent)" }}>lecture moment</span><br />
            effortlessly
          </h1>
          <p style={{ fontSize: "1.05rem", color: "var(--muted)", lineHeight: 1.7, marginBottom: "32px", maxWidth: "42ch" }}>
            LectureLens listens, transcribes, and organises your notes in real-time — so you focus on learning, not scribbling.
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "36px" }}>
            {["🎙️ Live transcription", "✨ AI notes", "📱 Mobile capture", "📚 Course organiser"].map(tag => (
              <span key={tag} className="pill" style={{ fontSize: "0.82rem" }}>{tag}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button className="primary-btn" style={{ padding: "12px 28px", fontSize: "1rem" }} onClick={() => router.push("/profile")}>
              Get started — it's free
            </button>
            <button className="secondary-btn" style={{ padding: "12px 28px", fontSize: "1rem" }} onClick={() => {
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
            }}>
              See how it works
            </button>
          </div>
        </div>

        {/* Right — Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Image
            src="/Logo.jpeg"
            alt="LectureLens"
            width={340}
            height={340}
            style={{ borderRadius: "24px", boxShadow: "var(--shadow)" }}
          />
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 48px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px", justifyContent: "center",
            fontSize: "0.72rem", letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--muted)", marginBottom: "12px",
          }}>
            <div style={{ flex: 1, maxWidth: "60px", height: "1px", background: "var(--border)" }} />
            FEATURES
            <div style={{ flex: 1, maxWidth: "60px", height: "1px", background: "var(--border)" }} />
          </div>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
            fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)",
          }}>Everything you need to ace your courses</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          {[
            { icon: "🎙️", title: "Live transcription", desc: "Every word your professor says, captured instantly and accurately in real-time." },
            { icon: "✨", title: "AI-generated notes", desc: "Key terms, bullet points, definitions, and questions structured automatically." },
            { icon: "📚", title: "Course organiser", desc: "Organise all sessions by course and semester. Find any lecture in seconds." },
            { icon: "📱", title: "Mobile capture link", desc: "Scan a QR code to use your phone as a second microphone for better audio." },
            { icon: "🧠", title: "AI course enrichment", desc: "Let AI build context around your course with summaries and related concepts." },
            { icon: "📝", title: "Session history", desc: "Every session is saved. Review notes from any past lecture whenever you need." },
          ].map((f) => (
            <div key={f.title} className="context-card" style={{ margin: 0 }}>
              <div style={{ fontSize: "26px", marginBottom: "12px" }}>{f.icon}</div>
              <h3 style={{ marginBottom: "8px", color: "var(--ink)", fontSize: "1rem", fontWeight: 600 }}>{f.title}</h3>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" style={{ background: "var(--bg-accent)", padding: "80px 48px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "56px" }}>
            <div style={{
              fontSize: "0.72rem", letterSpacing: "0.12em", textTransform: "uppercase",
              color: "var(--muted)", marginBottom: "12px",
              display: "flex", alignItems: "center", gap: "10px", justifyContent: "center",
            }}>
              <div style={{ flex: 1, maxWidth: "60px", height: "1px", background: "var(--border)" }} />
              GETTING STARTED
              <div style={{ flex: 1, maxWidth: "60px", height: "1px", background: "var(--border)" }} />
            </div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
              fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)",
            }}>Up and running in minutes</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "40px" }}>
            {[
              { num: "01", title: "Create your profile", desc: "Sign up, add your institution, program, and courses for the semester." },
              { num: "02", title: "Start a session", desc: "Select your course, grant mic permission, and hit record. That's it." },
              { num: "03", title: "Capture in real-time", desc: "LectureLens transcribes and builds your notes live as the lecture unfolds." },
              { num: "04", title: "Review & study", desc: "Session ends, final notes are ready. Structured, clean, and searchable." },
            ].map((s) => (
              <div key={s.num}>
                <div style={{
                  fontSize: "2rem", fontWeight: 700, color: "var(--accent)",
                  fontFamily: "'Space Grotesk', sans-serif", marginBottom: "12px",
                  borderBottom: "2px solid var(--accent-soft)", paddingBottom: "12px",
                }}>
                  {s.num}
                </div>
                <div style={{ fontWeight: 600, marginBottom: "8px", color: "var(--ink)", fontSize: "1rem" }}>{s.title}</div>
                <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


    </div>
  );
}
