# Offline editing and synchronization

## User experience

Open a group online, open its settings, and wait for **“Auf diesem Gerät offline
bereit”** under **Offline-Verfügbarkeit**. A disappearing preparation pill alone
is not a readiness guarantee. The settings card remains accessible offline and
with pending mutations; it shows the local snapshot time/expense count, pending
mutations for this group, checked pages/assets, missing files, and active worker
version. “Offline-Stand prüfen” rechecks the actual cache even without a network;
“Offline-Dateien laden” refreshes the snapshot and retries downloads online.
Its complete expense data, participants and categories are stored in IndexedDB;
the service worker saves the main group pages and their application bundles.
The same expense drawer works offline: create, edit, delete and reimbursements.
Balances, totals, filters and charts are calculated from the local state including
pending changes. The activity log is the last downloaded server history (500 entries).

A quiet status pill shows offline state, pending count, synchronization, success,
and recoverable errors. Synchronization runs on reconnect, foregrounding the app,
and every 30 seconds while visible. On iOS the app must be open; no promise of
background delivery after closing an installed PWA is made.

Group creation/settings, uploads, receipt/category AI, location lookup and live
currency rates require the network. Existing document metadata is retained, but
attachment binaries are not downloaded for offline use. An unvisited group cannot
be opened offline. Browser/OS storage eviction or clearing site data can remove
unsynced changes: persistent storage is requested where supported; blocked
changes can be downloaded as a JSON backup. That export is a recovery artifact,
not an implemented self-service import format.

## Consistency and conflicts

1. A save is acknowledged by the UI only after an IndexedDB transaction commits.
   Storage failures keep the form open and show an error. Network failures do not
   discard or renumber the operation.
2. Each operation has a stable UUID; new expenses have client-assigned IDs.
   Local edits are projected over the server snapshot. Multiple offline edits of
   one expense form a version chain, including create → edit → delete.
3. Every expense has an opaque `syncVersion`, changed by legacy online writes too.
   Editing captures the version when the form opens, not when it is submitted.
4. The server compares the expected version and changes expense, activity and
   durable receipt in one serializable PostgreSQL transaction. Retrying an
   acknowledged operation returns success without repeating writes or pushes.
   Reusing an ID with different content is rejected. Receipts are not expired:
   very late retries must not recreate deleted expenses.
5. Changed/deleted online expenses open a comparison dialog. “Online-Stand
   behalten” discards pending edits of that expense only; “Meine Änderung
   übernehmen” approves only the exact displayed server version. A newer edit
   between dialog and confirmation triggers another conflict. Restoring an
   online-deleted expense requires that same explicit choice. Defer keeps data
   and the queue intact. Conflicts pause the FIFO queue until resolved.
6. Removed groups/participants or changed group currency block the affected
   operation with a recoverable error and export option; no silent reassignment
   or currency conversion takes place.

Web Locks serialize synchronization across tabs. IndexedDB read/write transactions
serialize journal edits; server receipts make duplicate attempts harmless on
browsers without Web Locks. BroadcastChannel invalidates other tabs' query caches.
Snapshots started before a local acknowledgement cannot replace the newer base.

## Service worker and updates

Only same-origin static assets and HTML documents are cached. API calls, mutations,
server actions and RSC responses are never cached. Offline tab navigation uses
prewarmed HTML documents; expense drawers remain client-side. Unknown pages get
an honest offline fallback, not a cached page from another group.

New workers wait for an explicit update, without forcibly reloading open forms.
Update controls refuse while offline or while the durable queue is nonempty.
IndexedDB is independent of deployment-versioned asset caches and never cleared
by the update flow. Existing Push notification handlers are retained.

Readiness protocol v2 talks to the **controlling** worker, not an arbitrary active
or waiting registration. Older nonresponding workers are reported as an update
requirement, never as ready. Each cache check parses the saved HTML and verifies
that its referenced same-origin bundles/styles/preloaded fonts/images still
exist. Non-HTML responses, failed downloads and timeouts cannot report success.
Preparation includes `/`, `/groups`, the group alias and all six group sections;
redirected documents are saved as plain HTML responses for WebKit compatibility.
Card-body navigation and tab changes use full cached documents offline rather
than uncached Next RSC requests. Activity expense links open the local drawer.

Tests must rely on application-owned preparation, not send WARM_URLS directly.
Regression scenarios include root/PWA launch, card-body navigation, settings with
queued offline edits, evicted assets with repair, and a legacy installed worker
followed by an explicit update. These supplement mutation/conflict/date tests.

## Date-only bug

The date picker returns local midnight; directly serializing that instant shifted
positive-offset zones to the previous UTC day before PostgreSQL `DATE` storage.
`fromCalendarDate` encodes the chosen local year/month/day as UTC midnight;
`toCalendarDate` converts stored day components for display/picking. Grouping also
uses these calendar components. Existing dates are not rewritten because the
originally intended day cannot be inferred safely.

## Verification and deployment

`playwright.offline.config.ts` targets **127.0.0.1:3133**, never production :3033.
It uses a separate PostgreSQL database `spliit_offline_test` on loopback :55439,
synthetic groups only, and a production Next.js build. Run:

```
npx tsc --noEmit
npx playwright test --config playwright.offline.config.ts
```

Deploy requires the additive `20260918050000_offline_sync` migration. Keep a
pre-deploy database backup and prior image tag. Code rollback can retain the
additive columns/table, but pending browser operations require the sync-capable
server to return; never roll back by deleting local browser data.

Upstream review, 2026-09-18: https://github.com/spliit-app/spliit/releases/tag/1.26.0
contains recent validation/split-preview fixes; 1.25.0 adds monthly spending charts.
1.23.0 includes offline _assets_, not durable expense mutations or conflict sync:
https://github.com/spliit-app/spliit/pull/587 . This change does not merge unrelated
upstream releases or replace the fork's custom UI/features.
