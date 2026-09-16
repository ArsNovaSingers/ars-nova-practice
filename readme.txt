=== Ars Nova Practice ===
Contributors: arsnovasingers
Tags: choir, practice, assignments, rehearsal
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Weekly practice assignments for the Ars Nova Singers Hub. Add-on for the Ars Nova Singers Portal plugin (1.40.0 or later).

== Description ==

**For singers** — "This Week's Assignments" on the Singers Hub becomes a week-by-week homework page:

* This week's tasks first, with "have ready by" and the director's note; earlier and upcoming weeks folded away.
* Each task: a Done tick, a Bad · Fair · Good · Great slider, the score/link buttons, and a **practice player**.
* The practice player plays every attached track together. Each track has Mute, Volume and Ear (left / both / right), so a singer can keep the backing track in both ears and their own part in one ear, or mute their part and sing it alone.
* A task can carry one track per voice part; each singer gets their own part's track.
* Optional **recording test**: record a take over the music with wired headphones (the page records the microphone only), hear it back with or without the music, and download it. Nothing is uploaded in this version. Off / staff only / everyone, under Practice → Settings (default: staff only).

**For Tom and Zahnay** — wp-admin → Practice:

* **Weekly builder**: weeks with title, "have ready by" date, rehearsal label, "show to singers from" date, note, Draft/Published; tasks with minutes, details, voice parts, and music attached from the concert's own materials (scores and links open; recordings play in the practice player, with a voice part, a starting ear and "starts muted"). Copy a week, reorder, delete.
* **Progress**: per week and singer — week opened, ticks, ratings, plays (20 seconds or more in one sitting), minutes listened, score opens; who has not opened the week; tasks rated "Bad".

Drafts are shown to staff on the Hub page itself, so the Hub is the preview.

**How it fits the Hub.** The Hub decides who can see what. A task only points at Hub material ids, and every page view looks them up through the Hub's permission check for that viewer. Audio plays through the Hub's own playback endpoint. The weeks live in the concert's post meta (`_anpr_weeks`); ticks, ratings and plays live in two tables (`anpr_progress`, `anpr_events`). With the add-on switched off the Hub shows its original page.

**Tracking writes are POST-only** (`ars-nova-practice/v1/event`, `Cache-Control: no-store`); nothing private is read over REST.

The practice player is built on **@dawcore/components** from waveform-playlist by Naomi Aro (MIT License) — https://github.com/naomiaro/waveform-playlist. The built browser bundle is in `assets/player/`, with every bundled licence in `assets/player/THIRD-PARTY-LICENSES.txt` (MIT and BSD-3-Clause, plus waveform-data under LGPL-3.0). Its source, exact versions and build script are in the repository's `player-src/` folder, so the bundle can be rebuilt with any of those libraries replaced.

== Changelog ==

= 0.1.0 =
* First version, staging only: weekly builder, singer week page, practice player (mute / volume / ear per track, per-voice-part tracks), done / rating / play tracking, progress report, and the recording test (takes stay in the browser).
