# Media hosting: talent photos and videos

## Recommendation

Keep Cloudflare R2 as the private master copy of every photo and video, served through short-lived signed URLs as today. Replace the server-action uploads with presigned uploads that go from the browser straight to R2. Cap a video at 150 MB for the MVP and add multipart uploads before raising the cap. Strip location metadata on the server before a casting director can open a file. Cloudflare Stream remains an optional add-on for playback, with R2 kept as the master.

## Cost

Assumptions: 3 videos of about 100 MB per talent, and R2 list prices of $0.015 per GB-month after 10 GB free, with free egress and operations inside the free monthly allowance (1 million Class A, 10 million Class B).

| Talents | Video stored | R2 per month |
|---|---|---|
| 100 | 30 GB | (30 - 10) GB x $0.015 = $0.30 |
| 1,000 | 300 GB | (300 - 10) GB x $0.015 = $4.35 |

Photos add little: 10 photos of about 3 MB per talent come to 30 GB at 1,000 talents, about $0.45 a month. Each upload costs a PUT and a copy (Class A) and a HEAD (Class B), and each playback a few ranged GETs (Class B). At 1,000 talents with 10 plays per video a month, that is about 30,000 plays, far inside the free allowance.

## Why uploads have to skip the app

`uploadMedia` (`src/app/actions/media.ts:22-58`) and `saveSelfTape` (`src/app/actions/selftape.ts:27-92`) receive the whole file as a server action argument. Next.js caps a server action request body at 1 MB by default (`serverActions.bodySizeLimit`, documented in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`), and `next.config.ts` keeps that default. A phone photo of 2 to 5 MB is refused before the action runs, and the 50 MB limit at `media.ts:20` is never reached. Raising the Next limit would run into Vercel's 4.5 MB cap on a function request body, and the whole file would still sit in function memory (`media.ts:37`).

## Upload flow

`createUpload` (server action) -> browser `PUT` to R2 -> `completeUpload` (server action)

1. **`createUpload({ kind, mime, size })`**
   - Requires a TALENT session and a profile whose birth date makes the person 18 or older, with `isMinor` false. V1 stores no images of minors.
   - Checks the mime type against an allowlist (JPEG, PNG, WebP, MP4, QuickTime, WebM) and the declared size against the cap. HEIC stays off the list until the photo job can decode it, which sharp's prebuilt binaries cannot.
   - Enforces a per-profile quota on file count and total bytes (the sum of `Media.sizeBytes`) and a rate limit, so one account cannot request upload URLs without limit.
   - Picks the key `incoming/{profileId}/{uuid}` and returns a presigned `PUT` URL valid for 600 seconds, with Content-Type and Content-Length in the signature.
2. **Browser `PUT`** straight to R2 with the same Content-Type. XMLHttpRequest reports upload progress, which fetch lacks.
3. **`completeUpload({ key })`**
   - Accepts only a key under `incoming/{the caller's profileId}/`.
   - Treats `head()` as the authority: the size and Content-Type R2 reports are checked again against the allowlist and the cap, and the object is deleted when they fail.
   - Moves the object to `media/{profileId}/{uuid}` or `selftape/{profileId}/{uuid}` (copy, then delete the incoming one) and creates the `Media` row with `sizeBytes`.
   - Relies on a unique index on `Media.storageKey`: when two calls race, the second gets P2002 and reports success, so two rows never share one object (deleting one of them would delete the other's file).
   - Later: read the first bytes with a ranged GET and check the file signature.

Supporting changes:

- `Storage` (`src/lib/storage/index.ts:12-24`) gains `presignPut`, `head`, `move` and `list(prefix)`. Local disk needs a dev stand-in, such as a dev-only route that accepts the `PUT`.
- Playback URLs go from 300 to 3600 seconds (`src/lib/storage/r2.ts:25`), so seeking in a long video keeps working, and carry `ResponseContentType` from `Media.mime` and `ResponseContentDisposition: inline`. The redirect keeps `Cache-Control: private, no-store` (`src/app/api/media/[id]/route.ts:52-62`).
- New error keys (`errors.uploadUnavailable`, the quota errors) go in all four locales, followed by `bun run i18n:check`.
- Tests cover the upload checks, the prefix scoping, and the age and mandate gates.

R2 bucket settings, for each environment:

- Private: no `r2.dev` URL, no public custom domain, and one API token scoped to the bucket.
- CORS with exact origins: `https://www.agental.co` on `agental-media`; `http://localhost:3000` and one stable preview domain on `agental-media-dev`. Methods `PUT`, plus `GET` and `HEAD` only if a page reads media with JavaScript. Allowed header `content-type`; exposed header `ETag`, which multipart needs.
- Lifecycle rules: delete `incoming/` objects after 1 day and abort incomplete multipart uploads after 1 day.
- `src/lib/storage/r2.ts:35` builds the account-wide endpoint. Create `agental-media-dev` the same way as `agental-media`, because a bucket in the EU jurisdiction would need `<account>.eu.r2.cloudflarestorage.com`.

## Size: 150 MB now, multipart next

A single presigned `PUT` can carry up to 5 GB on R2. Over a phone connection, though, a 150 MB upload that drops starts again from zero, which is why the MVP stops at 150 MB per video (20 MB per photo). Before allowing 300 MB and more, switch to multipart: the server creates the upload and presigns one `UploadPart` URL per part (10 MB parts, for example; R2 wants every part except the last to be the same size), the browser sends the parts with retries and collects their ETags, and the server completes the upload and runs the same `head()` checks.

## Playback and location data

iPhones record HEVC in `.mov` files by default. Safari plays them, and elsewhere support depends on the browser and on hardware decoding. Chrome's in-browser recorder, on desktop and Android, produces WebM, which some Safari versions cannot play. Serving the original file therefore leaves some casting directors with a video that will not start. The fix is a transcode to H.264 and AAC in MP4, in a background job or through Cloudflare Stream.

iPhone photos carry GPS coordinates in EXIF, and iPhone videos carry a location atom. R2 serves the original bytes, so a casting director could read where a talent filmed, often at home. Before anyone else can open a file:

- photos are re-encoded on the server with sharp, which drops metadata unless asked to keep it (apply the EXIF orientation first, and move sharp from `devDependencies` to `dependencies`);
- videos are remuxed without metadata in a background job, for example `ffmpeg -i in.mov -map_metadata -1 -c copy out.mov`, since a 150 MB file is a poor fit for a Vercel function, then checked with `exiftool` for any remaining location;
- the file stays visible to its owner only until the job marks it clean. `SelfTape.status` already has PROCESSING and READY, and `Media` needs the same.

Stripping metadata in the browser is a convenience. The server cannot verify it, so the server job remains the control.

## Cloudflare Stream, optional

Stream transcodes each upload into H.264 renditions at several bitrates (HLS and DASH), so playback works in the major browsers and on weak connections, and `requireSignedURLs` keeps playback behind tokens the backend signs. Viewers receive those renditions, which are new encodes; check one with `exiftool` before relying on Stream for location privacy. List prices are $5 per 1,000 minutes stored and $1 per 1,000 minutes delivered, with encoding included. For 2-minute videos played in full 10 times a month:

| Talents | Minutes stored | Minutes delivered | Stream per month |
|---|---|---|---|
| 100 | 600 | 6,000 | $3 + $6 = about $9 |
| 1,000 | 6,000 | 60,000 | $30 + $60 = about $90 |

R2 stays the master and feeds Stream, which can import from a URL such as a short-lived signed R2 link, so leaving Stream later loses nothing. Stream is worth adding once playback complaints, or the work of running ffmpeg jobs, outweigh about $90 a month.

## Why Supabase Storage was set aside

Supabase Storage could do the job technically, since signed upload URLs and resumable (TUS) uploads suit phones. Three points decided against it:

- The Free plan allows 50 MB per file and 1 GB in total.
- On Pro the file limit can be raised and 100 GB are included, but egress beyond the included 250 GB costs $0.09 per GB. At 1,000 talents with 10 plays per video a month, about 3 TB, that comes to about $250 a month, where R2 egress is free.
- A leaked `service_role` key would open the database and every bucket at once. The R2 token is a separate secret scoped to one bucket.

The storage code (`src/lib/storage`) and the production bucket already run on R2 and were verified end to end (TODOS.md).

## Follow-up work

The remaining changes (media access rules, storage cleanup on account deletion, the self-tape recorder's file type, and the move to the upload flow above) are tracked in the team's private notes, outside this repository.
