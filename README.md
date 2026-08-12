# Online Compiler

A web-based code execution platform. Users submit C++, JavaScript, or Python source from the browser; a background worker compiles and runs it on the host and writes the result back to Postgres, which the frontend polls until the job finishes.

## Architecture

```
Browser (Frontend :3003)
      │  POST /submission          { code, language }
      ▼
Express API (Backend :3000) ──► Postgres (Neon)   row created, status = processing
      │                                    ▲
      │  LPUSH "Problems"                  │  UPDATE status + output
      ▼                                    │
   Redis :6379 ──────► Worker (RPOP loop) ─┘
                            │
                            └─► g++ / node / python  (child_process.spawn)

Browser polls GET /submission/:id every 1s until status ≠ processing
```

The queue exists so the API never blocks on code execution. If the worker crashes or falls behind, submissions simply sit in Redis — the API stays responsive.

## Tech stack

| Component | Stack |
|---|---|
| Frontend | Bun's dev server, React 19, Tailwind CSS v4, shadcn/ui (Radix), axios |
| Backend  | Express 5, Prisma 7 (`@prisma/adapter-pg`), `redis`, `cors` |
| Worker   | Bun runtime, `node:child_process`, Prisma 7, `redis` |
| Data     | Neon Postgres, Redis (queue) |

Everything runs on **Bun**, not Node.

## Prerequisites

- **Bun** (developed against 1.3.14)
- **Redis** listening on `localhost:6379`
- **A Neon Postgres database** (or any Postgres) — connection string in `DATABASE_URL`
- Toolchains for whichever languages you want to support:
  - C++ → `g++` on `PATH` (MinGW at `C:\MinGW\bin` on Windows)
  - JavaScript → `node` on `PATH`
  - Python → `python` on `PATH`

### Windows note on Python

`python3` on Windows is usually a **0-byte Microsoft Store alias stub**, not a real interpreter. Running it opens the Store and produces no output. The worker deliberately spawns `python`, not `python3`.

## Setup

Each of the three folders is an independent Bun project.

```bash
cd Backend  && bun install
cd ../Worker && bun install
cd ../Frontend && bun install
```

Create `Backend/.env` and `Worker/.env`, both containing the same connection string:

```
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
```

Both `.env` files are gitignored — do not commit them.

Apply the schema (from `Backend/`):

```bash
bunx prisma migrate dev
```

The Worker has its own `prisma/schema.prisma` and generates its own client into `Worker/generated/prisma`. Keep the two schemas in sync; the Backend owns the migrations.

## Running

Three processes, three terminals:

```bash
# Terminal 1 — API on :3000
cd Backend && bun index.ts

# Terminal 2 — execution worker
cd Worker && bun index.ts

# Terminal 3 — UI on :3003
cd Frontend && bun run dev
```

Use `bun run dev`, **not** `npm run dev`. The script is `PORT=3003 bun --hot src/index.ts`, and that leading env-var assignment is POSIX shell syntax. npm shells out to `cmd.exe` on Windows, which fails with `'PORT' is not recognized`. Bun ships its own cross-platform shell and handles it.

Neither `bun index.ts` process hot-reloads — restart them manually after edits. Only the frontend watches files.

## Data model

`Backend/prisma/schema.prisma`:

```prisma
model submission {
  id                String            @id @default(uuid())
  code              String
  language          String
  submissionstatus  SubmissionStatus? @default(processing)
  output            String?
}

enum SubmissionStatus {
  processing
  Success
  Failure
  TLE
}
```

Prisma scalar types are capitalized (`String`, not `string`) — lowercase fails validation.

| Status | Meaning |
|---|---|
| `processing` | queued or currently running |
| `Success` | exited `0` |
| `Failure` | exited non-zero, or failed to compile |
| `TLE` | still running at the 5s limit and was killed |

The enum is duplicated in `Worker/prisma/schema.prisma`. Changing it means editing **both** files, running `bunx prisma migrate dev` from `Backend/`, and then `bunx prisma generate` in **both** — `migrate dev` does not regenerate the client for you. Skipping the Backend regenerate produces `Value 'TLE' not found in enum 'SubmissionStatus'` on every read of an affected row, even though the Worker wrote it happily.

## API

| Method | Route | Body / Params | Response |
|---|---|---|---|
| `POST` | `/submission` | `{ code, language }` | `{ message, id }` |
| `GET`  | `/submission/:id` | — | `{ submission: { id, code, language, submissionstatus, output } }` |
| `POST` | `/signup` | — | not implemented |
| `POST` | `/signin` | — | not implemented |

Note the **nesting** on the GET response: fields live under `submission`, not at the top level.

### Language identifiers

The worker matches these **case-sensitively**:

| UI label | Value sent | Interpreter |
|---|---|---|
| CPP | `CPP` | `g++` |
| JS | `js` | `node` |
| Python | `py` | `python` |

Anything else (`Py`, `cpp`, `python`) is popped off the queue, matches no branch, and is silently discarded — the submission is then stuck at `processing` forever with no way to tell why.

## How execution works

For each queued job the worker writes the source into `Worker/code/` (`a.cpp`, `a.js`, `a.py`), then:

- **C++** — spawns `g++`, **waits for the compiler to exit**, checks the exit code, then runs the produced binary. The wait is essential: `spawn` is non-blocking, so launching the binary on the next line would execute a stale binary left over from the previous submission, or fail with `ENOENT` on the first run.
- **JS / Python** — spawns the interpreter directly against the written file.

Both stdout **and stderr** are accumulated. On `"close"` (not `"exit"` — that fires before the streams drain and truncates diagnostics), a single `finishSubmission` helper writes the result: exit code `0` sets `Success`, anything else sets `Failure`, and `output` gets stdout and stderr joined in both cases. A process that exits without writing anything records `process exited with code N and produced no output` rather than `null`.

For C++, compiler diagnostics are captured separately and written to `output` when the compile step fails, so a compile error is distinguishable from a crash at runtime.

### Time limit

Every spawned child — the compiler as well as the program — runs under a **5 second** ceiling (`TIMEOUT_SECONDS` in `Worker/index.ts`). On expiry the child is killed and the submission is marked `TLE`.

`runWithTimeout` resolves with a `timedOut` flag rather than just an exit code, because after a kill `"close"` still fires — with a `null` exit code — and would otherwise be indistinguishable from a normal non-zero exit and recorded as `Failure`.

Whatever the program printed before being killed is kept, with `[time limit exceeded: execution killed after 5s]` appended. The note is always appended: partial output with no marker reads like a completed run.

The compiler gets the same limit, since a pathological template or include bomb wedges the worker exactly as badly as an infinite loop does.

`Worker/code/` is scratch space, overwritten on every submission. It should be gitignored.

## Known issues / TODO

Ordered roughly by how much pain each causes.

- **A failed spawn still hangs the worker — the 5s timeout does not save you here.** A `spawn` for a binary that isn't on `PATH` emits `"error"`, never `"close"`, so the awaited promise never settles. The timer is armed but only ever *kills* a child that exists; nothing resolves the promise, and the worker stops dead. This is the one remaining way to wedge the queue permanently. Add an `"error"` handler to every branch.
- **Unknown languages silently vanish.** Mark them `Failure` instead of dropping the message.
- **One shared scratch filename.** All submissions use `a.cpp` / `a.exe`. Safe only because the worker is strictly sequential; it breaks the moment you add concurrency. Use per-submission paths.
- **No sandboxing.** Submitted code runs as your user with full filesystem and network access. This is fine locally and completely unsafe to expose. Containerize before deploying anywhere.
- **Auth is unimplemented.** `/signup` and `/signin` are empty, there's no user model, and submissions have no owner.
- **Polling never gives up.** The frontend loops indefinitely if a job never leaves `processing`. Add an attempt cap.

## Troubleshooting

Problems hit during development and what they actually were:

| Symptom | Cause |
|---|---|
| No `prisma/` folder after `bun add prisma` | Installing only adds packages. Scaffolding comes from `bunx prisma init`. |
| `could not determine executable to run for package prism` | Typo — the package is `prisma`. |
| Backend accepts connections but never responds | `app.use(cors)` passed the **factory** instead of calling it. Express invoked it as middleware; it returned a function and never called `next()`, so every request hung forever. Must be `app.use(cors())`. |
| `405 Method Not Allowed` on submit | The POST reached the frontend dev server, whose `"/*": index` HTML route only accepts GET. Usually a stale browser bundle pointing at the wrong origin — hard-refresh. |
| `ENOENT: uv_spawn './code/out'` | `g++` was given `-o ".code/out"` (missing slash), a directory that doesn't exist, so no binary was produced. |
| Status stuck at `processing`, output `null` | Language string case didn't match the worker's comparison, so the job was discarded. |
| UI blank despite a valid API response | Frontend read `response.data.submissionstatus` instead of `response.data.submission.submissionstatus`. `undefined !== "processing"` is true, so polling exited on the first pass and wrote `undefined` into state. |
| `'PORT' is not recognized` | `npm run` uses `cmd.exe`. Use `bun run dev`. |
| Python produces nothing | `python3` resolved to the 0-byte Microsoft Store stub. Use `python`. |
