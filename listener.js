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

// Node 20+ has global fetch. If you ever run on older Node, you may need node-fetch.
if (typeof fetch !== "function") {
  throw new Error(
    "Global fetch() is not available. Use Node 20+ or add a fetch polyfill (node-fetch)."
  );
}
//test comment

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

// Clean "ready" event
client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

// Reaction handler: choices (1–5) + draft approval (👍/👎)
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    // Ignore the bot's own reactions
    if (user.bot) return;

    // Because we're using partials, ensure full objects
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    // Only handle reactions in the Basic Breakdown channel
    if (reaction.message.channelId !== CHANNEL_ID) return;

    const emojiName = reaction.emoji.name;

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

      const res = await fetch(N8N_CHOICE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log(
        `Sent choice ${choice} to n8n – HTTP ${res.status} (${emojiName})`
      );
      return; // do not also treat this as approval
    }

    // -------------------------
    // 2) DRAFT APPROVAL: 👍 / 👎
    // -------------------------

    // Only consider messages sent by *this* bot and that look like a draft
    const isBotMessage = reaction.message.author?.id === client.user.id;
    const looksLikeDraft =
      typeof reaction.message.content === "string" &&
      reaction.message.content.includes("Basic Breakdown");

    if (!isBotMessage || !looksLikeDraft) return;

    if (emojiName === "👍" || emojiName === "👎") {
      const approved = emojiName === "👍";

      const payload = {
        approved,
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
        }`
      );
    }
  } catch (err) {
    console.error("Error handling reaction:", err);
  }
});

// Login
client.login(DISCORD_TOKEN);
