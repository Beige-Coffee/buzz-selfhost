# Run Your Own Buzz (guide site)

An interactive, single-page guide to self-hosting a Buzz relay. White page, Buzz chartreuse as the accent.

```bash
npm install
npm run dev     # http://localhost:5186
npm run build   # static output in dist/
node build/skill.ts   # parses the skill and prints each setup's steps
```

- Page order: the hero, the story (`#how`), where to run it (`#where`: three cards, a line for a local test, and Choose by requirements), the guide (`#guide`), security (`#security`: two practices for a community anyone can join, each a still drawing with a few lines, then links to the answers below and to the skill's security reference), Running your relay (`#operations`, a checklist and a FAQ), a place to ask (`#ask`: how to join Block's feedback community, in three steps with a still drawing each), then the footer.
- `index.html`: the static prose and the link-preview tags. Blocks with `data-tracks` show only for those setups. A `<noscript>` paragraph points at the skill.
- `src/scenes/`: `story.ts` (the scroll story), `security.ts` (the Security section: two practices, each a still drawing and a few lines), `checked.ts` (the line under the setup's heading that says what the guide was reviewed with), `paths.ts` (the cards and the local test line), `decide.ts` (Choose by requirements, its rules in `src/data/decide.ts`), `panel.ts` (the Running on box), `agent.ts` (Get ready, installing the skill, the prompt and What to expect, its content in `src/data/agent.ts`), `setup.ts` (the step-by-step view, which collapses as one from a pill that floats at the foot of the screen), `faq.ts` (Running your relay) with `operations.ts` (backing up, restoring and upgrading each setup), `ask.ts` (A place to ask: the three steps, and the button that copies the invite in `index.html`), and click-throughs of Buzz's own screens (`members.ts`, `identity.ts`, `agentflow.ts`, `joinmock.ts`, `buzzapp.ts`).
- `src/lib/values.ts`: the chosen setup, the reader's values and the templating. `DEFAULT_TAG` is the relay image every setup installs, the tag of `tested-image` in SKILL.md; the digest comes from SKILL.md's `tested-digest`.
- The skill is served from its one source, `../skills/self-host-buzz/`: every file at `skills/self-host-buzz/<path>`, and the folder as `skills/self-host-buzz.tar.gz` (a plugin in `vite.config.ts`). `build/skill.ts` parses its Markdown into the step-by-step view at build time. It fails the build when the skill's shape breaks, when the page would show a note for Buzz 0.X, or when a link between the skill's files has no place on the page.
- `public/`: the favicon, the touch icon, `og.png` (rendered from `build/og.html` at 1200 by 630) and `llms.txt`, which points agents at the skill.
- Styles: `src/styles/main.css`, with the design tokens in `src/styles/tokens.css`, and `src/styles/overhaul.css` for Security, the setup switch, the launch checklist, the phones drawing and A place to ask.
