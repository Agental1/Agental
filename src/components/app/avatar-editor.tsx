"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionErrorMessage } from "@/components/app/action-error";
import { removeAvatar, setAvatar } from "@/app/actions/avatar";
import { err, type ActionError } from "@/domain/action-result";
import { AVATAR_SIZE_PX } from "@/domain/avatar";
import { cn } from "@/lib/utils";
import { stillSignedIn } from "@/lib/session-check";

/** The round picture, or the initials when there is none. */
export function Avatar({
  src,
  initials,
  size = 40,
  className,
}: {
  src: string | null;
  initials: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-bold text-accent",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, signed, already square
        <img src={src} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

const VIEW = 256; // crop frame, CSS pixels

/**
 * Add, replace or remove the profile picture. Pick a photo, drag it and zoom
 * so the face sits in the circle, then save: the browser cuts a 512 px square
 * JPEG and the server stores it privately (src/app/actions/avatar.ts).
 */
export function AvatarEditor({
  src,
  initials,
  size = 40,
  trigger = "avatar",
}: {
  src: string | null;
  initials: string;
  size?: number;
  /** "avatar": the picture itself opens the editor; "button": a labelled button. */
  trigger?: "avatar" | "button";
}) {
  const t = useTranslations("talents.space.avatar");
  const router = useRouter();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function reset() {
    setImage(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(undefined);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(err("errors.avatarType"));
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setError(undefined);
    };
    img.onerror = () => setError(err("errors.avatarType"));
    img.src = url;
  }

  // The image covers the frame at zoom 1; the offset is clamped so no gap shows.
  const base = image ? VIEW / Math.min(image.naturalWidth, image.naturalHeight) : 1;
  const scale = base * zoom;
  const w = image ? image.naturalWidth * scale : VIEW;
  const h = image ? image.naturalHeight * scale : VIEW;
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.min((w - VIEW) / 2, Math.max(-(w - VIEW) / 2, o.x)),
    y: Math.min((h - VIEW) / 2, Math.max(-(h - VIEW) / 2, o.y)),
  });
  const pos = clamp(offset);

  function nudge(dx: number, dy: number) {
    setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }));
  }

  function save() {
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const g = canvas.getContext("2d");
    if (!g) return;
    // The frame's top-left corner, in image pixels.
    const sx = (w / 2 - VIEW / 2 - pos.x) / scale;
    const sy = (h / 2 - VIEW / 2 - pos.y) / scale;
    const side = VIEW / scale;
    g.drawImage(image, sx, sy, side, side, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
    // 512 x 512 JPEG, under 500 KB: lower the quality until it fits.
    const encode = (quality: number) =>
      canvas.toBlob(
        (blob) => {
          if (!blob) return setError(err("errors.generic"));
          if (blob.size > 500 * 1024 && quality > 0.5) return encode(quality - 0.1);
          send(blob);
        },
        "image/jpeg",
        quality
      );
    encode(0.88);
  }

  function send(blob: Blob) {
    const fd = new FormData();
    fd.append("file", blob, "avatar.jpg");
    start(async () => {
      const res = await setAvatar(fd).catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (!res.ok && res.error.key === "errors.unauthorized") {
        if (await stillSignedIn()) return setError(err("errors.sessionCheck"));
        // Really signed out: sign in again and come back to this page.
        const here = window.location.pathname + window.location.search;
        window.location.assign(`/${locale}/connexion?next=${encodeURIComponent(here)}`);
        return;
      }
      if (!res.ok) return setError(res.error);
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await removeAvatar().catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (!res.ok) return setError(res.error);
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger === "avatar" ? (
          <button
            type="button"
            aria-label={src ? t("change") : t("add")}
            className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <Avatar src={src} initials={initials} size={size} />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-fg-muted group-hover:text-accent">
              <Camera aria-hidden="true" className="size-3" />
            </span>
          </button>
        ) : (
          <Button variant="secondary" className="border-border-strong">
            <Camera aria-hidden="true" className="size-4" />
            {src ? t("change") : t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{image ? t("cropHint") : t("intro")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {image ? (
            <>
              <div
                role="img"
                aria-label={t("preview")}
                tabIndex={0}
                className="relative cursor-grab touch-none overflow-hidden rounded-full border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (d) setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 20 : 5;
                  if (e.key === "ArrowLeft") nudge(step, 0);
                  else if (e.key === "ArrowRight") nudge(-step, 0);
                  else if (e.key === "ArrowUp") nudge(0, step);
                  else if (e.key === "ArrowDown") nudge(0, -step);
                  else return;
                  e.preventDefault();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file */}
                <img
                  src={image.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{
                    width: w,
                    height: h,
                    left: VIEW / 2 - w / 2 + pos.x,
                    top: VIEW / 2 - h / 2 + pos.y,
                  }}
                />
              </div>
              <label className="flex w-full max-w-64 items-center gap-3 text-sm text-fg-muted">
                {t("zoom")}
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
              </label>
            </>
          ) : (
            <Avatar src={src} initials={initials} size={160} />
          )}

          <label className="cursor-pointer text-sm font-bold text-accent hover:underline">
            {image || src ? t("choose") : t("upload")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>

          <ActionErrorMessage error={error} />

          <div className="flex w-full flex-wrap justify-between gap-2">
            {src && !image ? (
              <Button variant="ghost" disabled={pending} onClick={remove}>
                {t("remove")}
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={!image || pending} onClick={save}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
