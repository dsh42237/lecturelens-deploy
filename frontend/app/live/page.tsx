"use client";

import { useEffect, useRef, useState } from "react";
import TranscriptPanel from "../../components/TranscriptPanel";
import LiveNotesPanel from "../../components/LiveNotesPanel";
import FinalNotesPanel from "../../components/FinalNotesPanel";
import { connectSession } from "../../lib/ws";
import type {
  AudioFramePayload,
  FinalNotesPayload,
  LiveNotesPayload,
  TranscriptLine
} from "../../lib/types";
import AppLayout from "../../components/AppLayout";
import { createMobileLink, getMe, listCourses } from "../../lib/api";

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320; // ~20ms at 16kHz
const LIVE_NOTES_INTERVAL_SECONDS = 10;

function generateId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getJwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload?.exp === "number") {
      return payload.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [connected, setConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState("idle");
  const [status, setStatus] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [partialLine, setPartialLine] = useState<TranscriptLine | null>(null);
  const [liveNotes, setLiveNotes] = useState<LiveNotesPayload | null>(null);
  const [liveNotesHistory, setLiveNotesHistory] = useState<
    { id: string; ts: number; notes: LiveNotesPayload }[]
  >([]);
  const [selectedLiveNotesId, setSelectedLiveNotesId] = useState<string | null>(null);
  const [finalNotes, setFinalNotes] = useState<FinalNotesPayload | null>(null);
  const [lastLiveNotesUpdate, setLastLiveNotesUpdate] = useState<number | null>(null);
  const [framesSent, setFramesSent] = useState(0);
  const [lastFrameMs, setLastFrameMs] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | "unknown">("unknown");
  const [micLabel, setMicLabel] = useState<string>("(none)");
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [courses, setCourses] = useState<{ id: number; course_code: string; course_name: string }[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | "">("");
  const [courseStatus, setCourseStatus] = useState<string | null>(null);
  const [captureSource, setCaptureSource] = useState<"desktop" | "phone">("desktop");
  const [cameraPreviewDataUrl, setCameraPreviewDataUrl] = useState<string | null>(null);
  const [mobileBaseUrl, setMobileBaseUrl] = useState("");
  const [mobileApiBaseUrl, setMobileApiBaseUrl] = useState("");
  const [mobileAuthToken, setMobileAuthToken] = useState<string | null>(null);
  const [mobileLinkStatus, setMobileLinkStatus] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const pendingRef = useRef<{ chunks: Float32Array[]; length: number }>({
    chunks: [],
    length: 0
  });

  useEffect(() => {
    const existing = window.localStorage.getItem("desktopSessionId");
    const id = existing || generateId();
    window.localStorage.setItem("desktopSessionId", id);
    setSessionId(id);
  }, []);

  useEffect(() => {
    if (!navigator.permissions?.query) {
      setPermissionState("unknown");
      return;
    }

    let permissionStatus: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        permissionStatus = status;
        setPermissionState(status.state);
        status.onchange = () => {
          setPermissionState(status.state);
        };
      })
      .catch(() => {
        setPermissionState("unknown");
      });

    return () => {
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("mobileBaseUrl");
    const storedApi = window.localStorage.getItem("mobileApiBaseUrl");
    const storedToken = window.localStorage.getItem("mobileAuthToken");
    const defaultBase = `${window.location.protocol}//${window.location.host}`;
    const defaultApi = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    setMobileBaseUrl(stored || defaultBase);
    setMobileApiBaseUrl(storedApi || defaultApi);
    if (storedToken) {
      const exp = getJwtExpMs(storedToken);
      if (exp && exp > Date.now() + 30_000) {
        setMobileAuthToken(storedToken);
      }
    }
  }, []);

  useEffect(() => {
    if (!mobileBaseUrl) return;
    window.localStorage.setItem("mobileBaseUrl", mobileBaseUrl);
  }, [mobileBaseUrl]);

  useEffect(() => {
    if (!mobileApiBaseUrl) return;
    window.localStorage.setItem("mobileApiBaseUrl", mobileApiBaseUrl);
  }, [mobileApiBaseUrl]);

  useEffect(() => {
    if (!sessionId) return;
    const loadCourses = async () => {
      const me = await getMe();
      if (!me) {
        setCourses([]);
        setSelectedCourseId("");
        setCourseStatus("Login to attach a course");
        setMobileAuthToken(null);
        window.localStorage.removeItem("mobileAuthToken");
        return;
      }
      try {
        const items = await listCourses();
        setCourses(items);
        if (items.length > 0) {
          setSelectedCourseId(items[0].id);
        }
        setCourseStatus(null);
      } catch (err) {
        setCourseStatus(err instanceof Error ? err.message : "Failed to load courses");
      }
      // Only mint a new mobile token if we don't already have a valid one.
      if (!mobileAuthToken) {
        try {
          const link = await createMobileLink(sessionId);
          setMobileAuthToken(link.token);
          window.localStorage.setItem("mobileAuthToken", link.token);
          setMobileLinkStatus(null);
        } catch (err) {
          setMobileLinkStatus(err instanceof Error ? err.message : "Failed to generate mobile link");
        }
      }
    };
    loadCourses();
  }, [mobileAuthToken, sessionId]);

  const refreshMobileLink = async () => {
    if (!sessionId) return;
    try {
      const link = await createMobileLink(sessionId);
      setMobileAuthToken(link.token);
      window.localStorage.setItem("mobileAuthToken", link.token);
      setMobileLinkStatus("Mobile link refreshed");
    } catch (err) {
      setMobileLinkStatus(err instanceof Error ? err.message : "Failed to refresh mobile link");
    }
  };

  useEffect(() => {
    if (!sessionId || !isSessionRunning) return;

    setWsStatus("connecting");
    const connection = connectSession(sessionId, {
      onOpen: () => {
        setConnected(true);
        setWsStatus("open");
        setIsStopping(false);
        const startMessage = {
          type: "start_session",
          sessionId,
          timestamp: Date.now(),
          payload: selectedCourseId ? { courseId: selectedCourseId } : {}
        };
        connection.socket.send(JSON.stringify(startMessage));
      },
      onClose: (event) => {
        setConnected(false);
        setWsStatus("closed");
        setIsSessionRunning(false);
        setIsStopping(false);
        if (event) {
          setStatus(`ws closed (${event.code})`);
          console.log("[WS] closed", event.code, event.reason);
        }
      },
      onStatus: (event) => setStatus(event.payload.message),
      onTranscriptPartial: (event) => {
        setPartialLine({ id: event.payload.lineId, text: event.payload.text });
      },
      onTranscriptFinal: (event) => {
        setLines((prev) => [
          ...prev,
          { id: event.payload.lineId ?? generateId(), text: event.payload.text }
        ]);
        setPartialLine(null);
      },
      onLiveNotesDelta: (event) => {
        const entry = {
          id: generateId(),
          ts: Date.now(),
          notes: event.payload
        };
        setLiveNotes(event.payload);
        setLastLiveNotesUpdate(entry.ts);
        setLiveNotesHistory((prev) => {
          const next = [...prev, entry];
          if (next.length > 25) {
            next.splice(0, next.length - 25);
          }
          return next;
        });
        setSelectedLiveNotesId(entry.id);
      },
      onFinalNotes: (event) => {
        setFinalNotes(event.payload);
      },
      onCameraPreview: (event) => {
        const payload = event.payload;
        setCameraPreviewDataUrl(`data:${payload.mimeType};base64,${payload.image}`);
      },
      onErrorEvent: (event) => setStatus(event.payload.message)
    });
    socketRef.current = connection.socket;

    return () => {
      socketRef.current = null;
      connection.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isSessionRunning, captureSource, selectedCourseId]);

  const encodeFloat32 = (audio: Float32Array) => {
    const bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const resampleLinear = (input: Float32Array, inputRate: number, targetRate: number) => {
    if (inputRate === targetRate) return input;
    if (input.length === 0) return input;

    const ratio = targetRate / inputRate;
    const outputLength = Math.max(1, Math.round(input.length * ratio));
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i += 1) {
      const srcIndex = i / ratio;
      const idx0 = Math.floor(srcIndex);
      const idx1 = Math.min(idx0 + 1, input.length - 1);
      const frac = srcIndex - idx0;
      output[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
    }

    return output;
  };

  const sendAudioFrame = (audio: Float32Array) => {
    if (!sessionId) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const payload: AudioFramePayload = {
      sampleRate: TARGET_SAMPLE_RATE,
      format: "f32le",
      audio: encodeFloat32(audio)
    };

    const message = {
      type: "audio_frame",
      sessionId,
      timestamp: Date.now(),
      payload
    };

    socket.send(JSON.stringify(message));
    setFramesSent((prev) => prev + 1);
    setLastFrameMs(Date.now());
  };

  const queueSamples = (samples: Float32Array) => {
    pendingRef.current.chunks.push(samples);
    pendingRef.current.length += samples.length;
  };

  const takeFrame = () => {
    if (pendingRef.current.length < FRAME_SAMPLES) return null;
    const frame = new Float32Array(FRAME_SAMPLES);
    let offset = 0;

    while (offset < FRAME_SAMPLES && pendingRef.current.chunks.length > 0) {
      const chunk = pendingRef.current.chunks[0];
      const remaining = FRAME_SAMPLES - offset;
      if (chunk.length <= remaining) {
        frame.set(chunk, offset);
        offset += chunk.length;
        pendingRef.current.chunks.shift();
        pendingRef.current.length -= chunk.length;
      } else {
        frame.set(chunk.subarray(0, remaining), offset);
        pendingRef.current.chunks[0] = chunk.subarray(remaining);
        pendingRef.current.length -= remaining;
        offset += remaining;
      }
    }

    return frame;
  };

  const handleAudioChunk = (chunk: Float32Array, inputRate: number) => {
    const resampled = resampleLinear(chunk, inputRate, TARGET_SAMPLE_RATE);
    queueSamples(resampled);

    let frame = takeFrame();
    while (frame) {
      sendAudioFrame(frame);
      frame = takeFrame();
    }
  };

  const stopAudioPipeline = () => {
    pendingRef.current = { chunks: [], length: 0 };

    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startAudioPipeline = async (stream: MediaStream) => {
    const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    audioContextRef.current = context;
    const inputRate = context.sampleRate;

    const source = context.createMediaStreamSource(stream);
    sourceNodeRef.current = source;

    const gain = context.createGain();
    gain.gain.value = 0;
    gainNodeRef.current = gain;

    if (context.audioWorklet && "AudioWorkletNode" in window) {
      const processorCode = `
        class FrameProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input && input[0]) {
              const channel = input[0];
              const copy = new Float32Array(channel.length);
              copy.set(channel);
              this.port.postMessage(copy);
            }
            return true;
          }
        }
        registerProcessor('frame-processor', FrameProcessor);
      `;
      const blob = new Blob([processorCode], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      try {
        await context.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(context, "frame-processor");
        node.port.onmessage = (event) => {
          const data = event.data as Float32Array;
          handleAudioChunk(data, inputRate);
        };
        workletNodeRef.current = node;
        source.connect(node);
        node.connect(gain).connect(context.destination);
        URL.revokeObjectURL(url);
        return;
      } catch {
        URL.revokeObjectURL(url);
      }
    }

    const processor = context.createScriptProcessor(256, 1, 1);
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      handleAudioChunk(copy, inputRate);
    };
    processorNodeRef.current = processor;
    source.connect(processor);
    processor.connect(gain).connect(context.destination);
  };

  const handleStart = () => {
    const start = async () => {
      try {
        setIsStopping(false);
        setLiveNotes(null);
        setFinalNotes(null);
        setLastLiveNotesUpdate(null);
        setLiveNotesHistory([]);
        setSelectedLiveNotesId(null);
        setLines([]);
        setPartialLine(null);
        if (captureSource === "desktop") {
          await requestMicAndStartStreaming();
        } else {
          setMicActive(false);
          setMicError(null);
          setStatus("Session started. Start capture on phone.");
        }
        setIsSessionRunning(true);
      } catch (error) {
        const message =
          error instanceof Error ? `${error.name}: ${error.message}` : "Failed to access microphone";
        setMicError(message);
        setStatus(message);
        stopSession();
      }
    };

    start();
  };

  const stopSession = () => {
    stopAudioPipeline();
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }
    setMicActive(false);
    if (isSessionRunning) {
      setIsStopping(true);
    }

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && sessionId) {
      const stopMessage = {
        type: "stop_session",
        sessionId,
        timestamp: Date.now(),
        payload: {}
      };
      socket.send(JSON.stringify(stopMessage));
      if (captureSource === "phone") {
        socket.close();
      }
    } else if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };

  const handleStop = () => {
    stopSession();
  };

  const requestMicAndStartStreaming = async () => {
    setMicError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setMediaStream(stream);
    const track = stream.getAudioTracks()[0];
    setMicLabel(track?.label || "(default)");
    setMicActive(true);
    if (permissionState === "unknown") {
      setPermissionState("granted");
    }
    await startAudioPipeline(stream);
  };

  if (!sessionId) {
    return (
      <AppLayout>
        <main>
          <div className="app-shell">
            <div className="header-card">
              <div className="brand">
                <h1>LectureLens</h1>
                <p>Preparing your session...</p>
              </div>
            </div>
          </div>
        </main>
      </AppLayout>
    );
  }

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);
  const courseReady = Boolean(selectedCourseId);
  const micReady = permissionState === "granted";
  const sourceReady = captureSource === "desktop" ? micReady : true;
  const readyText = courseReady && sourceReady ? "Ready to record" : "Complete setup";
  const mobileLink = mobileAuthToken
    ? `${mobileBaseUrl.replace(/\/+$/, "")}/mobile?auth=${encodeURIComponent(mobileAuthToken)}&sid=${encodeURIComponent(sessionId)}&cid=${encodeURIComponent(String(selectedCourseId || ""))}&api=${encodeURIComponent(mobileApiBaseUrl)}`
    : "";
  const mobileQrUrl = mobileLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileLink)}`
    : "";

  return (
    <AppLayout>
      <main>
        <div className="app-shell">
          <header className="header-card">
            <div className="brand">
              <h1>LectureLens</h1>
              <p>Capture lectures, highlight key ideas, and keep pace with the room.</p>
              <div className="meta-row">
                <span className="pill">Session {sessionId.slice(0, 8)}</span>
                <span className="pill muted">{connected ? "connected" : "disconnected"}</span>
                {status && <span className="pill muted">{status}</span>}
              </div>
              <div className="stat-row">
                <span className="stat-chip">Mic: {permissionState}</span>
                <span className="stat-chip">WS: {wsStatus}</span>
                <span className="stat-chip">
                  Notes: {lastLiveNotesUpdate ? new Date(lastLiveNotesUpdate).toLocaleTimeString() : "-"}
                </span>
              </div>
              <div className="session-setup">
                <div className="setup-grid">
                  <div className="setup-card">
                    <div className="setup-title">Course</div>
                    {courses.length === 0 ? (
                      <div className="setup-empty">
                        <span>{courseStatus ?? "No courses yet"}</span>
                        <a className="secondary-btn" href="/semesters">
                          Add courses
                        </a>
                      </div>
                    ) : (
                      <select
                        className="input"
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(Number(e.target.value))}
                        disabled={isSessionRunning}
                      >
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.course_code} — {course.course_name}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedCourse && (
                      <div className="setup-caption">
                        {selectedCourse.course_code} · {selectedCourse.course_name}
                      </div>
                    )}
                  </div>
                  <div className="setup-card">
                    <div className="setup-title">Mic</div>
                    <div className="setup-caption">
                      {micLabel} · {micActive ? "Active" : "Inactive"}
                    </div>
                    <ul className="checklist">
                      <li className={courseReady ? "ok" : ""}>Course selected</li>
                      <li className={sourceReady ? "ok" : ""}>
                        {captureSource === "desktop" ? "Mic permission" : "Phone capture selected"}
                      </li>
                      <li className={wsStatus === "open" ? "ok" : ""}>WebSocket connected</li>
                    </ul>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Capture source</label>
                      <select
                        className="input"
                        value={captureSource}
                        onChange={(e) => setCaptureSource(e.target.value as "desktop" | "phone")}
                        disabled={isSessionRunning}
                      >
                        <option value="desktop">Desktop mic</option>
                        <option value="phone">Phone mic/camera</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="setup-actions">
                  <div className={`ready-pill ${courseReady && micReady ? "ready" : ""}`}>
                    {readyText}
                  </div>
                  <button
                    type="button"
                    onClick={() => (isSessionRunning ? handleStop() : handleStart())}
                    className={`primary-btn ${isSessionRunning ? "stop" : ""}`}
                    disabled={isStopping}
                  >
                    {isStopping ? "Stopping..." : isSessionRunning ? "Stop Session" : "Start Session"}
                  </button>
                </div>
              </div>
              {micError && <div className="inline-error">Mic error: {micError}</div>}
            </div>
          </header>

          {mobileAuthToken && (
            <section className="mobile-link-card">
              <div>
                <h3>Phone Capture Link</h3>
                <p className="muted">Scan QR on your phone to open lightweight mobile capture.</p>
                <div className="form-row">
                  <label>Phone base URL</label>
                  <input
                    className="input"
                    value={mobileBaseUrl}
                    onChange={(e) => setMobileBaseUrl(e.target.value)}
                    placeholder="http://10.0.0.188:3000"
                  />
                </div>
                <div className="form-row">
                  <label>Phone WS base URL (HTTPS)</label>
                  <input
                    className="input"
                    value={mobileApiBaseUrl}
                    onChange={(e) => setMobileApiBaseUrl(e.target.value)}
                    placeholder="wss://your-backend-tunnel.trycloudflare.com"
                  />
                </div>
                <div className="mobile-link-actions">
                  <button type="button" className="secondary-btn" onClick={refreshMobileLink}>
                    Refresh QR
                  </button>
                  {mobileLink && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => navigator.clipboard?.writeText(mobileLink)}
                    >
                      Copy Link
                    </button>
                  )}
                </div>
                {mobileLink && <div className="mobile-link-text">{mobileLink}</div>}
                {mobileLinkStatus && <div className="muted">{mobileLinkStatus}</div>}
              </div>
              {mobileQrUrl && (
                <img
                  src={mobileQrUrl}
                  alt="QR code for mobile capture link"
                  className="mobile-qr"
                />
              )}
            </section>
          )}

          {captureSource === "phone" && (
            <section className="mobile-preview-card">
              <div className="panel-heading">
                <h2>Phone Camera Preview</h2>
                <span className="pill muted">{cameraPreviewDataUrl ? "live" : "waiting"}</span>
              </div>
              <div className="mobile-preview-body">
                {cameraPreviewDataUrl ? (
                  <img src={cameraPreviewDataUrl} alt="Phone camera preview" className="mobile-preview-image" />
                ) : (
                  <p className="muted">Start capture on phone to preview board feed here.</p>
                )}
              </div>
            </section>
          )}

          <section className="content-grid">
            <div className="panel-card">
              <TranscriptPanel lines={lines} partialLine={partialLine} />
            </div>
            <div className="panel-card">
              <LiveNotesPanel
                notes={liveNotes}
                history={liveNotesHistory}
                selectedId={selectedLiveNotesId}
                onSelect={setSelectedLiveNotesId}
              />
            </div>
            <div className="panel-card">
              <FinalNotesPanel notes={finalNotes} />
            </div>
          </section>
        </div>
      </main>
    </AppLayout>
  );
}
