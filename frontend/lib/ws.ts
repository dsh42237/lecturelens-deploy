import {
  CameraPreviewPayload,
  EventEnvelope,
  FinalNotesPayload,
  LiveNotesPayload,
  NotesDeltaPayload,
  SimulatorProgressPayload,
  StatusPayload,
  TranscriptFinalPayload,
  TranscriptPartialPayload,
  WhiteboardInsightPayload,
} from "./types";

function resolveWsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_BASE;
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:8000`;
  }
  return "ws://localhost:8000";
}

export interface WSHandlers {
  onStatus?: (event: EventEnvelope<StatusPayload>) => void;
  onSimulatorProgress?: (event: EventEnvelope<SimulatorProgressPayload>) => void;
  onTranscriptPartial?: (event: EventEnvelope<TranscriptPartialPayload>) => void;
  onTranscriptFinal?: (event: EventEnvelope<TranscriptFinalPayload>) => void;
  onNotesDelta?: (event: EventEnvelope<NotesDeltaPayload>) => void;
  onLiveNotesDelta?: (event: EventEnvelope<LiveNotesPayload>) => void;
  onFinalNotes?: (event: EventEnvelope<FinalNotesPayload>) => void;
  onCameraPreview?: (event: EventEnvelope<CameraPreviewPayload>) => void;
  onWhiteboardInsight?: (event: EventEnvelope<WhiteboardInsightPayload>) => void;
  onErrorEvent?: (event: EventEnvelope<{ message: string }>) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
}

interface WSOptions {
  baseUrl?: string;
}

export function connectSession(sessionId: string, handlers: WSHandlers, options: WSOptions = {}) {
  const explicit = options.baseUrl?.replace(/\/+$/, "");
  const normalizedExplicit = explicit
    ? explicit.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")
    : "";
  const base = normalizedExplicit || resolveWsBase();
  const ws = new WebSocket(`${base}/ws/session/${sessionId}`);

  ws.onopen = () => {
    handlers.onOpen?.();
  };

  ws.onclose = (event) => {
    handlers.onClose?.(event);
  };

  ws.onerror = () => {
    // Browser WebSocket API doesn't surface a structured error.
  };

  ws.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data) as EventEnvelope;
      switch (parsed.type) {
        case "status":
          handlers.onStatus?.(parsed as EventEnvelope<StatusPayload>);
          break;
        case "simulator_progress":
          handlers.onSimulatorProgress?.(parsed as EventEnvelope<SimulatorProgressPayload>);
          break;
        case "transcript_partial":
          handlers.onTranscriptPartial?.(parsed as EventEnvelope<TranscriptPartialPayload>);
          break;
        case "transcript_final":
          handlers.onTranscriptFinal?.(parsed as EventEnvelope<TranscriptFinalPayload>);
          break;
        case "notes_delta":
          handlers.onNotesDelta?.(parsed as EventEnvelope<NotesDeltaPayload>);
          break;
        case "live_notes_delta":
          handlers.onLiveNotesDelta?.(parsed as EventEnvelope<LiveNotesPayload>);
          break;
        case "final_notes":
          handlers.onFinalNotes?.(parsed as EventEnvelope<FinalNotesPayload>);
          break;
        case "camera_preview":
          handlers.onCameraPreview?.(parsed as EventEnvelope<CameraPreviewPayload>);
          break;
        case "whiteboard_insight":
          handlers.onWhiteboardInsight?.(parsed as EventEnvelope<WhiteboardInsightPayload>);
          break;
        case "error":
          handlers.onErrorEvent?.(parsed as EventEnvelope<{ message: string }>);
          break;
        default:
          break;
      }
    } catch {
      // Ignore malformed messages in scaffold mode.
    }
  };

  return {
    socket: ws,
    close: () => ws.close()
  };
}
