# Finance Tab Architecture

## Decision Summary

- **Chatty** is the primary application
- **Finance** is a first-class tab/section within Chatty
- **FXShinobi** is a finance app that plugs into the Finance tab
- Users can connect multiple finance services; FXShinobi is the first integration

## Architecture Overview

```
Chatty (Host App)
├── Finance Tab (/app/finance)
│   ├── Finance Overview (app list, quick stats, connections)
│   └── FXShinobi Dashboard (/app/finance/fxshinobi)
│       ├── TradingView Chart Widgets
│       ├── Kalshi-style Market Tiles
│       ├── Perplexity-style Insights Panel
│       └── Trade History Table
└── Other Tabs (Chat, VVAULT, Library, etc.)
```

## FinanceApp Interface

Located at `src/types/finance.ts`:

```typescript
interface FinanceApp {
  id: string;                        // Unique identifier (e.g., 'fxshinobi')
  name: string;                      // Display name
  description: string;               // Short description
  icon: string;                      // Icon name from lucide-react
  route: string;                     // Primary route (e.g., '/app/finance/fxshinobi')
  version: string;                   // App version
  author?: string;                   // Developer/author
  dataSources: FinanceAppDataSource[];
  requiredCredentials: FinanceAppCredential[];
  widgets: FinanceAppWidget[];
  enabled: boolean;
  category: 'trading' | 'analytics' | 'portfolio' | 'research' | 'automation';
}
```

## Registering FXShinobi

FXShinobi is registered in the `financeAppRegistry` at `src/types/finance.ts`:

```typescript
const fxShinobiApp: FinanceApp = {
  id: 'fxshinobi',
  name: 'FXShinobi',
  description: 'Trading signals, analytics, and automated strategy execution',
  icon: 'TrendingUp',
  route: '/app/finance/fxshinobi',
  version: '1.0.0',
  author: 'LIFE Technology',
  category: 'trading',
  enabled: true,
  dataSources: [
    { type: 'api', endpoint: '/api/fxshinobi', refreshInterval: 30000 },
    { type: 'supabase', tables: ['fx_sessions', 'fx_trades', 'strategy_runs', 'price_snapshots'] }
  ],
  requiredCredentials: [
    { id: 'broker_api_key', name: 'Broker API Key', type: 'api_key', required: false }
  ],
  widgets: [
    { id: 'chart', type: 'chart', title: 'Price Chart', defaultSize: 'large' },
    { id: 'markets', type: 'tiles', title: 'Active Markets', defaultSize: 'medium' },
    { id: 'insights', type: 'insights', title: 'AI Insights', defaultSize: 'medium' },
    { id: 'trades', type: 'table', title: 'Recent Trades', defaultSize: 'full' }
  ]
};
```

## Routes and Components

### New Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/app/finance` | `FinancePage.tsx` | Finance hub overview |
| `/app/finance/fxshinobi` | `FXShinobiPage.tsx` | FXShinobi trading dashboard |

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `FinancePage` | `src/pages/FinancePage.tsx` | Main finance overview with app cards |
| `FXShinobiPage` | `src/pages/finance/FXShinobiPage.tsx` | FXShinobi dashboard |
| `ConnectServiceModal` | `src/components/finance/ConnectServiceModal.tsx` | Connect broker/service UI |

### Sidebar Navigation

Finance tab added to Sidebar between Library and "Get More" apps.

## Data Flow

### FXShinobi API Endpoints (Planned)

> **Note**: These endpoints are planned/proposed. The frontend currently uses mock fallback data while the backend routes are implemented.

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/fxshinobi/snapshot` | GET | Current market snapshot | Planned |
| `/api/fxshinobi/trades/history` | GET | Recent trade history | Planned |
| `/api/fxshinobi/performance` | GET | Performance metrics | Planned |
| `/api/fxshinobi/markets` | GET | Prediction market data | Planned |
| `/api/fxshinobi/insights` | GET | AI-generated insights | Planned |

### Data Hooks

Located at `src/hooks/useFinanceData.ts`:

- `useMarketSnapshot(symbol)` - Real-time price data
- `useTradeHistory()` - Recent trades with P&L
- `usePerformanceMetrics()` - Win rate, Sharpe, drawdown
- `useKalshiMarkets()` - Prediction market tiles
- `useFinanceInsights()` - AI insights and alerts

## Supabase Schema (Proposed)

> **Note**: These tables are proposed for the finance integration. Run the SQL migration below to create them in Supabase.

### Tables (Chatty reads, FXShinobi writes)

```sql
-- Trading sessions
CREATE TABLE fx_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  strategy TEXT,
  notes TEXT
);

-- Individual trades
CREATE TABLE fx_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES fx_sessions(id),
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  pnl NUMERIC,
  status TEXT DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  strategy TEXT,
  metadata JSONB
);

-- Strategy execution runs
CREATE TABLE strategy_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  trades_count INTEGER DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  config JSONB,
  results JSONB
);

-- Price snapshots for charting
CREATE TABLE price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  price NUMERIC NOT NULL,
  bid NUMERIC,
  ask NUMERIC,
  volume NUMERIC,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- User finance service connections
CREATE TABLE user_finance_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  metadata JSONB,
  UNIQUE(user_id, service_id)
);
```

### Read/Write Responsibility

| Table | FXShinobi | Chatty |
|-------|-----------|--------|
| fx_sessions | Write | Read |
| fx_trades | Write | Read |
| strategy_runs | Write | Read |
| price_snapshots | Write | Read |
| user_finance_connections | Read/Write | Read/Write |

## VVAULT Integration (Proposed)

> **Note**: The VVAULT finance endpoints below are proposed. The client is implemented but backend routes need to be added to VVAULT.

### Credential Storage

VVAULT stores user-linked finance credentials securely:

```typescript
// Store credentials
await storeFinanceCredentials(userId, {
  serviceId: 'fxshinobi',
  serviceName: 'FXShinobi',
  credentials: { api_key: '...', api_secret: '...' }
});

// Retrieve credentials
const creds = await getFinanceCredentials(userId, 'fxshinobi');
```

### VVAULT Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/finance/credentials` | POST | Store service credentials |
| `/finance/credentials/:serviceId` | GET | Retrieve credentials |
| `/finance/connections` | GET | List user connections |
| `/finance/connections/:id` | DELETE | Disconnect service |
| `/finance/connections/:id/test` | POST | Test connection |
| `/finance/construct-state` | POST | Save construct state |
| `/finance/construct-state/:constructId/:appId` | GET | Get construct state |

## Background Processing

**Recommended Pattern**: FXShinobi runs as the worker engine; Chatty is the UI host.

### Why This Separation?

1. **Reliability**: FXShinobi can run 24/7 independently
2. **Scalability**: Trading logic doesn't compete with UI resources
3. **Flexibility**: FXShinobi can serve multiple frontends
4. **Simplicity**: Chatty stays lightweight as a UI layer

### Data Flow

```
FXShinobi Workers (24/7)
    │
    ├── Execute trading strategies
    ├── Monitor markets
    ├── Process signals
    │
    └── Write to Supabase
            │
            ▼
        Supabase
            │
            ▼
        Chatty UI (reads)
            │
            └── Display dashboards
```

## Environment Variables

### Frontend (Vite)

```env
VITE_FXSHINOBI_API_URL=/api/fxshinobi
VITE_VVAULT_API_URL=/api/vvault
```

### Backend

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
VVAULT_API_BASE_URL=https://vvault-api.example.com
```

## Next Actions

### Files to Create/Modify

1. ✅ `src/types/finance.ts` - TypeScript interfaces and registry
2. ✅ `src/hooks/useFinanceData.ts` - Data fetching hooks
3. ✅ `src/lib/vvaultFinanceClient.ts` - VVAULT integration
4. ✅ `src/pages/FinancePage.tsx` - Finance overview
5. ✅ `src/pages/finance/FXShinobiPage.tsx` - FXShinobi dashboard
6. ✅ `src/components/finance/ConnectServiceModal.tsx` - Service connection UI
7. ✅ `src/main.tsx` - Add finance routes
8. ✅ `src/components/Sidebar.tsx` - Add Finance nav item

### Backend API Routes (Future)

Create `/server/routes/fxshinobi.js` to proxy requests to FXShinobi API:

```javascript
import express from 'express';
const router = express.Router();

router.get('/snapshot', async (req, res) => {
  // Proxy to FXShinobi API or read from Supabase
});

router.get('/trades/history', async (req, res) => {
  // Fetch from Supabase fx_trades table
});

export default router;
```

### Supabase Migration

Run the SQL schema above to create finance tables in Supabase.
