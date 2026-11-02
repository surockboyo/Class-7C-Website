# Class Website Project Specification

## 1. Goal and priorities

Build a polished, installable, mobile-first single-page class website that feels like a real app for a junior high class at SMPN 62 Surabaya.

When requirements conflict, prioritize:

1. Data integrity
2. Functional correctness
3. Static-hosting compatibility
4. Security and privacy honesty
5. Mobile usability and accessibility
6. Performance
7. Visual polish
8. Bonus features

## 2. Stack decision

Keep one `index.html`, vanilla HTML/CSS/JavaScript ES modules, the existing UI, theme system, and disc gallery. GitHub Pages remains the static host with no build step. Supabase is the approved hosted backend: Postgres stores shared data, Auth identifies the Owner, Storage holds shared gallery/report images, and Realtime will notify connected clients. Browser-local storage remains only for preferences/progress explicitly designated per device and as an offline cache.

Vendor and pin the Supabase JavaScript client locally in Phase 2; do not load it from a CDN. Only the Supabase Project URL and public anon/publishable key may be shipped in `assets/js/config.js`. Never expose a service-role/secret key, database password, or Owner password in client code or the repository. Do not add a framework or build step.

## 3. Architecture and file structure

Exactly one HTML file is allowed: `index.html`. All views, tabs, modals, and Dashboard sections stay in that document and switch through JavaScript; do not use page loads or `window.location` for internal navigation. Use relative paths for GitHub Pages repository subpaths.

Create only what is needed from this structure:

```text
index.html
README.md
PROJECT_SPEC.md
HANDOFF.md
manifest.webmanifest
sw.js
.github/
  copilot-instructions.md
assets/
  css/
    styles.css
  js/
    app.js
    storage.js
    schedule.js
    owner-auth.js
    gallery.js
    wheel.js
    reports.js
    utils.js
  images/
  icons/
data/
  default-data.json
tests/
  schedule.test.js
```

Do not create any other HTML documents. Optional files and folders may be added only when a feature requires them.

## 4. Static hosting and publishing model

- GitHub Pages serves the static single-page app under a repository subpath; Supabase hosts shared backend services. A static host alone cannot keep credentials secret, so only the public anon key may be used in the browser and RLS/Auth enforce access.
- Owner changes to shared collections, reports, suggestions, and gallery metadata become available to authorized/anonymous readers according to policy on other devices. Phase 6 adds Realtime updates and a refetch fallback.
- `data/default-data.json` is a seed and first-load fallback only, not the ongoing source of truth after shared-data migration.
- Browser storage is per device for theme/accent, homework checklist progress, like state, mute/vibration settings, cooldown timestamps, view toggle, and a cache of the last good shared data. It does not synchronize these deliberately local settings.
- Public shared records have UUID IDs, version numbers, `updated_at`, `updated_by`, and `deleted_at`. Soft-deleted rows are hidden from anon and remain restorable by an Owner.
- Reports and suggestions are stored in Supabase; their inbox is visible only to an authenticated Owner. A stored submission does not mean a teacher has read or answered it.
- Export/import remains available as a backup mechanism for shared data. Import and migration must be validated and confirmed before writing.
- An offline visitor may read the last good cached public data with a clear offline notice. Do not queue Dashboard writes offline; disable them and explain why.
- Every shared update uses the version originally read. If the conditional update finds a newer version, show a conflict choice in Indonesian; never overwrite silently.

## 5. Storage map

| Data | Storage |
|---|---|
| Shared records: `classInfo`, `homework`, `exams`, `kisi-kisi`, `announcements`, `schedule`, `scheduleSettings`, `students`, `galleryPosts`, `albums`, `birthdays`, `piket`, `siteSettings`, `wheelHistory` | Supabase `public.records` with JSONB data, UUID ID, version, timestamps, Owner identity, and soft-delete timestamp |
| Reports and suggestions | Supabase `public.reports` and `public.suggestions`; public inserts are limited by column grants, RLS, and length constraints; only Owners read/manage inboxes |
| Activity | Supabase `public.activity_log`; Owner-only RLS |
| Gallery objects and report attachments | Supabase Storage buckets `gallery` and `report-attachments`, with public/private access rules and MIME/size limits |
| Owner membership | Supabase `public.owners`, containing Auth user UUIDs; membership is not determined by a hardcoded email |
| Last good shared-data cache | Browser local storage/IndexedDB, for immediate display and offline reading only |
| Theme/accent, checklist progress, likes, mute/vibration, cooldown timestamps, gallery view mode | Local browser storage by design; not synchronized |

`assets/js/storage.js` remains the single storage abstraction for all features. Its public operations cover reading, writing/updating/deleting, backup import/export, reset, validation, and migration. Shared operations use Supabase; the cache is used for immediate/offline reads, not as confirmation of a successful write. Never put base64 images in localStorage. Do not remove or overwrite existing local data during a migration without explicit Owner confirmation and a verified backup.

For the existing local schema, `outlines` maps to the shared collection key `kisi-kisi`, `settings` maps to `siteSettings` plus `scheduleSettings` as appropriate, and legacy `gallery` metadata maps to `galleryPosts`/`albums`. Existing non-UUID IDs require an explicit, stable migration mapping before upload; never discard local records just because their IDs need conversion.

## 6. Backup, import, and reset

- Export package includes schema/app versions, export time, all shared collections, and metadata. Include image blobs only in an explicit export package and show a size warning.
- Import flow: parse and validate the entire file, preview changes, require explicit Owner confirmation, then apply server writes with version/conflict handling. Do not claim all-or-nothing across Postgres and Storage unless implemented transactionally; report partial failures and retain the backup for recovery.
- Destructive shared-data resets require a separate confirmation and Owner privileges. Never silently wipe Supabase or browser data.

## 7. Owner authentication

- Hidden gesture: tap the logo/title five times within three seconds using a sliding window. It opens the Supabase Owner login; do not mention the gesture in public UI.
- Phase 3 uses Supabase Auth email/Password login and a visible `Keluar Dashboard` action. Do not render management controls unless a valid session exists and the authenticated UUID is listed in `owners`.
- Server-side RLS is the real access control. The client membership check only controls usability and never replaces RLS.
- Disable public sign-ups after creating the Owner account. Do not hardcode Owner email, password, or service-role key.
- The public anon key is expected to be visible in the static app. It is not secret; RLS policies must prevent unauthorized access.
- Login errors are friendly Indonesian; add a short local delay after repeated failures without exposing whether an account exists.
- README and settings must describe which data is shared, which stays local, and how to back it up.

## 8. Features

### 8.1 Class information

Public sections: `Deskripsi Kelas`, `PR`, `Jadwal Ulangan`, `Kisi-kisi Ulangan`, `Pengumuman`, and Owner-created custom sections (rename, add, delete). Owner CRUD supports soft delete and restore.

Records include `id`, `title`, `description`, `subject`, date/deadline, optional image, author, `createdAt`, `updatedAt`, and status. Homework and exam badges are text-based and support `H-7`, `H-3`, `H-1`, `Hari ini`, `Terlambat`, and `Selesai`. Missing or invalid dates never produce a countdown. Sort upcoming entries by nearest date; visually distinguish completed and expired records.

### 8.2 Smart daily schedule

Period fields: day, subject, start, end, teacher, classroom. Owner can add, edit, delete, reorder, change switch time (default 20:00), and restore defaults. School days default to Monday-Friday and are configurable.

Keep all schedule computation in `getScheduleView(now, schedule, settings)` in `assets/js/schedule.js`. It returns `{ mode, shownDay, pinnedDay, currentPeriod, nextPeriod }`. Inject `now`; use explicit `Intl`/timezone logic for `Asia/Jakarta`, never the device timezone. WIB has no daylight-saving time.

Authoritative display rules (`S` is the configured switch time):

| WIB time | Mode | Day shown |
|---|---|---|
| Monday-Friday, 00:00 up to S | single | today |
| Monday-Thursday, S up to 24:00 | single | tomorrow |
| Friday, S up to 24:00 | single | Monday, labelled `Senin depan` |
| Saturday, all day | full-week | all days |
| Sunday, all day | full-week | all days, Monday pinned at top |

Monday 23:59 shows Tuesday; Tuesday 00:00 shows Tuesday. Friday 23:59 shows Monday; Saturday 00:00 switches to full-week. Highlight `Sedang berlangsung` and `Selanjutnya` only when `shownDay` is today and WIB time is within a period (or, for `Selanjutnya`, before the next period starts). During gaps, nothing is in progress and the next period is marked next. Empty or invalid data shows a friendly empty state without a crash. Include a `Lihat semua jadwal` button.

Tests in `tests/schedule.test.js` use fixed injected timestamps and cover every weekday, Saturday, Sunday, switch boundary (S-1 minute and S), midnight transition, Friday-to-Monday, Sunday Monday-pinning, empty schedule, invalid data, custom switch time, and in-lesson/gap/after-school highlighting. Run with `node --test`.

### 8.3 Spin wheel

Owner can add, edit, remove, and reset student names and toggle `jangan pilih yang sudah terpilih`. Use a canvas wheel with eased animation. Choose the winner index first using `crypto.getRandomValues` from eligible names; animate to the chosen slice so the visible winner always matches. Use Web Audio API oscillator ticks (no audio files), a mute toggle, optional vibration, confetti, a large winner name, `Selamat!` popup, and history (view, clear, reset picked). Handle zero and one name. Respect `prefers-reduced-motion` by showing the result without a long spin.

### 8.4 Gallery (`Momen Kelas`)

Use an interactive, carousel-like photo disc as the primary gallery, with a clear `Daftar` mode as an accessible fallback. The disc shows only nearby photos in the DOM, uses a minimum 20-degree item spacing, and supports pointer/touch dragging, inertia and snapping, tap-front-to-open, tap-side-to-select, previous/next buttons, and arrow/Home/End keyboard controls. Respect reduced motion. Provide a live announcement for the selected photo. The list mode retains all cards and keyboard-operable image, like, and Owner moderation controls.

Both modes show image, caption, uploader, date, album, and like button. Likes are per-browser and labelled as such. Album and text filters cover captions, uploader, tags, and month, apply to both modes, and persist with the selected gallery mode. Include a full-screen viewer with swipe, pinch-zoom where supported, close control, and keyboard support.

Owner can upload, preview, edit caption/uploader, soft-delete and restore, organize albums and event/month/tag metadata, and filter. Validate MIME and file signature; default input limit is 5 MB and configurable. Resize to a maximum 1600px longest side, compress with canvas to JPEG/WebP around 0.8, show real progress, upload files to Supabase Storage, and store metadata in shared `records`; lazy-load list thumbnails. Disc thumbnails are restricted to nearby photos; revoke their object URLs as they leave the near set and when the gallery is destroyed. Failed/missing remote image URLs show a visible placeholder. Show Supabase storage usage where available and warn near the configured free-tier limit; never auto-delete images.

### 8.5 Dashboard

Single panel with: Overview, Class Information, Schedule, Spin Wheel, Gallery, Reports Log, Suggestions Inbox, Activity Log, Website Settings, and Backup and Restore.

Overview shows shared counts from Supabase. Activity entries include action, record, timestamp, description, and actor in the Owner-only `activity_log`. Counts and inbox data must not be presented as local-only after migration.

### 8.6 Report via WhatsApp

Fields: required name and message, optional image attachments, timestamp. Owner configures the WhatsApp number; it is empty by default. Validate international digits only (10-15 digits, no plus sign or spaces). If unset, disable `Kirim via WhatsApp` and explain why.

Use this exact message shape:

```text
📢 LAPORAN BARU
• Nama : <name>
• Pesan : <message>
• Waktu : <date time WIB>
```

Open `https://wa.me/<number>?text=<encodeURIComponent(message)>` in a new tab with `rel="noopener noreferrer"`. With attachments, show exactly: `Lampiran gambar akan diunduh; silakan kirim manual di WhatsApp.` and provide one download button per image. Store submissions in the shared `reports` table, but never claim WhatsApp sent the message or a teacher read the report. Cooldown timestamps are per browser; its configured duration may be shared in `siteSettings`. Do not claim a browser cooldown stops abuse. Report attachment objects are private to the Owner and use the restricted report bucket.

### 8.7 Suggestions

Fields: title, message, optional name. Before submit, explain that the suggestion is stored in the class website inbox visible to the Owner; do not imply the Owner has read it. Offer `Salin teks`, `.txt`/`.json` download, and optional WhatsApp handoff using the configured number.

Dashboard inbox loads shared submissions from Supabase; support read/unread, reply note, archive/restore, and delete with confirmation.

### 8.8 Bonus (only after all core features pass QA)

1. Homework checklist (per browser, with progress bar).
2. Birthdays (days remaining and celebration).
3. Piket roster (highlight today).
4. Install prompt and guidance, plus new-content dots.
5. Theme accents and persisted light/dark theme; first visit follows system.

Report each as `Completed`, `Partial`, or `Not implemented`.

## 9. PWA

- `manifest.webmanifest` uses `start_url` and `scope` set to `./`, with 192px, 512px, and maskable icons.
- `sw.js` uses a versioned cache, precaches the app shell, auth/data modules, and pinned local Supabase client, uses cache-first for static assets and network-first for `index.html` and the seed/fallback `data/default-data.json`, cleans old caches on activation, shows `Versi baru tersedia - Muat ulang` for updates instead of a silent swap, and provides an offline fallback.
- Never cache private Supabase data or Auth credentials in the service worker. Register it with a relative path.
- README documents iOS and Android installation differences.

## 10. Accessibility, performance, and UI

- Use semantic landmarks, one `h1`, labelled inputs, modal focus trap and Escape handling with focus return, `aria-live` status messages, at least 4.5:1 contrast, and no color-only meaning.
- Prefer event delegation and update only changed sections. Lazy-load images.
- Do not use fake delays. Show skeletons only during real asynchronous work.
- Each data section handles loading (only when real), empty, error, success, and offline states.
- UI is casual, polite Bahasa Indonesia for teenagers. Keep these labels in English: `Dashboard`, `Username`, `Password`, `Owner`. Roles: `Owner`, `Guru`, `Siswa`.
- Dates use locale `id-ID`, explicitly set timezone `Asia/Jakarta`, and 24-hour time (example: `Senin, 12 Oktober 2026`).
- Design mobile-first for 360-430px, with bottom navigation, at least 44px touch targets, no horizontal overflow, light/dark themes, visible keyboard focus, and reduced-motion support.
- Design language: use the described original UI as the base (rounded header, hero-first Beranda, weekly schedule card, five-item bottom navigation with a filled active pill, original card shapes and icons). Keep the present structure on screens without an archived original reference. Retain current improvements that do not change layout, including spacing, contrast, responsive behavior, 44px targets, visible focus, and shared SVG icons.
- Add a restrained school-classic layer (about 20%): self-host one Source Serif 4 WOFF2 for headings only, with Georgia/Times/serif fallback; body copy, controls, forms, and numbers remain in the existing sans-serif. Reuse shared CSS for eyebrow labels, centered-diamond rules, thin inset borders on key cards, text-bearing status stamps, light-only paper grain at no more than 4% opacity, and thin ledger separators for PR/kisi-kisi lists. Use existing theme tokens or new component tokens mixed from them; add no shadows, textures, or vintage copy.
- Keep all targets at least 44px except the protected Piringan/Daftar mode controls, which remain 40px by explicit user approval.
- The visual layer must not alter theme token values, the eraser switch, theme/accent persistence or first-paint behavior, or the protected gallery/disc/viewer. Dark mode receives no grain or tint changes. Precache the self-hosted font and bump the service-worker cache when its assets change.
- Theme is an accessible eraser switch with tap, keyboard, and drag support. First visit follows the system preference; persist light/dark choice and the red/yellow/blue/green accent. Apply theme tokens before first paint to avoid a flash. Text contrast meets 4.5:1 and UI borders meet 3:1 across both themes and all supported accents.

## 11. QA checklist requirements

Maintain `QA_CHECKLIST` in `HANDOFF.md`. Each item must be `PASS`, `FAIL`, or `NOT TESTED`, with evidence (command output or observed result). Cover navigation, modals, Owner Auth login/logout and non-owner denial, every CRUD flow, persistence after refresh, image upload/delete/restore, schedule tests, wheel result accuracy, report URL generation, suggestions, export/import, safe reset/migration, theme persistence, offline cache/read-only behavior, subpath hosting, widths 360/375/390/430/tablet/desktop, Chromium and Firefox, RLS policy cases, two-client Realtime, and console errors. Never invent Lighthouse scores.

## 12. Definition of done

- Exactly one HTML page; no build step; GitHub Pages frontend connected to the approved Supabase backend.
- All seven core groups work; no dead buttons, fake features, silent data loss, or known critical bugs.
- Schedule tests pass.
- Documentation is complete. `README.md` is beginner-friendly Indonesian and covers overview, features, stack, local run, GitHub Pages deployment, Supabase setup, Owner login, shared/local data, export/import, recovery, PWA install, offline limits, WhatsApp limits, report/suggestion semantics, security and browser storage limits, and troubleshooting.
- Every feature has a recorded QA status.

## 13. Stages

Do one user-named stage only; do not proceed to the next stage without a new request.

Shared-data rollout phases are separate from the original implementation stages. Follow the user-named phase and stop at its boundary:

1. Plan and SQL: Supabase schema, RLS, setup guide, manual RLS checklist, and architecture documentation only.
2. Data layer: pinned local Supabase client, public URL/anon-key configuration supplied by the Owner, storage abstraction, cache/offline reads, conditional updates/conflicts, and explicit migration consent.
3. Owner login: Supabase Auth session plus `owners` membership; the former convenience code gate has been removed.
4. Wire existing features to shared records/submission tables, testing feature-by-feature.
5. Upload gallery/report images to the defined Supabase Storage buckets.
6. Realtime subscriptions, fallback refresh, two-session QA, offline/conflict/security regression.

The original feature stages below describe the existing app baseline. Shared-data phases above are the active plan and supersede the old local-only data/auth implementation where they conflict.

0. Planning: specification, handoff, instructions, and folder structure.
1. Foundation: one-page app shell, design, navigation, manifest, service worker, and icons.
2. Data layer: local Supabase client, shared storage, cache, offline reads, and versioned writes are implemented in shared-data Phase 2; feature-specific wiring continues in Phases 3-5.
3. Dashboard: Supabase Auth and `owners` membership; client checks control usability and RLS remains authoritative.
4. Class information; 5. Schedule; 6. Gallery; 7. Spin wheel; 8. Reports and suggestions; 9. Bonus; 10. Full QA and docs.

## 14. Stack decisions and limitations

- GitHub Pages serves the static frontend; Supabase Postgres/Auth/Storage/Realtime provide the shared backend. `data/default-data.json` is only a seed/first-load fallback after migration.
- WhatsApp handoff opens a prefilled message; it does not send automatically. Attachments must be downloaded and manually attached by the user.
- A static browser app cannot keep its public anon key secret. Never expose a service-role key, database password, or Owner password; enforce data permissions with Supabase RLS.
- Authenticated user access is governed by membership in `owners`, not a hardcoded email. Keep public sign-ups disabled after creating the Owner account.
- Theme/accent, checklist progress, like state, mute/vibration settings, cooldown timestamps, and gallery view mode intentionally remain per browser. The browser cache provides offline read access but does not confirm a server write.
- Shared writes require connectivity and server confirmation. No silent offline write queue; conflicts are surfaced before overwriting a newer version.
- Shared records include class information/custom sections, homework, exams, kisi-kisi, announcements, schedule, students, gallery metadata, site settings, birthdays/piket collections, and wheel history. Reports and suggestions use their dedicated tables; images use the configured Storage buckets; activity is Owner-only.
- Owner controls require a Supabase Auth session and `owners` membership. Shared record writes verify membership in the client and are always enforced by RLS.
- Public report/suggestion submissions and report-attachment uploads use a separate non-persistent anon client so an Owner's saved browser session does not accidentally change public-insert requests to the authenticated role.
- Realtime listens for public `records` changes. If the channel is unavailable, the client refetches on focus/visibility and every three minutes; private inbox data is fetched only while an Owner view is open.
- Phase 3-6 code is implemented, but live Owner login/write, RLS policy cases, Storage behavior, Realtime across two sessions, and GitHub Pages subpath hosting remain unverified until manually tested against the configured Supabase project.
- JSON backup currently covers the app's collection/cache format and local IndexedDB blobs; it does not yet provide a complete restore path for private inbox tables or remote Storage objects. Back up these in Supabase before destructive operations.
- Do not migrate existing browser data or reset local storage without explicit Owner confirmation and a verified export backup.
- Reports and suggestions are shared inbox submissions, but submission is not evidence that the Owner or teacher has read them. Gallery images are public by design; report attachments are private to the Owner.
- Free-tier availability, quotas, pauses, and limits are controlled by Supabase and may change; verify the current project plan before launch. The gallery usage display is an estimate and its 800 MB warning is not an official quota.
