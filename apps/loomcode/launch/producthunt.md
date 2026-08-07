# Product Hunt launch kit — Loom Code

Everything needed to fill the submission form, plus the assets. Regenerate the
images with `node shoot.mjs` after editing `cards.html`; they are rendered at
true pixel size and captured by element clip, so what uploads is what was
composed.

Character counts are given where Product Hunt enforces a limit, because
discovering the tagline is four characters too long while the form is open is a
bad time to start editing.

---

## Name

**Loom Code**

## Tagline — 52 / 60

```
Stop paying your agent to read files it doesn't need
```

Alternates, all within the limit, if the above reads too aggressive:

| tagline | chars |
|---|---|
| `Context packs for coding agents. No embeddings.` | 46 |
| `Your agent reads whole files. It shouldn't.` | 42 |
| `Selective retrieval for coding agents` | 37 |
| `Call-graph-aware context, under a token budget` | 46 |

## Description — 257 / 260

```
To change six lines your coding agent loads whole files, and you pay for every
token. Loom Code parses your repo, resolves its call graph, and returns a
budgeted pack: the exact span, its callers and callees, all cited. No
embeddings, no GPU, self-hostable.
```

## Topics

Developer Tools · Artificial Intelligence · GitHub · API · Productivity

Primary should be **Developer Tools**. "Artificial Intelligence" is worth
carrying even though there is no model in the product — the buyer is someone
paying an LLM bill, and that is the category they browse.

## Links

- Website: the showcase page
- GitHub: `apps/loomcode` in this repo
- Docs: `/docs` on any running instance (FastAPI generates it)

## Assets

| file | size | use |
|---|---|---|
| `assets/thumbnail.png` | 240×240 | product thumbnail |
| `assets/01-hero.png` | 1270×760 | gallery 1 — the problem, to scale |
| `assets/02-pipeline.png` | 1270×760 | gallery 2 — how it works |
| `assets/03-confidence.png` | 1270×760 | gallery 3 — the differentiator |
| `assets/04-languages.png` | 1270×760 | gallery 4 — ten languages |
| `assets/05-numbers.png` | 1270×760 | gallery 5 — measured, both numbers |

Rendered at `deviceScaleFactor: 2`, so the files are 2540×1520 and 480×480 —
Product Hunt downsamples cleanly, and a 1× capture of 13px monospace looks soft
on any modern display.

The demo video (`../site/demo.webm`) is a real screen recording, not an
animation. Product Hunt accepts a YouTube link rather than a file upload, so it
needs to go up there first. **Webm is the only format it exists in** — the
recorder's bundled ffmpeg is VP8-only, with no libx264 — so converting to mp4
needs a full ffmpeg build somewhere.

---

## Maker's first comment

> Hey Product Hunt 👋
>
> I got tired of watching a coding agent burn 4,000 tokens reading a file so it
> could change six lines in it. The information it needed was maybe 200 tokens.
> You pay for the other 3,800 every single time.
>
> The obvious fix is "just send the function". That is not enough, and it is
> where most attempts stop. To change a function safely you also need what it
> calls and what calls it — otherwise you break a contract you never saw. So
> Loom Code returns a **pack**, filled in priority order until a token budget
> runs out: the matched span, its callees, its callers, the file's other symbols
> by name, then cards for other files that matched.
>
> Three things I decided to do differently, and one I decided not to do:
>
> **Every call-graph edge states its confidence.** `exact` means one definition
> of that name in the same file. `likely` means one in the whole repo.
> `ambiguous` means several share the name — and you get *all* the candidates,
> because guessing which `validate` was meant is how an agent edits the wrong
> file and never finds out. A graph that hides its guesses is worse than no
> graph.
>
> **Ranking fuses positions, not scores.** BM25, name match and PageRank
> centrality each produce an ordering, combined with Reciprocal Rank Fusion. A
> BM25 score of 7.4 and a PageRank of 0.003 have no defensible exchange rate;
> any weighted sum of them is really a weighting of their variances.
>
> **Whatever doesn't fit is reported, not dropped.** An agent that can see
> "3 callers omitted, budget exhausted" can ask for more. One handed a silently
> truncated pack cannot.
>
> **No embeddings.** There is a provider slot and nothing in it, on purpose. The
> moment an embedding model is in the request path, "a request costs CPU and
> nothing else" stops being true, and that property is the whole reason this can
> be self-hosted inside a bank and sold per-seat instead of per-token. I did try
> a dependency-free hashing pseudo-embedding early on; across 7,641 symbols the
> collisions ranked an unrelated activation function above the pricing model I
> was searching for. Bring your own provider and it fuses as a fourth ranker.
>
> On the numbers, I'm showing two and the second one is less flattering. A bare
> span read is **8.76×** less context. A full relation-aware pack is **2.76×**
> across six real edit tasks — it costs more precisely because it brings the
> callers and callees with it. Quoting only the first number would misdescribe
> what you actually get.
>
> Ten languages with exact spans (Python, Go, TypeScript, JavaScript, PHP,
> Pascal/Delphi, Java, Rust, Ruby, Kotlin). Every span comes from a real parse —
> the previous version regex-scanned everything but Python and I killed it,
> because you cannot edit against a boundary found by looking for the *next*
> declaration.
>
> Happy to answer anything, including the parts that don't work yet.

---

## Answers to the questions that will get asked

**"How is this different from just using grep / ctags / an LSP?"**
An LSP is the right comparison and it wins on precision — it has the compiler.
It loses on two things this is built for: it has no ranking, so it cannot answer
"where do we compute the optimal price", and it has no token budget, so it
cannot decide what to leave out. Loom Code is not trying to be a language
server; it is trying to fill a context window well.

**"Why no embeddings? Everyone else uses them."**
Because the request would then cost a model call, and the entire commercial
shape depends on it not doing that — per-seat pricing, air-gapped deployment, no
egress. It is a slot, not a refusal: `DenseProvider` takes anything that can
order documents, and it fuses as a fourth ranker.

**"Does my source code leave my machine?"**
On the hosted plans, file text is sent to `/files`, parsed, and **discarded** —
what persists is symbol names, line spans, docstring first lines, call sites and
a content hash. Nothing reconstructs the file. `/read` and `/context_pack` take
the content to slice *in the request*, so the service never becomes a second
copy of your repo. If that is still too much, the identical application runs
inside your perimeter on the enterprise tier.

**"What's the catch?"**
Search is lexical plus structural, so it matches wording and graph position, not
meaning. Resolution matches on the trailing name, so `a.b.parse(x)` resolves as
`parse` — receiver types are not inferred, which is exactly why every edge
carries a confidence tier instead of hiding it. Rate limiting is a fixed
per-minute window, so it is coarse at boundaries. SQLite backs the index, which
is comfortable to low millions of symbols on one node and wants Postgres beyond
that.

**"Pricing?"**
Free 25k indexed lines, $99 Team, $499 Business, $2,500 Enterprise
(self-hosted, unlimited). Billed on the estate you index, never per call —
charging per request would punish you for the tool working, since the entire
value is fewer and smaller calls.

---

## Launch-day checklist

- [ ] Upload `demo.webm` to YouTube, paste the link into the video field
- [ ] Hosted instance up with `LOOM_CORS_ORIGINS` set to the site's origin
      (optional — the launch stands on self-hosting alone)
- [ ] `LOOM_KEY_SALT` set to a real random value, not the dev placeholder
- [x] The showcase page's CTAs point somewhere real — "Run it yourself" jumps to
      a working self-host quickstart, "Read the source" goes to the repo. There
      is no hosted signup yet and the page says so rather than faking one.
- [ ] Free-tier signup path, if a hosted tier launches alongside
- [ ] `/docs` reachable on the hosted instance (works on a local instance today)
- [ ] Someone watching the comments for the first four hours
