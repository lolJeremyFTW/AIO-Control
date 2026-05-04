"use client";

import { useCallback, useRef, useState } from "react";

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "playing"
  | "error";

export interface UseRecorderReturn {
  /** "recording" when actively capturing audio. */
  isRecording: boolean;
  state: RecorderState;
  error: string | null;
  /** 0–255 volume level from AnalyserNode. */
  volume: number;
  /** Start recording. No-ops if already recording. */
  start: () => Promise<void>;
  /** Stop recording. Resolves with the audio Blob. */
  stop: () => Promise<Blob | null>;
  /** Discard the current recording. */
  discard: () => void;
  /** Set the URL of a TTS response to play. */
  setTtsUrl: (url: string | null) => void;
  /** Call from the <audio onEnded> handler. */
  onAudioEnded: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const volumeRafRef = useRef<number | null>(null);
  const silenceCountRef = useRef(0);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardRef = useRef(false);

  const setStateSync = (s: RecorderState) => setState(s);

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
    silenceCountRef.current = 0;
  }, []);

  const stopMediaTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const startVolumeLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const tick = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(Math.round(avg));
      volumeRafRef.current = requestAnimationFrame(tick);
    };
    volumeRafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    if (guardRef.current) return;
    guardRef.current = true;

    try {
      setError(null);
      setStateSync("requesting");
    } catch {
      guardRef.current = false;
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        const e = err as Error;
        console.error("[useRecorder] getUserMedia failed:", e.name, e.message);
        setError(e.name === "NotFoundError"
          ? "Geen microfoon gevonden. Check of andere apps de microfoon niet blokkeren."
          : `${e.name}: ${e.message}`);
        setStateSync("idle");
        guardRef.current = false;
        return;
      }

      streamRef.current = stream;

      if (stream.getAudioTracks().length === 0) {
        setError("Geen audio tracks in stream.");
        setStateSync("idle");
        guardRef.current = false;
        return;
      }

      console.info("[useRecorder] getUserMedia OK, tracks:", stream.getAudioTracks().map(t => t.label));

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
        startVolumeLoop();
      } catch { /* non-fatal */ }

      // Silence detection
      silenceIntervalRef.current = setInterval(() => {
        const analyser = analyserRef.current;
        if (!analyser) return;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolume(Math.round(avg));
        if (avg < 10) {
          silenceCountRef.current += 100;
          if (silenceCountRef.current >= 1500) {
            silenceCountRef.current = 0;
            recorderRef.current?.stop();
          }
        } else {
          silenceCountRef.current = 0;
        }
      }, 100);

      // Max duration
      maxDurationRef.current = setTimeout(() => {
        recorderRef.current?.stop();
      }, 30000);

      const rec = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = () => {
        cleanupIntervals();
        stopMediaTracks();
        const chunks = [...chunksRef.current];
        chunksRef.current = [];
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        setStateSync(chunks.length === 0 ? "idle" : "processing");
        resolve?.(chunks.length > 0 ? new Blob(chunks, { type: rec.mimeType }) : null);
      };

      rec.onerror = (e) => {
        cleanupIntervals();
        stopMediaTracks();
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        setError(`Opname fout: ${(e as ErrorEvent).message ?? "onbekend"}`);
        setStateSync("error");
        resolve?.(null);
      };

      rec.start(250);
      setStateSync("recording");
    } catch (err) {
      const e = err as Error;
      console.error("[useRecorder] start unexpected error:", e.message);
      setError(e.message);
      setStateSync("error");
    } finally {
      guardRef.current = false;
    }
  }, [cleanupIntervals, stopMediaTracks, startVolumeLoop]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      const rec = recorderRef.current;
      console.info("[useRecorder] stop called, recorder:", rec?.state ?? "null");
      if (!rec) {
        stopResolveRef.current = null;
        setStateSync("idle");
        resolve(null);
        return;
      }
      if (rec.state === "inactive") {
        stopResolveRef.current = null;
        setStateSync("idle");
        resolve(null);
        return;
      }
      const timeout = setTimeout(() => {
        if (stopResolveRef.current === resolve) {
          console.warn("[useRecorder] stop timeout — forcing resolve");
          stopResolveRef.current = null;
          cleanupIntervals();
          stopMediaTracks();
          setStateSync("idle");
          resolve(null);
        }
      }, 5000);
      stopResolveRef.current = (blob: Blob | null) => {
        clearTimeout(timeout);
        resolve(blob);
      };
      rec.stop();
    });
  }, [cleanupIntervals, stopMediaTracks]);

  const discard = useCallback(() => {
    cleanupIntervals();
    stopMediaTracks();
    stopResolveRef.current = null;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    chunksRef.current = [];
    setVolume(0);
    setStateSync("idle");
    setError(null);
  }, [cleanupIntervals, stopMediaTracks]);

  const ttsUrlRef = useRef<string | null>(null);
  const setTtsUrl = useCallback((url: string | null) => {
    ttsUrlRef.current = url;
    setStateSync(url ? "playing" : "idle");
  }, []);

  const onAudioEnded = useCallback(() => {
    ttsUrlRef.current = null;
    setStateSync("idle");
    setVolume(0);
  }, []);

  return {
    get isRecording() { return state === "recording"; },
    state,
    error,
    volume,
    start,
    stop,
    discard,
    setTtsUrl,
    onAudioEnded,
  };
}

// Debug helpers
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).debugRecorder = {
    async status() {
      const md = navigator.mediaDevices;
      return {
        mediaDevices: !!md,
        getUserMedia: !!md?.getUserMedia,
        enumerateDevices: !!md?.enumerateDevices,
        constraints: md?.getSupportedConstraints?.() ?? null,
      };
    },
    async listDevices() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audio = devs.filter(d => d.kind === "audioinput");
        console.info("[debug] audio devices:", audio.map(d => ({ label: d.label, id: d.deviceId })));
        return audio;
      } catch (e) {
        console.error("[debug] enumerateDevices failed:", e);
        return [];
      }
    },
    async testMic() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.info("[debug] testMic OK, tracks:", s.getAudioTracks().length);
        s.getTracks().forEach(t => t.stop());
        return "OK";
      } catch (e) {
        const err = e as Error;
        console.error("[debug] testMic FAILED:", err.name, err.message);
        return `${err.name}: ${err.message}`;
      }
    },
  };
  console.info("[useRecorder] debugRecorder ready — call window.debugRecorder.testMic() in console");
}
