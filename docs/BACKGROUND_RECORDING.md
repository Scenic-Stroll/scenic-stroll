# Design note: recording in the background (phone apps) — for later

Not built (pins phase 6, D56). Today recording only works while the app is open and in front: on the website the
browser stops sending positions when the screen locks (the app shows "Recording paused — tap to resume"), and the
phone apps behave the same way because they use foreground location only.

## What it would take on iOS and Android

- **Permissions:** "Allow all the time" (Android `ACCESS_BACKGROUND_LOCATION`, iOS "Always") on top of "While using".
  Both stores review this strictly: the app must explain why in the permission text and the store listing, and ask
  only when the person starts a recording — never at first launch.
- **Code:** `expo-location`'s `startLocationUpdatesAsync` with a task defined by `expo-task-manager`; on Android a
  foreground-service notification ("Scenic Stroll is recording your walk") must stay visible while it runs; on iOS
  `UIBackgroundModes: location` and the blue status-bar pill.
- **A setting**, off by default: Profile → "Keep recording when the screen is off", with the battery cost stated.
- **Same data path:** background fixes go through the same GPS filter (`shared/src/gps.ts`) and the same local
  recording store, so review, upload, pin collecting and distance points don't change.
- **Under-18s:** never (safety mode has no recording at all).
- **Not possible on the web:** browsers don't allow background location; the web keeps the "keep this page open" rule.

## Before building it

Test battery use on a mid-range Android phone for a 1-hour walk, and decide whether pins may be collected from
background fixes (the "never show pin text while walking" rule already holds: only a notification would appear).
