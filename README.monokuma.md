# Live Classroom

> The default `/` page is the Chinese classroom described in [README.md](README.md). This local compatibility style lives at `/styles/monokuma`. Both styles now plan with TokenDance DeepSeek 4.1 Flash, thinking disabled. The legacy style keeps its separate credentials and fal video path. Historical Git branches are not changed by this local migration.

A TV channel that teaches whatever you type. TokenDance DeepSeek 4.1 Flash plans an initial 30-second lesson as six five-second
beats, MiniMax H3 Max Turbo renders each beat as a retro 1970s educational cartoon scene just before it airs, and
the clips play on a CRT inside a 3D classroom with a program guide for queueing what's next.

![The classroom lobby](docs/lobby-danganronpa.jpg)

This local visual variant uses Monokuma in a Japanese classroom with Danganronpa-inspired black, white,
and magenta interface graphics. The UI floats directly over the scene without enclosing cards.
The button above the lobby portrait switches between Monokuma (default) and Monomi before starting.
The selected identity controls the UI portraits, script planning, H3 character sheet and voice,
and is recorded as `teacherId`. Both follow-ups inherit that identity; switching alone never generates a clip.
Generated videos retain the upstream 1970s American educational cartoon style: flat cel paint,
slightly boiling ink outlines, muted warm scenery, paper grain, and faded 16mm film texture.
The teachers retain their own black/white or pink/white colors. The surrounding classroom UI keeps its Danganronpa design.
A black/white/magenta loading screen covers asset loading and the first rendered frames. A short
entrance camera move then settles into the original lobby composition before showing the controls.
Drag the classroom canvas to look left or right, limited to 15 degrees each way. Input fields and
TV controls keep their own pointer behavior; reduced-motion preferences skip the entrance move.
The room uses locally authored bolted steel panels, a surveillance camera, a broadcast speaker,
ochre plaster, and dark timber wainscoting. The supplied photos keep their full images and white print borders.
Teacher identity, portrait paths, voice, and the short numbered character sheet are defined in
`src/lib/classroom-config.ts`. Keep character-sheet lines short: the provider's prompt rewriter
preserves numbered lists more reliably than prose. Asset provenance is recorded in
`public/characters/monokuma/SOURCE.md`, `public/characters/monomi/SOURCE.md`, and `public/models/monokuma/SOURCE.md`.

## Independent Chinese classroom

Open `/` (or the compatible `/zh-youth`) for the separate question-driven Chinese classroom. Its TokenDance
wallet supports authorization or a pasted API key, balance display, and a collapsible high-contrast
panel. Both planning and video requests use that browser's wallet, not the Demo's shared keys.
Browsing and connecting do not submit generation; starting a course can incur real TokenDance charges.
The `/styles/monokuma` Demo keeps its separate scene, sessions, credentials and fal video integration.

Set `TOKENPAY_PUBLIC_URL` to the exact HTTPS origin for a public deployment. Loopback development
supports the current localhost/127.0.0.1 port without this setting. See
[wallet setup, isolation and test boundaries](docs/youth/tokenpay-integration.zh-CN.md).
Real main-classroom wallet and text calls have been tested. Video generation and itemized billing
are not covered by that test; browser balance/playback screenshots use documented local fixtures.

## Run the original Demo

Requirements for new legacy Demo generation: Node 22.6+ (`.nvmrc`), a [fal.ai](https://fal.ai) key scoped to `minimax/h3-max-turbo/image-to-video`, and the private operator's own TokenDance API key. Browsing and saved-video playback do not need these keys. The existing expired-price guard still applies.

```bash
npm install
cp .env.example .env.local   # private legacy Demo only: FAL_KEY and TOKENDANCE_API_KEY
npm run dev                  # http://localhost:3000
```

Type a topic in Chinese or English (2–500 characters), press enter, and the TV tunes in.
Chinese requests default to Mandarin narration, Chinese captions, and Chinese follow-up questions;
an explicit requested narration language takes priority. IME confirmation does not submit a lesson.
**Every lesson costs real money** — see below —
so the app never starts a lesson without you typing one.

### Keys

| Key | Used for | Required |
|---|---|---|
| `FAL_KEY` | Video rendering via `minimax/h3-max-turbo/image-to-video` only | yes |
| `TOKENDANCE_API_KEY` | One `deepseek-v4.1-flash` planning request, thinking disabled | only for new legacy Demo generation |

Keys stay on the server in the git-ignored `.env.local`. Never copy a visitor's wallet key into this file. The main classroom ignores these shared keys. The old Google planner has been removed; there is no model fallback or
AI-generated end-card request. Restart the server after changing keys.

If the shell already exports `HTTP_PROXY` / `HTTPS_PROXY`, use `npm run dev:proxy` or
`npm run start:proxy` so Node's provider requests use that proxy. These commands require
Node 22.21+ or 24.5+; keep localhost in `NO_PROXY`. Ordinary `dev` / `start` use the default
Node network configuration.

### Short demo and cost

The initial lesson is **30 seconds**. Select up to **two 10-second follow-ups**, one at a time.
Suggestions alone create no requests, and the end card waits for a selection without a countdown.
The server enforces these limits even when requests are sent outside the UI.

The complete path contains **ten five-second 768p clips (50 seconds total)**. At the advertised
launch rate of $0.01/second, the fal estimate was **$0.50**. TokenDance script charges are separate and depend
on its actual bill. The [official pricing page](https://fal.ai/models/minimax/h3-max-turbo/image-to-video)
advertises a discount ending September 7; the app conservatively blocks new planning and rendering
from September 7, 2026 at 00:00 UTC until pricing and budget are reviewed. This cutoff is local policy,
not a published provider cutoff time. Estimates are not a live balance check; fal billing is authoritative.

This endpoint [allows `image_url` to be omitted](https://fal.ai/models/minimax/h3-max-turbo/image-to-video/api).
The app uses that documented text-only mode with its default 16:9 output. It does not call the
separate text-to-video endpoint, upload an initial image, or request unsupported `aspect_ratio` input.

A paid submission is sent exactly once, including on transport errors. The SDK retries its queue
POST internally, so `h3-request.ts` submits directly and uses the SDK only to read that request's
status and result. On failure, no new clips or queued lessons are submitted; already accepted
concurrent requests can still finish. Local recap cards keep failed beats inspectable.
The estimate ceiling is 98 cents per worker; the 30/10/10 limit bounds one demo to 50 cents at the
configured rate. Starting another demo spends again and does not share an account-wide budget ledger.

`SAVE_RECORDINGS=1` (the default) records selected topics and their parent/child sessions, exact
TokenDance and fal request bodies, public planner output and token counts, validated scripts, fal request
IDs, timings, results, and failures in `recordings/<sessionId>/events.jsonl`. It writes intent before
provider submission. A `video-request` alone does not prove fal accepted a request; use
`video-submitted` and its request ID. A network failure can leave acceptance unknown; never auto-resubmit.

Successful provider results also get `scene-NN.json` **before** downloading `scene-NN.mp4`.
A download failure preserves the result URL and metadata and adds `video-save-failed`; `video-saved`
confirms the local file finished writing. Disk-write failures are reported and prevent further
submissions. Already accepted requests still finish if a subsequent metadata write fails.
Auth headers, API keys, and thinking text are excluded. Actual billed cost stays `null` until it is
checked against provider billing. The folder is git-ignored. These are durable records, not automatic
runtime recovery or deterministic video reproduction. See [the saved workflow](docs/demo-workflow.zh-CN.md).

## How it works

```
topic ──► TokenDance planner ──► 6 beats ──► H3 Max Turbo, just in time ──► runway ──► CRT in the classroom
                                                 ▲                                    │
                                                 └──── program guide queues the next lesson ◄──┘
```

- **Planning** (`src/server/lesson-producer.ts`) makes one LLM call that writes narration and a
  visual beat for all six initial scenes or two follow-up scenes. There is no per-scene LLM call.
- **Rendering** (`src/server/fal.ts`, `classroom-runtime.ts`) keeps a small runway of clips ahead
  of playback: two clips must be decoded before the lesson starts, then production stays two to
  four scenes ahead and recovers toward six after an underrun. Two renders run concurrently.
- **Prompts** (`src/lib/classroom-config.ts`) are written for fal's prompt rewriter, not the video
  model: H3 Max always paraphrases the prompt before rendering, and long prose descriptions lose
  details every scene. The teacher is therefore a ten-line numbered character sheet the
  rewriter copies verbatim. `compileH3ScenePrompt` assembles sheet + scene + voice + style.
- **Playback** (`src/components/lesson-deck.tsx`) assigns fal's CDN URLs straight to reusable
  `<video>` elements, holds the first frame until it is painted, and layers the tuning static,
  colour bars, and sign-off card on top. One soundtrack loops continuously across lessons.
- **Playlist** (`classroom-playlist-runtime.ts`) runs queued lessons as child sessions that share
  one playback runway, so the next lesson is already rendering while the current one airs. If
  nothing is queued, the sign-off card waits. Only a manually chosen follow-up is planned and
  rendered; the server accepts at most two follow-ups in the entire demo.
- **The set** (`src/components/set/`) is hand-built with react-three-fiber: procedural textures,
  furniture, the CRT and AV cart, and set dressing.

## Deploying

There is no database, queue, or separate worker process — the lesson runtime is an in-memory
singleton inside the Next.js server, and fal is called over HTTPS. That means it runs anywhere a
single long-lived Node process runs (`npm run dev`, or `npm run build && npm start` on a VM,
Fly, Railway, etc.) and it does **not** work on serverless platforms: on Vercel-style deployments
each invocation gets a fresh process, so sessions and in-flight renders evaporate between requests.
Recordings also write to the local filesystem. One process, one disk.

## Prompt debugging

The single most useful thing to know: look at what fal *actually* rendered from, not what you sent.

```bash
node scripts/expanded-prompts.mjs <sessionId>               # rewritten prompt per scene + which
                                                            # character-sheet lines survived
node --experimental-strip-types scripts/probe-h3-expansion.mjs ["beat"] ["line"]
                                                            # render ONE clip (paid) with the current
                                                            # prompt and print its expansion
node --import tsx scripts/probe-planner-narration.mjs <saved-script.json>
                                                            # offline narration inspection only
```

Session ids appear in the dev-server log; `recordings/<sessionId>/scene-NN.json` holds the same
data for finished lessons.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run typecheck`, `lint`, `test` | Static gates CI runs |
| `npm run verify` | No-spend smoke test against a production build (run `npm run build` first) |
| `npm run soundtrack` | Regenerates the classroom loop in `public/audio/` |
| `node scripts/generate-teacher-sprite.mjs <reference> [monokuma\|monomi] [flatten]` | Generates a sprite draft for the selected teacher, preserving original portrait assets (OpenAI Images, paid) |
| `node scripts/generate-posters.mjs [monokuma\|monomi]` | Regenerates posters using the selected teacher (OpenAI Images, paid) |

## Layout

```
src/app/                 Next.js routes (page, /api/classroom)
src/components/          classroom.tsx (lobby + program guide), lesson-deck.tsx (the TV), set/ (3D)
src/hooks/               polling client, continuous soundtrack
src/lib/                 config + prompts, types, boundary parsing
src/server/              planner, fal client, lesson runtime, playlist runtime, archiving
scripts/                 generators and prompt-debugging probes
```

## License

Application code is MIT. Monokuma and Danganronpa belong to Spike Chunsoft. Character assets are
third-party fan-project assets; see the asset-specific source records above for the licensing boundary.
