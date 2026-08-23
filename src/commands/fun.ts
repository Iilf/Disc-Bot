import { SlashCommandBuilder, userMention } from 'discord.js';
import { defineCommand, replyError } from '../lib/command.js';
import { baseEmbed, infoEmbed } from '../lib/embeds.js';
import {
  compliments,
  eightball,
  facts,
  fortunes,
  getTrivia,
  jokes,
  roasts,
  wouldYouRather,
} from '../lib/stores.js';
import { COLORS, pick, randomInt, truncate } from '../lib/util.js';
import type { Command } from '../types.js';

const RPS = ['rock', 'paper', 'scissors'] as const;

export const funCommands: Command[] = [
  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('8ball')
      .setDescription('Ask the magic eight ball')
      .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true)),
    async execute(interaction) {
      const question = interaction.options.getString('question', true);
      const answer = (await eightball.random()) ?? 'Reply hazy. Try again.';
      await interaction.reply({
        embeds: [
          baseEmbed(COLORS.blurple)
            .setTitle('🎱 Magic 8-Ball')
            .addFields(
              { name: 'Question', value: truncate(question, 500) },
              { name: 'Answer', value: `**${answer}**` },
            ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('Flip a coin')
      .addStringOption((o) =>
        o
          .setName('call')
          .setDescription('Optional call')
          .addChoices({ name: 'heads', value: 'heads' }, { name: 'tails', value: 'tails' })
          .setRequired(false),
      ),
    async execute(interaction) {
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const call = interaction.options.getString('call');
      const extra = call ? (call === result ? 'You called it!' : 'Wrong call.') : 'No call.';
      await interaction.reply({
        embeds: [infoEmbed('🪙 Coin flip', `It landed on **${result}**.\n${extra}`)],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('dice')
      .setDescription('Roll dice')
      .addIntegerOption((o) =>
        o.setName('sides').setDescription('Sides per die').setMinValue(2).setMaxValue(1000).setRequired(false),
      )
      .addIntegerOption((o) =>
        o.setName('count').setDescription('How many dice').setMinValue(1).setMaxValue(20).setRequired(false),
      ),
    async execute(interaction) {
      const sides = interaction.options.getInteger('sides') ?? 6;
      const count = interaction.options.getInteger('count') ?? 1;
      const rolls = Array.from({ length: count }, () => randomInt(1, sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      await interaction.reply({
        embeds: [
          infoEmbed(
            `🎲 ${count}d${sides}`,
            count === 1 ? `You rolled **${total}**.` : `Rolls: ${rolls.join(', ')}\nTotal: **${total}**`,
          ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('rps')
      .setDescription('Rock paper scissors')
      .addStringOption((o) =>
        o
          .setName('choice')
          .setDescription('Your move')
          .setRequired(true)
          .addChoices(
            { name: 'rock', value: 'rock' },
            { name: 'paper', value: 'paper' },
            { name: 'scissors', value: 'scissors' },
          ),
      ),
    async execute(interaction) {
      const choice = interaction.options.getString('choice', true) as (typeof RPS)[number];
      const bot = pick(RPS);
      const beats: Record<(typeof RPS)[number], (typeof RPS)[number]> = {
        rock: 'scissors',
        paper: 'rock',
        scissors: 'paper',
      };
      const result = choice === bot ? 'Tie!' : beats[choice] === bot ? 'You win!' : 'I win!';
      await interaction.reply({
        embeds: [infoEmbed('✊ Rock Paper Scissors', `You: **${choice}**\nMe: **${bot}**\n\n**${result}**`)],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 4,
    data: new SlashCommandBuilder().setName('joke').setDescription('Tell a stored joke'),
    async execute(interaction) {
      const joke = (await jokes.random()) ?? 'I forgot all my jokes.';
      await interaction.reply({ embeds: [infoEmbed('😂 Joke', joke)] });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 4,
    data: new SlashCommandBuilder().setName('fact').setDescription('A random fact from facts.json'),
    async execute(interaction) {
      const fact = (await facts.random()) ?? 'Facts file is empty.';
      await interaction.reply({ embeds: [infoEmbed('🧠 Fact', fact)] });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('compliment')
      .setDescription('Compliment someone')
      .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(false)),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const line = (await compliments.random()) ?? 'You are doing great.';
      await interaction.reply({
        embeds: [baseEmbed(COLORS.pink).setTitle('💖 Compliment').setDescription(`${userMention(user.id)}, ${line}`)],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 4,
    data: new SlashCommandBuilder()
      .setName('roast')
      .setDescription('Light-hearted roast')
      .addUserOption((o) => o.setName('user').setDescription('Victim').setRequired(false)),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const line = (await roasts.random()) ?? 'I would roast you, but I am on a diet.';
      await interaction.reply({
        embeds: [baseEmbed(COLORS.red).setTitle('🔥 Roast').setDescription(`${userMention(user.id)}, ${line}`)],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('ship')
      .setDescription('Ship two people')
      .addUserOption((o) => o.setName('one').setDescription('First person').setRequired(true))
      .addUserOption((o) => o.setName('two').setDescription('Second person').setRequired(false)),
    async execute(interaction) {
      const one = interaction.options.getUser('one', true);
      const two = interaction.options.getUser('two') ?? interaction.user;
      const score = Number(
        `${[...one.id].reduce((a, c) => a + c.charCodeAt(0), 0) + [...two.id].reduce((a, c) => a + c.charCodeAt(0), 0)}`,
      ) % 101;
      const label =
        score > 90 ? 'Soulmates' : score > 75 ? 'On fire' : score > 50 ? 'Cute' : score > 25 ? 'Awkward' : 'Yikes';
      const name = `${one.username.slice(0, Math.ceil(one.username.length / 2))}${two.username.slice(Math.floor(two.username.length / 2))}`;
      await interaction.reply({
        embeds: [
          baseEmbed(COLORS.pink)
            .setTitle('💘 Ship')
            .setDescription(
              `${userMention(one.id)} + ${userMention(two.id)}\nShip name: **${name}**\nCompatibility: **${score}%** — ${label}\n${'❤️'.repeat(Math.round(score / 10))}${'🖤'.repeat(10 - Math.round(score / 10))}`,
            ),
        ],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('rate')
      .setDescription('Rate anything out of 10')
      .addStringOption((o) => o.setName('thing').setDescription('What to rate').setRequired(true)),
    async execute(interaction) {
      const thing = interaction.options.getString('thing', true);
      const seed = [...thing.toLowerCase()].reduce((a, c) => a + c.charCodeAt(0), 0);
      const score = (seed % 100) / 10;
      await interaction.reply({
        embeds: [infoEmbed('⭐ Rate', `I rate **${truncate(thing, 200)}** a **${score.toFixed(1)} / 10**.`)],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 4,
    data: new SlashCommandBuilder().setName('fortune').setDescription('Crack open a fortune cookie'),
    async execute(interaction) {
      const fortune = (await fortunes.random()) ?? 'Your fortune is loading... forever.';
      await interaction.reply({
        embeds: [baseEmbed(COLORS.gold).setTitle('🥠 Fortune').setDescription(fortune)],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 4,
    data: new SlashCommandBuilder().setName('wyr').setDescription('Would you rather?'),
    async execute(interaction) {
      const line = (await wouldYouRather.random()) ?? 'Would you rather add more prompts to data/content/wouldyourather.json?';
      await interaction.reply({
        embeds: [infoEmbed('🤷 Would you rather', line)],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 5,
    data: new SlashCommandBuilder().setName('trivia').setDescription('A multiple-choice trivia question'),
    async execute(interaction) {
      const bank = await getTrivia();
      if (!bank.length) {
        await replyError(interaction, 'Trivia file is empty.');
        return;
      }
      const q = pick(bank);
      const letters = ['A', 'B', 'C', 'D'];
      const body = q.answers.map((a, i) => `**${letters[i]}.** ${a}`).join('\n');
      await interaction.reply({
        embeds: [
          infoEmbed('❓ Trivia', `**${q.question}**\n\n${body}`).setFooter({
            text: `Answer: ${letters[q.correct]}`,
          }),
        ],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('how')
      .setDescription('Silly percentage meters')
      .addStringOption((o) =>
        o
          .setName('meter')
          .setDescription('Which meter')
          .setRequired(true)
          .addChoices(
            { name: 'gay', value: 'gay' },
            { name: 'sus', value: 'sus' },
            { name: 'smart', value: 'smart' },
            { name: 'cool', value: 'cool' },
            { name: 'simp', value: 'simp' },
            { name: 'lucky', value: 'lucky' },
          ),
      )
      .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(false)),
    async execute(interaction) {
      const meter = interaction.options.getString('meter', true);
      const user = interaction.options.getUser('user') ?? interaction.user;
      const seed = [...(user.id + meter)].reduce((a, c) => a + c.charCodeAt(0), 0);
      const score = seed % 101;
      await interaction.reply({
        embeds: [
          infoEmbed(`How ${meter}?`, `${userMention(user.id)} is **${score}%** ${meter}.`),
        ],
      });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('reverse')
      .setDescription('Reverse some text')
      .addStringOption((o) => o.setName('text').setDescription('Text').setRequired(true)),
    async execute(interaction) {
      const text = interaction.options.getString('text', true);
      await interaction.reply({ content: truncate([...text].reverse().join(''), 2000) });
    },
  }),

  defineCommand({
    category: 'fun',
    cooldown: 3,
    data: new SlashCommandBuilder()
      .setName('emojify')
      .setDescription('Turn letters into regional indicator emojis')
      .addStringOption((o) => o.setName('text').setDescription('Text').setRequired(true)),
    async execute(interaction) {
      const text = interaction.options.getString('text', true).toLowerCase();
      const mapped = [...text]
        .map((ch) => {
          if (ch >= 'a' && ch <= 'z') return `:regional_indicator_${ch}:`;
          if (ch === ' ') return '   ';
          return ch;
        })
        .join(' ');
      await interaction.reply({ content: truncate(mapped, 2000) || '...' });
    },
  }),
];
