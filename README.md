Basic Breakdown – Discord Listener

This service is a Discord reaction listener used by the Basic Breakdown newsletter platform.

It listens for reactions in a specific Discord channel and forwards structured events to n8n webhooks, which drive the automated content workflow (topic selection, draft approval, publishing, etc.).

The service runs as a long-lived Node.js process and is designed to be deployed on Railway.

What This Service Does

Listens for reactions in a specific Discord channel

Handles two types of interactions:

Topic voting using reactions 1️⃣–5️⃣

Draft approval / rejection using 👍 and 👎

Sends structured JSON payloads to n8n webhooks

Runs continuously (no HTTP server, no public API)

How It Fits in the System
Discord
  │
  │ (message reactions)
  ▼
Discord Listener (this service)
  │
  │ (webhooks)
  ▼
n8n
  │
  │ (automation + API calls)
  ▼
Backend API / Publishing Pipeline

Tech Stack

Node.js

discord.js

Railway (deployment)

n8n (workflow automation)
