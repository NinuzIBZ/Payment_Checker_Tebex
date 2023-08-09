const WebRcon = require("webrconjs");
const axios = require("axios");
const cron = require("node-cron");
const config = require("./config.json");

const oneMonth = 30 * 24 * 60 * 60 * 1000;

const { EmbedBuilder, Client, GatewayIntentBits } = require("discord.js");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

let queue = [];
let checked = new Set();

config.servers.forEach(async (server) => {
  const rcon = new WebRcon(server.ip, server.port);

  rcon.connect(server.password);

  rcon.on("connect", () => {
    console.log(`Connected to server ${server.ip}:${server.port}`);
  });

  rcon.on("disconnect", () => {
    setTimeout(() => {
      rcon.connect(server.password);
    }, 15000);
  });

  rcon.on("error", (err) => {
    console.error(err);
  });

  rcon.on("message", async (msg) => {
    if (msg.identity !== 0) {
      return;
    }

    if (!msg.message.includes("joined")) {
      return;
    }

    const steamIDs = msg.message.match(/7656([0-9]{13})/);

    if (!steamIDs) {
      return;
    }

    let playerId = steamIDs[0];
    if (!checked.has(playerId)) {
      queue.push(playerId);
    }
  });
});

setInterval(() => {
  let playerId = queue.shift();
  if (playerId) {
    checkPackage(playerId);
    checked.add(playerId);
  }
}, 1000);

cron.schedule("0 0 * * *", () => {
  checked.clear();
  console.log("Cleared the checked set.");
});

async function checkPackage(playerId) {
  let url = `https://plugin.tebex.io/player/${playerId}/packages`;
  let options = {
    headers: {
      "X-Tebex-Secret": config.tebex_secret_key,
      "Content-Type": "application/json",
    },
  };

  axios
    .get(url, options)
    .then((response) => {
      for (let purchase of response.data) {
        let purchaseDate = new Date(purchase.date);
        let timeDifference = Date.now() - purchaseDate.getTime();
        if (timeDifference > oneMonth) {
          let formattedPurchaseDate = purchaseDate.toLocaleString();
          const channel = client.channels.cache.get(config.channel_id);
          if (!channel) {
            console.error("Channel not found!");
          }
          const embed = new EmbedBuilder()
            .setTitle("Payment Checker")
            .addFields({
              name: "Steam ID:",
              value: `[${playerId}](https://www.battlemetrics.com/rcon/players?filter%5Bsearch%5D=${playerId})`,
            })
            .addFields({ name: "Package Name", value: purchase.package.name, inline: true })
            .addFields({ name: "Purchase Date", value: formattedPurchaseDate, inline: true })
            .setColor("#0099cc");

          channel.send({ embeds: [embed] });
          return;
        }
      }
      console.log(`Player ${playerId} does not have any package that is older than one month.`);
    })

    .catch((error) => {
      console.error(`Error checking package for player ${playerId}: ${error}`);
    });
}

client.login(config.bot_token);
