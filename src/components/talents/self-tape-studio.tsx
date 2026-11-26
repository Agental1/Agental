"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { err } from "@/domain/action-result";
import { stashTake, takeStashed } from "@/lib/take-stash";
import { stillSignedIn } from "@/lib/session-check";
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
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { uploadMedia, type UploadMediaResult } from "@/lib/media-upload";
import { UPLOAD_LIMITS, VIDEO_MAX_MB, type UploadDestination } from "@/domain/uploads";
import type { QualityMetrics } from "@/lib/ai/quality-scorer";
import { describeTapeDuration, type LimitLabel } from "@/domain/tape-duration";
import { readVideoDuration } from "@/lib/video-duration";

/** 2.5 Mb/s video plus 128 kb/s audio: two minutes is about 40 MB. */
const TAKE_VIDEO_BPS = 2_500_000;
/** Longest take that still fits in VIDEO_MAX_MB at that bitrate, with a margin. */
const MAX_TAKE_SECONDS = Math.floor(((VIDEO_MAX_MB * 1024 * 1024 * 8) / (TAKE_VIDEO_BPS + 128_000)) * 0.85);

type Phase = "idle" | "ready" | "recording" | "review" | "processing" | "done" | "denied";

/** A finished take waiting for the performer to keep or redo it. */
interface Take {
  blob: Blob;
  metrics: QualityMetrics;
  url: string;
}

export function SelfTapeStudio({
  onSaved,
  fixedDestination,
  maxDurationSeconds,
}: {
  /** Called with the new media id once a take is saved (e.g. to fill an application's video slot). */
  onSaved?: (mediaId: string) => void;
  /** Saves there without asking (an application's clip goes to Reel & Self-tape, private). */
  fixedDestination?: "library" | "profile";
  /** Length the request asks for, in seconds. Without it, only the length is shown. */
  maxDurationSeconds?: number | null;
} = {}) {
  const t = useTranslations("talents");
  const errorText = useActionErrorText();
  const router = useRouter();
  const locale = useLocale();
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
  const [destination, setDestination] = useState<UploadDestination>(fixedDestination ?? "library");
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
    // 720p at a bitrate that keeps a take under the 50 MB file limit.
    const rec = new MediaRecorder(streamRef.current, {
      ...(preferred ? { mimeType: preferred } : {}),
      videoBitsPerSecond: lowBandwidth ? 800_000 : TAKE_VIDEO_BPS,
      audioBitsPerSecond: 128_000,
    });
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = onStop;
    rec.start(1000);
    recorderRef.current = rec;
    // Stop by itself before the file would pass the limit.
    window.setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, MAX_TAKE_SECONDS * 1000);
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

  /**
   * Send the reviewed take straight to storage, with progress. The take is
   * kept until storage confirms it: a failed save can be tried again, and an
   * expired session keeps it in this browser while the performer signs in.
   */
  function save() {
    if (!take) return;
    const { blob, metrics, url } = take;
    if (blob.size > UPLOAD_LIMITS.SELFTAPE.maxBytes) {
      setResult({ ok: false, error: err("errors.uploadTooLarge", { limit: VIDEO_MAX_MB }) });
      return;
    }
    setProgress(0);
    setResult(null);
    setPhase("processing");
    startTransition(async () => {
      let res: UploadMediaResult;
      try {
        res = await uploadMedia(blob, {
          type: "SELFTAPE",
          destination,
          durationSec: metrics.durationMs / 1000,
          metrics,
          lowBandwidth,
          onProgress: setProgress,
        });
      } catch {
        res = { ok: false, error: err("errors.generic") };
      }
      if (!res.ok && res.error.key === "errors.unauthorized" && (await stillSignedIn())) {
        // The server said "signed out" but the session is there: never leave
        // the page over it. The take stays on review.
        res = { ok: false, error: err("errors.sessionCheck") };
      }
      if (!res.ok && res.error.key === "errors.unauthorized") {
        // Really signed out meanwhile: keep the take, sign in, come back to it.
        await stashTake({ blob, metrics, destination });
        const next = `/${locale}/talents/app/reel-self-tape?restore=1`;
        window.location.assign(`/${locale}/connexion?next=${encodeURIComponent(next)}`);
        return;
      }
      setResult(res);
      if (!res.ok) {
        setPhase("review");
        return;
      }
      URL.revokeObjectURL(url);
      setTake(null);
      setPhase("done");
      onSaved?.(res.mediaId);
      router.refresh();
    });
  }

  // Back from sign-in with a take kept in this browser: put it back on review.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("restore")) return;
    let cancelled = false;
    void takeStashed().then((kept) => {
      if (cancelled || !kept) return;
      setDestination(kept.destination);
      setTake({ blob: kept.blob, metrics: kept.metrics, url: URL.createObjectURL(kept.blob) });
      setPhase("review");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onFallbackFile(file: File | undefined) {
    if (!file) return;
    // No live metrics for an uploaded file: a neutral estimate for the
    // ratings, the real length from the video's own metadata.
    const probe = URL.createObjectURL(file);
    void readVideoDuration(probe).then((seconds) => {
      URL.revokeObjectURL(probe);
      review(file, { framing: 0.7, light: 0.7, sound: 0.7, durationMs: seconds ? seconds * 1000 : 8000 });
    });
  }

  function limitText(l: LimitLabel): string {
    if (l.unit === "minutes") return t("space.studio.duration.limitMinutes", { n: l.value });
    if (l.unit === "seconds") return t("space.studio.duration.limitSeconds", { n: l.value });
    return t("space.studio.duration.limitClock", { clock: l.clock });
  }

  /** "2:48", "2:48, within the 3-minute limit" or "3:40, 40 seconds over the 3-minute limit". */
  function durationText(durationMs: number): string | null {
    const d = describeTapeDuration(durationMs / 1000, maxDurationSeconds);
    if (d.status === "unknown") return null;
    if (d.status === "plain") return d.clock;
    if (d.status === "within") return t("space.studio.duration.within", { duration: d.clock, limit: limitText(d.limit) });
    const over =
      d.overMinutes === 0
        ? t("space.studio.duration.overSeconds", { s: d.overSeconds })
        : d.overSeconds === 0
          ? t("space.studio.duration.overMinutes", { m: d.overMinutes })
          : t("space.studio.duration.overBoth", { m: d.overMinutes, s: d.overSeconds });
    return t("space.studio.duration.over", { duration: d.clock, over, limit: limitText(d.limit) });
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
          <p className="text-[13px] text-fg-muted">
            {t("space.studio.limit", { minutes: Math.floor(MAX_TAKE_SECONDS / 60), mb: VIDEO_MAX_MB })}
          </p>

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
              {take && durationText(take.metrics.durationMs) && (
                <p className="text-sm text-fg-muted" aria-live="polite">
                  {t("space.studio.duration.label")} {durationText(take.metrics.durationMs)}
                </p>
              )}
              <fieldset hidden={!!fixedDestination}>
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Button variant="secondary" className="border-border-strong" onClick={discardTake}>
                  {t("space.studio.again")}
                </Button>
                {/* The take as recorded, straight from the browser: nothing is uploaded. */}
                {take && (
                <Button asChild variant="secondary" className="border-border-strong">
                  <a href={take.url} download={takeFileName(take.blob.type)}>
                    <Download aria-hidden="true" className="size-4" /> {t("space.studio.download")}
                  </a>
                </Button>
                )}
                <Button onClick={save} className="col-span-2 sm:col-span-1">{t("space.studio.save")}</Button>
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
              <Progress value={Math.round(progress * 100)} aria-label={t("space.studio.uploading", { percent: Math.round(progress * 100) })} />
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
      {(phase === "done" || phase === "review") && result && !result.ok && (
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

/** "self-tape-2026-11-21-1405.webm", with the extension of what the browser recorded. */
function takeFileName(type: string): string {
  const ext = type.includes("mp4") ? "mp4" : type.includes("quicktime") ? "mov" : "webm";
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `self-tape-${stamp}.${ext}`;
}
