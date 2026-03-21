"use client";

type SimulatorLoadState = "idle" | "loading" | "ready" | "error";
type SimulatorMode = "audio" | "transcript";

interface SimulatorPanelProps {
  mode: SimulatorMode;
  fileName: string | null;
  loadState: SimulatorLoadState;
  error: string | null;
  durationSec: number | null;
  progressSec: number;
  isRunning: boolean;
  transcriptText: string;
  onModeChange: (value: SimulatorMode) => void;
  onTranscriptChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) {
    return "--:--";
  }
  const rounded = Math.max(0, Math.round(seconds));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function SimulatorPanel({
  mode,
  fileName,
  loadState,
  error,
  durationSec,
  progressSec,
  isRunning,
  transcriptText,
  onModeChange,
  onTranscriptChange,
  onFileChange
}: SimulatorPanelProps) {
  const progressPercent =
    durationSec && durationSec > 0 ? Math.min(100, (progressSec / durationSec) * 100) : 0;
  const transcriptWordCount = transcriptText.trim()
    ? transcriptText.trim().split(/\s+/).length
    : 0;
  const statusLabel =
    loadState === "loading"
      ? "Preparing"
      : isRunning
        ? "Processing"
        : loadState === "ready"
          ? "Ready"
          : loadState === "error"
            ? "Error"
            : "Idle";

  return (
    <section className="simulator-card">
      <div className="panel-heading">
        <h2>Lecture Simulator</h2>
        <span className="pill muted">{statusLabel}</span>
      </div>

      <div className="form-row" style={{ marginBottom: 0 }}>
        <label>Simulator input</label>
        <select
          className="input"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as SimulatorMode)}
          disabled={isRunning}
        >
          <option value="audio">Audio upload</option>
          <option value="transcript">Transcript paste</option>
        </select>
      </div>

      {mode === "audio" ? (
        <>
          <div className="simulator-grid">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Audio lecture</label>
              <input
                className="input"
                type="file"
                accept="audio/*"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                disabled={isRunning}
              />
              <div className="simulator-caption">
                Upload a lecture recording. The backend transcribes it, emits live-note cards,
                and generates the final notes without simulating real-time playback.
              </div>
            </div>

            <div className="simulator-metrics">
              <div className="status-card">
                <strong>Loaded file</strong>
                <span>{fileName ?? "None selected"}</span>
              </div>
              <div className="status-card">
                <strong>Lecture length</strong>
                <span>{formatDuration(durationSec)}</span>
              </div>
              <div className="status-card">
                <strong>Processed</strong>
                <span>
                  {formatDuration(progressSec)} / {formatDuration(durationSec)}
                </span>
              </div>
            </div>
          </div>

          <div className="simulator-progress">
            <div className="simulator-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </>
      ) : (
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Transcript</label>
          <textarea
            className="input simulator-transcript-area"
            value={transcriptText}
            onChange={(event) => onTranscriptChange(event.target.value)}
            placeholder="Paste the lecture transcript here. The app will skip audio transcription and still generate the live-note cards and final notes."
            disabled={isRunning}
          />
          <div className="simulator-caption">
            This path skips STT and pushes the transcript directly through the same live-notes and
            final-notes pipeline.
          </div>
          <div className="simulator-metrics">
            <div className="status-card">
              <strong>Transcript length</strong>
              <span>{transcriptWordCount} words</span>
            </div>
          </div>
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}
    </section>
  );
}
