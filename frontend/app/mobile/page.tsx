"use client";

import { useEffect, useRef, useState } from "react";
import { connectSession } from "../../lib/ws";

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320;
export const dynamic = "force-dynamic";

export default function MobileCapturePage() {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [authToken, setAuthToken] = useState<string>("");
  const [apiBaseParam, setApiBaseParam] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<number | "">("");
  const [status, setStatus] = useState<string>("Idle");
  const [error, setError] = useState<string | null>(null);
  const [useMic, setUseMic] = useState(true);
  const [useCamera, setUseCamera] = useState(true);
  const [armed, setArmed] = useState(false);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [frameCount, setFrameCount] = useState(0);
  const [isSecureContext, setIsSecureContext] = useState<boolean | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const pendingRef = useRef<{ chunks: Float32Array[]; length: number }>({ chunks: [], length: 0 });
  const cameraIntervalRef = useRef<number | null>(null);
  const wsReadyRef = useRef(false);
  const sendEnabledRef = useRef(false);

  useEffect(() => {
    // Parse query params on the client to avoid SSR hydration mismatches.
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("sid") || "";
    const auth = params.get("auth") || "";
    const cid = params.get("cid") || "";
    const api = params.get("api") || "";
    setSessionId(sid);
    setAuthToken(auth);
    setApiBaseParam(api);
    if (cid && !Number.isNaN(Number(cid))) {
      setSelectedCourseId(Number(cid));
    }
    setIsSecureContext(window.isSecureContext);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !sessionId) return;
    if (socketRef.current) return;

    const connection = connectSession(
      sessionId,
      {
        onOpen: () => {
          wsReadyRef.current = true;
          setStatus("Connected");
          if (authToken) {
            connection.socket.send(
              JSON.stringify({
                type: "mobile_attach",
                sessionId,
                timestamp: Date.now(),
                payload: { mobileToken: authToken }
              })
            );
          }
        },
        onStatus: (event) => {
          const msg = event.payload.message;
          setStatus(msg);
          if (msg === "session started") {
            setSessionRunning(true);
          }
          if (msg === "session stopped") {
            setSessionRunning(false);
          }
        },
        onTranscriptFinal: (event) => setLastTranscript(event.payload.text),
        onClose: () => {
          wsReadyRef.current = false;
          setRunning(false);
          sendEnabledRef.current = false;
          setStatus("Disconnected");
        },
        onErrorEvent: (event) => setError(event.payload.message)
      },
      { baseUrl: apiBaseParam }
    );
    socketRef.current = connection.socket;

    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [apiBaseParam, authToken, ready, sessionId]);

  useEffect(() => {
    const enabled = Boolean(armed && sessionRunning && wsReadyRef.current);
    sendEnabledRef.current = enabled;
    setRunning(enabled);
  }, [armed, sessionRunning]);

  const encodeFloat32 = (audio: Float32Array) => {
    const bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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

  const resampleLinear = (input: Float32Array, inputRate: number, targetRate: number) => {
    if (inputRate === targetRate || input.length === 0) return input;
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
    if (!sendEnabledRef.current || !useMic) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "audio_frame",
        sessionId,
        timestamp: Date.now(),
        payload: { sampleRate: TARGET_SAMPLE_RATE, format: "f32le", audio: encodeFloat32(audio) }
      })
    );
    setFrameCount((prev) => prev + 1);
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

  const stopCameraFrames = () => {
    if (cameraIntervalRef.current !== null) {
      window.clearInterval(cameraIntervalRef.current);
      cameraIntervalRef.current = null;
    }
  };

  const startCameraFrames = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    stopCameraFrames();
    cameraIntervalRef.current = window.setInterval(() => {
      if (!sendEnabledRef.current || !useCamera) {
        return;
      }
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (video.videoWidth < 2 || video.videoHeight < 2) {
        return;
      }
      const maxWidth = 640;
      const ratio = maxWidth / video.videoWidth;
      const targetW = Math.max(2, Math.round(video.videoWidth * Math.min(1, ratio)));
      const targetH = Math.max(2, Math.round(video.videoHeight * Math.min(1, ratio)));
      // Rotate 90deg so preview is horizontal.
      canvas.width = targetH;
      canvas.height = targetW;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();
      const jpegData = canvas.toDataURL("image/jpeg", 0.72);
      const comma = jpegData.indexOf(",");
      if (comma < 0) {
        return;
      }
      const base64 = jpegData.slice(comma + 1);
      socket.send(
        JSON.stringify({
          type: "camera_frame",
          sessionId,
          timestamp: Date.now(),
          payload: {
            mimeType: "image/jpeg",
            image: base64,
            width: canvas.width,
            height: canvas.height
          }
        })
      );
    }, 1200);
  };

  const stopMedia = () => {
    stopCameraFrames();
    stopAudioPipeline();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const disarm = () => {
    setArmed(false);
    sendEnabledRef.current = false;
    setRunning(false);
    stopMedia();
  };

  const armCapture = async () => {
    try {
      setError(null);
      setFrameCount(0);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Media capture unavailable. Use HTTPS or localhost.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: useMic,
        video: useCamera ? { facingMode: "environment" } : false
      });
      streamRef.current = stream;
      if (videoRef.current && useCamera) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          startCameraFrames();
        };
      }

      if (useMic) {
        const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
        audioContextRef.current = context;
        const source = context.createMediaStreamSource(stream);
        sourceNodeRef.current = source;
        const gain = context.createGain();
        gain.gain.value = 0;
        gainNodeRef.current = gain;
        const processor = context.createScriptProcessor(256, 1, 1);
        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);
          const copy = new Float32Array(input.length);
          copy.set(input);
          handleAudioChunk(copy, context.sampleRate);
        };
        processorNodeRef.current = processor;
        source.connect(processor);
        processor.connect(gain).connect(context.destination);
      }
      if (useCamera) {
        startCameraFrames();
      }
      setArmed(true);
      setStatus("Capture armed. Waiting for desktop to start session...");
    } catch (err) {
      stopMedia();
      setError(err instanceof Error ? `${err.name}: ${err.message}` : "Failed to start");
    }
  };

  useEffect(() => {
    return () => {
      disarm();
      socketRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <main className="mobile-shell">
        <div className="mobile-card">Preparing mobile capture...</div>
      </main>
    );
  }

  if (!authToken) {
    return (
      <main className="mobile-shell">
        <div className="mobile-card">
          <h1>Mobile Capture</h1>
          <p>Missing mobile auth token. Re-open from desktop QR link.</p>
          {error && <p className="inline-error">{error}</p>}
        </div>
      </main>
    );
  }

  if (!sessionId) {
    return (
      <main className="mobile-shell">
        <div className="mobile-card">
          <h1>Mobile Capture</h1>
          <p>Session id missing. Open this page using the desktop QR link.</p>
        </div>
      </main>
    );
  }

  const mediaBlockedByInsecure = isSecureContext === false;
  const enableLabel = sessionRunning ? "Enable Mic/Camera (Session is running)" : "Enable Mic/Camera";

  return (
    <main className="mobile-shell">
      <div className="mobile-card">
        <h1>Mobile Capture</h1>
        <p className="muted">Linked to session {sessionId.slice(0, 8)}</p>
        {mediaBlockedByInsecure && (
          <p className="inline-error">
            This mobile browser blocks mic/camera on HTTP. Use HTTPS tunnel for capture.
          </p>
        )}

        <div className="mobile-controls">
          <label className="mobile-toggle">
            <input type="checkbox" checked={useMic} onChange={(e) => setUseMic(e.target.checked)} disabled={running} />
            Mic
          </label>
          <label className="mobile-toggle">
            <input type="checkbox" checked={useCamera} onChange={(e) => setUseCamera(e.target.checked)} disabled={running} />
            Camera
          </label>
        </div>

        <div className="mobile-actions">
          {!armed ? (
            <button
              type="button"
              className="primary-btn"
              onClick={armCapture}
              disabled={mediaBlockedByInsecure}
            >
              {enableLabel}
            </button>
          ) : (
            <>
              <div className="ready-pill ready">
                {sessionRunning ? "Streaming" : "Armed (waiting)"}
              </div>
              <button type="button" className="ghost-btn" onClick={disarm}>
                Disable
              </button>
            </>
          )}
        </div>

        <div className="mobile-status-grid">
          <div className="status-card"><strong>Status</strong>{status}</div>
          <div className="status-card"><strong>Session</strong>{sessionId.slice(0, 8)}</div>
          <div className="status-card"><strong>Frames sent</strong>{frameCount}</div>
          <div className="status-card"><strong>Latest transcript</strong>{lastTranscript || "-"}</div>
        </div>

        {useCamera && <video ref={videoRef} className="mobile-video" autoPlay muted playsInline />}
        {error && <p className="inline-error">{error}</p>}
      </div>
    </main>
  );
}
