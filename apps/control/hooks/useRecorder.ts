"use client";

import { useCallback, useRef, useState } from "react";

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "error";

export type UseRecorderOptions = {
  /**
   * Called whenever recording ends and audio data is available.
   * State is already "processing" when this fires. The hook
   * automatically returns to "idle" once the returned Promise resolves
   * or rejects — so the caller does not need to call reset().
   */
  onComplete: (blob: Blob) => void | Promise<void>;
  /** ms of continuous silence before auto-stop. Default 2000. Set 0 to disable. */
  silenceMs?: number;
  /** Hard cap on recording duration in ms. Default 30000. */
  maxDurationMs?: number;
};

export type UseRecorderReturn = {
  state: RecorderState;
  isRecording: boolean;
  error: string | null;
  /** 0–255 instantaneous volume from AnalyserNode. */
  volume: number;
  start: () => Promise<void>;
  /** Trigger stop + onComplete (same as silence auto-stop). */
  stop: () => void;
  /** Abort recording; onComplete is NOT called. */
  discard: () => void;
  /** Reset from error back to idle. */
  reset: () => void;
};

export function useRecorder({
  onComplete,
  silenceMs = 2000,
  maxDurationMs = 30000,
}: UseRecorderOptions): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discardRef = useRef(false);

  // Always keep the latest onComplete so the onstop closure never goes stale.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stopTimers = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (silenceIntervalRef.current !== null) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "error") return;

    setState("requesting");
    setError(null);
    discardRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const e = err as DOMException;
      console.error("[useRecorder] getUserMedia failed:", e.name, e.message);
      const msg =
        e.name === "NotAllowedError" || e.name === "PermissionDeniedError"
          ? "Microfoon toegang geweigerd."
          : e.name === "NotFoundError"
            ? "Geen microfoon gevonden."
            : `Microfoon fout: ${e.message}`;
      setError(msg);
      setState("error");
      return;
    }

    streamRef.current = stream;
    console.info(
      "[useRecorder] stream OK:",
      stream.getAudioTracks().map((t) => t.label),
    );

    // Volume analysis (non-fatal)
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        setVolume(Math.round(buf.reduce((a, b) => a + b, 0) / buf.length));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* non-fatal */
    }

    const mimeType =
      ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      ) ?? "";

    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorderRef.current = rec;
    chunksRef.current = [];

    rec.ondataavailable = (e) => {
      if (e.data?.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      stopTimers();
      stopStream();
      setVolume(0);
      recorderRef.current = null;

      const chunks = [...chunksRef.current];
      chunksRef.current = [];

      if (discardRef.current || chunks.length === 0) {
        setState("idle");
        return;
      }

      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      console.info("[useRecorder] complete — size:", blob.size, "type:", blob.type);
      setState("processing");

      // Auto-return to idle once onComplete resolves/rejects.
      Promise.resolve(onCompleteRef.current(blob))
        .catch(() => {})
        .finally(() => setState("idle"));
    };

    rec.onerror = (e) => {
      stopTimers();
      stopStream();
      recorderRef.current = null;
      const msg = (e as ErrorEvent).message ?? "onbekend";
      console.error("[useRecorder] MediaRecorder error:", msg);
      setError(`Opname fout: ${msg}`);
      setState("error");
    };

    rec.start(250);
    setState("recording");

    // Silence detection: accumulate silence, stop after silenceMs.
    if (silenceMs > 0) {
      let silenceAccum = 0;
      silenceIntervalRef.current = setInterval(() => {
        const analyser = analyserRef.current;
        if (!analyser) return;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        if (avg < 6) {
          silenceAccum += 200;
          if (silenceAccum >= silenceMs) {
            console.info("[useRecorder] silence auto-stop");
            recorderRef.current?.stop();
          }
        } else {
          silenceAccum = 0;
        }
      }, 200);
    }

    // Hard max-duration cap.
    maxTimerRef.current = setTimeout(() => {
      console.info("[useRecorder] max-duration auto-stop");
      recorderRef.current?.stop();
    }, maxDurationMs);
  }, [state, silenceMs, maxDurationMs, stopTimers, stopStream]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    console.info("[useRecorder] manual stop, rec.state:", rec?.state ?? "null");
    if (!rec || rec.state === "inactive") {
      setState("idle");
      return;
    }
    rec.stop();
  }, []);

  const discard = useCallback(() => {
    discardRef.current = true;
    stopTimers();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // onstop will see discardRef=true → idle
    } else {
      stopStream();
      setVolume(0);
      setState("idle");
      setError(null);
    }
  }, [stopTimers, stopStream]);

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return {
    state,
    get isRecording() {
      return state === "recording";
    },
    error,
    volume,
    start,
    stop,
    discard,
    reset,
  };
}
