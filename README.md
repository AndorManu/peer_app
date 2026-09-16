# Peer

Peer is a local React app for adaptive peer-to-peer learning. It starts as a chat, watches how the learner asks and responds, and shifts between simple explanations, technical detail, analogies, Socratic questions, mini challenges, and rubber-duck checking.

## Use it now

**https://peer-app.pages.dev** — no account, no server. Paste your own Anthropic or OpenAI API key under *Settings → AI key* (or when you send your first message). The key is stored only in your browser and sent only to the provider you picked; you pay the provider directly, a study session costs cents. Everything you create stays on your device.

The hosted build is `VITE_STATIC=1 vite build`: it hides the parts that need the local server (image generation, OCR, semantic retrieval over big libraries, the server code runner for languages other than JavaScript/Python, cloud accounts and billing).

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Run the unit tests (no extra dependencies — uses Node's built-in test runner):

```bash
npm test
```

## Add an AI key

Create a `.env` file from `.env.example` and fill in one provider:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

or:

```bash
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

The browser talks to `/api/chat`, and the local Node server talks to the AI provider. That keeps API keys out of frontend code.

## Current MVP

- Adaptive chat prompt with a persistent local learning profile.
- Structured adaptive learning model with implicit signals, style weights, observations, and successful teaching strategies.
- Feedback loop under AI answers: understood, confused, explain differently, too vague, too hard, too long, good example, more technical, more visual, quiz me, teach back, save, regenerate.
- Per-project concept mastery, confidence tracking, misconception memory, and session reflections.
- Teaching recipe generation that turns the learner profile and project memory into concrete prompt guidance.
- Study modes: auto, explain, quiz, rubber duck, challenge, visual, exam prep, and code review.
- Projects and chats stored in browser local storage.
- Project document library with PDF text extraction, preview, and document-grounded prompts.
- Drag/drop study materials directly into the chat; Peer saves them to the active project automatically.
- Supported local material types: PDF, text, markdown, CSV, JSON, common source-code files, and image previews.
- Drag/drop chats onto projects to organize them.
- Saved notes view for important explanations.
- Command palette with `Ctrl + K`.
- Onboarding flow for subject, goal, and language preference.
- Expanded language preferences.
- Dark/light mode, dyslexia-friendly font options, high-legibility font options, and text-size settings.

## Production Next

These are intentionally not hardcoded into the local prototype:

- Real user accounts and cloud sync.
- Database-backed chats, projects, notes, and learning profiles.
- File storage for uploaded PDFs.
- Vector search over document chunks instead of sending large text blocks.
- OCR for scanned PDFs.
- AI vision over attached images.
- Rate limits, usage tracking, and billing safeguards.
