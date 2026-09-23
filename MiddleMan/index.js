import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} from "discord.js";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  MIDDLEMAN_ROLE_ID,
  TICKET_CATEGORY_ID,
  LOG_CHANNEL_ID,
  SENIOR_MIDDLEMAN_EMOJI_ID,
  BLACK_VERIFY_EMOJI_ID,
  CLAIM_EMOJI_ID,
  CLOSE_EMOJI_ID
} = process.env;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing TOKEN, CLIENT_ID or GUILD_ID in environment variables.");
  process.exit(1);
}

const DATA_FILE = "./middleman-data.json";
let data = { nextTicket: 1, tickets: {}, panels: {} };

if (fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    data = {
      nextTicket: saved.nextTicket ?? 1,
      tickets: saved.tickets ?? {},
      panels: saved.panels ?? {}
    };
  } catch (error) {
    console.error("Could not read middleman-data.json:", error);
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send the Middleman Request panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("panelconfig")
    .setDescription("Configure the Middleman Request panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("crosstrade")
    .setDescription("Start a cross trade inside this ticket.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON()
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands
  });
  console.log("Registered /panel, /panelconfig and /crosstrade");
}

function isMMStaff(member) {
  return Boolean(member?.roles?.cache?.has(MIDDLEMAN_ROLE_ID));
}

function parseUserId(value) {
  const match = String(value).trim().match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/);
  return match?.[1] ?? match?.[2] ?? null;
}

function buttonEmoji(value, fallbackName) {
  if (!value) return undefined;

  let emojiValue = String(value).trim();

  // Accept either a raw emoji ID (123456789...) or a Discord
  // custom emoji string such as <:SeniorMiddleMan:123456789...>
  // / <a:SeniorMiddleMan:123456789...>.
  emojiValue = emojiValue.replace(/^([\"\'])(.*)\1$/, "$2").trim();

  const customEmoji = emojiValue.match(/^<(a?):([A-Za-z0-9_]+):(\d{17,20})>$/);
  if (customEmoji) {
    return {
      id: customEmoji[3],
      name: customEmoji[2],
      animated: customEmoji[1] === "a"
    };
  }

  if (/^\d{17,20}$/.test(emojiValue)) {
    return { id: emojiValue, name: fallbackName };
  }

  // Do not pass an invalid string into Discord's emoji.id field.
  return undefined;
}

function middlemanPanel() {
  const embed = new EmbedBuilder()
    .setTitle("__**MIDDLEMAN SERVICES**__")
    .setDescription(
      "**Request a Middleman**\n\n" +
      "Welcome to our middleman Service centre.\n\n" +
      "We value and provide a safe and secure way to exchange your goods, whatever it's in-game items, crypto or digital assets.\n\n" +
      "Our trusted middleman team ensures that both parties receive what they agreed upon; with Zero risks or failure or scams. If you've found a trade and want to ensure your safety, you can use our middleman service by following the steps below.\n\n" +
      "(Note: Our services are free but we encourage you to show gratitude and pay a small tip to your respective middleman.)\n\n" +
      "---Usage Conditions:\n" +
      "• Both parties agree to trade before requesting a middleman.\n" +
      "• Pick your respective categories and fill in the info once you request a middleman.\n" +
      "• Fake or troll tickets will result in punishments.\n" +
      "• You agree to follow our server rules and trading guidelines."
    );

  const button = new ButtonBuilder()
    .setCustomId("create_middleman")
    .setLabel("REQUEST MIDDLEMAN")
    .setStyle(ButtonStyle.Secondary);

  if (SENIOR_MIDDLEMAN_EMOJI_ID) {
    button.setEmoji(buttonEmoji(SENIOR_MIDDLEMAN_EMOJI_ID, "SeniorMiddleMan"));
  }

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(button)]
  };
}

function panelConfigComponents() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("panel_config_select")
      .setPlaceholder("Choose a panel configuration")
      .addOptions(
        {
          label: "Set Panel Channel",
          value: "set_channel"
        },
        {
          label: "Send Panel Here",
          value: "send_here"
        }
      )
  );
}

function ticketEmbed(ticket) {
  const middleman = ticket.claimedBy
    ? `<@${ticket.claimedBy}>`
    : "Waiting for a middleman";

  return new EmbedBuilder()
    .setTitle("Middleman Request")
    .setDescription(
      "Your middleman ticket has been created.\n\n" +
      "A middleman will claim the ticket when available."
    )
    .addFields(
      { name: "Requester", value: `<@${ticket.requesterId}>`, inline: true },
      { name: "Trading With", value: `<@${ticket.traderId}>`, inline: true },
      { name: "Trade", value: ticket.trade, inline: false },
      { name: "Fees", value: ticket.fees, inline: false },
      { name: "Middleman", value: middleman, inline: false }
    )
    .setTimestamp();
}

function ticketButtons() {
  const claim = new ButtonBuilder()
    .setCustomId("claim_ticket")
    .setLabel("Claim Ticket")
    .setStyle(ButtonStyle.Secondary);
  const close = new ButtonBuilder()
    .setCustomId("close_ticket")
    .setLabel("Close Ticket")
    .setStyle(ButtonStyle.Secondary);

  if (CLAIM_EMOJI_ID) claim.setEmoji(buttonEmoji(CLAIM_EMOJI_ID, "Claim"));
  if (CLOSE_EMOJI_ID) close.setEmoji(buttonEmoji(CLOSE_EMOJI_ID, "Close"));

  return new ActionRowBuilder().addComponents(claim, close);
}

function crossTradeRulesEmbed() {
  return new EmbedBuilder()
    .setTitle("Cross Trading Guidelines")
    .setDescription(
      "Please read carefully before you agree:\n\n" +
      "1. We do not middleman accounts. Accounts can be recovered/rolled back, which may lead to scams.\n\n" +
      "2. If either trader refunds, chargebacks, or disputes the payment, we are not responsible for any losses.\n\n" +
      "3. Confirm the exact trade amount and items with the other trader before starting.\n\n" +
      "4. We do not middleman fraudulent, stolen, or suspicious items.\n\n" +
      "5. Once both traders confirm the deal is complete, the trade is considered final.\n\n" +
      "6. Any attempt to scam, impersonate, or misuse the service will result in a blacklist and server punishment.\n\n" +
      "7. By clicking Agree, you confirm that you understand and accept these guidelines."
    );
}

function crossTradeAgreeRow() {
  const button = new ButtonBuilder()
    .setCustomId("crosstrade_agree")
    .setLabel("Click to Agree")
    .setStyle(ButtonStyle.Secondary);

  if (BLACK_VERIFY_EMOJI_ID) {
    button.setEmoji(buttonEmoji(BLACK_VERIFY_EMOJI_ID, "BlackVerify"));
  }

  return new ActionRowBuilder().addComponents(button);
}

function crossTradeModal() {
  const modal = new ModalBuilder()
    .setCustomId("crosstrade_modal")
    .setTitle("Cross Trade");

  const fields = [
    ["person1", "Person 1", "Mention user or enter user ID"],
    ["person1stuff", "Person 1 Stuff", "What stuff is Person 1 trading?"],
    ["person2", "Person 2", "Mention user or enter user ID"],
    ["person2stuff", "Person 2 Stuff", "What stuff is Person 2 trading?"],
    ["fees", "Fees", "Person 1 fee and Person 2 fee"]
  ];

  for (const [id, label, placeholder] of fields) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setPlaceholder(placeholder)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
  }

  return modal;
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error("Command registration failed:", error);
  }
  client.user.setPresence({
    activities: [{ name: "Middleman Tickets", type: 3 }],
    status: "online"
  });
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "panel") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
        }
        await interaction.channel.send(middlemanPanel());
        return interaction.reply({ content: "The Middleman Request panel has been sent.", ephemeral: true });
      }

      if (interaction.commandName === "panelconfig") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
        }
        return interaction.reply({
          content: "Choose what you want to configure.",
          components: [panelConfigComponents()],
          ephemeral: true
        });
      }

      if (interaction.commandName === "crosstrade") {
        if (!isMMStaff(interaction.member)) {
          return interaction.reply({ content: "Only Middleman Staff can use this command.", ephemeral: true });
        }
        if (!interaction.channel?.isTextBased()) {
          return interaction.reply({ content: "This command must be used inside a ticket.", ephemeral: true });
        }
        return interaction.showModal(crossTradeModal());
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "panel_config_select") {
      if (interaction.values[0] === "send_here") {
        await interaction.channel.send(middlemanPanel());
        return interaction.update({ content: "The Middleman Request panel has been sent here.", components: [] });
      }
      if (interaction.values[0] === "set_channel") {
        const modal = new ModalBuilder().setCustomId("panel_channel_modal").setTitle("Panel Configuration");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("channel_id")
              .setLabel("Panel Channel ID")
              .setPlaceholder("Enter the channel ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(17)
              .setMaxLength(20)
          )
        );
        return interaction.showModal(modal);
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "create_middleman") {
        const modal = new ModalBuilder().setCustomId("middleman_modal").setTitle("Request a Middleman");
        const fields = [
          ["trader_id", "Who Are You Trading With?", "Mention User Or User Id"],
          ["trade", "What Is the Trade?", "My Meowl For His 230$"],
          ["fees", "What Is the Fees? (REQUIRED)", "Dragon Cannelloni Or 10$"]
        ];
        for (const [id, label, placeholder] of fields) {
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(id)
              .setLabel(label)
              .setPlaceholder(placeholder)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1000)
          ));
        }
        return interaction.showModal(modal);
      }

      const ticket = data.tickets[interaction.channel?.id];
      if (!ticket) return;

      if (interaction.customId === "claim_ticket") {
        if (!isMMStaff(interaction.member)) {
          return interaction.reply({ content: "Only Middleman Staff can claim this ticket.", ephemeral: true });
        }
        if (ticket.claimedBy) {
          return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
        }
        ticket.claimedBy = interaction.user.id;
        saveData();
        await interaction.message.edit({ embeds: [ticketEmbed(ticket)], components: [ticketButtons()] });
        return interaction.reply({ content: `<@${interaction.user.id}> claimed this ticket.`, allowedMentions: { users: [interaction.user.id] } });
      }

      if (interaction.customId === "close_ticket") {
        if (!isMMStaff(interaction.member) && interaction.user.id !== ticket.requesterId && interaction.user.id !== ticket.traderId) {
          return interaction.reply({ content: "You do not have permission to close this ticket.", ephemeral: true });
        }
        ticket.status = "closed";
        saveData();
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel?.isTextBased()) {
          await logChannel.send({ embeds: [
            new EmbedBuilder()
              .setTitle("Middleman Ticket Closed")
              .addFields(
                { name: "Requester", value: `<@${ticket.requesterId}>`, inline: true },
                { name: "Other Trader", value: `<@${ticket.traderId}>`, inline: true },
                { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true }
              )
              .setTimestamp()
          ] });
        }
        await interaction.reply({ content: "This ticket will be closed.", allowedMentions: { parse: [] } });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        return;
      }

      if (interaction.customId === "crosstrade_agree") {
        const ct = data.tickets[interaction.channel.id]?.crossTrade;
        if (!ct) return interaction.reply({ content: "No Cross Trade is active in this ticket.", ephemeral: true });
        if (![ct.person1Id, ct.person2Id].includes(interaction.user.id)) {
          return interaction.reply({ content: "Only Person 1 and Person 2 can agree to these rules.", ephemeral: true });
        }
        if (ct.agreed.includes(interaction.user.id)) {
          return interaction.reply({ content: "You have already agreed to the rules.", ephemeral: true });
        }
        ct.agreed.push(interaction.user.id);
        saveData();
        await interaction.reply({ content: `<@${interaction.user.id}> has agreed the rules!`, allowedMentions: { users: [interaction.user.id] } });
        if (ct.agreed.includes(ct.person1Id) && ct.agreed.includes(ct.person2Id)) {
          ct.bothAgreedAt = Date.now();
          saveData();
          await interaction.channel.send({ embeds: [
            new EmbedBuilder()
              .setTitle("Cross Trade Rules Accepted")
              .setDescription("Both traders have agreed to the rules. Moderation staff can now continue.")
              .setTimestamp()
          ] });
        }
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "panel_channel_modal") {
        const channelId = interaction.fields.getTextInputValue("channel_id").trim();
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) return interaction.reply({ content: "That channel was not found or is not a text channel.", ephemeral: true });
        data.panels[interaction.guild.id] = channelId;
        saveData();
        return interaction.reply({ content: `Panel channel saved as <#${channelId}>.`, ephemeral: true });
      }

      if (interaction.customId === "middleman_modal") {
        await interaction.deferReply({ ephemeral: true });
        const traderValue = interaction.fields.getTextInputValue("trader_id").trim();
        const traderId = parseUserId(traderValue);
        const trade = interaction.fields.getTextInputValue("trade").trim();
        const fees = interaction.fields.getTextInputValue("fees").trim();
        if (!traderId) return interaction.editReply({ content: "The trading user must be a valid mention or user ID." });
        if (traderId === interaction.user.id) return interaction.editReply({ content: "You cannot trade with yourself." });
        let trader;
        try { trader = await interaction.guild.members.fetch(traderId); } catch { trader = null; }
        if (!trader) return interaction.editReply({ content: "That user is not in this server. They must join the server before you can create a middleman ticket." });

        const ticketNumber = data.nextTicket++;
        const ticketName = `mm-${String(ticketNumber).padStart(4, "0")}`;
        const overwrites = [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: traderId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: MIDDLEMAN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
        ];
        const channel = await interaction.guild.channels.create({ name: ticketName, type: ChannelType.GuildText, parent: TICKET_CATEGORY_ID, permissionOverwrites: overwrites });
        data.tickets[channel.id] = {
          channelId: channel.id,
          ticketNumber,
          requesterId: interaction.user.id,
          traderId,
          trade,
          fees,
          claimedBy: null,
          status: "open",
          createdAt: Date.now()
        };
        saveData();
        await channel.send({
          content: `<@${interaction.user.id}> <@&${MIDDLEMAN_ROLE_ID}>`,
          embeds: [ticketEmbed(data.tickets[channel.id])],
          components: [ticketButtons()]
        });
        await channel.send({
          embeds: [new EmbedBuilder().setDescription(`<@${traderId}> was added to the ticket.`)],
          allowedMentions: { users: [traderId] }
        });
        return interaction.editReply({ content: `Ticket created: <#${channel.id}>` });
      }

      if (interaction.customId === "crosstrade_modal") {
        if (!isMMStaff(interaction.member)) return interaction.reply({ content: "Only Middleman Staff can use this command.", ephemeral: true });
        const channel = interaction.channel;
        const person1Value = interaction.fields.getTextInputValue("person1").trim();
        const person1Id = parseUserId(person1Value);
        const person1Stuff = interaction.fields.getTextInputValue("person1stuff").trim();
        const person2Value = interaction.fields.getTextInputValue("person2").trim();
        const person2Id = parseUserId(person2Value);
        const person2Stuff = interaction.fields.getTextInputValue("person2stuff").trim();
        const fees = interaction.fields.getTextInputValue("fees").trim();
        if (!person1Id || !person2Id) return interaction.reply({ content: "Both people must be valid mentions or user IDs.", ephemeral: true });
        if (person1Id === person2Id) return interaction.reply({ content: "Person 1 and Person 2 must be different users.", ephemeral: true });
        let p1, p2;
        try { p1 = await interaction.guild.members.fetch(person1Id); } catch { p1 = null; }
        try { p2 = await interaction.guild.members.fetch(person2Id); } catch { p2 = null; }
        if (!p1 || !p2) return interaction.reply({ content: "Both traders must be members of this server.", ephemeral: true });

        const ticket = data.tickets[channel.id];
        if (!ticket) return interaction.reply({ content: "Use /crosstrade inside a middleman ticket.", ephemeral: true });
        ticket.crossTrade = {
          person1Id,
          person1Stuff,
          person2Id,
          person2Stuff,
          fees,
          createdBy: interaction.user.id,
          agreed: [],
          createdAt: Date.now()
        };
        saveData();

        await channel.send({ embeds: [crossTradeRulesEmbed()], components: [crossTradeAgreeRow()] });
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel?.isTextBased()) {
          await logChannel.send({ embeds: [
            new EmbedBuilder()
              .setTitle("Cross Trade")
              .addFields(
                { name: "Person 1", value: `<@${person1Id}>`, inline: true },
                { name: "Person 1 Stuff", value: person1Stuff, inline: false },
                { name: "Person 2", value: `<@${person2Id}>`, inline: true },
                { name: "Person 2 Stuff", value: person2Stuff, inline: false },
                { name: "Fees", value: fees, inline: false },
                { name: "Submitted By", value: `<@${interaction.user.id}>`, inline: true }
              )
              .setTimestamp()
          ] });
        }
        return interaction.reply({ content: "Cross Trade rules have been sent and the submitted details were logged.", ephemeral: true });
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Something went wrong while processing that action.", ephemeral: true }).catch(() => {});
    } else {
      await interaction.followUp({ content: "Something went wrong while processing that action.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);
