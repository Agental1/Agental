"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Upload, Trash2, Star, Film, AudioLines, Loader2, ImageOff, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { IconTip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  uploadMedia as uploadSmallMedia,
  deleteMedia,
  setPrimaryMedia,
  updateMediaDetails,
} from "@/app/actions/media";
import { uploadMedia } from "@/lib/media-upload";
import {
  CATEGORY_ACCEPT,
  DESCRIPTION_MAX,
  MEDIA_CATEGORIES,
  mediaCategory,
  type MediaCategory,
} from "@/domain/media-categories";

export interface MediaItem {
  id: string;
  type: string;
  isPrimary: boolean;
  mime: string | null;
  category?: string | null;
  description?: string | null;
}

function typeForMime(mime: string): "PHOTO" | "VIDEO" | "AUDIO" {
  if (mime.startsWith("video")) return "VIDEO";
  if (mime.startsWith("audio")) return "AUDIO";
  return "PHOTO";
}

const isHeic = (file: File) =>
  /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/**
 * iPhone photos are HEIC, which only Safari can display: stored as is, they
 * showed as an empty tile everywhere else. They are turned into JPEG in the
 * browser before the upload. The converter loads only when a HEIC file is
 * picked. If it fails, the original is uploaded (it is still a valid file).
 */
async function displayable(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Profile > Media, in four categories, in order: photos of yourself, past
 * productions, general videos, other. Each item shows a real preview (the
 * photo, a video frame with a play button, an audio player) and carries a
 * short description. Reel & Self-tape holds the videos made for one audition.
 */
export function MediaManager({ media }: { media: MediaItem[] }) {
  const t = useTranslations("talents.space.media");
  const router = useRouter();
  const byCategory = (c: MediaCategory) => media.filter((m) => mediaCategory(m) === c);
  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-muted">{t("lead")}</p>
      {MEDIA_CATEGORIES.map((c) => (
        <CategorySection key={c} category={c} items={byCategory(c)} onChanged={() => router.refresh()} />
      ))}
    </div>
  );
}

function CategorySection({
  category,
  items,
  onChanged,
}: {
  category: MediaCategory;
  items: MediaItem[];
  onChanged: () => void;
}) {
  const t = useTranslations("talents.space.media");
  const tt = useTranslations("common.app.toast");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(undefined);
    startTransition(async () => {
      for (const picked of Array.from(files)) {
        const file = await displayable(picked);
        const type = typeForMime(file.type);
        let id: string | undefined;
        let failure: ActionError | undefined;
        try {
          if (type === "AUDIO") {
            // Audio stays on the small-file action (voice clips are short).
            const fd = new FormData();
            fd.set("file", file);
            fd.set("type", type);
            const res = await uploadSmallMedia(fd);
            if (res.ok) id = res.id;
            else failure = res.error;
          } else {
            // Photos and videos go straight to storage, never through an action body.
            const res = await uploadMedia(file, { type, destination: type === "VIDEO" ? "profile" : undefined });
            if (res.ok) id = res.mediaId;
            else failure = res.error;
          }
        } catch {
          failure = err("errors.uploadFailed");
        }
        if (!id) {
          setError(failure ?? err("errors.uploadFailed"));
          break;
        }
        await updateMediaDetails({ id, category });
        toast.success(tt("uploaded"), { description: picked.name });
      }
      onChanged();
    });
  }

  return (
    <section
      data-field={`media-${category}`}
      aria-labelledby={`media-${category}-title`}
      className="space-y-3 rounded-sedan border border-border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`media-${category}-title`} className="font-display text-lg font-medium">
            {t(`categories.${category}.title`)}
            <span className="ml-2 text-sm font-normal text-fg-subtle">{items.length}</span>
          </h3>
          <p className="text-sm text-fg-muted">{t(`categories.${category}.hint`)}</p>
        </div>
        <Button variant="outline" size="sm" loading={pending} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> {t("add")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={CATEGORY_ACCEPT[category]}
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-sm text-danger">{errorText(error)}</p>}
      {items.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFiles(e.dataTransfer.files);
          }}
          className="rounded-sedan border-2 border-dashed border-border bg-surface-2/40 p-5 text-center text-sm text-fg-muted"
        >
          {t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((m) => (
            <MediaCard key={m.id} media={m} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function MediaCard({ media, onChanged }: { media: MediaItem; onChanged: () => void }) {
  const t = useTranslations("talents.space.media");
  const errorText = useActionErrorText();
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState(media.description ?? "");
  const saved = useRef(media.description ?? "");
  const src = `/api/media/${media.id}`;

  function saveDescription() {
    if (description.trim() === saved.current.trim()) return;
    startTransition(async () => {
      const res = await updateMediaDetails({ id: media.id, description });
      if (!res.ok) {
        toast.error(errorText(res.error) ?? "");
        return;
      }
      saved.current = description;
      toast.success(t("descriptionSaved"));
    });
  }

  function move(category: string) {
    startTransition(async () => {
      const res = await updateMediaDetails({ id: media.id, category });
      if (!res.ok) toast.error(errorText(res.error) ?? "");
      onChanged();
    });
  }

  return (
    <div className="overflow-hidden rounded-sedan border border-border bg-surface">
      <div className="group relative">
        <Preview media={media} src={src} />
        {media.isPrimary && (
          <Badge variant="solid" className="absolute left-2 top-2">
            {t("primary")}
          </Badge>
        )}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-black/60 p-1.5",
            "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          )}
        >
          {media.type === "PHOTO" && !media.isPrimary && (
            <IconTip label={t("setPrimary")}>
              <button
                aria-label={t("setPrimary")}
                aria-disabled={pending || undefined}
                onClick={() =>
                  !pending &&
                  startTransition(async () => {
                    await setPrimaryMedia(media.id);
                    onChanged();
                  })
                }
                className="rounded p-1.5 text-white hover:bg-white/20"
              >
                <Star className="size-4" />
              </button>
            </IconTip>
          )}
          <IconTip label={t("delete")}>
            <button
              aria-label={t("delete")}
              aria-disabled={pending || undefined}
              onClick={() =>
                !pending &&
                startTransition(async () => {
                  await deleteMedia(media.id);
                  onChanged();
                })
              }
              className="rounded p-1.5 text-white hover:bg-white/20"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          </IconTip>
        </div>
      </div>
      <div className="space-y-2 p-2">
        <Input
          aria-label={t("descriptionLabel")}
          placeholder={t("descriptionPlaceholder")}
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className="h-9 text-sm"
        />
        <Select value={mediaCategory(media)} onValueChange={move} disabled={pending}>
          <SelectTrigger aria-label={t("categoryLabel")} className="h-9 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEDIA_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`categories.${c}.title`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * The preview: the photo itself, a frame of the video with a play button, or
 * an audio player. A file the browser cannot draw says so instead of showing
 * an empty tile.
 */
function Preview({ media, src }: { media: MediaItem; src: string }) {
  const t = useTranslations("talents.space.media");
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const kind = media.type === "SELFTAPE" ? "VIDEO" : media.type;

  if (kind === "AUDIO") {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-3 bg-surface-2 p-3">
        <AudioLines aria-hidden="true" className="size-10 text-accent" />
        <audio controls preload="none" src={src} className="w-full" aria-label={t("listen")} />
      </div>
    );
  }

  if (broken) {
    const Icon = kind === "VIDEO" ? Film : ImageOff;
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-surface-2 p-3 text-center">
        <Icon aria-hidden="true" className="size-8 text-fg-subtle" />
        <p className="text-xs text-fg-muted">{t("noPreview")}</p>
        <a href={src} target="_blank" rel="noopener" className="text-xs font-bold text-accent hover:underline">
          {t("open")}
        </a>
      </div>
    );
  }

  if (kind === "VIDEO") {
    return (
      <div className="relative aspect-square bg-black">
        {/* #t=0.1 asks for a frame just after the start: the thumbnail. */}
        <video
          src={`${src}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={t("play")}
          className="absolute inset-0 flex items-center justify-center bg-black/20 text-white transition-colors hover:bg-black/30"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-black/60">
            <Play aria-hidden="true" className="ml-0.5 size-6 fill-current" />
          </span>
        </button>
        <Dialog open={playing} onOpenChange={setPlaying}>
          <DialogContent className="max-w-3xl p-2">
            <DialogTitle className="sr-only">{media.description || t("play")}</DialogTitle>
            {playing && <video src={src} controls autoPlay playsInline className="max-h-[80svh] w-full rounded" />}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="aspect-square bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, signed, any size */}
      <img
        src={src}
        alt={media.description ?? ""}
        loading="lazy"
        onError={() => setBroken(true)}
        className="size-full object-cover"
      />
    </div>
  );
}
