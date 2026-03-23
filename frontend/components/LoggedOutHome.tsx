"use client";

import Image from "next/image";
import Link from "next/link";

export default function LoggedOutHome() {
  const featureGroups = [
    {
      title: "Capture",
      lead: "Choose the lecture input setup that matches the room and your testing workflow.",
      items: [
        {
          title: "Desktop microphone",
          copy: "Start a live session from your laptop and stream lecture audio directly into transcript and notes."
        },
        {
          title: "Phone mic and camera",
          copy: "Use the QR-based mobile capture flow to pick up better audio or preview the board from a second device."
        },
        {
          title: "Audio simulator",
          copy: "Upload a lecture recording and compress 15-20 minutes of testing into about 60-90 seconds."
        }
      ]
    },
    {
      title: "Understand",
      lead: "Keep the lecture readable while it is happening, not only after it ends.",
      items: [
        {
          title: "Live transcript",
          copy: "Watch the lecture appear in real time so you can recover details you might have missed."
        },
        {
          title: "Live notes",
          copy: "Receive compact AI note snapshots with topic focus, key points, and quick missed-it cues."
        },
        {
          title: "Student notes",
          copy: "Write your own reminders, confusions, and callouts alongside the lecture as it unfolds."
        }
      ]
    },
    {
      title: "Review",
      lead: "Turn raw capture into something worth studying from later.",
      items: [
        {
          title: "Final notes generation",
          copy: "Combine transcript, AI synthesis, and your own student notes into a polished study document."
        },
        {
          title: "Session history",
          copy: "Return to previous sessions by course and inspect both the final notes and live note timeline."
        },
        {
          title: "Course context",
          copy: "Attach each session to a course so your semester stays organized instead of turning into loose files."
        }
      ]
    }
  ];

  const workflowSteps = [
    {
      step: "01",
      title: "Set up your semester",
      copy: "Create an account, add courses, and choose the class you are about to record so each session lands in the right place."
    },
    {
      step: "02",
      title: "Pick a capture mode",
      copy: "Use the desktop mic in class, connect a phone for remote capture, or run the simulator when you want accelerated testing."
    },
    {
      step: "03",
      title: "Watch notes build live",
      copy: "Transcript updates continuously while live notes and your own student notes build context in parallel."
    },
    {
      step: "04",
      title: "Stop and generate finals",
        copy: "When the session ends, LiveLecture turns the session into final notes using the lecture transcript and your own note additions."
    },
    {
      step: "05",
      title: "Review and iterate",
      copy: "Open session history, compare outcomes, and use simulator runs to quickly test prompts, note quality, and UI behavior."
    }
  ];

  return (
    <main className="landing-shell">
      <div className="landing-page">
        <header className="landing-header">
          <div className="landing-header-brand">
            <Image
              src="/Logo.jpg"
              alt="LiveLecture logo"
              width={42}
              height={42}
              className="landing-header-logo"
              priority
            />
            <div className="landing-brand">LiveLecture</div>
          </div>
          <nav className="landing-nav">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#testing">Testing</a>
            <a href="/profile" className="landing-nav-cta">
              Sign in
            </a>
          </nav>
        </header>

        <section className="landing-band landing-band-hero">
          <div className="landing-section-inner">
            <div className="landing-hero-grid">
              <div>
                <div className="landing-badge">AI lecture workflow for capture, notes, and testing</div>
                <p className="landing-kicker">LiveLecture</p>
                <h1>Capture lectures, add your own notes, and turn class into something studyable.</h1>
                <p className="landing-lead">
                  LiveLecture brings transcript, live notes, final notes, student notes, mobile
                  capture, and accelerated lecture simulation into one workspace so you can use the
                  same app in class and during development.
                </p>
                <div className="landing-pill-row">
                  <span className="pill">Live transcription</span>
                  <span className="pill">AI live notes</span>
                  <span className="pill">Student notes</span>
                  <span className="pill">Session history</span>
                  <span className="pill">Audio simulator</span>
                </div>
                <div className="landing-actions">
                  <Link href="/profile" className="landing-btn landing-btn-primary">
                    Open the app
                  </Link>
                  <a href="#features" className="landing-btn landing-btn-secondary">
                    Explore features
                  </a>
                </div>
                <div className="landing-proof-grid">
                  <div className="landing-proof-card">
                    <strong>Capture</strong>
                    <span>Desktop mic, phone capture, or uploaded audio simulation.</span>
                  </div>
                  <div className="landing-proof-card">
                    <strong>Note flow</strong>
                    <span>Transcript, live notes, final notes, and your own note layer together.</span>
                  </div>
                  <div className="landing-proof-card">
                    <strong>Testing</strong>
                    <span>Run long lecture recordings at high speed to verify behavior faster.</span>
                  </div>
                </div>
              </div>

              <div className="landing-preview">
                <div className="landing-logo-frame">
                  <Image
                    src="/Logo.jpg"
                    alt="LiveLecture logo"
                    width={220}
                    height={220}
                    className="landing-logo-image"
                    priority
                  />
                </div>
                <div className="landing-preview-card">
                  <div className="landing-preview-label">Live transcript</div>
                  <div className="landing-preview-title">Professor explains gradient descent</div>
                  <div className="landing-preview-copy">
                    The learning rate changes how far each update step moves, so a rate that is too
                    high can overshoot the minimum.
                  </div>
                </div>
                <div className="landing-preview-grid">
                  <div className="landing-preview-card">
                    <div className="landing-preview-label">Live notes</div>
                    <ul className="landing-preview-list">
                      <li>Topic: optimization basics</li>
                      <li>Key point: step size controls convergence</li>
                      <li>Definition: local minimum</li>
                    </ul>
                  </div>
                  <div className="landing-preview-card accent">
                    <div className="landing-preview-label">Student notes</div>
                    <ul className="landing-preview-list">
                      <li>Reminder: compare batch vs stochastic descent</li>
                      <li>Ask why large learning rates oscillate</li>
                      <li>Include exam-style example in finals</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="landing-band">
          <div className="landing-section-inner">
            <div className="landing-section-heading">
              <div className="landing-eyebrow">Features</div>
              <h2>Built as a full lecture workflow, not just a transcript box</h2>
              <p>
                Each section of the product handles a different part of lecture capture: getting
                the audio in, making it understandable in real time, and turning it into something
                useful after class.
              </p>
            </div>

            <div className="landing-feature-groups">
              {featureGroups.map((group) => (
                <section key={group.title} className="landing-feature-group">
                  <div className="landing-feature-group-head">
                    <div className="landing-feature-index">{group.title}</div>
                    <p>{group.lead}</p>
                  </div>
                  <div className="landing-feature-card-grid">
                    {group.items.map((item) => (
                      <article key={item.title} className="landing-feature-card">
                        <h3>{item.title}</h3>
                        <p>{item.copy}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-band landing-band-alt">
          <div className="landing-section-inner landing-split-grid">
            <div className="landing-surface">
              <div className="landing-eyebrow">Why It Feels Better</div>
              <h2>Designed to keep pace with lectures instead of forcing cleanup later</h2>
              <p>
                The point is not only to store audio. It is to reduce friction during class,
                preserve your own observations, and make testing iterations fast enough that you
                can improve the workflow between lectures.
              </p>
            </div>
            <div className="landing-surface landing-surface-accent">
              <div className="landing-eyebrow">What Changes</div>
              <h2>One app for both student use and development validation</h2>
              <p>
                In class, you capture and annotate. During development, you replay lecture audio at
                high speed to inspect transcript behavior, note quality, and final-note composition
                without waiting through full-length recordings.
              </p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="landing-band">
          <div className="landing-section-inner">
            <div className="landing-section-heading">
              <div className="landing-eyebrow">How It Works</div>
              <h2>Move through the lecture flow in clear stages</h2>
              <p>
                The homepage is split here on purpose: first what the system can do, then the
                actual sequence of using it. The step rail reflects the order a real session moves.
              </p>
            </div>

            <div className="landing-step-flow">
              {workflowSteps.map((item, index) => (
                <div key={item.step} className="landing-step-item">
                  <div className="landing-step-rail">
                    <div className="landing-step-marker">{item.step}</div>
                    {index < workflowSteps.length - 1 && <div className="landing-step-line" />}
                  </div>
                  <div className="landing-step-body">
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="testing" className="landing-band landing-band-accent">
          <div className="landing-section-inner">
            <div className="landing-section-heading">
              <div className="landing-eyebrow">Testing</div>
              <h2>Use simulator mode to validate long lectures quickly</h2>
              <p>
                Instead of waiting through an entire recording, upload lecture audio and control the
                speed. That lets you test transcript flow, live notes cadence, student notes
                inclusion, and final note generation on realistic input with a much shorter loop.
              </p>
            </div>
            <div className="landing-testing-grid">
              <article className="landing-feature-card">
                <h3>Fast replay</h3>
                <p>Compress 15-20 minutes of source audio into roughly 60-90 seconds for iteration.</p>
              </article>
              <article className="landing-feature-card">
                <h3>Same processing path</h3>
                <p>The simulator streams through the same session websocket path as live capture.</p>
              </article>
              <article className="landing-feature-card">
                <h3>Real UI validation</h3>
                <p>Observe transcript, live notes, final notes, and session history under realistic load.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-band landing-band-cta">
          <div className="landing-section-inner landing-cta-card">
            <div>
              <div className="landing-eyebrow">Start Using LiveLecture</div>
              <h2>Open the app, pick a course, and run a live session or simulator pass.</h2>
              <p>
                The current build already supports student notes, mobile capture, session history,
                and accelerated testing. The fastest way to judge it is to run a session yourself.
              </p>
            </div>
            <div className="landing-actions">
              <Link href="/profile" className="landing-btn landing-btn-primary">
                Sign in and start
              </Link>
              <a href="/sessions" className="landing-btn landing-btn-secondary">
                View session history
              </a>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          <div>LiveLecture • AI lecture assistant for students</div>
          <div className="landing-footer-links">
            <a href="/profile">Sign in</a>
            <a href="/semesters">Semesters</a>
            <a href="/sessions">Session history</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
