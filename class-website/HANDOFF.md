# Handoff

## Supabase shared-data rollout

- **Approved target architecture:** one `index.html`, vanilla JS/CSS, no build step, and GitHub Pages as the static host; Supabase hosted Postgres, Auth, Storage, and Realtime provide shared data/backend services. Existing UI, themes, and disc gallery design/behavior are to remain unchanged.
- **Phase 1 status: COMPLETE (planning/files only).** Added `supabase/schema.sql`, beginner-friendly `supabase/README_SETUP.md`, and manual `tests/rls-checklist.md`; updated this handoff and `PROJECT_SPEC.md`.
- **Phase 2: COMPLETE.** Pinned local Supabase JS 2.118.0, public-only config, shared-record cache, versioned updates/conflicts, offline read/write behavior, and service-worker precache.
- **Phase 3: IMPLEMENTED.** Supabase Auth email/password login, `owners` membership check before showing Dashboard controls, sign-out, and temporary throttling after repeated failures. Removed the active PBKDF2 gate and hash-generation utility.
- **Phase 4: PARTIAL.** Class, schedule, student/wheel history, site settings, gallery metadata, Owner inbox tables, and activity calls route to shared Supabase storage. Reports/suggestions use anonymous submissions; Owner-only inbox operations use authenticated requests. The birthdays/piket collection mappings exist, but there is no dedicated UI to read or manage them.
- **Phase 5: IMPLEMENTED.** Gallery images upload to public `gallery` Storage and render by public URL; report attachments upload through a non-persistent anon client to the private bucket and Owner inbox uses short-lived signed URLs. Soft deletion leaves image objects intact; confirmed permanent delete removes them. Gallery size is estimated from Storage listing with an explicitly non-authoritative 800 MB warning threshold.
- **Phase 6: IMPLEMENTED IN CODE; LIVE QA NOT TESTED.** Public `records` Realtime subscription, debounced refetch, focus/visibility refresh, three-minute fallback, and unsubscribe lifecycle are implemented. The updated SQL publication still needs to be run in Supabase; two-client Realtime, live RLS, Owner login/writes, Storage uploads, and conflict behavior were not exercised in this session.
- `data/default-data.json` remains a first-load fallback/seed and is not uploaded automatically. Existing browser collections are not migrated. Theme/accent, checklist/likes, audio/vibration, cooldown timestamp, and gallery view/filter preferences remain local.
- `node --test`: **40 passed, 0 failed**. JavaScript syntax checks and `git diff --check` passed. Local browser smoke checks loaded the app, navigated all public views, and opened Owner login without submitting credentials. Offline now stops Realtime (avoiding reconnect-error noise) and reconnects/refetches when online; service-worker cache bumped to v17. A prior read-only Supabase endpoint check returned HTTP 200 and zero anon-visible records; it did not inspect records or attempt writes.
- JSON export/import is not a complete remote backup/restore for private inbox rows or Storage objects. Back up these directly in Supabase before destructive operations. No browser data was cleared or migrated.
- **Next:** run the updated `supabase/schema.sql`, verify the RLS checklist, then test Owner auth, a two-client change, reports/inbox, Storage, offline cache, and repository-subpath deployment. Never request or include a service-role key, database password, or Owner password.

## Overall status

- The one-page, build-free vanilla app and core feature set for Stages 1-8 are implemented. The user authorized replacing the disposable Next.js scaffold.
- The `UI Refresh v3` implementation is in place: classroom noticeboard design, persisted whiteboard/chalkboard themes and accents, and an interactive gallery disc with list mode.
- The style blend is implemented. Automated tests, responsive overflow checks, theme persistence, and cached offline startup pass; the required 390px screenshot matrix is not tested because the integrated browser resets its capture viewport.
- Firefox, assistive-technology, and GitHub Pages subpath QA remain incomplete; see the checklist and do not treat untested items as passed.
- Stage 9 bonus features were not a prerequisite for the core implementation and remain partial or unimplemented.
- Before publishing, replace demo class data, run the latest schema SQL, verify RLS, and optionally configure the WhatsApp destination. Old gate code is removed from the current tree. Earlier commits may still contain its hash; Git history was not rewritten.

## GitHub repository readiness

- At repository-preparation time, the files and docs were ready and subpath/offline checks passed on the pre-Supabase version. Current Phase 6 browser/subpath/offline status is tracked separately below. No GitHub account, remote, push, or deployment action was performed.
- Audit approval was received before preparing the first local commit. The user selected no license (all rights reserved); no `LICENSE` file is included. No files were deleted during the repository-preparation task; the later Auth migration intentionally removed the old gate files.
- The initial worktree already contained uncommitted style-blend and hero-clock changes. Those existing changes were preserved and included in the requested local preparation commit; no UI behavior was changed as part of repository hygiene.
- No Next.js scaffold artifacts remain except `package.json`, which contains only the no-dependency `node --test` script and ES-module metadata. No `package-lock.json`, `node_modules`, `.next`, `app/`, `public/`, TypeScript or ESLint configuration was present. No tracked generated/junk files or tracked files larger than 1 MiB were found.
- `.gitignore` covers dependency/build output, local environment/secrets, logs, OS/editor files, temporary files, backups, exports, and local JSON. Essential app, data, tests, tools, documentation, and `.github` files are not ignored. `.gitattributes` normalizes text and marks WOFF2 and image formats binary; `.nojekyll`, the Indonesian bug template, and `SECURITY.md` were added. No Pages workflow was created.
- `git check-ignore -v` confirmed ignores for `node_modules/`, `.next/`, environment files, logs, OS files, and `*.local.json`; `.env.example` and all required runtime/deployment paths remain unignored.
- Privacy review at repository-preparation time found no plaintext password, plaintext Owner code, API key, or access token. The obsolete gate source and generator are deleted from the current tree; its old hash may remain in public Git history.
- Numeric scan candidates were false positives: SVG path coordinates in `assets/js/icons.js` lines 5, 7, 10, and 12-14; sample timestamps in `data/default-data.json` lines 24, 38, 52, and 66; dummy phone-number inputs in `tests/reports.test.js` lines 6-7 and 15-16 and `tests/utils.test.js` lines 8-13. `data/default-data.json` contains sample-labeled class/schedule/student data only; the WhatsApp destination is empty. The report test contains the fictional first name `Rani`; no real full student name was identified.
- README now describes the Supabase-backed app, Owner Auth, shared data, offline limits, and incomplete remote backup coverage. The approved target and security boundaries are in `PROJECT_SPEC.md` and `supabase/README_SETUP.md`.
- Historical validation before Supabase Auth: `node --test` passed (30 tests, 0 failures). The subpath simulation at `/class-website/` loaded the pre-integration app, navigated to Jadwal and Momen, loaded assets and service-worker scope under the subpath, and reloaded/navigated among views after stopping the server using cache `ruang-kelas-shell-v12`. This does not validate current Supabase integration.
- Remaining manual step: create an empty GitHub repository, then set `origin`, push `main`, and enable Pages from `main` / root using the README commands. Actual GitHub deployment was not tested.

## Style Blend

### Baseline and safety

- There is no usable original-UI commit. Git history before the style task contained only `7a8027b` (`Initial commit from Create Next App`), the disposable Next.js scaffold.
- VS Code Local History was searched for this workspace's `index.html` and `assets/css/styles.css`; no matching snapshots were available. VS Code Timeline therefore has no earlier project commit to compare.
- Original reference: the user's written screenshot description: rounded `rk` brand/header, `Local changes` pill, round theme control, an eyebrow-led hero with a date line, weekly schedule card, and five-item bottom navigation with a filled active pill.
- Because the eraser theme control and current light/dark system are protected, keep the current eraser switch instead of restoring the round theme button. Keep the current header content, spacing, five destinations, and tap gesture.
- Pre-style work was preserved as commit `22fb3f2` (`WIP before style blend`) and tag `backup-before-style-blend`.

### Screen comparison and decisions

| Screen | Original reference | Current before blend | Decision |
|---|---|---|---|
| Beranda | Header; rounded, prominent hero with `Papan kabar kelas`, title, short copy, and date/dot; `Lihat jadwal sepekan` card with `Semua jadwal`; five-item bottom nav with a filled active pill. | Content-first Refresh v3 view places deadlines before the schedule and announcement; theme is the protected eraser switch. | Restore the described hero-first order, weekly schedule card and original schedule microcopy; retain current data-backed schedule, responsive spacing, focus states, and protected theme control. Add a restrained classic heading, eyebrow, divider, badge, and inner-rule layer. |
| Kelas | No older screenshot/history available. | Current tabbed class information and record-card flow. | Keep current structure and flow as the agreed baseline; retain touch targets, contrast and focus; add only shared classic typography/dividers/stamps and light surface details. |
| Jadwal | No older screenshot/history available. | Current selected-day/full-week flow with schedule cards. | Keep current structure and flow; retain readable period rows and state labels; add only shared classic styles and thin ledger separators. |
| Momen | No older screenshot/history available. | Current draggable Piringan, Daftar, filters, viewer, and Owner actions. | Protected: keep disc, list, math, viewer and behavior exactly; apply only shared non-behavioral typography, border and divider styles. |
| Lainnya | No older screenshot/history available. | Current wheel, report and suggestion card/form arrangement. | Keep current structure and flow; retain current accessibility and spacing; add only shared classic heading, eyebrow and key-card treatments. |
| Modals/forms | No older screenshot/history available. | Current shared dialog, validation, and form layout. | Keep current structure, controls and interaction; body text, buttons, form controls and numbers stay sans-serif. Apply only shared heading and ornamental treatments. |
| Dashboard | No older screenshot/history available. | Current tabs, panel, card and form arrangement. | Keep current structure and flow; preserve Owner access checks and all data controls; apply only shared classic typography, divider, stamp and key-card treatments. |

### Blend recipe

- Base: original hero-first Beranda and navigation arrangement described above; for views without archived references, preserve the current screen structure as explicitly approved by the user.
- Kept from current: responsive spacing, text and UI contrast, visible focus, 44px controls, shared SVG icons, working schedule state labels, all existing feature flows, and the protected eraser theme/gallery systems. The protected Piringan/Daftar controls remain 40px by user approval.
- Classic layer (about 20%): one self-hosted serif for headings only, small-caps eyebrows, thin inset key-card borders, CSS-only centered-diamond section rules, text-bearing stamp badges, subtle light-only paper grain, and thin ruled PR/kisi-kisi rows.
- Source Serif 4 is self-hosted at `assets/fonts/source-serif-4-latin.woff2`; its OFL license is included in `assets/fonts/OFL.txt`. Georgia/Times/serif remains the load-failure fallback.

### Applied style and retained current behavior

| Screen | Kept from current | Classic layer applied |
|---|---|---|
| Beranda | Protected theme switch, current content/data sources, schedule state, navigation gesture, focus and spacing; restored the described hero-first order and schedule microcopy. | Serif hero/section headings, eyebrow, diamond dividers, inset hero/schedule/announcement borders, status stamps, and ruled PR/ulangan rows. |
| Kelas | Existing tabs, information/record flow, SVG icons, controls, and responsive spacing. | Shared serif headings, eyebrow and section divider; status stamps and thin ledger rows for PR/kisi-kisi records. |
| Jadwal | Existing day selection, full-week view, period state and navigation. | Shared serif headings, eyebrow/divider, inset schedule card, and stamped status labels. |
| Momen | Protected draggable disc, Daftar view, viewer, filters, and Owner actions; protected 40px mode buttons retained as approved. | Shared headings, eyebrow and divider only; no gallery behavior or math changed. |
| Lainnya | Existing wheel, report, suggestion, and form flows. | Shared serif headings, eyebrow and divider; form controls and copy remain sans-serif. |
| Modals/forms | Existing dialogs, validation, focus, and interaction. | Serif dialog heading and eyebrow; form controls, buttons, body text, and numbers remain sans-serif. |
| Dashboard | Existing session gate, tabs, data controls, and layout. | Shared serif headings, eyebrow/divider and existing status-stamp treatment where records use it. |

### Beranda hero follow-up

- Added four static CSS concentric rings at the lower-right of the hero. The hero clips the pseudo-element to its rounded corners; theme-derived ring tokens use 8% text color in light mode and 10% in dark mode. Rings sit behind the content and do not intercept pointer events.
- Restored a semantic `<time>` line with a decorative dot. `formatLiveDateTime()` uses `id-ID`, explicit `Asia/Jakarta`, and 24-hour time; the machine-readable value includes the `+07:00` offset. A UTC+7 fallback prevents unsupported Intl timezone formatting from showing an invalid date.
- The clock schedules one timeout for the next minute boundary, recalculates on each tick, pauses when the page is hidden, refreshes on visibility/focus/pageshow, and clears its timer when the home view is rerendered or removed.
- Hero screenshots were visually inspected at 390px in light and dark mode. Responsive checks at 360, 390, 430, 768, and 1280px in both themes confirmed the rings render, the clock stays within the card, and the document has no horizontal overflow. Full multi-screen screenshot matrix remains not tested.

## Implemented

- Single `index.html`, responsive Bahasa Indonesia interface, in-page navigation, class information, schedule, gallery, spin wheel, reports, suggestions, and Dashboard.
- Original-reference hero-first home with clipped concentric rings and a live WIB clock, shared inline SVG icons, early theme bootstrap, accessible eraser switch, and self-hosted Source Serif 4 for headings only.
- Whiteboard/chalkboard design tokens with red/yellow/blue/green accents; persisted mode and accent; contrast tests for all theme/accent combinations.
- Interactive photo disc with bounded nearby rendering, drag/inertia/snap, tap and keyboard controls, persisted filters and disc/list mode, plus an accessible list fallback.
- Shared school-classic CSS for eyebrows, diamond dividers, thin inset key-card borders, text-bearing stamp badges, light-only 1.2% paper grain, and thin ledger separators.
- Pre-migration local browser storage and IndexedDB remain for per-device preferences, cache, and older data that is deliberately not auto-migrated. Shared features use Supabase as documented at the top of this handoff.
- Versioned service worker, offline shell, manifest, and PWA icons.
- Indonesian run, deployment, privacy, backup, publishing, and troubleshooting guidance in `README.md`.
- Focused native Node tests in `tests/`.

Current runtime status: Supabase Auth, shared data, Storage, and Realtime code is integrated. Live Owner/RLS/Storage/two-client Realtime checks are **NOT TESTED**.

## Historical validation evidence (before Supabase Auth integration)

The browser and interaction evidence below was collected before the Phase 3-6 integration. It does not validate the current Supabase-backed flows; use the current checklist below for those.

- `npm test` (`node --test`): 30 tests passed, 0 failed; includes the protected contrast and disc-math suites, classic-token checks, and five injected-time live-clock cases.
- `node --check` passed for the app, utilities, service worker, gallery/disc/storage code, and both classic-token and hero-clock tests.
- Contrast tests measured text at 4.70:1 or higher, with the lowest text contrast 4.70:1 and lowest tested UI border contrast 3.36:1 across both themes and all four accents.
- `data/default-data.json` parsed successfully; repository check found exactly one HTML file.
- Chromium interaction checks covered all public views and all ten Dashboard sections at 360, 375, 390, 430, 768, and 1280 CSS pixels: no horizontal overflow.
- Chromium checks exercised suggestion submission and local inbox actions; Dashboard unlock with a temporary test-only hash; record create/edit/soft-delete/restore; schedule add/reorder; gallery upload/delete/restore/view/filter/like; local report submission; valid and invalid backup imports; and all three reset paths.
- The temporary test hash and test data from the earlier browser QA were removed during the Auth replacement. The old gate hash may remain in earlier Git commits; history has not been rewritten.
- Theme persistence after refresh, Dashboard session persistence/locking, dialog Escape behavior, and focus return were observed.
- Style-blend Chromium checks: Beranda, Kelas, Jadwal, Momen, Lainnya, and Dashboard at 360, 390, 430, 768, and 1280px had no document/body horizontal overflow in both themes. Visible keyboard focus used a 3px outline.
- Touch-target audit at 360, 390, and 430px found no visible targets below 44px except the two protected Piringan/Daftar controls at 40px, retained by explicit user approval.
- Theme switch smoke test confirmed `role="switch"`, light/dark toggle, `aria-checked` update, and persistence after reload; the original dark setting was restored after testing. No theme token values or `tests/contrast.test.js` were changed.
- Service worker v12 controlled the page and its cache contained the self-hosted font and shell assets. After stopping the local server, reload still served the cached hero, clock, and ring styles; the cache contained `ruang-kelas-shell-v12`.
- Firefox and actual GitHub Pages repository-subpath hosting were not tested.
- The required full 390px screenshot matrix was attempted, but the integrated browser reset the capture surface to 288x624 despite a 390x844 viewport request; the resulting cropped images were discarded. **Full multi-screen visual screenshot checks: NOT TESTED.** Beranda hero-only screenshots at 390px in both themes were captured and visually checked. To complete the full matrix, use local responsive design mode at 390x844 to capture Beranda, Kelas, Jadwal, Momen, Lainnya, a modal, and Dashboard in both themes. Also inspect those screens at 360, 430, tablet, and desktop.

## Current Phase 6 QA checklist

| QA item | Status | Evidence |
|---|---|---|
| Node test suite, including contrast and disc math | PASS | `node --test`: 40 passed, 0 failed |
| JavaScript syntax across `assets/js/*.js` and `sw.js` | PASS | `node --check` passed for all JavaScript files under `assets/js` and `sw.js` |
| Whitespace / patch validation | PASS | `git diff --check` returned no errors |
| Local app startup and public view navigation | PASS | Local static server; visited Beranda, Kelas, Jadwal, Momen, and Lainnya |
| Owner entry gate without credentials | PASS | Five logo taps opened the Owner login dialog; no credentials were entered |
| Online browser console and service-worker v17 | PASS | v17 controlled the page; public views loaded with no captured errors or warnings and only the v17 shell cache remained |
| Offline Realtime shutdown and cached view | PASS | Browser offline emulation displayed the offline notice and cached class content with no console errors; returning online restored network status |
| Current GitHub Pages repository-subpath deployment | NOT TESTED | Older subpath simulation predates the Auth/Storage/Realtime integration |
| Live Owner login, RLS writes, inbox, Storage, conflict, and two-client Realtime | NOT TESTED | No Owner credentials or live Supabase writes were used; latest Realtime publication SQL has not been applied |
| Live report attachment and gallery upload/delete | NOT TESTED | No live Storage operation was attempted |

## Historical QA baseline (pre-Supabase integration)

Statuses below reflect browser checks actually run before Supabase Auth and shared-storage integration; PASS entries are not current integration evidence.

| QA item | Status | Evidence |
|---|---|---|
| Public navigation and in-page view switching | PASS | Chromium navigation across Beranda, Kelas, Jadwal, Momen, and Lainnya |
| Dialog Escape, focus entry/return, and confirmation cancellation | PASS | Dashboard/editor dialogs; Escape closed and cancelled safely; explicit close returned focus |
| Supabase Owner login/logout and non-Owner denial | NOT TESTED | Auth logic and membership checks have unit tests; no live Owner or non-Owner session was used |
| Repeated-failure login delay | PASS (unit) | Owner-auth test confirms retry throttling; live UI behavior not tested |
| Class record create/edit/soft-delete/restore | PASS | Homework record completed the full flow and remained after refresh |
| Custom-section CRUD | NOT TESTED | No browser flow run |
| Schedule logic | PASS | `node --test`: fixed WIB boundary, weekday/weekend, invalid/empty, and period-highlighting cases passed |
| Schedule add and reorder | PASS | Added a Monday period and moved it within its day |
| Schedule edit/delete/restore and settings changes beyond WhatsApp | NOT TESTED | No complete browser flow run |
| Gallery disc math, wrap/snap/inertia and bounded visible items | PASS | `node --test tests/disc-math.test.js`: deterministic mapping, wrapping, snapping, bounded item set, and inertia tests |
| Gallery disc keyboard/tap/viewer, list mode, filtering, thumbnail loading, and drag | PASS | Chromium test-only gallery: keyboard and side selection changed the front item, front tap opened viewer, list showed all cards, query filtered, and drag snapped without opening the viewer |
| Gallery object-URL lifecycle and missing-blob placeholder | NOT TESTED | Code paths are implemented but not instrumented in browser QA |
| Gallery upload, soft-delete/restore, viewer, filter, and like | NOT TESTED | Cloud Storage UI is wired; no live upload or delete was attempted |
| Gallery persistence after refresh and storage usage estimate | NOT TESTED | Estimate code is wired; live bucket listing and refresh persistence not tested |
| Spin-wheel result and winner dialog | PASS | Chromium spin selected a listed student; selection and landing-angle unit tests passed |
| Report validation, exact message format, and WhatsApp URL encoding | PASS | `node --test` report cases passed |
| Report can submit without WhatsApp number; WhatsApp handoff stays optional | NOT TESTED | UI and anon-table wiring updated; no live submission attempted |
| External WhatsApp handoff, attachment downloads, and cooldown | NOT TESTED | No external handoff or attachment flow run |
| Suggestion submit and shared inbox read/reply/archive/restore | NOT TESTED | UI and Supabase table operations are wired; no live submission/session used |
| Suggestion copy/download/WhatsApp actions | NOT TESTED | No browser flow run |
| JSON backup download | PASS | Browser captured the download link and parsed schema version 1 with 14 collections |
| Valid backup import | PASS | Export package passed preview and import; source changed to `Imported backup` |
| Invalid JSON import preserves existing data | PASS | Browser displayed the Indonesian error and existing suggestion count was unchanged |
| Older-schema migration and storage rollback | PASS | Covered by storage unit tests |
| Reset data demo | PASS | Browser reset completed |
| Hapus semua data aplikasi | PASS | Browser reset cleared local collections |
| Pulihkan data publikasi | PASS | Browser restored published homework and `Published` source |
| Collection and theme persistence after refresh | PASS | Homework edit persisted; dark theme remained after refresh |
| Theme contrast for light/dark and red/yellow/blue/green accents | PASS | `node --test tests/contrast.test.js`; text >= 4.70:1, borders >= 3.36:1 |
| Classic component-token contrast | PASS | `node --test tests/classic-tokens.test.js`; ornament and stamp borders meet 3:1 against both surfaces in both themes and all accents; protected contrast test unchanged |
| Hero ring tokens, clipping, and layer order | PASS | `node --test tests/classic-tokens.test.js` and browser inspection at 360/390/430/768/1280px in both themes |
| Live WIB clock formatting, timezone conversion, midnight rollover, and fallback | PASS | Five injected-time cases in `tests/hero-clock.test.js`; browser clock advanced at the next minute boundary |
| Clock cleanup across repeated view changes | PASS | Switched between Momen and Beranda three times; each return had exactly one connected clock element |
| Hidden/visible clock lifecycle | PASS | Simulated `visibilitychange` with hidden state; the timestamp paused, then refreshed immediately on visible state |
| Actual device wake/system-clock jump | NOT TESTED | Focus/pageshow handlers and timeout recalculation are implemented; no physical sleep or system-clock change was simulated |
| Theme switch tap and persistence | PASS | Chromium toggled to dark; `aria-checked` updated and dark theme persisted after reload |
| Theme switch drag/keyboard, system preference, and accent choices | PASS | Chromium emulated system dark preference; tap, Space, and drag toggled the theme and updated switch state |
| Service-worker registration and activation | NOT TESTED | Cache bumped to v15 with Owner Auth module; browser validation remains pending |
| Offline shell and cached shared-data read | NOT TESTED | Phase 2 smoke test showed cached content and an offline notice, but the reload automation did not return |
| Offline uncached-data error state | NOT TESTED | The cached app shell was tested; no uncached-data request was exercised offline |
| GitHub Pages repository-subpath hosting | NOT TESTED | Relative paths are implemented, but no subpath deployment was simulated |
| Style-blend responsive overflow at 360/390/430/tablet/desktop | PASS | Beranda, Kelas, Jadwal, Momen, Lainnya, and unlocked Dashboard at 360, 390, 430, 768, and 1280 CSS px; document/body width did not exceed viewport in both themes |
| 44px targets and visible focus | PASS | All scanned targets were at least 44px except the explicitly approved protected gallery mode buttons (40px); keyboard focus outline was 3px |
| Style-blend screenshot matrix at 390px in both themes | NOT TESTED | The browser capture surface reset to 288x624; invalid captures were discarded. Use local responsive design mode at 390x844 to capture the seven required screens per theme. |
| Chromium refreshed UI and console/page errors | NOT TESTED | Earlier Phase 2 load had no captured errors; Phase 3-6 changes and cache v15 need a fresh browser pass |
| Refreshed Owner-code modal and wheel surface | PASS | At 390px, the hidden gesture opened the Owner dialog and Escape closed it; wheel canvas rendered at 300px square without horizontal overflow |
| Wheel visual review in both themes | NOT TESTED | No valid viewport-matched wheel screenshots were captured |
| Firefox | NOT TESTED | Firefox was not available in the active browser session |
| Console and page errors | PASS | No console or page errors in the final Chromium smoke test |
| Reduced-motion preference and screen reader | NOT TESTED | Reduced-motion CSS/controller paths exist; no assistive-technology check was run |
| Automated color-contrast audit | PASS | Token-based tests cover text, status, accent, and border pairs for both themes and all accents |

## Bonus status (Stage 9)

| Bonus | Status | Notes |
|---|---|---|
| Homework checklist and progress | Not implemented | — |
| Birthdays and celebration | Not implemented | — |
| Piket roster | Not implemented | — |
| Install prompt and new-content dots | Partial | PWA installation guidance and manifest/service worker exist; no custom install prompt or content dots |
| Theme accents and persisted light/dark theme | Completed | Light/dark/system bootstrap, eraser switch, four accents, and contrast tests; tap/persistence browser check passed |

## Go-live checklist

1. Run the latest `supabase/schema.sql`; create the Owner user, register its UUID in `owners`, and disable public sign-ups.
2. Verify anon/Owner/non-Owner RLS cases using `tests/rls-checklist.md`.
3. Replace sample content and configure the WhatsApp destination only if the class approves it.
4. Back up Supabase database and Storage separately; website JSON export is not a full remote backup/restore.
5. Test Owner login, report/suggestion submission, gallery/attachment uploads, two-client Realtime, offline behavior, and repository-subpath deployment before publishing.

## Run and test

```powershell
python -m http.server 8080
npm test
```
