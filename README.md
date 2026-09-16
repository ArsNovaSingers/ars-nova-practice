# Ars Nova Practice

Weekly practice assignments for the Ars Nova Singers Hub — a WordPress add-on for
[`ars-nova-singers-portal`](https://github.com/ArsNovaSingers/ars-nova-singers-portal) (1.40.0+).

See `readme.txt` for what it does.

## Layout

| Path | What |
|---|---|
| `ars-nova-practice.php` | Bootstrap; checks the Hub is active |
| `includes/class-anpr-weeks.php` | Weeks/tasks storage (post meta `_anpr_weeks`), cleaning, what a viewer sees |
| `includes/class-anpr-tracking.php` | `POST ars-nova-practice/v1/event`, progress + events tables, report queries |
| `includes/class-anpr-frontend.php` | Replaces the Hub's `group-assignments` template through `ansp_template_file` |
| `includes/class-anpr-admin.php` | wp-admin → Practice: builder, progress, settings |
| `templates/assignments.php` | The singer page |
| `assets/practice.js` / `.css` | Singer page behaviour and styles |
| `assets/builder.js`, `assets/admin.css` | The builder |
| `assets/player/` | **Built** practice player (do not edit by hand) |
| `player-src/` | Player source + build script (not in the release zip) |

## Rebuilding the player

```
cd player-src
npm install
npm run build      # writes ../assets/player/
```

The player uses `@dawcore/components` from
[waveform-playlist](https://github.com/naomiaro/waveform-playlist) (MIT).

## Releases

Release zips are built with `git archive` from the tag (`--prefix=ars-nova-practice/`), so
`player-src/` and this README's tooling are excluded by `.gitattributes`.
