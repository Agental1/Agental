"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Upload,
  Trash2,
  Star,
  Film,
  Music,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { uploadMedia, deleteMedia, setPrimaryMedia } from "@/app/actions/media";

export interface MediaItem {
  id: string;
  type: string;
  isPrimary: boolean;
  mime: string | null;
}

function typeForMime(mime: string): "PHOTO" | "VIDEO" | "AUDIO" {
  if (mime.startsWith("video")) return "VIDEO";
  if (mime.startsWith("audio")) return "AUDIO";
  return "PHOTO";
}

export function MediaManager({ media }: { media: MediaItem[] }) {
  const t = useTranslations("talents");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(undefined);
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("type", typeForMime(file.type));
        const res = await uploadMedia(fd);
        if (!res.ok) {
          setError(res.error ?? err("errors.uploadFailed"));
          break;
        }
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
        className="flex flex-col items-center justify-center gap-2 rounded-sedan border-2 border-dashed border-border bg-surface-2/40 p-8 text-center"
      >
        <Upload className="size-6 text-accent" />
        <p className="text-sm text-fg-muted">{t("space.media.drop")}</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Choisir des fichiers
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{errorText(error)}</p>}

      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((m) => (
            <MediaCard key={m.id} media={m} onChanged={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({
  media,
  onChanged,
}: {
  media: MediaItem;
  onChanged: () => void;
}) {
  const t = useTranslations("talents");
  const [pending, startTransition] = useTransition();
  return (
    <div className="group relative overflow-hidden rounded-sedan border border-border bg-surface">
      <div className="flex aspect-square items-center justify-center bg-surface-2">
        {media.type === "PHOTO" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${media.id}`}
            alt=""
            className="size-full object-cover"
          />
        ) : media.type === "VIDEO" ? (
          <Film className="size-8 text-fg-subtle" />
        ) : media.type === "AUDIO" ? (
          <Music className="size-8 text-fg-subtle" />
        ) : (
          <ImageIcon className="size-8 text-fg-subtle" />
        )}
      </div>
      {media.isPrimary && (
        <Badge variant="solid" className="absolute left-2 top-2">
          Principale
        </Badge>
      )}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-noirchaud/60 p-1.5",
          "opacity-0 transition-opacity group-hover:opacity-100"
        )}
      >
        {media.type === "PHOTO" && !media.isPrimary && (
          <button
            aria-label={t("space.media.setPrimary")}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setPrimaryMedia(media.id);
                onChanged();
              })
            }
            className="rounded p-1.5 text-creme hover:bg-white/20"
          >
            <Star className="size-4" />
          </button>
        )}
        <button
          aria-label={t("space.media.delete")}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deleteMedia(media.id);
              onChanged();
            })
          }
          className="rounded p-1.5 text-creme hover:bg-white/20"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
