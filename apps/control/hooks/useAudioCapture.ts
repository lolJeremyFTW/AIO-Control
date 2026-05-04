"use client";

import { useCallback, useRef, useState } from "react";

export type AudioCaptureState =
  | "idle"
  | "requesting"
  | "listening"
  | "processing"
  | "playing"
  | "error";

interface UseAudioCaptureOptions {
  silenceThreshold?: number;
  silenceDurationMs?: number;
  maxDurationMs?: number;
}

interface UseAudioCaptureReturn {
  state: AudioCaptureState;
  error: string | null;
  currentVolume: number;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<Blob | null>;
  cancelCapture: () => void;
  setAudioUrl: (url: string | null) => void;
  onPlaybackEnded: () => void;
}

function getMimeType(): string {
  if (typeof window === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "audio/webm";
}

export function useAudioCapture(
  options: UseAudioCaptureOptions = {},
): UseAudioCaptureReturn {
  const {
    silenceThreshold = 10,
    silenceDurationMs = 1500,
    maxDurationMs = 30000,
  } = options;

  const [state, setState] = useState<AudioCaptureState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [audioUrl, setAudioUrlState] = useState<string | null>(null);

  // All mutable recorder state lives in refs — no closure staleness
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const silenceCounterRef = useRef(0);
  const isCapturingRef = useRef(false);

  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (silenceIntervalRef.current !== null) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (maxDurationRef.current !== null) {
      clearTimeout(maxDurationRef.current);
      maxDurationRef.current = null;
    }
    silenceCounterRef.current = 0;
    isCapturingRef.current = false;
  }, []);

  const stopMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const startCapture = useCallback(async () => {
    console.info("[useAudioCapture] startCapture");
    setError(null);
    setAudioUrlState(null);
    chunksRef.current = [];
    silenceCounterRef.current = 0;
    setCurrentVolume(0);
    setState("requesting");
    isCapturingRef.current = true;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      const msg = err instanceof Error
        ? err.name === "NotAllowedError"
          ? "Mikrofon toegang geweigerd. Check 🔒 in adresbalk → toestemming geven."
          : err.name === "NotFoundError"
            ? "Geen microfoon gevonden. Check of andere apps de microfoon blokkeren."
            : err.name === "NotReadableError"
              ? "Microfoon in gebruik door ander programma."
              : err.message
        : "Kon geen microfoon krijgen.";
      console.error("[useAudioCapture] getUserMedia failed:", err);
      setError(msg);
      setState("error");
      isCapturingRef.current = false;
      return;
    }

    mediaStreamRef.current = stream;

    // Volume analysis
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = new AnalyserNode(audioCtx);
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
    } catch {
      // Non-fatal
    }

    // Silence detection
    silenceIntervalRef.current = setInterval(() => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setCurrentVolume(Math.round(avg));
      if (avg < silenceThreshold) {
        silenceCounterRef.current += 100;
        if (silenceCounterRef.current >= silenceDurationMs) {
          silenceCounterRef.current = 0;
          const rec = recorderRef.current;
          if (rec && rec.state === "recording") {
            console.info("[useAudioCapture] silence auto-stop");
            rec.stop();
          }
        }
      } else {
        silenceCounterRef.current = 0;
      }
    }, 100);

    // Max duration
    maxDurationRef.current = setTimeout(() => {
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        console.info("[useAudioCapture] max duration auto-stop");
        rec.stop();
      }
    }, maxDurationMs);

    const mimeType = getMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      console.info("[useAudioCapture] recorder onstop, chunks:", chunksRef.current.length);
      cleanup();
      stopMediaTracks();
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const resolve = stopResolveRef.current;
      stopResolveRef.current = null;
      if (chunks.length === 0) {
        setState("idle");
        resolve?.(null);
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      setState("processing");
      resolve?.(blob);
    };

    recorder.onerror = (e) => {
      console.error("[useAudioCapture] recorder error:", e);
      cleanup();
      stopMediaTracks();
      const resolve = stopResolveRef.current;
      stopResolveRef.current = null;
      setError(`Opname fout: ${(e as ErrorEvent).message ?? "onbekend"}`);
      setState("error");
      resolve?.(null);
    };

    recorder.start(250);
    setState("listening");
    console.info("[useAudioCapture] recording started, state=idle");
  }, [silenceThreshold, silenceDurationMs, maxDurationMs, cleanup, stopMediaTracks]);

  const stopCapture = useCallback(async (): Promise<Blob | null> => {
    console.info("[useAudioCapture] stopCapture, recorder state:", recorderRef.current?.state);
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      const rec = recorderRef.current;
      if (!rec) {
        console.info("[useAudioCapture] stopCapture: no recorder");
        stopResolveRef.current = null;
        setState("idle");
        resolve(null);
        return;
      }
      if (rec.state === "inactive") {
        console.info("[useAudioCapture] stopCapture: already inactive");
        stopResolveRef.current = null;
        setState("idle");
        resolve(null);
        return;
      }
      console.info("[useAudioCapture] calling recorder.stop()");
      rec.stop();
    });
  }, []);

  const cancelCapture = useCallback(() => {
    console.info("[useAudioCapture] cancelCapture");
    cleanup();
    stopMediaTracks();
    stopResolveRef.current = null;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    chunksRef.current = [];
    setState("idle");
    setCurrentVolume(0);
    setError(null);
  }, [cleanup, stopMediaTracks]);

  const setAudioUrl = useCallback((url: string | null) => {
    setAudioUrlState(url);
    if (url) setState("playing");
  }, []);

  const onPlaybackEnded = useCallback(() => {
    setAudioUrlState(null);
    setState("idle");
    setCurrentVolume(0);
  }, []);

  return {
    state,
    error,
    currentVolume,
    startCapture,
    stopCapture,
    cancelCapture,
    setAudioUrl,
    onPlaybackEnded,
  };
}
