"use client";

type SimulatorLoadState = "idle" | "loading" | "ready" | "error";

interface SimulatorPanelProps {
  fileName: string | null;
  loadState: SimulatorLoadState;
  error: string | null;
  durationSec: number | null;
  progressSec: number;
  speed: number;
  isRunning: boolean;
  onSpeedChange: (value: number) => void;
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

function clampSpeed(value: number): number {
  return Math.min(40, Math.max(1, value));
}

export default function SimulatorPanel({
  fileName,
  loadState,
  error,
  durationSec,
  progressSec,
  speed,
  isRunning,
  onSpeedChange,
  onFileChange
}: SimulatorPanelProps) {
  const progressPercent =
    durationSec && durationSec > 0 ? Math.min(100, (progressSec / durationSec) * 100) : 0;
  const estimatedRuntimeSec = durationSec ? durationSec / speed : null;
  const statusLabel =
    loadState === "loading"
      ? "Preparing"
      : isRunning
        ? "Streaming"
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
            Upload a lecture recording and stream it through the existing session pipeline.
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Speed ({speed.toFixed(1)}x)</label>
          <input
            type="range"
            min="1"
            max="40"
            step="0.5"
            value={speed}
            onChange={(event) => onSpeedChange(clampSpeed(Number(event.target.value)))}
          />
          <input
            className="input simulator-speed-input"
            type="number"
            min="1"
            max="40"
            step="0.5"
            value={speed}
            onChange={(event) => onSpeedChange(clampSpeed(Number(event.target.value)))}
          />
          <div className="simulator-caption">
            Target audio compression is about {formatDuration(estimatedRuntimeSec)} at this speed.
            Transcript and note generation can still take longer depending on processing load.
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
            <strong>Progress</strong>
            <span>
              {formatDuration(progressSec)} / {formatDuration(durationSec)}
            </span>
          </div>
        </div>
      </div>

      <div className="simulator-progress">
        <div className="simulator-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      {error && <div className="inline-error">{error}</div>}
    </section>
  );
}
