=== Ars Nova Practice ===
Contributors: arsnovasingers
Tags: choir, practice, assignments, rehearsal
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Weekly practice assignments for the Ars Nova Singers Hub. Add-on for the Ars Nova Singers Portal plugin (1.40.0 or later).

== Description ==

**For singers** — "This Week's Assignments" on the Singers Hub becomes a week-by-week homework page:

* This week's tasks first, with "have ready by" and the director's note; earlier and upcoming weeks folded away.
* Each task: a Not done / Done switch, saved practice takes (see 0.4.0), a Bad · Fair · Good · Great slider, the score/link buttons, and a **practice player**.
* Each practice track opens in its own player: green Play, red Record and black Stop side by side, Mute / Solo / Volume / Pan on the track, zoom, and takes recorded underneath that can be selected and deleted.
* A task can carry one track per voice part; each singer gets their own part's track.
* Optional **recording test**: record takes over the track with wired headphones (the page records the microphone only), hear them back, delete and retry, and download one. Nothing is uploaded in this version. Off / staff only / everyone, under Practice → Settings (default: staff only).

**For Tom and Zahnay** — wp-admin → Practice:

* **Weekly builder**: weeks with title, "have ready by" date, rehearsal label, "show to singers from" date, note, Draft/Published; tasks with minutes, details, voice parts, and music attached from the concert's own materials (scores and links open; recordings play in the practice player, with a voice part, a starting ear and "starts muted"). Copy a week, reorder, delete.
* **Progress**: per week and singer — week opened, ticks, ratings, plays (20 seconds or more in one sitting), minutes listened, score opens; who has not opened the week; tasks rated "Bad".

Drafts are shown to staff on the Hub page itself, so the Hub is the preview.

**How it fits the Hub.** The Hub decides who can see what. A task only points at Hub material ids, and every page view looks them up through the Hub's permission check for that viewer. Audio plays through the Hub's own playback endpoint. The weeks live in the concert's post meta (`_anpr_weeks`); ticks, ratings and plays live in two tables (`anpr_progress`, `anpr_events`). With the add-on switched off the Hub shows its original page.

**Tracking writes are POST-only** (`ars-nova-practice/v1/event`, `Cache-Control: no-store`); nothing private is read over REST.

The practice player is built on **@dawcore/components** from waveform-playlist by Naomi Aro (MIT License) — https://github.com/naomiaro/waveform-playlist. The built browser bundle is in `assets/player/`, with every bundled licence in `assets/player/THIRD-PARTY-LICENSES.txt` (MIT and BSD-3-Clause, plus waveform-data under LGPL-3.0). Its source, exact versions and build script are in the repository's `player-src/` folder, so the bundle can be rebuilt with any of those libraries replaced.

== Changelog ==

= 0.4.0 =
Saved takes (Jonathan, 2026-09-17).
* **New take** and **Save take** sit to the right of Record. New take clears Track 2 (it asks twice if the take is not saved).
* **Save take** levels the voice (peaks at −1 dB, at most +30 dB of gain), mixes it with the practice track exactly as the dials are set (volume, pan, mute, solo, timing correction), and saves the stereo mixdown — MP3 160 kbps (encoded in the browser, off the main thread) or WAV, chosen in Practice → Settings.
* **My saved takes** box: up to 5 takes per piece (setting), each with play, rename, download and delete; a small player with a seek bar. Playing a saved take pauses the music and the other way round. Delete asks twice.
* **Storage:** takes go straight from the browser to a private Google Cloud bucket through short-lived signed URLs issued by the Singers Hub scores service (worker 0.8.0) — WordPress never carries the audio, and the site checks every request: who is asking, which concert, week, task and practice track, and the per-piece limit. Staging and LIVE use separate folders. Play and download links are made fresh on each click.
* **Who can hear a take:** the singer, and Hub managers (Tom, Zahnay, site admins). Only the singer can rename or delete one. Nothing is deleted automatically.
* New table `anpr_takes`; new POST-only routes `ars-nova-practice/v1/takes/{start,finish,rename,url,delete}` (no-store). Events `take`, `takeplay`, `takedel` are logged.

= 0.3.3 =
* The practice track buttons line up with the rest of the task again; the site theme had been indenting the list by 32 px.

= 0.3.2 =
* **Done is now a switch, not a bare checkbox** (Jonathan, 2026-09-17: it was not clear what the boxes were for). Each task shows a red "Not done" switch at the right of its title; tapping it turns it green with "✓ Done". The page intro and the Progress report say "marked done" instead of "ticked".

= 0.3.1 =
* **Takes are recorded in mono.** A microphone that reports two channels made the take track twice as tall as the music (Jonathan, 2026-09-17); the recorder now always mixes the microphone down to one channel, and the downloaded .wav is mono.

= 0.3.0 =
A two-track recorder laid out like a pro multitrack (Jonathan, 2026-09-17, after Adobe Audition).
* **Two tracks per practice block, stacked.** Track 1 is the practice material; Track 2 is "My take". Recording again replaces the take — there is only ever one.
* **Track headers:** name, **M / S / R** buttons and rotary **Volume** and **Pan** dials with their values. Drag a dial up or down (Shift for fine), use the arrow keys, or double-click to reset. Track 1 has no R.
* **R arms Track 2** (armed when the player opens). While armed and the microphone is on, a level meter under the header shows your input.
* **Transport and zoom at the bottom:** time on the left, black Stop, green Play (turns to Pause) and red Record in the middle, zoom on the right.
* **Under the player:** timing correction, clear-my-take (bin or Delete key after clicking the take) and download.
* The whole piece fits the player when it opens, even when it was opened inside a hidden tab; the site theme no longer boxes the range slider.

= 0.2.0 =
The practice player, redesigned to Jonathan's direction (2026-09-17).
* **One player per practice track.** A task lists its tracks; each opens its own player with only that track loaded.
* **Icon transport side by side:** green Play (turns to Pause), red Record, black Stop (back to the start). Record plays the track from the start and records onto a new take track underneath (Take 1, Take 2…); press Record or Stop to finish.
* **Controls on each track:** Mute, Solo, Volume and Pan, drawn on the track itself.
* **Zoom:** zoom in, zoom out, and fit the whole piece.
* **Timing correction** sits under the tracks, with the measured delay.
* **Try again:** click a take to select it, then the trash button (or the Delete key) removes it; the download button saves the selected take as .wav.

= 0.1.3 =
* **Practice tracks load again.** The track links were written with `&amp;` inside the page's JSON, so the browser sent a scrambled request and the Hub answered 403 — no track loaded, on staging, on 2026-09-17. Fixed, and a track that fails to load is now named in the player.
* **The player opens with just the music.** Tracks are numbered Track 1, Track 2 in the order the builder lists them (the builder can now reorder attached items); a take track is added only when Record is pressed, one per take (Take 1, Take 2…).

= 0.1.2 =
* The "Download my take" button no longer shows before a take has been recorded (a button style was overriding `hidden`).

= 0.1.1 =
* **An attached score no longer goes missing when the Hub changes its id.** The Hub lists a Drive score that has both a hand-entered row and a published mirror copy once, under the mirror copy's id — and under the hand row's id when the mirror library cannot be reached. A task now also finds its material by the title, piece and type saved with it, searching only what that viewer can already see, and never guessing between two matches. Found on staging on 2026-09-16.

= 0.1.0 =
* First version, staging only: weekly builder, singer week page, practice player (mute / volume / ear per track, per-voice-part tracks), done / rating / play tracking, progress report, and the recording test (takes stay in the browser).
