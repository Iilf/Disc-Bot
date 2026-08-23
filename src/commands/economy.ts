import { SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand, replyError } from '../lib/command.js';
import { baseEmbed, errorEmbed, infoEmbed, successEmbed, warnEmbed } from '../lib/embeds.js';
import { crimeFail, crimeWin, getEco, getShop, updateEco, workLines, economyStore } from '../lib/stores.js';
import {
  COLORS,
  formatCoins,
  formatDuration,
  pick,
  randomInt,
  truncate,
  userKey,
} from '../lib/util.js';
import type { Command, EcoProfile } from '../types.js';

const DAILY_COOLDOWN = 20 * 60 * 60 * 1000;
const WORK_COOLDOWN = 30 * 60 * 1000;
const CRIME_COOLDOWN = 60 * 60 * 1000;
const ROB_COOLDOWN = 2 * 60 * 60 * 1000;

function cooldownLeft(last: number, cd: number): number {
  return Math.max(0, last + cd - Date.now());
}

function profileLines(profile: EcoProfile): string {
  return [
    `**Wallet:** ${formatCoins(profile.wallet)}`,
    `**Bank:** ${formatCoins(profile.bank)}`,
    `**Net worth:** ${formatCoins(profile.wallet + profile.bank)}`,
  ].join('\n');
}

export const economyCommands: Command[] = [
  defineCommand({
    category: 'economy',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Check wallet and bank')
      .addUserOption((o) => o.setName('user').setDescription('Whose balance').setRequired(false)),
    async execute(interaction) {
      if (!interaction.guildId) {
        await replyError(interaction, 'Economy is per-server.');
        return;
      }
      const user = interaction.options.getUser('user') ?? interaction.user;
      const profile = await getEco(interaction.guildId, user.id);
      await interaction.reply({
        embeds: [
          baseEmbed(COLORS.gold)
            .setTitle(`${user.username}'s balance`)
            .setDescription(profileLines(profile))
            .setThumbnail(user.displayAvatarURL()),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coins'),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const left = cooldownLeft((await getEco(interaction.guildId, interaction.user.id)).lastDaily, DAILY_COOLDOWN);
      if (left > 0) {
        await interaction.reply({
          embeds: [warnEmbed('Daily already claimed', `Come back in **${formatDuration(left)}**.`)],
          ephemeral: true,
        });
        return;
      }
      const amount = randomInt(220, 420);
      const bonus = Math.random() < 0.12 ? randomInt(80, 180) : 0;
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet += amount + bonus;
        p.lastDaily = Date.now();
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Daily claimed',
            `You received **${formatCoins(amount)}**${bonus ? ` plus a lucky bonus of **${formatCoins(bonus)}**` : ''}.\n${profileLines(profile)}`,
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('work').setDescription('Work a shift for coins'),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const current = await getEco(interaction.guildId, interaction.user.id);
      const left = cooldownLeft(current.lastWork, WORK_COOLDOWN);
      if (left > 0) {
        await interaction.reply({
          embeds: [warnEmbed('On break', `You can work again in **${formatDuration(left)}**.`)],
          ephemeral: true,
        });
        return;
      }
      const charm = current.inventory.charm ?? 0;
      const amount = randomInt(55, 140) + (charm > 0 ? randomInt(15, 40) : 0);
      const line = (await workLines.random()) ?? 'You did a shift and got paid.';
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet += amount;
        p.lastWork = Date.now();
      });
      await interaction.reply({
        embeds: [
          successEmbed('Payday', `${line}\n\nYou earned **${formatCoins(amount)}**.\nWallet: ${formatCoins(profile.wallet)}`),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('crime').setDescription('Commit a risky crime for coins'),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const current = await getEco(interaction.guildId, interaction.user.id);
      const left = cooldownLeft(current.lastCrime, CRIME_COOLDOWN);
      if (left > 0) {
        await interaction.reply({
          embeds: [warnEmbed('Lay low', `Try again in **${formatDuration(left)}**.`)],
          ephemeral: true,
        });
        return;
      }
      const success = Math.random() < 0.52;
      if (success) {
        const amount = randomInt(80, 360);
        const line = (await crimeWin.random()) ?? 'You got away with it.';
        const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
          p.wallet += amount;
          p.lastCrime = Date.now();
        });
        await interaction.reply({
          embeds: [successEmbed('Crime success', `${line}\n\nLoot: **${formatCoins(amount)}**\nWallet: ${formatCoins(profile.wallet)}`)],
        });
        return;
      }
      const fine = Math.min(current.wallet, randomInt(40, 180));
      const line = (await crimeFail.random()) ?? 'You got caught.';
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet -= fine;
        p.lastCrime = Date.now();
      });
      await interaction.reply({
        embeds: [errorEmbed('Busted', `${line}\n\nFine: **${formatCoins(fine)}**\nWallet: ${formatCoins(profile.wallet)}`)],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('deposit')
      .setDescription('Move coins into your bank')
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('How much, or -1 for all').setRequired(true),
      ),
    async execute(interaction) {
      if (!interaction.guildId) return;
      let amount = interaction.options.getInteger('amount', true);
      const current = await getEco(interaction.guildId, interaction.user.id);
      if (amount === -1) amount = current.wallet;
      if (amount <= 0 || amount > current.wallet) {
        await replyError(interaction, 'You do not have that many coins in your wallet.');
        return;
      }
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet -= amount;
        p.bank += amount;
      });
      await interaction.reply({ embeds: [successEmbed('Deposited', profileLines(profile))] });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('withdraw')
      .setDescription('Move coins out of your bank')
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('How much, or -1 for all').setRequired(true),
      ),
    async execute(interaction) {
      if (!interaction.guildId) return;
      let amount = interaction.options.getInteger('amount', true);
      const current = await getEco(interaction.guildId, interaction.user.id);
      if (amount === -1) amount = current.bank;
      if (amount <= 0 || amount > current.bank) {
        await replyError(interaction, 'You do not have that many coins in the bank.');
        return;
      }
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.bank -= amount;
        p.wallet += amount;
      });
      await interaction.reply({ embeds: [successEmbed('Withdrawn', profileLines(profile))] });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Give coins to another member')
      .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('Coins to send').setRequired(true).setMinValue(1),
      ),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      if (user.bot || user.id === interaction.user.id) {
        await replyError(interaction, 'You cannot pay yourself or a bot.');
        return;
      }
      const from = await getEco(interaction.guildId, interaction.user.id);
      if (from.wallet < amount) {
        await replyError(interaction, 'Not enough coins in your wallet.');
        return;
      }
      await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet -= amount;
      });
      await updateEco(interaction.guildId, user.id, (p) => {
        p.wallet += amount;
      });
      await interaction.reply({
        embeds: [successEmbed('Paid', `Sent **${formatCoins(amount)}** to ${userMention(user.id)}.`)],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 6,
    data: new SlashCommandBuilder()
      .setName('gamble')
      .setDescription('50/50 double-or-nothing')
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('Wager').setRequired(true).setMinValue(10),
      ),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const amount = interaction.options.getInteger('amount', true);
      const current = await getEco(interaction.guildId, interaction.user.id);
      if (current.wallet < amount) {
        await replyError(interaction, 'You cannot afford that wager.');
        return;
      }
      const win = Math.random() < 0.48;
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet += win ? amount : -amount;
      });
      await interaction.reply({
        embeds: [
          (win ? successEmbed : errorEmbed)(
            win ? 'You won!' : 'You lost',
            `${win ? 'Doubled' : 'Lost'} **${formatCoins(amount)}**.\nWallet: ${formatCoins(profile.wallet)}`,
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 6,
    data: new SlashCommandBuilder()
      .setName('slots')
      .setDescription('Spin the slot machine')
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('Wager').setRequired(true).setMinValue(10),
      ),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const amount = interaction.options.getInteger('amount', true);
      const current = await getEco(interaction.guildId, interaction.user.id);
      if (current.wallet < amount) {
        await replyError(interaction, 'You cannot afford that wager.');
        return;
      }
      const symbols = ['🍒', '🍋', '🍇', '⭐', '💎', '7️⃣'];
      const spin = [pick(symbols), pick(symbols), pick(symbols)];
      let multiplier = 0;
      if (spin[0] === spin[1] && spin[1] === spin[2]) {
        multiplier = spin[0] === '7️⃣' ? 8 : spin[0] === '💎' ? 6 : 4;
      } else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) {
        multiplier = 1.6;
      }
      const profit = multiplier > 0 ? Math.floor(amount * multiplier) - amount : -amount;
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet += profit;
      });
      await interaction.reply({
        embeds: [
          baseEmbed(profit >= 0 ? COLORS.green : COLORS.red)
            .setTitle('🎰 Slots')
            .setDescription(`**[ ${spin.join(' | ')} ]**\n\n${profit >= 0 ? `Won **${formatCoins(profit + amount)}**` : `Lost **${formatCoins(amount)}**`}\nWallet: ${formatCoins(profile.wallet)}`),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 8,
    data: new SlashCommandBuilder()
      .setName('rob')
      .setDescription('Try to steal wallet coins from someone')
      .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(true)),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const targetUser = interaction.options.getUser('user', true);
      if (targetUser.bot || targetUser.id === interaction.user.id) {
        await replyError(interaction, 'Pick a real person who is not you.');
        return;
      }
      const thief = await getEco(interaction.guildId, interaction.user.id);
      const left = cooldownLeft(thief.lastRob, ROB_COOLDOWN);
      if (left > 0) {
        await interaction.reply({
          embeds: [warnEmbed('Too hot', `You can rob again in **${formatDuration(left)}**.`)],
          ephemeral: true,
        });
        return;
      }
      const victim = await getEco(interaction.guildId, targetUser.id);
      if (victim.wallet < 80) {
        await replyError(interaction, 'They are too broke to rob.');
        return;
      }
      const success = Math.random() < 0.4;
      if (success) {
        const amount = randomInt(20, Math.max(21, Math.floor(victim.wallet * 0.25)));
        await updateEco(interaction.guildId, targetUser.id, (p) => {
          p.wallet -= amount;
        });
        await updateEco(interaction.guildId, interaction.user.id, (p) => {
          p.wallet += amount;
          p.lastRob = Date.now();
        });
        await interaction.reply({
          embeds: [successEmbed('Heist complete', `You stole **${formatCoins(amount)}** from ${userMention(targetUser.id)}.`)],
        });
        return;
      }
      const fine = Math.min(thief.wallet, randomInt(30, 120));
      await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet -= fine;
        p.lastRob = Date.now();
      });
      await interaction.reply({
        embeds: [errorEmbed('Caught', `${userMention(targetUser.id)} got away. You paid a **${formatCoins(fine)}** fine.`)],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 4,
    data: new SlashCommandBuilder().setName('shop').setDescription('Browse the item shop'),
    async execute(interaction) {
      const items = await getShop();
      if (!items.length) {
        await replyError(interaction, 'The shop file is empty.');
        return;
      }
      await interaction.reply({
        embeds: [
          infoEmbed(
            'Item shop',
            items
              .map((i) => `${i.emoji} **${i.name}** — ${formatCoins(i.price)}\n${i.description}  \`${i.id}\``)
              .join('\n\n'),
          ).setFooter({ text: 'Buy with /buy item:<id>' }),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('buy')
      .setDescription('Buy an item from the shop')
      .addStringOption((o) =>
        o.setName('item').setDescription('Item id').setRequired(true).setAutocomplete(true),
      )
      .addIntegerOption((o) =>
        o.setName('amount').setDescription('How many').setMinValue(1).setMaxValue(25).setRequired(false),
      ),
    async autocomplete(interaction) {
      const items = await getShop();
      const focused = interaction.options.getFocused().toLowerCase();
      await interaction.respond(
        items
          .filter((i) => i.id.includes(focused) || i.name.toLowerCase().includes(focused))
          .slice(0, 25)
          .map((i) => ({ name: `${i.emoji} ${i.name} (${i.price})`, value: i.id })),
      );
    },
    async execute(interaction) {
      if (!interaction.guildId) return;
      const id = interaction.options.getString('item', true);
      const amount = interaction.options.getInteger('amount') ?? 1;
      const item = (await getShop()).find((i) => i.id === id);
      if (!item) {
        await replyError(interaction, 'Unknown item id. Check `/shop`.');
        return;
      }
      const cost = item.price * amount;
      const current = await getEco(interaction.guildId, interaction.user.id);
      if (current.wallet < cost) {
        await replyError(interaction, `You need ${formatCoins(cost)}.`);
        return;
      }
      const profile = await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.wallet -= cost;
        p.inventory[item.id] = (p.inventory[item.id] ?? 0) + amount;
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Purchased',
            `Bought **${amount}× ${item.emoji} ${item.name}** for ${formatCoins(cost)}.\nWallet: ${formatCoins(profile.wallet)}`,
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('inventory')
      .setDescription('See your items')
      .addUserOption((o) => o.setName('user').setDescription('Whose bag').setRequired(false)),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const user = interaction.options.getUser('user') ?? interaction.user;
      const profile = await getEco(interaction.guildId, user.id);
      const shop = await getShop();
      const lines = Object.entries(profile.inventory)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => {
          const item = shop.find((s) => s.id === id);
          return `${item?.emoji ?? '📦'} **${item?.name ?? id}** × ${n}`;
        });
      await interaction.reply({
        embeds: [
          infoEmbed(
            `${user.username}'s inventory`,
            lines.join('\n') || 'Empty pockets.',
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 5,
    data: new SlashCommandBuilder()
      .setName('use')
      .setDescription('Use a consumable item')
      .addStringOption((o) => o.setName('item').setDescription('Item id').setRequired(true).setAutocomplete(true)),
    async autocomplete(interaction) {
      if (!interaction.guildId) {
        await interaction.respond([]);
        return;
      }
      const profile = await getEco(interaction.guildId, interaction.user.id);
      const shop = await getShop();
      const focused = interaction.options.getFocused().toLowerCase();
      const owned = Object.entries(profile.inventory)
        .filter(([, n]) => n > 0)
        .map(([id]) => shop.find((s) => s.id === id) ?? { id, name: id, emoji: '📦', price: 0, description: '' });
      await interaction.respond(
        owned
          .filter((i) => i.id.includes(focused) || i.name.toLowerCase().includes(focused))
          .slice(0, 25)
          .map((i) => ({ name: `${i.emoji} ${i.name}`, value: i.id })),
      );
    },
    async execute(interaction) {
      if (!interaction.guildId) return;
      const id = interaction.options.getString('item', true);
      const shop = await getShop();
      const item = shop.find((s) => s.id === id);
      const current = await getEco(interaction.guildId, interaction.user.id);
      if (!current.inventory[id]) {
        await replyError(interaction, 'You do not own that item.');
        return;
      }
      if (id === 'charm') {
        await replyError(interaction, 'Lucky charms stay in your bag and passively boost `/work`.');
        return;
      }
      let flavor = `You used ${item?.emoji ?? ''} **${item?.name ?? id}**. Nice.`;
      await updateEco(interaction.guildId, interaction.user.id, (p) => {
        p.inventory[id] = (p.inventory[id] ?? 1) - 1;
        if (p.inventory[id] <= 0) delete p.inventory[id];
        if (id === 'cookie') p.wallet += 15;
        if (id === 'coffee') p.lastWork = Math.max(0, p.lastWork - 20 * 60 * 1000);
        if (id === 'medkit') p.wallet += 5;
        if (id === 'lootbox') p.wallet += randomInt(40, 220);
        if (id === 'trophy') flavor = 'You hold the trophy up. The server is impressed. It is not consumed.';
        if (id === 'trophy') p.inventory.trophy = (p.inventory.trophy ?? 0) + 1;
      });
      if (id === 'coffee') flavor = 'The coffee shaves 20 minutes off your work cooldown.';
      if (id === 'cookie') flavor = 'You eat the cookie and find **15** coins in the crumbs.';
      if (id === 'lootbox') flavor = 'You rip open the lootbox. Coins spill everywhere.';
      await interaction.reply({ embeds: [successEmbed('Item used', flavor)] });
    },
  }),

  defineCommand({
    category: 'economy',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('baltop').setDescription('Richest members in this server'),
    async execute(interaction) {
      if (!interaction.guildId) return;
      const all = await economyStore.read();
      const rows = Object.entries(all)
        .filter(([key]) => key.startsWith(`${interaction.guildId}:`))
        .map(([key, profile]) => ({
          userId: key.split(':')[1] ?? '',
          net: profile.wallet + profile.bank,
        }))
        .sort((a, b) => b.net - a.net)
        .slice(0, 10);
      if (!rows.length) {
        await interaction.reply({ embeds: [infoEmbed('Economy leaderboard', 'Nobody has coins yet. Try `/daily`.')] });
        return;
      }
      const lines = rows.map((row, i) => `**${i + 1}.** ${userMention(row.userId)} — ${formatCoins(row.net)}`);
      await interaction.reply({
        embeds: [baseEmbed(COLORS.gold).setTitle('💰 Richest members').setDescription(lines.join('\n'))],
      });
    },
  }),
];
