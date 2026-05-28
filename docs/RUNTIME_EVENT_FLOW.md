# HumanHands Runtime Event Flow

## Step 2 — Live Browser Runtime

### Startup Sequence

```
Chrome Extension Load
        │
        ▼
[contents/runtime.ts] — Plasmo injects content script
        │
        ├─ new RuntimeManager({ sessionId, onGraphUpdate, onActionResult })
        │
        ├─ RuntimeManager.init()
        │        │
        │        ├─ IncrementalDomExtractor.fullExtract()
        │        │      → scans all 30+ extractable element types
        │        │      → stamps each with data-hh-id
        │        │      → builds ElementRegistry: Map<hhId, Entry>
        │        │      → wires parent-child relationships
        │        │
        │        ├─ UIGraph constructed
        │        │      → checksum computed
        │        │      → interactable/form/modal IDs indexed
        │        │
        │        └─ SmartMutationObserver.start()
        │               → observes childList + selected attributes
        │               → intercepts history.pushState / replaceState
        │               → polls URL for SPA fallback
        │
        ├─ sendToBackground('OBSERVER_READY', { sessionId, url })
        └─ sendToBackground('UI_GRAPH_UPDATE', graph)
                │
                ▼
        [background/index.ts]
                │
                ├─ SessionManager.createOrUpdate(tabId, sessionId, url)
                ├─ SessionManager.updateGraph(tabId, graph)
                └─ WebSocketClient.send({ type: 'UI_GRAPH_UPDATE', graph })
                         │ (if backend connected)
                         ▼
                   Backend API / AI Planning Layer
```

---

### Mutation → Incremental Update Flow

```
User clicks button / DOM mutates
        │
        ▼
MutationObserver callback fires
        │
        ├─ Mutations buffered in pendingMutations[]
        ├─ Debounce timer reset (350ms)
        │
        [350ms later]
        │
        ▼
SmartMutationObserver.flushBatch()
        │
        ├─ buildBatch(mutations) →
        │      categories: Set<MutationCategory>
        │      addedSubtrees: Element[]      ← roots of newly added subtrees
        │      removedNodes: { hhId, node }[]  ← removed DOM nodes w/ hhIds
        │      modifiedHhIds: string[]       ← attr-changed element IDs
        │
        ▼
RuntimeManager.handleMutationBatch(batch)
        │
        ├─ [route-change?]
        │      → generatePageId()
        │      → extractor.fullExtract() after 600ms
        │
        └─ [structural/attribute change]
               │
               ▼
        IncrementalDomExtractor.incrementalUpdate(
          addedSubtrees,
          removedHhIds,
          modifiedHhIds
        )
               │
               ├─ Remove stale entries from registry
               ├─ Re-extract modified elements
               ├─ Scan added subtrees for new elements
               ├─ Re-wire parent-child for changed elements
               └─ Return { elements, added, removed, modified }
                      │
                      ▼
               [changed?] → buildGraph(elements)
                      │
                      ├─ RuntimeStateSync.setGraph(graph)
                      └─ onGraphUpdate(graph)
                               │
                               ▼
                        sendToBackground('UI_GRAPH_UPDATE', graph)
```

---

### Action Execution Flow

```
Background receives: EXECUTE_ACTION (from API or external)
        │
        ▼
MessageRouter routes to tab via chrome.tabs.sendMessage
        │
        ▼
contents/runtime.ts receives 'EXECUTE_ACTION'
        │
        ▼
RuntimeManager.executeAction(request)
        │
        ▼
ActionRuntime.execute(request)
        │
        ├─ captureSnapshot(pre)
        │      → url, focusedEl, targetValue, modalCount
        │
        ├─ executeWithRetry(request)
        │      ├─ resolveTarget()
        │      │      kind='selector' → document.querySelector(selector)
        │      │                        + fallback chain
        │      │      kind='element-id' → [data-hh-id="..."]
        │      │      kind='text'       → text content search
        │      │
        │      └─ executeSingle()
        │             click  → scrollIntoView + MouseEvent + .click()
        │             type   → .focus() + .value= + input/change events
        │             select → .value= + change event
        │             etc.
        │
        ├─ waitForSettle() [400ms + loader detection]
        │
        ├─ captureSnapshot(post)
        │
        ├─ verify(request, pre, post)
        │      click   → url changed? modal appeared? focus changed?
        │      type    → post.targetValue === request.value?
        │      select  → post.targetValue === request.value?
        │      navigate → post.url includes request.url?
        │
        ├─ scheduleExtraction('post-action')  [200ms]
        │      → fullExtract() → rebuild graph → emit update
        │
        └─ sendToBackground('ACTION_RESULT', result)
                 └─ WebSocketClient.send(result) → API → AI Layer
```

---

### Event Types Reference

| Event | Source | Payload |
|---|---|---|
| `RUNTIME_READY` | RuntimeStateSync | `{ url }` |
| `GRAPH_UPDATED` | RuntimeStateSync | `{ checksum, diff }` |
| `ACTION_STARTED` | RuntimeStateSync | `{ actionId, type }` |
| `ACTION_COMPLETED` | RuntimeStateSync | `{ actionId, success, verification }` |
| `ACTION_FAILED` | RuntimeStateSync | `{ actionId, error }` |
| `ACTION_VERIFICATION_FAILED` | RuntimeStateSync | `{ actionId, verification }` |
| `ROUTE_CHANGED` | RuntimeStateSync | `{ url, title }` |
| `LOADING_STARTED` | RuntimeStateSync | `{}` |
| `LOADING_ENDED` | RuntimeStateSync | `{}` |
| `EVENT_LOG_CLEARED` | RuntimeStateSync | `{}` |

---

### Debug Interface

In browser DevTools console:

```javascript
// Inspect current UI graph
window.__HUMANHANDS_DEBUG__.getGraph()

// Get runtime state
window.__HUMANHANDS_DEBUG__.getState()

// Test a selector
window.__HUMANHANDS_DEBUG__.testSelector('[data-testid="submit"]')
// → { count: 1, unique: true, element: HTMLElement }

// List all interactable elements
window.__HUMANHANDS_DEBUG__.listInteractable()

// Force full re-extraction
window.__HUMANHANDS_DEBUG__.forceExtract()

// Run an action
await window.__HUMANHANDS_DEBUG__.runAction('click', '#submit-btn')

// Get ARIA landmarks
window.__HUMANHANDS_DEBUG__.getLandmarks()

// Tab order
window.__HUMANHANDS_DEBUG__.getTabOrder()

// Event log (last 200 events)
window.__HUMANHANDS_DEBUG__.getEventLog()

// Inspect specific element by HH ID
window.__HUMANHANDS_DEBUG__.inspectElement('button_abc123')
```

---

### API Endpoints (Step 2 Additions)

```
GET  /stream/events?sessionId=<id>    SSE stream of WorkflowEvents
GET  /stream/status                    Streaming readiness + EventBus stats
POST /graphs                           Ingest graph snapshot from extension
GET  /graphs/:sessionId                Get latest graph for session
GET  /graphs/:sessionId/elements       Query elements (role/text/interactable)
GET  /graphs/:sessionId/validate-selector?selector=...   Validate selector
```
