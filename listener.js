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

function sameChannel(channelId) {
  // Ensure both are strings (Discord IDs are strings)
  return String(channelId) === String(CHANNEL_ID);
}

function isThumbsUp(emojiName) {
  // Covers 👍 plus skin-tone variants like 👍🏻👍🏼👍🏽👍🏾👍🏿
  return typeof emojiName === "string" && emojiName.startsWith("👍");
}

function isThumbsDown(emojiName) {
  // Covers 👎 plus skin-tone variants
  return typeof emojiName === "string" && emojiName.startsWith("👎");
}

function looksLikeDraftMessage(message) {
  // Make this stricter if you want:
  // - check for a known header marker
  // - check embed title
  // - check a prefix like "[DRAFT]"
  const content = typeof message.content === "string" ? message.content : "";
  return content.includes("Basic Breakdown");
}

async function ensureFullReaction(reaction) {
  // Because we use partials, fetch if needed
  if (reaction.partial) await reaction.fetch();
  if (reaction.message?.partial) await reaction.message.fetch();
  return reaction;
}

// Clean "ready" event
client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

// Shared handler for add/remove if you ever want it
async function handleReaction({ reaction, user, type }) {
  try {
    if (user?.bot) return;

    await ensureFullReaction(reaction);

    // Only handle reactions in the configured channel
    if (!sameChannel(reaction.message.channelId)) return;

    const emojiName = reaction.emoji?.name ?? "";
    const emojiId = reaction.emoji?.id ?? null;

    // Helpful debug (you can remove once confirmed)
    console.log(`${type} REACTION`, {
      emojiName,
      emojiId,
      identifier: reaction.emoji?.identifier,
      user: user.username,
      userId: user.id,
      messageId: reaction.message.id,
      channelId: reaction.message.channelId,
    });

    // -------------------------
    // 1) TOPIC CHOICE: 1–5
    // -------------------------
    const choice = emojiToChoice[emojiName];
    if (choice && type === "ADD") {
      const payload = {
        choice,
        emoji: emojiName,
        userId: user.id,
        messageId: reaction.message.id,
        channelId: reaction.message.channelId,
        guildId: reaction.message.guildId,
      };

      const res = await fetch(N8N_CHOICE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log(
        `Sent choice ${choice} to n8n – HTTP ${res.status} (${emojiName})`
      );
      return;
    }

    // -------------------------
    // 2) DRAFT APPROVAL: 👍 / 👎
    // -------------------------

    // Only consider messages sent by *this* bot and that look like a draft
    const isBotMessage = reaction.message.author?.id === client.user.id;
    const looksLikeDraft = looksLikeDraftMessage(reaction.message);

    if (!isBotMessage || !looksLikeDraft) return;

    const approved = isThumbsUp(emojiName);
    const rejected = isThumbsDown(emojiName);

    // Only act on add (not remove) to avoid accidental toggles
    if (type !== "ADD") return;

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

    const res = await fetch(N8N_APPROVE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log(
      `Sent draft ${approved ? "approval" : "rejection"} to n8n – HTTP ${
        res.status
      } (${emojiName})`
    );
  } catch (err) {
    console.error("Error handling reaction:", err);
  }
}

// Reaction add
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  await handleReaction({ reaction, user, type: "ADD" });
});

// Optional: reaction remove (not used for approvals, but handy for debugging)
client.on(Events.MessageReactionRemove, async (reaction, user) => {
  await handleReaction({ reaction, user, type: "REMOVE" });
});

// Login
client.login(DISCORD_TOKEN);
