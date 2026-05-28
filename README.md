# HumanHands

**Deterministic browser automation infrastructure for AI agents.**

HumanHands converts web applications into structured, machine-readable semantic UI graphs — giving AI agents a reliable, vision-free way to operate browsers at enterprise scale.

---

## Why HumanHands

Traditional browser automation breaks in production because it relies on:
- Pixel coordinates that shift on every deploy
- CSS selectors that change with every framework upgrade
- Screenshots that require expensive vision models to interpret

HumanHands solves this by treating every webpage as a **structured semantic graph** — stable, traversable, and verifiable — that AI agents can plan against without ever seeing a screenshot.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Planning Layer                           │
│              (consumes UIGraph, emits ActionRequests)               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        apps/api  (Fastify)                          │
│                                                                     │
│   POST /execute          POST /extract-ui         GET /health       │
│        │                       │                                    │
│        ▼                       ▼                                    │
│   packages/executor     packages/ui-graph                           │
│   (Playwright)          (UIGraphBuilder)                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 apps/extension  (Plasmo / Chrome MV3)               │
│                                                                     │
│  background.ts          contents/dom-observer.ts                    │
│  (session routing)      (DOM extraction + MutationObserver)         │
│                                │                                    │
│                   lib/dom-extractor.ts                              │
│                   lib/accessibility-parser.ts                       │
│                   lib/action-executor.ts                            │
│                   lib/page-observer.ts                              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
                         Live Web Page
```

### Shared Packages

| Package | Purpose |
|---|---|
| `@humanhands/shared-types` | Zod schemas + TypeScript types for all domain objects |
| `@humanhands/event-system` | Typed EventBus — local subscriptions, future streaming |
| `@humanhands/selector-engine` | Multi-strategy selector generation with fallback chains |
| `@humanhands/ui-graph` | Immutable, traversable semantic UI tree |
| `@humanhands/executor` | Playwright-based deterministic action executor |

---

## Monorepo Structure

```
humanhands/
├── apps/
│   ├── extension/              Plasmo Chrome MV3 extension
│   │   └── src/
│   │       ├── background.ts   Service worker — session routing
│   │       ├── contents/
│   │       │   └── dom-observer.ts   Content script — DOM extraction + observer
│   │       └── lib/
│   │           ├── dom-extractor.ts
│   │           ├── accessibility-parser.ts
│   │           ├── action-executor.ts
│   │           └── page-observer.ts
│   └── api/                    Fastify HTTP API
│       └── src/
│           ├── index.ts
│           ├── server.ts
│           └── routes/
│               ├── health.route.ts
│               ├── execute.route.ts
│               └── extract-ui.route.ts
├── packages/
│   ├── shared-types/           Zod schemas (UIElement, UIGraph, Action, Event, Workflow)
│   ├── event-system/           EventBus with type-safe subscriptions
│   ├── selector-engine/        SelectorGenerator + SelectorEngine
│   ├── ui-graph/               UIGraph + UIGraphBuilder + UIGraphTraversal
│   └── executor/               Executor + ActionRegistry + RetryHandler
├── infrastructure/
│   ├── docker/                 docker-compose.yml + Dockerfile.api + init.sql
│   └── scripts/                setup.sh + setup.ps1
└── turbo.json
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
# Windows
.\infrastructure\scripts\setup.ps1

# macOS / Linux
bash infrastructure/scripts/setup.sh
```

### Start Development

```bash
# All services
pnpm dev

# API only
pnpm --filter=@humanhands/api dev

# Extension only (watch mode)
pnpm --filter=@humanhands/extension dev
```

### Load Extension in Chrome

1. Build the extension: `pnpm --filter=@humanhands/extension build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select `apps/extension/.plasmo/chrome-mv3-dev`

---

## API Reference

### `GET /health`

```json
{ "status": "ok", "version": "0.1.0", "timestamp": "...", "uptime": 42 }
```

### `POST /sessions`

Create a browser session. Returns `{ "sessionId": "..." }`.

### `POST /execute`

Execute a deterministic action in a session.

**Request body (`ActionRequest`):**
```json
{
  "id": "act_001",
  "sessionId": "session_abc",
  "type": "click",
  "target": {
    "kind": "selector",
    "selector": "[data-testid='submit-btn']",
    "fallbackSelectors": ["button[type='submit']", "[aria-label='Submit']"]
  },
  "options": { "timeout": 5000, "retries": 3 }
}
```

**Response (`ActionResult`):**
```json
{
  "success": true,
  "result": {
    "actionId": "act_001",
    "sessionId": "session_abc",
    "type": "click",
    "success": true,
    "timestamp": 1717000000000,
    "duration": 342,
    "retryCount": 0,
    "selectorUsed": "[data-testid='submit-btn']"
  }
}
```

### `POST /extract-ui`

Navigate to a URL and return the full semantic UI graph.

**Request:**
```json
{ "url": "https://example.com/login", "timeout": 15000 }
```

---

## Example: Extracted UI Graph

```json
{
  "pageId": "page_login_1bx7k2",
  "sessionId": "session_abc123",
  "url": "https://app.example.com/login",
  "title": "Login — Example App",
  "timestamp": 1717000000000,
  "version": "1",
  "checksum": "a3f9c2b1",
  "metadata": {
    "viewport": { "width": 1280, "height": 900 },
    "isLoading": false,
    "hasModal": false,
    "totalElementCount": 8,
    "interactableCount": 4
  },
  "interactableIds": ["input_email", "input_password", "button_submit", "link_forgot"],
  "elements": [
    {
      "id": "input_email",
      "role": "input",
      "tagName": "input",
      "text": "",
      "placeholder": "Email address",
      "inputType": "email",
      "selector": {
        "primary": "[name='email']",
        "fallbacks": ["input[type='email']", "[aria-label='Email address']"]
      },
      "visible": true,
      "enabled": true,
      "interactable": true,
      "bounds": { "x": 440, "y": 320, "width": 400, "height": 48 },
      "accessibility": {
        "ariaLabel": "Email address",
        "ariaRequired": true,
        "focusable": true,
        "keyboardAccessible": true
      },
      "depth": 4,
      "pageId": "page_login_1bx7k2"
    },
    {
      "id": "button_submit",
      "role": "button",
      "tagName": "button",
      "text": "Sign in",
      "selector": {
        "primary": "[data-testid='login-submit']",
        "fallbacks": ["button[type='submit']", "[aria-label='Sign in']"]
      },
      "visible": true,
      "enabled": true,
      "interactable": true,
      "bounds": { "x": 440, "y": 440, "width": 400, "height": 52 },
      "accessibility": {
        "ariaRole": "button",
        "focusable": true,
        "keyboardAccessible": true
      },
      "depth": 4,
      "pageId": "page_login_1bx7k2"
    }
  ]
}
```

---

## Example: Action Execution Flow

```
AI Agent
  │
  │  1. POST /sessions → { sessionId: "s1" }
  │  2. POST /execute (navigate to login page)
  │  3. POST /extract-ui → UIGraph with { input_email, input_password, button_submit }
  │  4. POST /execute { type: "type", target: { kind: "selector", selector: "[name='email']" }, value: "user@example.com" }
  │  5. POST /execute { type: "type", target: ..., value: "secret" }
  │  6. POST /execute { type: "click", target: { kind: "selector", selector: "[data-testid='login-submit']" } }
  │  7. POST /extract-ui → new UIGraph (dashboard page)
  │  8. AI verifies expected elements present on dashboard
  │
  └─▶ Deterministic, verifiable, recoverable
```

---

## Key Design Principles

1. **No coordinates.** All actions target semantic selectors, never pixels.
2. **Planning ≠ Execution.** The AI layer never directly controls the browser — it emits `ActionRequest` objects that the executor validates and runs.
3. **Self-healing selectors.** Every element carries a primary selector + fallback chain. The executor walks the chain until a unique match is found.
4. **Immutable UI snapshots.** `UIGraph` objects are frozen at creation. Diffs are always computed from two snapshots — never mutated in place.
5. **Observable.** Every action and DOM change emits typed `WorkflowEvent` objects through the `EventBus`, enabling replay, audit, and future streaming.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo |
| Language | TypeScript 5.6 (strict mode everywhere) |
| Validation | Zod 3 |
| Browser Extension | Plasmo Framework + Chrome MV3 |
| Automation | Playwright |
| API | Fastify 5 |
| Events | EventEmitter3 |
| Database | PostgreSQL 16 (schema-only, Step 2) |
| Package Manager | pnpm 9 |
| Containerization | Docker + docker-compose |

---

## License

Proprietary — HumanHands © 2026
