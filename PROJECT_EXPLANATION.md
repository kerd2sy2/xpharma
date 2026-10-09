# XPharma System Architecture & Technical Specification

> **Target Audience:** Lead System Architects, Senior Software Engineers, and Technical Stakeholders  
> **Repository:** `d:\xpharma`  
> **Document Status:** Comprehensive System Analysis & Architectural Blueprint  
> **Version:** 2.0 (Post-Audit Edition)

---

## Executive Summary & Architecture Reality Check

Following an exhaustive code scan across all workspace directories (`backend/`, `agent/`, `frontend/`, `web-admin/`), this document details the complete current state of the **XPharma** platform.

> [!IMPORTANT]
> **Key Architectural Finding (Backend Stack Reality Check):**  
> While future specifications target a decoupled **Python / FastAPI** microservices ecosystem and worker fleet, the **current production backend** is implemented in **Go 1.27 (Gin Framework + pgx/v5 PostgreSQL)** with schema-isolated multi-tenancy.  
> The term **"Agent"** currently residing in the codebase refers to a **Windows Desktop On-Premise Sync Agent** (written in Go with native GUI and Firebird 2.5 DB connectors) that extracts data from pharmaceutical warehouse ERPs (specifically **ORGA SOFT**).  
> A dedicated **AI Agent Worker Service** (LLM/RAG/analytics) is **not yet present** in the active codebase and represents a primary greenfield module to be architected.

---

## 1. System Overview

**XPharma** is an enterprise-grade multi-tenant B2B pharmaceutical intelligence and distribution platform operating across Egypt. It bridges legacy on-premise ERP databases located at pharmaceutical distributors/warehouses with a cloud analytics backend, an administrative control panel, and a React Native (Expo) mobile application used by community pharmacies.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ON-PREMISE WAREHOUSES (DISTRIBUTORS)                  │
│                                                                        │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │ Firebird 2.5 ERP         │         │ xpharma-agent.exe         │   │
│   │ (ORGA SOFT - WIN1256 DB) │ ◄──────►│ (Go Windows Tray / Daemon)│   │
│   └──────────────────────────┘  Direct │ - Batching (100 rows)     │   │
│                                 SQL    │ - Gzip compression        │   │
│                                        │ - Resumable Cursors       │   │
└──────────────────────────────────────────────┬─────────────────────────┘
                                               │ HTTPS POST /v1/sync/ingest
                                               │ (API Key Auth + TLS)
                                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        XPHARMA CLOUD PLATFORM                          │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Cloud Backend Service (Current: Go / Envisioned: Python API)   │   │
│   │ - Tenant Connection Router (Dynamic Schema Resolution)         │   │
│   │ - Google & Apple OAuth + Hardware Device Binding               │   │
│   │ - SaaS Subscription Lifecycle & Kashier Payment Webhooks       │   │
│   │ - Pharmacist Query Service (Purchases, Returns, Ledgers)       │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│         ┌─────────────────────────┴─────────────────────────┐          │
│         ▼                                                   ▼          │
│   ┌───────────────────────────────┐   ┌────────────────────────────┐   │
│   │ PostgreSQL Database           │   │ [ENVISIONED WORKER POOL]   │   │
│   │ - public Schema (Master Data) │   │ - Message Queue (Redis)    │   │
│   │ - tenant_* Schemas (Isolated) │   │ - AI Agent Worker (Python) │   │
│   └───────────────────────────────┘   └────────────────────────────┘   │
└───────────────────────────────▲───────────────────────────────▲────────┘
                                │ REST / JWT                    │ Next.js Admin
                                │                               │
┌───────────────────────────────┴────────┐    ┌─────────────────┴────────┐
│ Expo Mobile App (Community Pharmacists)│    │ Next.js 16 Web Admin     │
│ - Hardware Device Integrity Protection │    │ - Multi-Tenant Oversight │
│ - Module Error Boundary Isolation      │    │ - Sync Health Monitor    │
│ - Live Balance, Purchases & Ledgers    │    │ - Subscription Approval  │
└────────────────────────────────────────┘    └──────────────────────────┘
```

### High-Level Interaction Flow
1. **ERP Data Extraction & Transformation:**
   - The on-premise `xpharma-agent.exe` queries Firebird 2.5 (`ORGA.GDB`) on local port `3050`.
   - Converts strings from legacy `Windows-1256` charset to UTF-8.
   - Converts `NUMERIC(15,2)` fixed-point types with negative scaling via `CAST(... AS DOUBLE PRECISION)` to prevent decimal truncation.
   - Bundles transactions into 100-record batches, compresses them via `gzip`, and pushes them to `/v1/sync/ingest`.
2. **Multi-Tenant Ingestion & Schema Routing:**
   - The cloud backend validates the warehouse `X-Agent-Key`.
   - The `TenantRouter` looks up the tenant's dedicated PostgreSQL schema (e.g., `tenant_tabarak`) and executes all inserts/updates within that isolated schema via `SET search_path TO <schema>, public`.
3. **Pharmacy App Consumption:**
   - Community pharmacists authenticate via Google/Apple OAuth on the Expo mobile app.
   - The backend checks a cryptographic hardware device signature (`xpharma_hardware_device_id`) to ensure one active device per subscription.
   - Pharmacists query their account balance, invoice history, itemized receipts, return vouchers, and comprehensive running account statements.

---

## 2. Current Directory Structure

Below is the directory map of the entire workspace (`d:\xpharma`):

```
d:\xpharma\
├── .env                                       # Local environment variables
├── .gitignore
├── ERP_DATABASE_MAP.md                        # Master Firebird 2.5 ERP schema reference (ORGA SOFT)
├── PROJECT_EXPLANATION.md                     # Current document
├── nginx_xpharma.conf                         # Reverse proxy configuration
├── update_vps.sh                              # Production deployment script
│
├── agent/                                     # On-Premise Windows ERP Sync Agent (Go)
│   ├── README.md                              # Agent deployment & operation instructions
│   ├── config.json                            # Local agent config (DB path, IP, token, batch delay)
│   ├── go.mod / go.sum                        # Go module (nakagami/firebirdsql, charmap)
│   ├── logo.png                               # Embedded application branding
│   ├── main.go                                # Single-binary engine: GUI, Tray, Firebird sync (3,778 lines)
│   ├── rsrc_windows_amd64.syso                # Windows binary resource object
│   └── winres/                                # Windows icon and version resource configs
│
├── backend/                                   # Cloud Backend Service (Go Gin)
│   ├── go.mod / go.sum                        # Dependencies (Gin, pgx/v5, golang-jwt/v5)
│   ├── xpharma-backend.service                # Linux systemd daemon definition
│   ├── vps_env.txt / vps_web_env.txt          # Server environment templates
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                        # Backend entrypoint, router configuration, graceful shutdown
│   ├── migrations/                            # PostgreSQL database migration scripts
│   │   ├── 0001_central_schema.sql            # Master public schema: tenants, pharmacies, subscriptions
│   │   ├── 0002_tenant_template.sql           # Template schema for warehouse data isolation
│   │   ├── 0003_tenant_provisioning.sql       # Automation for creating new tenant schemas
│   │   ├── 0004_tenant_products.sql           # Warehouse product catalog schema
│   │   ├── 0005_users.sql                     # End-user profile tables
│   │   ├── 0006_tenant_details.sql            # Metadata extensions for warehouses
│   │   ├── 0007_tenant_category.sql           # Warehouse classification (Pharma, Cosmetics, etc.)
│   │   ├── 0008_warehouse_requests.sql        # Pharmacist warehouse connection requests
│   │   ├── 0009_user_device_and_trial.sql     # Hardware device binding & free trial tracking
│   │   ├── 0010_billing_kashier_support.sql   # Kashier payment gateway fields
│   │   ├── 0011_fix_subscriptions_schema.sql  # Subscription schema updates
│   │   └── 0012_optimize_invoice_items_indexes.sql # Performance B-Tree indexes for line items
│   └── pkg/                                   # Domain Modules (Modular Go Architecture)
│       ├── auth/
│       │   ├── handler.go                     # Google/Apple OAuth, device validation & reset
│       │   └── jwt.go                         # JWT token generation, role & tenant claims
│       ├── db/
│       │   └── router.go                      # Multi-tenant pgxpool connection & schema router
│       ├── ingestion/
│       │   └── engine.go                      # Ingestion pipeline: invoices, returns, receipts, cursors
│       ├── query/
│       │   └── service.go                     # Pharmacist query APIs: balance, invoices, statement, items
│       ├── subscription/
│       │   ├── kashier.go                     # Kashier payment gateway integration & webhook validation
│       │   └── service.go                     # Subscription plan verification, quotas, upgrades
│       └── warehouse/
│           └── service.go                     # Warehouse catalog, Egyptian phone fuzzy matching, linking
│
├── frontend/                                  # Mobile Application (React Native / Expo v54/57)
│   ├── app.json                               # Expo configuration (bundle ID, scheme, icons)
│   ├── package.json                           # Dependencies (expo-router, react-native, lucide, etc.)
│   ├── tsconfig.json                          # Path aliases (@/* -> ./src/*)
│   └── src/
│       ├── app/                               # Expo Router file-based route definitions
│       │   ├── _layout.tsx                    # Root navigation, auth provider, theme, device check
│       │   ├── index.tsx                      # Root index routing to HomeScreen
│       │   ├── login.tsx                      # Login screen route
│       │   ├── explore.tsx                    # Explore tab route
│       │   └── subscription-success.tsx       # Post-checkout success callback route
│       ├── components/                        # Shared UI components & modals
│       │   ├── DeviceMismatchModal.tsx        # Hardware device mismatch blocker modal
│       │   ├── ModuleErrorBoundary.tsx        # React Error Boundary for individual module isolation
│       │   ├── PharmacyVerifyModal.tsx        # Modal for phone verification against ERP records
│       │   ├── PromoBannerCarousel.tsx        # Warehouse promotional banner carousel
│       │   ├── SelectActivePharmaciesModal.tsx# Plan quota pharmacy selector modal
│       │   ├── SubscriptionModal.tsx          # Subscription plans & Kashier checkout trigger
│       │   ├── SubscriptionNoticeModal.tsx    # Trial expiration warning modal
│       │   ├── UnlinkedNoticeModal.tsx        # Modal prompting user to connect to a warehouse
│       │   └── UpgradeProrationModal.tsx      # Mid-cycle subscription upgrade pricing modal
│       ├── context/
│       │   └── AuthContext.tsx                # Global session state, device integrity check, logout
│       ├── features/                          # Domain-specific UI components
│       │   ├── home/                          # Home screen search bar and category filters
│       │   ├── portal/                        # Warehouse portal cards, invoice & return views
│       │   ├── purchases/                     # Invoice cards, invoice details breakdown modal
│       │   ├── receipts/                      # Payment receipt card component
│       │   ├── returns/                       # Return vouchers and itemized credit notes
│       │   ├── settings/                      # Account settings and subscription details
│       │   ├── statement/                     # 8-way union financial account ledger row
│       │   └── warehouses/                    # Warehouse directory card, connection request modal
│       ├── screens/                           # Top-level screen assemblies
│       │   ├── HomeScreen.tsx                 # Main dashboard (Banners, Warehouse Grid, Quick Actions)
│       │   ├── LoginScreen.tsx                # Google & Apple OAuth triggers
│       │   ├── SettingsScreen.tsx             # User profile, device lock status, logout, support
│       │   ├── SubscriptionScreen.tsx         # Comprehensive billing management screen
│       │   └── WarehousePortalScreen.tsx      # Detailed warehouse portal (Invoices, Receipts, Statements)
│       └── services/                          # API communication layer
│           ├── auth.ts                        # Hardware fingerprint computation, OAuth, session storage
│           ├── banner.ts                      # Promotional banner queries
│           ├── subscription.ts                # Subscription API, Kashier checkout session initiation
│           └── warehouse.ts                   # Warehouse directory, linking, invoices, statements
│
└── web-admin/                                 # Enterprise Web Admin Portal (Next.js 16 + Bun)
    ├── package.json                           # Next.js 16, React 19, TailwindCSS, shadcn/ui
    ├── src/
    │   ├── app/                               # Next.js App Router (dashboard, tenants, sync, users)
    │   ├── components/                        # Admin UI design system
    │   └── features/                          # Admin domain modules
```

---

## 3. Module-by-Module Deep Dive

### 3.1 Backend Modules (`backend/pkg/`)

#### 1. Tenant Router & Database Engine (`pkg/db/router.go`)
- **Multi-Tenant Architecture:** Employs a schema-per-tenant pattern within a single PostgreSQL database instance.
- **Dynamic Schema Resolution:** `TenantRouter.ExecInTenant(ctx, tenantID, callback)` checks an in-memory `sync.Map` cache of `tenant_id -> schema_name`. If absent, it queries `public.tenants` and issues `SET search_path TO <schema_name>, public` on the acquired pooled connection.
- **Connection Pool:** Configured via `pgxpool.ParseConfig` with 25 maximum connections, 5 minimum idle connections, and a 5-minute idle timeout.

#### 2. Ingestion Engine (`pkg/ingestion/engine.go`)
- **Endpoint:** `POST /v1/sync/ingest`
- **Security:** Authenticates on-premise agents via `X-Agent-Key`, hashing the provided key with SHA-256 and verifying against `public.tenants.api_key_hash`.
- **Payload Handling:** Decompresses gzip payloads on the fly (`IngestionPayload`).
- **Entity Ingestion:**
  - `Invoices`: Upserts headers and line items into `<tenant_schema>.invoices` and `<tenant_schema>.invoice_items`.
  - `Returns`: Upserts headers and line items into `<tenant_schema>.returns`.
  - `Cash Receipts`: Upserts cash payment vouchers into `<tenant_schema>.cash_receipts`.
  - `Ledger`: Upserts running customer statement entries into `<tenant_schema>.ledger_entries`.
  - `Customers & Products`: Synchronizes customer registry and warehouse medication inventories.
- **Cursor Checkpointing:** Stores incremental cursor progress (`last_invoice_id`, `last_receipt_id`, etc.) in `public.tenant_sync_states`.

#### 3. Pharmacy Query Service (`pkg/query/service.go`)
- **Security Middleware:** `ValidateLinkedPharmacyMiddleware` extracts the JWT claims, verifies the requesting user's identity, and verifies that the pharmacy code is actively linked in `public.pharmacies` without suspension (`is_suspended = FALSE`).
- **Endpoints:**
  - `GET /v1/pharmacy/balance`: Calculates net debit balance across all transactions.
  - `GET /v1/pharmacy/purchases`: Paginated invoice listing with filter by date range.
  - `GET /v1/pharmacy/purchases/:id`: Retrieves full invoice line items (unit price, bonus quantities, discounts).
  - `GET /v1/pharmacy/returns`: Return voucher history with reason codes.
  - `GET /v1/pharmacy/receipts`: Cash collection and payment receipts.
  - `GET /v1/pharmacy/statement`: Executes an 8-way union financial ledger statement query matching ERP accounting logic.

#### 4. Warehouse & Verification Service (`pkg/warehouse/service.go`)
- **Directory Discovery:** `GET /v1/warehouses` returns all active distribution houses with user linking indicators.
- **Fuzzy Egyptian Phone Verification:** When a pharmacist requests to link their account to a warehouse, `VerifyPharmacy` searches `<tenant_schema>.customers`.
  - Implements `normalizeEgyptianPhone` to strip `0020`, leading `20`, and leading zeros.
  - Implements `matchEgyptianPhones` using regex tokenizers to match against delimited phone strings stored in the ERP database.
- **Account Linking:** Issues a cryptographically signed tenant-scoped JWT token when verification succeeds.

#### 5. Auth & Device Binding Module (`pkg/auth/`)
- **OAuth Providers:** Implements Google ID Token verification via Google OAuth endpoints and Apple Identity Token decode.
- **Hardware Device Locking:**
  - Every mobile request carries an identifier computed from immutable hardware chips.
  - `CheckDevice` compares this identifier with `public.users.hardware_device_id`.
  - If a mismatch occurs, the login attempt is blocked (`code: DEVICE_MISMATCH`) to prevent credential sharing among multiple pharmacies.
  - `ResetDevice` permits controlled device migration subject to administrative or trial rules.

#### 6. Subscription & Billing Module (`pkg/subscription/`)
- **Payment Gateway:** Direct integration with **Kashier (Egypt)**.
  - `InitiateSession`: Generates a Kashier payment order with SHA-256 HMAC signature validation.
  - `HandleWebhook` & `HandleRedirect`: Validates Kashier callback signatures, updates `public.subscriptions`, and activates pharmacy account quotas.
- **Multi-Pharmacy Quotas:** Pharmacists choose which pharmacies remain active based on their subscription tier (1, 2, 3, or 5 active warehouses).

---

### 3.2 Frontend Features (`frontend/src/`)

The Expo mobile client is structured using a hybrid approach combining **Expo Router** navigation with **domain-specific feature packages**:

| Feature Directory | Primary Components | Purpose |
| :--- | :--- | :--- |
| `features/home` | `CategoryTabs.tsx`, `HomeSearchBar.tsx` | Category filtering (Medicines, Cosmetics, Medical Supplies) and live search across warehouse catalogs. |
| `features/portal` | `PharmacyMasterCard.tsx`, `PortalSectionCards.tsx`, `PortalSectionListView.tsx`, `InvoiceDetailsView.tsx`, `ReturnDetailsView.tsx` | Dedicated warehouse portal view displaying live balance cards, quick navigation pills, and interactive transaction lists. |
| `features/purchases` | `InvoiceCard.tsx`, `InvoiceDetailsModal.tsx` | Renders purchase invoices, item counts, total/paid amounts, and detailed popups displaying itemized bonuses and discounts. |
| `features/receipts` | `ReceiptCard.tsx` | Renders cash collection receipts issued by warehouse representatives. |
| `features/returns` | `ReturnCard.tsx`, `ReturnDetailsModal.tsx` | Displays credit notes, return reasons, and processed return amounts. |
| `features/statement` | `StatementRow.tsx` | Visual financial statement ledger row color-coded for debit (red) vs credit (green). |
| `features/warehouses` | `WarehouseCard.tsx`, `RequestWarehouseModal.tsx` | Warehouse discovery card with connection badges, link status, and new warehouse request flow. |
| `features/settings` | `SettingsModal.tsx` | Profile information, linked device hardware ID display, subscription tier, and direct WhatsApp support launcher. |

---

### 3.3 On-Premise Sync Agent (`agent/main.go`)

The on-premise agent is a standalone Go binary operating as a Windows background service with a system tray icon:
- **Firebird Connection:** Connects via `nakagami/firebirdsql` with `Legacy_Auth` and `wire_crypt=false`.
- **Charset Transcoding:** Translates Arabic strings from `Windows-1256` charset to standard UTF-8 using `golang.org/x/text/encoding/charmap`.
- **Throttling & Backpressure:**
  - Default batch size: 100 rows.
  - Delay between batches: 1,500ms (`batch_delay_ms`) to avoid locking Firebird table pages while distributor sales reps are actively billing.
- **Cursor Tracking:** Stores cursor positions in `config.json` (`last_invoice_id`, `last_receipt_id`, `last_return_id`) to ensure resume-on-failure without duplicate data transmission.

---

## 4. Resilience & Fault Tolerance Mechanisms

### 4.1 Frontend Component-Level Error Isolation
The mobile application implements robust React Error Boundaries via `ModuleErrorBoundary.tsx`:
- **Implementation:**
  ```tsx
  // frontend/src/components/ModuleErrorBoundary.tsx
  export default class ModuleErrorBoundary extends Component<Props, State> {
    public state: State = { hasError: false, error: null };
    public static getDerivedStateFromError(error: Error): State {
      return { hasError: true, error };
    }
    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
      console.error('ModuleErrorBoundary caught an error in submodule:', error, errorInfo);
    }
    // Renders calm fallback card with retry button instead of a white crash screen
  }
  ```
- **Active Usage in Production Screens:**
  In `WarehousePortalScreen.tsx` and `HomeScreen.tsx`, individual UI widgets are wrapped independently:
  - Balance Card is wrapped in its own `ModuleErrorBoundary`.
  - Invoices List is wrapped in its own `ModuleErrorBoundary`.
  - Returns and Receipts sections are each isolated.
  - **Result:** If an unhandled null pointer or corrupted date appears in an invoice payload, only the invoice widget displays a localized fallback message with an "إعادة المحاولة" (Retry) button. Navigation, profile access, and other warehouse portals remain fully interactive.

### 4.2 Backend Resilience
- **Database Multi-Tenant Isolation:** Because warehouse data is split across PostgreSQL schemas, a corrupt table or query failure in `tenant_warehouse_a` has zero impact on `tenant_warehouse_b`.
- **Graceful Shutdown:** `backend/cmd/server/main.go` captures `SIGINT` and `SIGTERM` signals, completing in-flight HTTP requests within a 5-second context timeout before releasing database connections.

### 4.3 Resilience Gaps & Vulnerabilities
- **Absence of Circuit Breakers:** External HTTP requests (e.g., calls to Kashier, external OAuth validation) do not utilize a Circuit Breaker pattern. If Kashier's API experiences high latency, backend worker threads will hold connections until timeouts expire.
- **Missing Frontend Retry with Backoff:** In `frontend/src/services/warehouse.ts`, network calls execute standard `fetch` without an automated retry loop, exponential backoff, or offline SQLite/WatermelonDB fallback caching.

---

## 5. Event-Driven & Background Tasks

### Current Implementation State
- **Polling-Based Ingestion:** Background synchronization between the on-premise ERP and the cloud backend is currently handled via **client-side scheduled polling** inside `xpharma-agent.exe`. The agent runs a 60-second ticker loop:
  ```go
  // agent/main.go ticker loop
  ticker := time.NewTicker(time.Duration(cfg.SyncIntervalSeconds) * time.Second)
  for range ticker.C {
      syncEngine.RunIncrementalSync()
  }
  ```
- **Synchronous Ingestion Processing:** When `/v1/sync/ingest` receives the batch, the backend executes the database inserts and updates synchronously within the HTTP handler transaction.

### Missing Event Infrastructure
- **No Message Broker (RabbitMQ / Redis):** Background jobs are not currently queued through an AMQP or Redis message bus.
- **No Asynchronous Task Workers:** Complex operations (such as processing thousands of historical ledger records or generating multi-month financial statements) run on the web server's request threads rather than being delegated to Celery, ARQ, or Asynq background workers.

---

## 6. AI Agent Integration

### Current Status: Greenfield / Missing Module
As identified in Section 1, there is **no AI Agent integration** currently present in the codebase:
- **No LLM Integration:** Zero references to OpenAI, Anthropic, Google Gemini, or local models.
- **No RAG Pipeline:** No vector databases (pgvector, Chroma, Qdrant) or embeddings models for medication search, alternative drug matching, or invoice anomaly detection.
- **No WebSocket / Async Task Endpoints:** The API has no `/v1/agent/chat`, `/v1/agent/tasks`, or WebSocket subscription streams.

### Required Architecture for AI Agent Service
To comply with the Micro-Modular Architecture rules:
1. **Isolated Worker Service:** The AI Agent must be deployed as an independent Python service (FastAPI + LangChain/LlamaIndex or Google GenAI SDK).
2. **Decoupled Job Dispatch:** The main API will receive user prompts, validate tokens, persist a `Task` entity, and push a job to a Redis queue with status `202 Accepted`.
3. **Non-Blocking Delivery:** The Expo mobile app will subscribe to progress via WebSockets or poll `/v1/agent/tasks/:id` to receive progressive streaming responses without blocking UI threads.

---

## 7. Structural Gap Analysis & Missing Pieces

To align the current repository with the **Micro-Modular Architecture & Core Coding Standards**, the following architectural changes are required:

| Component | Current State | Required Target State |
| :--- | :--- | :--- |
| **Backend Technology** | Go 1.27 (Gin monolith) | Modular Python / FastAPI microservices (or clean Go-to-Python hybrid service boundaries). |
| **Feature Isolation** | Services in `frontend/src/services/` are centralized (`warehouse.ts`, `auth.ts`, `subscription.ts`). | Co-locate services, types, hooks, and components strictly inside each `frontend/src/features/<feature>/` directory. |
| **Circuit Breakers** | None implemented. | Wrap all external integrations (ERP agent ingest, payment gateway, OAuth providers) with Circuit Breakers. |
| **Message Broker** | Direct synchronous HTTP ingest. | Integrate Redis / RabbitMQ with Celery / ARQ workers for asynchronous task processing. |
| **AI Agent Fleet** | Not implemented. | Greenfield standalone AI Agent worker handling inventory intelligence, voice ordering, and ERP ledger Q&A. |
| **Offline Cache (Expo)** | Memory-only session caching via `SecureStore`. | Implement a resilient offline-first cache (WatermelonDB or TanStack Query + AsyncStorage) to allow offline browsing of past invoices. |

---

## Conclusion & Architectural Recommendation

The **XPharma** project boasts a functional, high-performance foundation:
- Schema-isolated multi-tenancy in PostgreSQL ensures enterprise data privacy.
- The Go Windows Agent solves challenging legacy ERP extraction problems (Windows-1256 charset, negative numeric scaling, backpressure throttling).
- The Expo mobile application already implements UI component error boundaries (`ModuleErrorBoundary.tsx`) and hardware device binding.

**Next Immediate Steps:**
1. Maintain the stability of the core Go ingestion engine while introducing a **Python / FastAPI worker service** for the AI Agent and background tasks.
2. Deploy a **Redis message broker** to decouple heavy ERP ledger reconciliations from the web HTTP request-response cycle.
3. Complete the domain-driven refactoring of `frontend/src/features/` by moving global service calls into self-contained feature modules with local fallback states.
