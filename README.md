# Ranch Horse App

Horse assignment system for dude ranch operations.

## Setup Instructions

### Step 1 — Add your API key in Vercel

1. Go to vercel.com and open your ranch-horse-app project
2. Click **Settings** in the top nav
3. Click **Environment Variables** in the left sidebar
4. Click **Add New**
5. Name: `ANTHROPIC_API_KEY`
6. Value: paste your Anthropic API key (from console.anthropic.com)
7. Click **Save**
8. Go to **Deployments** and click **Redeploy** on the latest deployment

### Step 2 — Get your Anthropic API key

1. Go to console.anthropic.com
2. Sign up or log in
3. Click **API Keys** in the left sidebar
4. Click **Create Key**
5. Copy the key and paste it into Vercel (Step 1 above)

## Features

- **Horse Swap** — AI-powered horse matching for any rider profile
- **Horse Roster** — View all horses with their notes and status
- **Guests** — Coming soon
- **Assignment Board** — Coming soon

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- Anthropic Claude API
