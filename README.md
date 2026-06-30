# KPI Dashboard — Developer Performance Tracker

A web application to track developer KPIs based on **GitHub Projects V2** data.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL + Prisma ORM
- **Data Source**: GitHub GraphQL API (Projects V2)
- **Charts**: Recharts

---

## Getting Started

### 1. Prerequisites

- Node.js 18+
- PostgreSQL running locally (or connection string to a remote DB)
- GitHub Personal Access Token

### 2. Clone & Install

```bash
cd kpi-dashboard
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# PostgreSQL connection
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/kpi_dashboard?schema=public"

# GitHub token (scopes needed: repo, read:project, read:org)
GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Your GitHub username or org name
GITHUB_ORG_OR_USER="your-username"

# Project number (visible in GitHub Project URL)
GITHUB_PROJECT_NUMBER=1

# "user" or "organization"
GITHUB_OWNER_TYPE="user"

# For the GitHub link in the header
NEXT_PUBLIC_GITHUB_ORG_OR_USER="your-username"
```

### 4. Create GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens (use Classic token)
2. Required scopes:
   - `repo` (for accessing issue data)
   - `read:project` (for accessing Projects V2)
   - `read:org` (only if `GITHUB_OWNER_TYPE=organization`)

### 5. Setup Database & Run Migrations

```bash
# Create database & apply migrations
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to inspect data
npx prisma studio
```

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/dashboard`.

---

## Usage

### Sync Data from GitHub

Click the **"Sync GitHub"** button in the top-right of the dashboard, or call the API directly:

```bash
curl -X POST http://localhost:3000/api/sync/github-project
```

The sync is **idempotent** — you can run it multiple times safely. It uses GitHub Project item IDs to upsert records.

### View KPI Data

```bash
# All users
curl http://localhost:3000/api/kpi/users

# With filters
curl "http://localhost:3000/api/kpi/users?start_date=2024-01-01&end_date=2024-12-31&repository=org/repo"
```

---

## Project Structure

```
kpi-dashboard/
├── app/
│   ├── api/
│   │   ├── kpi/
│   │   │   ├── users/route.ts      # GET /api/kpi/users
│   │   │   └── summary/route.ts    # GET /api/kpi/summary
│   │   └── sync/
│   │       └── github-project/route.ts  # POST /api/sync/github-project
│   ├── dashboard/
│   │   └── page.tsx               # Main dashboard UI
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── FilterBar.tsx              # Date range + repo filter
│   ├── KPITable.tsx               # Sortable KPI table
│   ├── SummaryCards.tsx           # Summary stat cards
│   ├── SyncButton.tsx             # Sync trigger button
│   └── UserChart.tsx              # Bar chart (Recharts)
├── lib/
│   ├── github.ts                  # GitHub GraphQL client
│   ├── kpi-service.ts             # KPI calculation logic
│   ├── prisma.ts                  # Prisma singleton
│   ├── repository.ts              # DB access layer
│   └── sync-service.ts            # Sync orchestration
├── prisma/
│   └── schema.prisma              # Database schema
└── .env.example
```

---

## KPI Metrics Explained

| Metric | Description |
|--------|-------------|
| **Total Tasks** | All issues/PRs assigned to the user |
| **Completed Tasks** | Tasks with status `DONE` |
| **Completion Rate** | `completed / (total - cancelled) × 100%` |
| **Avg Cycle Time** | Average days from `createdAt` to `closedAt` for completed tasks |
| **Active Tasks** | Tasks in `TODO` or `IN_PROGRESS` status |

---

## Status Mapping

The app maps GitHub Project V2 status field values to internal statuses:

| GitHub Status | Internal |
|---------------|----------|
| Todo / Backlog | `TODO` |
| In Progress / WIP / Doing | `IN_PROGRESS` |
| Done / Complete / Closed | `DONE` |
| Cancelled | `CANCELLED` |

If a GitHub issue is `CLOSED` state, it's automatically marked as `DONE`.

---

## Troubleshooting

**"Project not found" error**
- Make sure `GITHUB_PROJECT_NUMBER` matches the URL: `github.com/users/USERNAME/projects/NUMBER`
- Ensure the token has `read:project` scope

**Database connection error**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running: `pg_isready`

**No data showing**
- Click "Sync GitHub" button first
- Check the browser console and server logs for errors
