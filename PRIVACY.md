# Privacy

Sabr has no ads, analytics, crash reporting or tracking, and no account unless you choose an online backup. Your medicines,
times, doses and history are stored only in the app's database on your phone.

Anything that could share or show what you take is **off until you turn it on** in
Settings > Privacy.

## Fully local

Settings > Privacy > **Fully local** is one switch that keeps Sabr off the internet
entirely, whatever else is turned on: online medicine search, server backup and sharing,
following someone, Google Drive backups and the watch tile all pause. Every network
request in the app checks it first ([`src/privacy.ts`](src/privacy.ts)), and it counts as
on if settings can't be read. It belongs to the phone, so restoring a backup doesn't change it.

## What leaves the phone

Out of the box, nothing. With **Online medicine search** turned on, two things go online,
both to free US government services, and both send a medicine or ingredient name only. Nothing identifies you, and no cookies, tokens or IDs
are sent. Like any website, the service can see the phone's internet address.

| When | Sent to | What is sent |
| --- | --- | --- |
| First medicine search, then once a month | US National Library of Medicine (RxNav, `rxnav.nlm.nih.gov`) | Nothing but the request. The full list of medicine names is downloaded and searched on the phone, so what you type is never sent. |
| You pick a medicine from search | RxNav | That medicine's name (or the ingredient of a built-in UAE brand), to fill in ingredients and strengths. |
| You open the interaction check | US FDA (openFDA, `api.fda.gov`) | The active ingredient of each medicine checked. Labels are saved on the phone for a month. |

All requests are made from one file, [`src/drugs/online.ts`](src/drugs/online.ts).

## Online medicine search (off by default)

While it is off, the app sends nothing. Search and the interaction check use only the
built-in list and anything already saved on the phone. Every request goes through one
check of this setting, which also counts as off if settings can't be read. Settings >
Privacy can also delete the downloaded names and labels.

## Sync and sharing (off by default)

Settings > Sync and sharing connects the app to a [PocketBase](https://pocketbase.io)
server: either the **Sabr server** that Sabr's developer runs
(`sabr-sync.danishali.dev`, how it's run: [server/SABR-SERVER.md](server/SABR-SERVER.md)),
or one **you run yourself** (setup: [server/README.md](server/README.md)). While
**Back up and share online** is off, none of this code talks to any network.

Everything below is encrypted on the phone before it leaves (XSalsa20-Poly1305), so the
server stores data it can't read, including the Sabr server. Your password never leaves
the phone either: it's stretched on the phone (PBKDF2-SHA512, 200,000 rounds) into two
codes. One signs you in (the server stores a hash of it); the other stays on the phone and
locks your backup's key.

| When | Sent to | What is sent |
| --- | --- | --- |
| You sign in or create an account | The server | Your email and the sign-in code made from your password (the server stores a hash). Accounts made on your own server before 0.10 sent the password itself. |
| **Keep an encrypted backup** is on, a couple of minutes after changes | The server | Your medicines, history and notes, encrypted with a random key. That key goes along locked with the code from your password, which never leaves the phone; your recovery key opens it too. Photos are not included. |
| **Let someone see my doses** is on, a few seconds after changes | Your server | Today's and yesterday's doses, whether each was taken, and the last 7 days' counts, encrypted with a key that exists only in the share code you hand out. Medicine names and doses are replaced with "Medicine A", "Medicine B" unless you turn on **Include medicine names**. |
| You follow someone with their share code | Their server | A request for their encrypted status, a few times a day and when you open the app. No account is needed and nothing about you is sent. |

Server sign-in, encryption keys and the codes you follow are kept in the Android keystore,
not in the app database or its exports. **Stop old codes working** deletes your shared
record and makes a new key. Turning the server off signs you out, takes down your shared
status, and can delete your backup from the server. All sync requests are made from
[`src/sync/pocketbase.ts`](src/sync/pocketbase.ts).

## Watch tile (off by default)

Reminders reach a paired watch the way any notification does. Settings > Smartwatch >
**Watch tile** also sends today's summary to the Sabr watch app, so its tile can show your
progress ring, the next dose time and Taken / Snooze buttons. While it's off, nothing is sent.

| When | Sent to | What is sent |
| --- | --- | --- |
| A dose, medicine or setting changes, the app opens, or the watch asks | Your paired watch | Today's date, how many doses are due and done, each dose's time, how much it is (like "2 tablets"), whether it's taken, skipped or still open and when it was taken, any snooze, and your streak. Medicine names only if **Show medicine names in reminders** is on. |
| You press Taken or Snooze on the tile | Your phone | The day and time the tile showed. |

This uses Google's Wear OS data layer (part of Google Play services). It goes over the
Bluetooth link between phone and watch; when Bluetooth isn't available, Google routes it through
its servers, end-to-end encrypted ([Google's description](https://developer.android.com/training/wearables/data/overview)).
Only the Sabr app on your own phone and watch, signed with the same key, can read it. Turning the tile
off deletes the summary from the watch. All of it is in [`src/wear/sync.ts`](src/wear/sync.ts)
and the [`wear/`](wear) watch app.

## Health data (off by default)

Settings > Watch, widgets and health > Health data can read your steps, sleep (with bedtime, wake time and sleep stages), heart rate and resting heart rate from
**Health Connect**, the place on the phone where Samsung Health (and a Galaxy Watch through it),
Google Fit and most watch apps share them. This all happens on the phone: nothing goes online.

- Nothing is read until you turn it on, and Health Connect's own screen lets you pick which of
  the four Sabr may read. You can take access back in Health Connect at any time.
- Sabr only reads. It never writes, changes or deletes anything in your health data.
- What it reads is kept in memory for a few minutes to show the Health data page and Patterns,
  then forgotten. It isn't saved in Sabr's database, so it's never in backups, doctor reports,
  sync or anything shared.

All of it is in [`src/health/connect.ts`](src/health/connect.ts) and
[`modules/sabr-health`](modules/sabr-health).

## Health profile and features

- Setup asks which conditions you have (for example diabetes or high blood pressure) and roughly how many medicines you take. All of it is optional, and you can change or clear it in Settings > Features and health profile.
- Your health profile is kept in Sabr's database on this phone and in your backups, which are encrypted. It is never part of sharing with family or caregivers, never shown in reminders, never put in a doctor report, and never sent anywhere.
- Sabr uses it only on the phone, to suggest which features to turn on. Every feature apart from the core and the rewards starts off.

## Blood sugar and blood pressure readings

- Readings you type in are kept in Sabr's database on this phone and in your backups, which are encrypted. They are never part of sharing with family or caregivers and never sent anywhere.
- Reminders for checks say "Time for your 7:00 check", not what is checked, unless you turned on medicine names.
- Checks stay off the home screen widgets and the watch.
- A doctor report includes readings only when you tick "Include my readings" for that report.

## Other things to know

- **Phone backups:** Android's automatic Google cloud backup is turned off for this app, so
  the database isn't copied to Google Drive. Use Settings > Backup and restore instead. By
  default the app hands the file to the place you choose (Google Drive, Files...) through
  Android's share sheet, or writes it to a folder you picked.
- **Google Drive (off by default):** if you choose **Sign in with Google** in Backup and
  restore, Sabr asks only for the `drive.file` permission, which lets it see and change only
  the files it made (in a "Sabr backups" folder), nothing else in your Drive. Backups sent
  there, on demand or automatically, are always password-locked on the phone first, so Google
  stores them but can't read them. Google learns that you use Sabr. **Disconnect** signs out
  and takes back the permission. All Drive requests are in [`src/backup/drive.ts`](src/backup/drive.ts). With a password, the file is
  locked on the phone (PBKDF2-SHA512 key from the password, then XSalsa20-Poly1305) and can't be
  read without it (200,000 rounds in the Android app). The password for automatic backups is
  kept in the phone's secure storage.
  Without a password the file is plain JSON, and the app warns you before saving it.
- **App lock:** uses the phone's own fingerprint, face or screen lock check. Sabr never sees
  your fingerprint or PIN. **Hide in recent apps** also blocks screenshots of the app.
- **Machines (CPAP, nebulizer, oxygen):** check-ins, night details (hours, AHI, mask fit) and
  part dates are typed in by you and stay in the app's database. Sabr doesn't connect to the
  machine, its SD card or the maker's cloud. Machines are never included in what you share
  with people who follow you. Reminders say "Time for your 10:30 PM check-in" and "A part is
  due for a change" unless **Show medicine names in reminders** is on.
- **Patterns, reviews and timing suggestions** are worked out on the phone from data already on it.
- **Notifications:** by default reminders and refill alerts don't name your medicines
  ("Time for your 8:00 dose, 2 medicines to take"), on the lock screen and on a paired watch.
  With **Show medicine names in reminders** on, they do. Reminders are marked private, so
  if your phone hides sensitive notification content on the lock screen, the text is hidden
  there and shown once unlocked. They are local notifications; no push service is used.
- **Keyboard:** your phone's keyboard app can see what you type in any app. Gboard and
  Samsung Keyboard have their own settings for this.
- **Photos and box scans:** pill photos stay in the app's own storage. Reading a medicine
  box uses on-device text recognition; the photo is never uploaded.
- **Doctor report:** the PDF is made on the phone and only goes where you send it.
