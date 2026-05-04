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
  /** Amplitude threshold for silence detection (0–255, default 10). */
  silenceThreshold?: number;
  /** Ms of silence before auto-stop (default 1500). */
  silenceDurationMs?: number;
  /** MediaRecorder timeslice in ms (default 1000). */
  timesliceMs?: number;
  /** Max recording duration in ms (default 30000). */
  maxDurationMs?: number;
}

interface UseAudioCaptureReturn {
  state: AudioCaptureState;
  error: string | null;
  /** Volume level 0–255 for visualization. */
  currentVolume: number;
  /** Start recording. Resolves when capture begins. */
  startCapture: () => Promise<void>;
  /** Stop recording and return the audio blob. */
  stopCapture: () => Promise<Blob | null>;
  /** Cancel and discard the current recording. */
  cancelCapture: () => void;
  /** Call after receiving an audio URL from the server to set it for playback. */
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
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceCounterRef = useRef(0);

  const cleanup = useCallback(() => {
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (maxDurationRef.current) {
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
  }, []);

  const startCapture = useCallback(async () => {
    setError(null);
    setAudioUrlState(null);
    chunksRef.current = [];

    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Mikrofon toegang geweigerd. Check je browser permissies."
            : err.message
          : "Kon geen microfoon krijgen.";
      setError(msg);
      setState("error");
      return;
    }

    mediaStreamRef.current = stream;

    // Set up audio context for volume monitoring
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
    } catch {
      // Non-fatal — volume visualization just won't work
    }

    // Volume monitoring interval
    volumeIntervalRef.current = setInterval(() => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setCurrentVolume(Math.round(avg));
    }, 100);

    // Silence detection interval
    silenceIntervalRef.current = setInterval(() => {
      if (state !== "listening") return;
      const vol = currentVolume;
      if (vol < silenceThreshold) {
        silenceCounterRef.current += 100;
        if (silenceCounterRef.current >= silenceDurationMs) {
          // Auto-stop on silence
          recorderRef.current?.stop();
        }
      } else {
        silenceCounterRef.current = 0;
      }
    }, 100);

    // Max duration fallback
    maxDurationRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, maxDurationMs);

    const mimeType = getMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      cleanup();
      stopMediaTracks();
      if (chunksRef.current.length === 0) {
        setState("idle");
        return;
      }
      setState("processing");
    };

    recorder.onerror = (e) => {
      cleanup();
      stopMediaTracks();
      setError(`Opname fout: ${(e as ErrorEvent).message ?? "onbekend"}`);
      setState("error");
    };

    recorder.start(timesliceMs);
    setState("listening");
  }, [silenceThreshold, silenceDurationMs, timesliceMs, maxDurationMs, state, currentVolume, cleanup, stopMediaTracks]);

  const stopCapture = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setState("idle");
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        cleanup();
        stopMediaTracks();
        if (chunksRef.current.length === 0) {
          setState("idle");
          resolve(null);
          return;
        }
        const mimeType = getMimeType();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        setState("processing");
        resolve(blob);
      };

      if (recorder.state === "recording") {
        recorder.stop();
      } else {
        setState("idle");
        resolve(null);
      }
    });
  }, [cleanup, stopMediaTracks]);

  const cancelCapture = useCallback(() => {
    cleanup();
    stopMediaTracks();
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
