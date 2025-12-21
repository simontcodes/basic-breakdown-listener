require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");

// -------------------------
// ENV VARS (Required)
// -------------------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_CHOICE_WEBHOOK_URL = process.env.N8N_CHOICE_WEBHOOK_URL;
const N8N_APPROVE_WEBHOOK_URL = process.env.N8N_APPROVE_WEBHOOK_URL;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!DISCORD_TOKEN) throw new Error("Missing env var: DISCORD_TOKEN");
if (!N8N_CHOICE_WEBHOOK_URL)
  throw new Error("Missing env var: N8N_CHOICE_WEBHOOK_URL");
if (!N8N_APPROVE_WEBHOOK_URL)
  throw new Error("Missing env var: N8N_APPROVE_WEBHOOK_URL");
if (!CHANNEL_ID) throw new Error("Missing env var: CHANNEL_ID");

// Node 20+ has global fetch.
if (typeof fetch !== "function") {
  throw new Error(
    "Global fetch() is not available. Use Node 20+ or add a fetch polyfill (node-fetch)."
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const emojiToChoice = {
  "1️⃣": 1,
  "2️⃣": 2,
  "3️⃣": 3,
  "4️⃣": 4,
  "5️⃣": 5,
};

// -------------------------
// Helpers
// -------------------------
function sameChannel(channelId) {
  return String(channelId) === String(CHANNEL_ID);
}

function isThumbsUp(emojiName) {
  return typeof emojiName === "string" && emojiName.startsWith("👍");
}

function isThumbsDown(emojiName) {
  return typeof emojiName === "string" && emojiName.startsWith("👎");
}

// ✅ Fix: treat ALL bot messages in the channel as drafts (simple + reliable)
function looksLikeDraftMessage(_message) {
  return true;
}

async function ensureFullReaction(reaction) {
  if (reaction.partial) await reaction.fetch();
  if (reaction.message?.partial) await reaction.message.fetch();
  return reaction;
}

async function postJson(url, payload, label) {
  console.log(`[${label}] POST ->`, url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    console.log(`[${label}] <-`, {
      status: res.status,
      ok: res.ok,
      bodyPreview: text.slice(0, 200),
    });

    return { res, text };
  } catch (err) {
    console.error(`[${label}] ERROR`, err);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// -------------------------
// Ready
// -------------------------
client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log("Config:", {
    CHANNEL_ID: String(CHANNEL_ID),
    N8N_CHOICE_WEBHOOK_URL,
    N8N_APPROVE_WEBHOOK_URL,
  });
});

// -------------------------
// Reaction handling
// -------------------------
async function handleReaction({ reaction, user, type }) {
  try {
    if (user?.bot) return;

    await ensureFullReaction(reaction);

    if (!sameChannel(reaction.message.channelId)) return;

    const emojiName = reaction.emoji?.name ?? "";
    const emojiId = reaction.emoji?.id ?? null;

    console.log(`${type} REACTION`, {
      emojiName,
      emojiId,
      identifier: reaction.emoji?.identifier,
      user: user.username,
      userId: user.id,
      messageId: reaction.message.id,
      channelId: reaction.message.channelId,
    });

    if (type !== "ADD") return;

    // -------------------------
    // 1) TOPIC CHOICE: 1–5
    // -------------------------
    const choice = emojiToChoice[emojiName];
    if (choice) {
      const payload = {
        choice,
        emoji: emojiName,
        userId: user.id,
        messageId: reaction.message.id,
        channelId: reaction.message.channelId,
        guildId: reaction.message.guildId,
      };

      await postJson(N8N_CHOICE_WEBHOOK_URL, payload, `CHOICE ${choice}`);
      return;
    }

    // -------------------------
    // 2) DRAFT APPROVAL: 👍 / 👎
    // -------------------------
    const isBotMessage = reaction.message.author?.id === client.user.id;
    const looksLikeDraft = looksLikeDraftMessage(reaction.message);

    console.log("APPROVAL CHECK", {
      isBotMessage,
      authorId: reaction.message.author?.id,
      botId: client.user.id,
      looksLikeDraft,
      contentPreview: (reaction.message.content || "").slice(0, 120),
    });

    if (!isBotMessage || !looksLikeDraft) return;

    const approved = isThumbsUp(emojiName);
    const rejected = isThumbsDown(emojiName);

    if (!approved && !rejected) return;

    const payload = {
      approved: approved === true,
      emoji: emojiName,
      userId: user.id,
      messageId: reaction.message.id,
      channelId: reaction.message.channelId,
      guildId: reaction.message.guildId,
      draftText: reaction.message.content,
    };

    await postJson(
      N8N_APPROVE_WEBHOOK_URL,
      payload,
      approved ? "APPROVE" : "REJECT"
    );
  } catch (err) {
    console.error("Error handling reaction:", err);
  }
}

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await handleReaction({ reaction, user, type: "ADD" });
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  await handleReaction({ reaction, user, type: "REMOVE" });
});

// -------------------------
// Login
// -------------------------
client.login(DISCORD_TOKEN);
