# Media privacy: who can see a talent's files

Photos, reels and self-tapes are private by default. A file is visible to the talent who owns it, to admins, and to the parties listed below. Everyone else gets a 404. How files are stored and uploaded is in [MEDIA_HOSTING.md](MEDIA_HOSTING.md); where the data lives is in [DATA_SECURITY.md](DATA_SECURITY.md).

## Who can see what

Each file has a destination: `profile` (part of the profile) or `library` (the talent's private shelf). A photo always goes to the profile. A self-tape starts in the library.

| Who | Profile files | Library files |
|---|---|---|
| The talent who owns them | Yes | Yes |
| An admin (minors compliance back office) | Yes | Yes |
| A casting user whose organization has an application from this talent | Yes | 404 |
| Any other casting user, any other talent, a visitor with no session | 404 | 404 |
| Someone holding a working share link | That one clip | That one clip |

The rule is `canReadMedia` in `src/lib/media-access.ts`. Reads go through `/api/media/<id>`, which checks the session on every request and answers with a redirect to a signed storage address. A refused read gets the same 404 as a file that does not exist. The bucket has no public address.

Every rule is decided on the server from the session. The browser never sends "who I am" or "which profile is mine".

## Who can upload

A signed-in talent, to their own profile, when the profile is an adult's. The first version stores no image of a minor: a profile marked as a minor's is refused at upload and can share nothing. The profile is read from the session, and the file is checked twice: what the browser declares before an upload address is issued, and what storage reports once the file has arrived.

## Upload states

| State | Meaning | Who sees it |
|---|---|---|
| In flight | The browser is sending the file. Only a pending `Upload` row exists; it expires after 30 minutes. | Hidden from everyone. |
| `READY` | Storage confirmed the file: the size matches what was declared and the type is on the allowlist. | The parties in the table above. |
| `PROCESSING` | Reserved for a later step (transcoding, metadata removal). Unused today. | Intended: owner and admins only. |
| `FAILED` | Reserved for the same later step. Unused today. | Intended: owner and admins only. |

A `Media` row is `READY` from the moment it exists, because it is only created once storage has confirmed the file. A file that is `PROCESSING` or `FAILED` cannot be shared, and its existing share links answer 404 until it is `READY` again. The read route `/api/media/<id>` does not look at the state yet. That change is requested and matters only once a processing step exists.

## Self-tapes and versions

A self-tape is a tape with a title, an optional demo brief, and its saved versions. Each version is one file. Uploading with a `tapeId` adds the next version to that tape. Uploading without one starts a new tape with the file as version 1. A tape created without a title stores an empty title, and the interface shows its own "Untitled" label.

A talent can only add versions to their own tapes. A tape that belongs to someone else gets the same answer as a tape that does not exist (`errors.tapeNotFound`). Self-tapes saved before tapes existed belong to no tape; they still appear in `listRecordings` with `tapeId` null.

## How a share link works

A share link is the talent's deliberate way to show one clip to someone outside the product.

- **Creating.** Only the owner can create a link, and only for a `READY` clip: `createShareLink(mediaId, { expiresInHours })`. Files on a profile marked as a minor's are never shared.
- **The token.** 32 random bytes, written in base64url. The database stores its SHA-256 hash and nothing else (`MediaShare.tokenHash`). The full link is returned once, at creation. It cannot be shown again later. A lost link is replaced by a new one.
- **Expiry.** 72 hours by default. The talent can choose between 1 hour and 7 days; a request outside that range is brought back inside it.
- **Limit.** A clip can have 5 links working at the same time. Revoked and expired links stop counting.
- **Revoking.** `revokeShareLink(shareId)` stops the link at once and for good.
- **Opening.** `GET /api/share/<token>` needs no account. A working link answers with a redirect to a signed storage address for that one file. A link that is unknown, revoked or expired, or whose clip is deleted or not `READY`, gets one identical 404, so an old link or a guess learns nothing about the reason.
- **Headers.** Every answer carries `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`.
- **Rate limit.** 60 requests per minute per client address, across all links, answered with 429 beyond that. The limit is checked before the token is looked at.
- **Counting.** Each link keeps a view count and the time of the last view. The count is approximate. A video player fetching a later part of the same file is counted as the same view, but link previews made by messaging apps count, and some players ask for the start of a file twice.

What the recipient gets is the file itself: they can play it and they can download it. Three limits follow from that and the interface should say so:

- The signed address in the redirect is valid for 15 minutes (one hour for the owner's own playback). An address already handed out keeps working until it runs out, so a revoked link can still play for up to 15 minutes in a browser that opened it just before.
- A copy that was downloaded cannot be recalled.
- The signed address contains the storage path of the file, which includes the talent's internal profile id and a random file name. On their own, the two open nothing.

## What deletion does

**Deleting one clip** (`deleteRecording(mediaId)`), in one transaction, then storage:

1. The `Media` row is deleted. The database deletes with it the self-tape record, every share link to the clip and its place in any application draft (`ON DELETE CASCADE` on `SelfTape`, `MediaShare` and `DraftMedia`).
2. An audit entry `media.delete` is written in the same transaction.
3. The stored file is deleted from the bucket.

Share links to the clip answer 404 from step 1. An application draft that had the clip attached stays, without the attachment. A tape whose last version is deleted stays as an empty tape, with its title and brief, until the talent deletes it or adds a version.

**Deleting a tape** (`deleteTape(tapeId)`) does the same for every version of the tape, and also removes any upload still on its way to that tape and the tape itself, with one audit entry `tape.delete`. A version that finishes uploading after the tape is gone is discarded.

**Deleting the account** removes every row that hangs off the user and every file under the talent's two storage folders (`src/app/actions/account.ts`).

The row always goes first. If the bucket cannot be reached, the deletion still succeeds, the file is left without a row, and the failure is logged by record id. The sweep that removes such leftover files is still to write. Any backup kept by the database or storage provider is outside this code.

## What `consentVersion` means

`consentVersion` is a short label (40 characters at most) naming the version of the upload notice the person accepted in the interface. It travels with the upload and is stored on the `Media` row.

It records consent to store the file and to show it to the parties in the table above. It is never permission to reuse the file, to publish it, or to train a model on it.

Unfinished: the server stores the label the interface sends and does not check it against a list of known versions. An upload that carries none is accepted and stored with an empty value.

## Connected accounts

Settings shows which of Google and Apple are connected, when each was connected and last used, and whether the account has a password. The provider's subject id and the token columns never leave the server.

`disconnectProvider(provider)` removes our record of the link, so that provider no longer opens the account. We store no provider tokens, so there is nothing to revoke on the provider's side: the app stays listed in the person's Google or Apple account until they remove it there. A connection that is the only way to sign in (no password, no other provider) is never removed.

## What is logged, and what never is

Logged:

- Audit entries (`AuditLog`): `media.delete`, `tape.delete`, `media.share.create`, `media.share.revoke`, `auth.oauth.unlink`. Each holds who did it, the record id, and a few facts such as the number of versions, the expiry of a link, or the provider's name.
- On each share link: the view count and the time of the last view.
- For the rate limit: one row per request with a keyed hash of the client address and a time. Rows older than one minute are deleted on that address's next request.
- In server logs, when something fails: record ids and the class of the error.

Kept out of the database and the logs:

- A share token, in any form other than its hash in `MediaShare`. Audit entries leave out both the token and the hash.
- Signed storage addresses and storage paths.
- A visitor's IP address, browser or referrer. There is no per-view record of who opened a link.
- Emails, names, titles and briefs in audit entries or server logs.

## What is not built

- **Transcoding.** The original file is served. Some browsers cannot play some originals (see MEDIA_HOSTING.md).
- **Metadata removal.** Location data inside a photo or video is not stripped yet.
- **A processing step.** The states `PROCESSING` and `FAILED` are never set, and `/api/media/<id>` does not check the state.
- **Provider callbacks.** Storage does not call the app when a file lands. The browser calls `completeUpload`. An upload that is never completed leaves a pending row that expires and possibly a file with no row.
- **A viewer page for share links.** The link opens the file itself. There is no watermark and no download prevention.
- **A notification when a link is opened.**
- **A required consent version.** See above.
- **Tapes for older self-tapes.** Self-tapes saved before tapes existed are not grouped.

Face and voice analysis are absent by design. The server never opens a file to look at or listen to its content. The self-tape quality score is computed from three numbers the browser measures (framing, light, sound) and sends as numbers.

## How to demonstrate

1. **Upload.** In a client component: `uploadMedia(file, { type: "SELFTAPE", title, consentVersion })` from `src/lib/media-upload.ts`. It runs `createUpload`, the browser `PUT`, then `completeUpload`, and returns `{ ok: true, mediaId, tapeId, takeNumber }`.
2. **Ready.** `listTapes(profileId)` from `src/lib/tapes.ts` shows the tape with one version whose `status` is `READY`. Upload again with `tapeId` to see version 2 appear first.
3. **Private.** Sign in as another talent and open `/api/media/<mediaId>`: 404.
4. **Share.** `createShareLink(mediaId, { expiresInHours: 24 })` from `src/app/actions/share.ts` returns `{ shareId, url, expiresAt }`. Open `url` in a private window with no session: the clip plays. `listShareLinks(mediaId)` from `src/lib/share.ts` shows the view counted and `active: true`.
5. **Revoke.** `revokeShareLink(shareId)`. Open `url` again: 404. `listShareLinks(mediaId)` shows `active: false`.
6. **Delete.** `deleteRecording(mediaId)` from `src/app/actions/uploads.ts` for one version, or `deleteTape(tapeId)` from `src/app/actions/tapes.ts` for the whole tape. The clip is gone from `listTapes`, `/api/media/<mediaId>` answers 404 for its owner too, and any other link to it answers 404.

The same sequence runs as a test against a real database in `tests/api/media-privacy.test.ts`.
