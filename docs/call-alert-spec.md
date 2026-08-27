# Incoming Call Alert — Feature Spec (Proposed)

**Status**: proposed, not yet assigned to an owner, not implemented.
**Proposed by**: 김민경 (2026-08-27)

## Summary

When an incoming call is detected on the device, look up the caller by phone number
against the user's contact list and, if a match is found, show a local push
notification containing that contact's most recent conversation summary.

## Why this doesn't fit the current 5-way split

This feature needs three things nobody currently owns end-to-end:

- Contact lookup by phone number → `features/contacts/` (강민구)
- Last conversation summary → `features/conversation/` (박재경)
- A native call-state listener + local notification dispatcher → doesn't belong to
  any existing feature folder

Per `CLAUDE.md` / `docs/architecture.md`, anything outside a single owner's folder
requires a separate branch and 2+ approvals — same rule as `shared/`. This document
is the design step before that PR; no code should land against it without that
review.

## User flow

1. Phone rings (Android `TelephonyManager`, `CALL_STATE_RINGING`).
2. App reads the incoming number.
3. App normalizes the number (strip spaces/dashes, `+82` prefix) and calls
   `GET /contacts/by-phone?phone=`.
   - No match (`404 NOT_FOUND`) → do nothing. No notification, no logging of the
     number.
   - Match → call `GET /conversations?person_id={id}&limit=1`.
4. App shows a local notification:
   - Title: `"{name}님에게 전화가 왔어요"`
   - Body: the latest conversation's `one_liner`, or `"아직 대화 기록이 없어요"` if
     the contact has none yet.
5. Tapping the notification opens `PersonDetailScreen` for that contact (see
   `ui-spec.md` §9).

## Data needed (new/changed API)

- **New**: `GET /contacts/by-phone` — owned by 강민구, `features/contacts/`.
- **Changed**: `GET /conversations?person_id=` gains an optional `limit` param and
  documented newest-first ordering — owned by 박재경, `features/conversation/`.

See `docs/api-spec.md` for the exact request/response shapes proposed for both.

No new *backend* cross-feature coupling is introduced: the two calls are made
sequentially from the client, the same way the client already reads contacts and
conversation data independently elsewhere (e.g. `PersonDetailScreen`).

## Where the code should live

Proposal: a new `features/call-alert/` folder, frontend-only (it has no backend
service of its own — it only calls the contacts and conversation endpoints above):

- A native call-state listener module (Android only)
- A local-notification dispatcher (`expo-notifications` — not yet a dependency,
  needs to be added to `frontend/package.json`)
- A phone-number normalization util

This folder doesn't cleanly belong to any current owner and needs a team decision
(see Open Questions), plus a dedicated branch/PR with 2+ approvals, before any code
is written.

## Platform constraints (must read before implementing)

- **Android only.** iOS restricts call-state access to CallKit extensions; this
  project is Android-first (`CLAUDE.md` tech stack), so this feature should
  explicitly no-op on iOS rather than attempt a partial port.
- **Requires a custom dev client, not Expo Go.** Reading call state needs the
  `READ_PHONE_STATE` permission and a native `BroadcastReceiver` for
  `TelephonyManager.ACTION_PHONE_STATE_CHANGED`, neither available in Expo Go. This
  needs either an Expo config plugin (`app.json` → `plugins`) that generates the
  receiver + manifest permission on prebuild, or a bare native module.
  `frontend/package.json` already has an `"android": "expo run:android"` script,
  confirming the project can run a prebuilt native project, so a config plugin is
  the lower-friction option.
- **Runtime permission + consent.** `READ_PHONE_STATE` is a dangerous Android
  permission — show an explicit consent screen before requesting it, explaining why,
  in the same spirit as the recording-consent notice already required in
  `ui-spec.md` §6.
- **Play Store policy (flag, not a blocker today).** Play restricts
  `READ_PHONE_STATE`/`READ_CALL_LOG` to apps that are the default Phone/SMS handler.
  Not an issue under `CLAUDE.md`'s "no deployment" scope (local Docker / sideloaded
  APK only), but worth knowing before anyone assumes this ships to Play later.
- **Local notification only.** Use `expo-notifications` for a device-local
  notification. There is no push backend in this project and none is needed here —
  consistent with the no-deployment scope.
- **Privacy.** Never notify or log anything for a number that doesn't match an
  existing contact. No partial matches, no "possible match" heuristics — exact
  normalized-number match only.

## Open questions for the team

1. **Who scaffolds `features/call-alert/`?** Suggest 강민구, by the same reasoning
   used to assign initial `shared/` setup to him in `features.md` (he owns the most
   screens / the contacts source of truth) — but this should be confirmed by the
   team, not decided unilaterally here.
2. **Debounce behavior**: fire the notification once on the first
   `CALL_STATE_RINGING` event, or update it if the call is still ringing after the
   API round-trip completes? This draft proposes fire-once, no retry.
3. **Mute/DND setting**: should this respect an in-app opt-out toggle? Not designed
   here — out of scope for this draft, worth a follow-up UI-spec addition if wanted.
