# Light

**Private, intelligent browser automation — without sending your screen to the cloud.**

Light is a privacy-first browser AI platform with:

- a **Next.js dashboard**
- a **Chromium Manifest V3 extension**
- a **Node.js/Fastify API**
- a **cloud LLM planner** that receives only redacted structured UI metadata
- **local DOM / accessibility perception**, **PII redaction**, and an **action executor**

For cloud hosting and installation on another computer, follow [DEPLOYMENT.md](./DEPLOYMENT.md).

## Architecture

```
Browser Tab
  → DOM / Accessibility Tree
  → Local Visual Perception (WebGPU/ONNX-ready)
  → Local PII Detection + Redaction
  → Safe Structured UI Representation
  → Cloud LLM Planner (or DEMO planner)
  → Structured Action JSON
  → Local Action Executor
  → Browser
```

The cloud model is a **high-level planner**. Precise clicks/typing happen on-device. Raw screenshots are **not** uploaded by default.

## Monorepo layout

```
light/
├── apps/
│   ├── web/          # Next.js dashboard
│   ├── api/          # Fastify API + WebSocket + Prisma
│   └── extension/    # Chromium MV3 extension
├── packages/
│   ├── schemas/      # Zod schemas (actions, observations)
│   ├── shared/       # IDs, WS events, restricted URL helpers
│   ├── privacy/      # PII detection + redaction
│   ├── vision/       # Vision/OCR provider interfaces
│   ├── ai-provider/  # Demo / OpenAI / Anthropic planners
│   └── agent-core/   # Agent loop + action validation
├── prisma/           # (schema lives in apps/api/prisma)
├── tests/
├── docker-compose.yml
└── .env.example
```

## Quick start

### 1. Prerequisites

- Node.js 20+
- Chromium / Chrome for the extension
- Optional: Docker for PostgreSQL (local default uses SQLite)

### 2. Configure environment

```bash
cp .env.example .env
```

Defaults use **DEMO MODE** and **SQLite** (`DATABASE_URL="file:./dev.db"`) so you can run without Docker or cloud API keys.

To use PostgreSQL instead:

1. Start Postgres (`docker compose up -d db` when Docker is available)
2. Set `DATABASE_URL=postgresql://privai:privai@localhost:5432/privai_agent?schema=public`
3. Change `provider = "postgresql"` in `apps/api/prisma/schema.prisma`
4. Run `npm run db:push`

### 3. Install & initialize

```bash
npm install
npm run build:packages
npm run db:generate -w @privai/api
npm run db:push -w @privai/api
```

### 4. Run API + Web

```bash
npm run dev:api
npm run dev:web
```

- Dashboard: http://localhost:3000
- API health: http://localhost:4000/api/health

### 5. Build & load the extension

```bash
npm run build:extension
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `apps/extension/dist`
4. In the dashboard, open **Onboarding** / generate a pairing code
5. Paste the code into the extension popup → **Connect to Dashboard**

You should see: **Your browser is connected.**

### 6. Run a task

1. Open a normal website (not `chrome://`)
2. Open **Agent** in the dashboard
3. Enter: `Search for wireless headphones`
4. Click **Run**

In DEMO MODE without an extension, the API simulates a store page so the loop still works end-to-end. In LIVE MODE with the extension connected, observations and actions run against the real active tab.

## Modes

| Mode | Behavior |
|------|----------|
| **DEMO MODE** | Rule-based planner; optional simulated page if extension offline. Clearly labeled in UI. |
| **LIVE MODE** | Uses configured cloud provider (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). Never fakes successful browser automation. |

Set:

```env
PRIVAI_MODE=live
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Privacy promise (precise)

We **do not** claim “100% private.”

We do provide:

- **Privacy-first architecture**
- Sensitive visual processing **locally whenever supported**
- **Only minimized structured context** sent to the cloud
- **0 raw screenshots uploaded** by default
- Passwords / cards / tokens replaced with `[REDACTED_*]` tokens

## Security notes

- JWT auth for dashboard; hashed extension pairing tokens
- Zod-validated action schemas — **no `eval` / `new Function` / arbitrary JS from the LLM**
- High-risk actions (payments, deletes, submit, etc.) require **Approval**
- CAPTCHA → agent pauses for human verification
- Restricted pages (`chrome://`, extension pages, etc.) show a clear unsupported message
- Same-Origin Policy / CSP / CAPTCHA / anti-bot systems are **not** bypassed

## Website compatibility

General-purpose perception uses DOM, ARIA, semantics, geometry, shadow DOM (where accessible), and iframe-aware handling where permissions allow. Not every page is automatable — browser-restricted surfaces are handled gracefully.

## Tests

```bash
npm run test -w @privai/privacy
npm run test -w @privai/api
npm run test -w @privai/tests
```

Fixtures under `tests/fixtures/` cover simple HTML, SPA, forms, ecommerce/modals.

Playwright e2e (optional):

```bash
npx playwright install
npm run test:e2e -w @privai/tests
```

## Docker (full stack)

```bash
docker compose up --build
```

## Local vision / ONNX

`packages/vision` defines `VisionProvider` / `OCRProvider`. The extension ships a `models/` folder for quantized ONNX assets. Until models are loaded, perception relies on DOM/accessibility (screenshots still never leave the device by default).

## Definition of done checklist

1. Start backend + frontend
2. Load extension
3. Pair extension ↔ dashboard
4. Open a normal site
5. Enter an instruction
6. Observe → redact → plan → execute → verify → activity/privacy logs update

## License

Proprietary / all rights reserved for the Light project unless otherwise stated.
