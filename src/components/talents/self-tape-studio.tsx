"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Video,
  Circle,
  Square,
  Upload,
  Sun,
  Mic,
  Crop,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { uploadMedia, type UploadMediaResult } from "@/lib/media-upload";
import type { UploadDestination } from "@/domain/uploads";
import type { QualityMetrics } from "@/lib/ai/quality-scorer";

type Phase = "idle" | "ready" | "recording" | "review" | "processing" | "done" | "denied";

/** A finished take waiting for the performer to keep or redo it. */
interface Take {
  blob: Blob;
  metrics: QualityMetrics;
  url: string;
}

export function SelfTapeStudio() {
  const t = useTranslations("talents");
  const errorText = useActionErrorText();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const samplesRef = useRef<{ framing: number; light: number; sound: number }[]>([]);
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [live, setLive] = useState({ framing: 0, light: 0, sound: 0 });
  const [result, setResult] = useState<UploadMediaResult | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [destination, setDestination] = useState<UploadDestination>("library");
  const [progress, setProgress] = useState(0);
  const [pending, startTransition] = useTransition();

  async function enableCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: lowBandwidth
          ? { width: 480, height: 270 }
          : { width: 1280, height: 720 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Audio analyser for the sound meter.
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      setPhase("ready");
      loop();
    } catch {
      setPhase("denied");
    }
  }

  function sample(): { framing: number; light: number; sound: number } {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    let light = 0;
    let framing = 0;
    if (video && canvas && video.videoWidth) {
      const w = 64;
      const h = 36;
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      if (g) {
        g.drawImage(video, 0, 0, w, h);
        const { data } = g.getImageData(0, 0, w, h);
        let sum = 0;
        let centerVar = 0;
        let n = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const lum = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255;
            sum += lum;
            const cx = x > w / 3 && x < (2 * w) / 3;
            const cy = y > h / 3 && y < (2 * h) / 3;
            if (cx && cy) {
              centerVar += Math.abs(lum - 0.5);
              n++;
            }
          }
        }
        const avg = sum / (w * h);
        light = Math.max(0, 1 - Math.abs(avg - 0.55) * 2.2);
        framing = Math.min(1, (centerVar / Math.max(1, n)) * 3.5);
      }
    }
    let sound = 0;
    if (analyserRef.current) {
      const arr = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(arr);
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      sound = Math.min(1, avg / 90);
    }
    return { framing, light, sound };
  }

  function loop() {
    const s = sample();
    setLive(s);
    if (phase === "recording" || recorderRef.current?.state === "recording") {
      samplesRef.current.push(s);
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    samplesRef.current = [];
    // eslint-disable-next-line react-hooks/purity -- runs from the Record button, never during render
    startedAtRef.current = performance.now?.() ?? 0;
    // Safari records MP4, Chrome and Firefox record WebM. Ask for whichever the
    // browser supports and keep the recorder's own answer for the file.
    const preferred = ["video/mp4", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    const rec = new MediaRecorder(streamRef.current, preferred ? { mimeType: preferred } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = onStop;
    rec.start();
    recorderRef.current = rec;
    setPhase("recording");
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  /** Hold the take for review: watch it, choose where it goes, or redo it. */
  function review(blob: Blob, metrics: QualityMetrics) {
    setTake({ blob, metrics, url: URL.createObjectURL(blob) });
    setPhase("review");
  }

  function discardTake() {
    if (take) URL.revokeObjectURL(take.url);
    setTake(null);
    setPhase(streamRef.current ? "ready" : "idle");
  }

  function onStop() {
    // The real container, never a guess: recorder first, then the first chunk.
    const type = (recorderRef.current?.mimeType || chunksRef.current[0]?.type || "video/webm").split(";")[0];
    const blob = new Blob(chunksRef.current, { type });
    const samples = samplesRef.current;
    const avg = (k: "framing" | "light" | "sound") =>
      samples.length ? samples.reduce((a, s) => a + s[k], 0) / samples.length : 0;
    const metrics: QualityMetrics = {
      framing: avg("framing"),
      light: avg("light"),
      sound: avg("sound"),
      durationMs: (performance.now?.() ?? 0) - startedAtRef.current,
    };
    review(blob, metrics);
  }

  /** Send the reviewed take straight to storage, with progress. */
  function save() {
    if (!take) return;
    const { blob, metrics, url } = take;
    setProgress(0);
    setPhase("processing");
    startTransition(async () => {
      const res = await uploadMedia(blob, {
        type: "SELFTAPE",
        destination,
        durationSec: metrics.durationMs / 1000,
        metrics,
        lowBandwidth,
        onProgress: setProgress,
      });
      URL.revokeObjectURL(url);
      setTake(null);
      setResult(res);
      setPhase("done");
      router.refresh();
    });
  }

  function onFallbackFile(file: File | undefined) {
    if (!file) return;
    // No live metrics for an uploaded file: a neutral estimate.
    review(file, { framing: 0.7, light: 0.7, sound: 0.7, durationMs: 8000 });
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Stage */}
        <div className="relative aspect-video overflow-hidden rounded-sedan border border-border bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="size-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          {phase === "review" && take && (
            <video src={take.url} controls playsInline className="absolute inset-0 size-full bg-black object-contain" />
          )}

          {(phase === "ready" || phase === "recording") && (
            <div className="pointer-events-none absolute inset-0">
              {/* rule-of-thirds */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/15" />
                ))}
              </div>
            </div>
          )}

          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
              <Video className="size-8 opacity-70" />
              <Button onClick={enableCamera}>{t("space.studio.enableCamera")}</Button>
            </div>
          )}
          {phase === "denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
              <AlertTriangle className="size-7 text-warning" />
              <p className="text-sm">{t("space.studio.cameraUnavailable")}</p>
            </div>
          )}
          {phase === "recording" && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
              <span className="size-2 animate-pulse rounded-full bg-danger" />
              REC
            </div>
          )}
        </div>

        {/* AI overlays / controls */}
        <div className="space-y-4">
          <div className="rounded-sedan border border-border bg-surface p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-accent" /> {t("space.studio.overlays")}
            </p>
            <Meter icon={Crop} label={t("space.selftape.framing")} value={live.framing} />
            <Meter icon={Sun} label={t("space.studio.lighting")} value={live.light} />
            <Meter icon={Mic} label={t("space.selftape.sound")} value={live.sound} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lowBandwidth}
              disabled={phase !== "idle" && phase !== "denied"}
              onChange={(e) => setLowBandwidth(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {t("space.studio.reducedMode")}
          </label>

          {phase === "ready" && (
            <Button className="w-full" onClick={startRecording}>
              <Circle className="size-4 fill-current" />{t("space.studio.record")}</Button>
          )}
          {phase === "recording" && (
            <Button variant="danger" className="w-full" onClick={stopRecording}>
              <Square className="size-4 fill-current" /> {t("space.studio.stop")}
            </Button>
          )}
          {phase === "review" && (
            <div className="space-y-3 rounded-sedan border border-border bg-surface p-4">
              <p className="font-bold">{t("space.studio.review")}</p>
              <fieldset>
                <legend className="text-sm text-fg-muted">{t("space.studio.saveTo")}</legend>
                <div className="mt-2 space-y-2">
                  {(["library", "profile"] as const).map((d) => (
                    <label
                      key={d}
                      className={cn(
                        "pressable flex cursor-pointer items-start gap-3 rounded-sedan border px-3 py-2.5 [--hover-scale:1.01] [--press-scale:1.02]",
                        destination === d ? "border-accent accent-wash" : "border-border"
                      )}
                    >
                      <input
                        type="radio"
                        name="destination"
                        checked={destination === d}
                        onChange={() => setDestination(d)}
                        className="mt-1 size-4 accent-[var(--accent)]"
                      />
                      <span className="block">
                        <span className="block text-sm font-bold">
                          {t(d === "library" ? "space.studio.toLibrary" : "space.studio.toProfile")}
                        </span>
                        <span className="block text-[13px] text-fg-muted">
                          {t(d === "library" ? "space.studio.toLibraryHint" : "space.studio.toProfileHint")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="border-border-strong" onClick={discardTake}>
                  {t("space.studio.again")}
                </Button>
                <Button onClick={save}>{t("space.studio.save")}</Button>
              </div>
            </div>
          )}
          {(phase === "processing" || pending) && (
            <div role="status" className="space-y-2">
              <p className="text-sm text-fg-muted">
                {progress < 1
                  ? t("space.studio.uploading", { percent: Math.round(progress * 100) })
                  : t("space.studio.analysing")}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}

          {(phase === "denied" || phase === "done") && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-sedan border border-dashed border-border p-3 text-sm text-fg-muted hover:border-accent">
              <Upload className="size-4" />{t("space.studio.import")}<input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => onFallbackFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>
      </div>

      {phase === "done" && result?.ok && (
        <div className="rounded-sedan border border-border bg-surface p-5">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "flex size-14 items-center justify-center rounded-full border-2 font-display text-lg font-medium",
                (result.score ?? 0) >= 75
                  ? "border-success text-success"
                  : "border-accent text-accent"
              )}
            >
              {result.score}
            </div>
            <div>
              <p className="font-medium">{t("space.studio.score")}</p>
              <p className="text-sm text-fg-muted">
                {t("space.selftape.framing")} {result.breakdown?.framing} ·{" "}
                {t("space.studio.lighting")} {result.breakdown?.light} ·{" "}
                {t("space.selftape.sound")} {result.breakdown?.sound}
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-fg-muted">
            {/* `tip`, not `t` — the map parameter used to shadow the
                translation function, so nothing here could be translated. */}
            {result.tips?.map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
                {t(tip)}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setResult(null);
              setPhase(streamRef.current ? "ready" : "idle");
            }}
          >
            {t("space.studio.newTake")}
          </Button>
        </div>
      )}
      {phase === "done" && result && !result.ok && (
        <p className="text-sm text-danger">{errorText(result.error)}</p>
      )}
    </div>
  );
}

function Meter({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  const t = useTranslations("talents");
  const pct = Math.round(value * 100);
  const good = value >= 0.6;
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-fg-muted">
          <Icon className="size-3.5" /> {label}
        </span>
        <Badge variant={good ? "success" : "warning"}>{good ? t("space.studio.meterOk") : t("space.studio.meterAdjust")}</Badge>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all", good ? "bg-success" : "bg-warning")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
