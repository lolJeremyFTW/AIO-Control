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
  timesliceMs?: number;
  maxDurationMs?: number;
}

interface UseAudioCaptureReturn {
  state: AudioCaptureState;
  error: string | null;
  /** Volume level 0–255 for visualization. */
  currentVolume: number;
  /** Start recording. Resolves when capture begins. */
  startCapture: () => Promise<void>;
  /** Stop recording. Resolves with the audio blob. */
  stopCapture: () => Promise<Blob | null>;
  /** Cancel and discard the current recording. */
  cancelCapture: () => void;
  /** Call with a blob URL to set audio for playback. */
  setAudioUrl: (url: string | null) => void;
  /** Call when playback finishes so state resets to idle. */
  onPlaybackEnded: () => void;
}

function getMimeType(): string {
  if (typeof window === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
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
    timesliceMs = 250,
    maxDurationMs = 30000,
  } = options;

  const [state, setState] = useState<AudioCaptureState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [audioUrl, setAudioUrlState] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const volumeRafRef = useRef<number | null>(null);
  const maxDurationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const silenceCounterRef = useRef(0);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupIntervals = useCallback(() => {
    if (volumeRafRef.current !== null) {
      cancelAnimationFrame(volumeRafRef.current);
      volumeRafRef.current = null;
    }
    if (silenceIntervalRef.current !== null) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (maxDurationRef.current !== null) {
      clearTimeout(maxDurationRef.current);
      maxDurationRef.current = null;
    }
    silenceCounterRef.current = 0;
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

  const tickVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setCurrentVolume(Math.round(avg));
    }
    volumeRafRef.current = requestAnimationFrame(tickVolume);
  }, []);

  const startCapture = useCallback(async () => {
    console.info("[useAudioCapture] startCapture called, state:", state);
    setError(null);
    setAudioUrlState(null);
    chunksRef.current = [];
    silenceCounterRef.current = 0;
    setCurrentVolume(0);
    setState("requesting");

    let stream: MediaStream;
    try {
      console.info("[useAudioCapture] requesting microphone access...");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      console.info("[useAudioCapture] microphone access granted!");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Mikrofon toegang geweigerd. Check je browser permissies (adresbalk 🔒 → toestemming geven)."
            : err.name === "NotFoundError"
              ? "Geen microfoon gevonden op dit apparaat."
              : err.name === "NotReadableError"
                ? "Microfoon wordt gebruikt door een ander programma."
                : err.message
          : "Kon geen microfoon krijgen.";
      console.error("[useAudioCapture] getUserMedia failed:", err);
      setError(msg);
      setState("error");
      return;
    }

    mediaStreamRef.current = stream;

    // Audio context for volume analysis
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

    // Start volume polling via rAF (~60fps)
    volumeRafRef.current = requestAnimationFrame(tickVolume);

    // Silence detection via interval
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
          const rec = recorderRef.current;
          if (rec && rec.state === "recording") {
            rec.stop();
          }
          silenceCounterRef.current = 0;
        }
      } else {
        silenceCounterRef.current = 0;
      }
    }, 100);

    // Max duration fallback
    maxDurationRef.current = setTimeout(() => {
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        rec.stop();
      }
    }, maxDurationMs);

    const mimeType = getMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    // Single onstop handler — used for both manual stop and auto-stop
    recorder.onstop = () => {
      cleanupIntervals();
      stopMediaTracks();

      const chunks = chunksRef.current;
      if (chunks.length === 0) {
        setState("idle");
        stopResolveRef.current?.(null);
        stopResolveRef.current = null;
        return;
      }

      const blob = new Blob(chunks, { type: mimeType });
      chunksRef.current = [];
      setState("processing");
      stopResolveRef.current?.(blob);
      stopResolveRef.current = null;
    };

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onerror = (e) => {
      cleanupIntervals();
      stopMediaTracks();
      setError(`Opname fout: ${(e as ErrorEvent).message ?? "onbekend"}`);
      setState("error");
      stopResolveRef.current?.(null);
      stopResolveRef.current = null;
    };

    recorder.start(timesliceMs);
    setState("listening");
  }, [timesliceMs, maxDurationMs, silenceThreshold, silenceDurationMs, tickVolume, cleanupIntervals, stopMediaTracks]);

  const stopCapture = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        stopResolveRef.current = null;
        setState("idle");
        resolve(null);
        return;
      }
      if (recorder.state === "recording") {
        recorder.stop();
      } else {
        stopResolveRef.current = null;
        setState("idle");
        resolve(null);
      }
    });
  }, []);

  const cancelCapture = useCallback(() => {
    cleanupIntervals();
    stopMediaTracks();
    stopResolveRef.current = null;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    chunksRef.current = [];
    setState("idle");
    setCurrentVolume(0);
    setError(null);
  }, [cleanupIntervals, stopMediaTracks]);

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
