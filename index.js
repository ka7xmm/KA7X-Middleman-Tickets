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
    PermissionFlagsBits
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
    LOG_CHANNEL_ID
} = process.env;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("Missing TOKEN, CLIENT_ID or GUILD_ID in .env");
    process.exit(1);
}

const DATA_FILE = "./middleman-data.json";
const pendingCrossTrades = new Map();

let data = {
    nextTicket: 1,
    tickets: {},
    crossTrades: {},
    config: {
        middlemanRoleId: MIDDLEMAN_ROLE_ID || "",
        ticketCategoryId: TICKET_CATEGORY_ID || "",
        logChannelId: LOG_CHANNEL_ID || "",
        panelChannelId: ""
    }
};

if (fs.existsSync(DATA_FILE)) {
    try {
        const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        data = {
            nextTicket: saved.nextTicket || 1,
            tickets: saved.tickets || {},
            crossTrades: saved.crossTrades || {},
            config: {
                middlemanRoleId: saved.config?.middlemanRoleId || MIDDLEMAN_ROLE_ID || "",
                ticketCategoryId: saved.config?.ticketCategoryId || TICKET_CATEGORY_ID || "",
                logChannelId: saved.config?.logChannelId || LOG_CHANNEL_ID || "",
                panelChannelId: saved.config?.panelChannelId || ""
            }
        };
    } catch {
        console.log("Could not read data file. Creating a new one.");
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function cfg(name) {
    return data.config[name] || "";
}

function isMiddleman(interaction) {
    return Boolean(
        interaction.member?.roles?.cache?.has(cfg("middlemanRoleId"))
    );
}

function isStaff(interaction) {
    return Boolean(
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
        isMiddleman(interaction)
    );
}

function makeFooter() {
    return { text: "KA7X'S MIDDLEMAN TICKETS" };
}

function panelPayload() {
    const embed = new EmbedBuilder()
        .setTitle("KA7X'S MIDDLEMAN TICKETS")
        .setDescription(
            "Need a middleman for your trade?\n\n" +
            "Click the button below to create a middleman ticket.\n\n" +
            "Both traders must be members of this server."
        )
        .setFooter(makeFooter())
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("create_middleman")
            .setLabel("Regular Middleman")
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function getUserId(value) {
    const match = String(value || "").match(/\d{17,20}/);
    return match ? match[0] : null;
}

function validId(value) {
    return /^\d{17,20}$/.test(String(value || "").trim());
}

function crossTradeRulesEmbed(trade) {
    return new EmbedBuilder()
        .setTitle("CROSS TRADE RULES")
        .setDescription(
            "Both traders must read and agree to the rules below.\n\n" +
            "• Both traders must confirm that the information submitted by the Middleman is correct.\n" +
            "• The Middleman will handle the trade according to the details shown below.\n" +
            "• Neither trader may change their offer after the trade has started without the Middleman's approval.\n" +
            "• Both traders must complete their side of the trade as instructed by the Middleman.\n" +
            "• Any agreement from someone other than Person 1 or Person 2 does not count.\n" +
            "• Both Person 1 and Person 2 must agree before this Cross Trade can be confirmed."
        )
        .addFields(
            { name: "Person 1", value: `<@${trade.person1}>`, inline: true },
            { name: "Person 1 Stuff", value: trade.person1Stuff || "Not provided", inline: true },
            { name: "Person 1 Fees", value: trade.person1Fees || "Not provided", inline: true },
            { name: "Person 2", value: `<@${trade.person2}>`, inline: true },
            { name: "Person 2 Stuff", value: trade.person2Stuff || "Not provided", inline: true },
            { name: "Person 2 Fees", value: trade.person2Fees || "Not provided", inline: true }
        )
        .setFooter(makeFooter())
        .setTimestamp();
}

function crossTradeButtons(tradeId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cross_agree_1_${tradeId}`)
            .setLabel("Person 1 Agree")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`cross_agree_2_${tradeId}`)
            .setLabel("Person 2 Agree")
            .setStyle(ButtonStyle.Secondary)
    );
}

function configEmbed() {
    return new EmbedBuilder()
        .setTitle("Panel Configuration")
        .setDescription("Current ticket panel configuration.")
        .addFields(
            { name: "Panel Channel", value: cfg("panelChannelId") ? `<#${cfg("panelChannelId")}>` : "Not set", inline: true },
            { name: "Ticket Category", value: cfg("ticketCategoryId") ? `<#${cfg("ticketCategoryId")}>` : "Not set", inline: true },
            { name: "Middleman Role", value: cfg("middlemanRoleId") ? `<@&${cfg("middlemanRoleId")}>` : "Not set", inline: true },
            { name: "Logs Channel", value: cfg("logChannelId") ? `<#${cfg("logChannelId")}>` : "Not set", inline: true }
        )
        .setFooter(makeFooter());
}

const commands = [
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send the middleman ticket panel.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
        .setName("panelconfig")
        .setDescription("Configure the middleman ticket panel.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option.setName("panelchannel")
                .setDescription("Channel where the ticket panel is sent.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .addChannelOption(option =>
            option.setName("category")
                .setDescription("Category where tickets are created.")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName("middlemanrole")
                .setDescription("Middleman staff role.")
                .setRequired(false)
        )
        .addChannelOption(option =>
            option.setName("logs")
                .setDescription("Middleman logs channel.")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("crosstrade")
        .setDescription("Start a cross trade inside the current ticket.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(command => command.toJSON());

async function registerCommands() {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log("Slash commands registered.");
    } catch (error) {
        console.error("Failed to register slash commands:", error);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

client.once("ready", async () => {
    console.log("--------------------------------");
    console.log("KA7X'S MIDDLEMAN TICKETS");
    console.log("--------------------------------");
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    client.user.setPresence({
        activities: [{ name: "Middleman Tickets", type: 3 }],
        status: "online"
    });
});

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === "panel") {
                if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
                }

                const channel = interaction.guild.channels.cache.get(cfg("panelChannelId")) || interaction.channel;
                await channel.send(panelPayload());
                return interaction.reply({ content: `The ticket panel has been sent in <#${channel.id}>.`, ephemeral: true });
            }

            if (interaction.commandName === "panelconfig") {
                if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: "You do not have permission to configure the panel.", ephemeral: true });
                }

                const panelChannel = interaction.options.getChannel("panelchannel");
                const category = interaction.options.getChannel("category");
                const role = interaction.options.getRole("middlemanrole");
                const logs = interaction.options.getChannel("logs");

                if (panelChannel) data.config.panelChannelId = panelChannel.id;
                if (category) data.config.ticketCategoryId = category.id;
                if (role) data.config.middlemanRoleId = role.id;
                if (logs) data.config.logChannelId = logs.id;
                saveData();

                return interaction.reply({ embeds: [configEmbed()], ephemeral: true });
            }

            if (interaction.commandName === "crosstrade") {
                if (!isMiddleman(interaction)) {
                    return interaction.reply({ content: "Only Middleman Staff can use this command.", ephemeral: true });
                }

                const ticket = data.tickets[interaction.channel.id];
                if (!ticket || ticket.status !== "open") {
                    return interaction.reply({ content: "This command can only be used inside an open middleman ticket.", ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId("crosstrade_first")
                    .setTitle("Cross Trade");

                const fields = [
                    ["person1_user", "Person 1 User", "Enter a user ID or mention"],
                    ["person1_stuff", "Person 1 Stuff", "What Person 1 is giving"],
                    ["person2_user", "Person 2 User", "Enter a user ID or mention"],
                    ["person2_stuff", "Person 2 Stuff", "What Person 2 is giving"],
                    ["person1_fees", "Person 1 Fees", "Enter Person 1 fees"]
                ];

                for (const [id, label, placeholder] of fields) {
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId(id)
                                .setLabel(label)
                                .setPlaceholder(placeholder)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setMaxLength(1000)
                        )
                    );
                }

                return interaction.showModal(modal);
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === "create_middleman") {
                const modal = new ModalBuilder()
                    .setCustomId("middleman_modal")
                    .setTitle("KA7X'S MIDDLEMAN TICKETS");

                const traderInput = new TextInputBuilder()
                    .setCustomId("trader_id")
                    .setLabel("Other Trader Discord ID")
                    .setPlaceholder("Enter their Discord User ID")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(17)
                    .setMaxLength(20);

                modal.addComponents(new ActionRowBuilder().addComponents(traderInput));
                return interaction.showModal(modal);
            }

            const ticket = data.tickets[interaction.channel.id];
            if (!ticket) return;

            if (interaction.customId === "claim_ticket") {
                if (!isMiddleman(interaction)) {
                    return interaction.reply({ content: "You do not have permission to claim this ticket.", ephemeral: true });
                }
                if (ticket.claimedBy) {
                    return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
                }
                ticket.claimedBy = interaction.user.id;
                saveData();
                return interaction.reply({
                    embeds: [new EmbedBuilder().setTitle("Ticket Claimed").setDescription(`<@${interaction.user.id}> is now handling this middleman ticket.`).setFooter(makeFooter()).setTimestamp()]
                });
            }

            if (interaction.customId === "close_ticket") {
                const allowed = interaction.user.id === ticket.requesterId || interaction.user.id === ticket.traderId || isMiddleman(interaction);
                if (!allowed) {
                    return interaction.reply({ content: "You do not have permission to close this ticket.", ephemeral: true });
                }

                ticket.status = "closed";
                saveData();

                await interaction.reply({
                    embeds: [new EmbedBuilder().setTitle("Ticket Closed").setDescription("This middleman ticket will be deleted in 5 seconds.").setFooter(makeFooter()).setTimestamp()]
                });

                const logChannel = interaction.guild.channels.cache.get(cfg("logChannelId"));
                if (logChannel) {
                    await logChannel.send({
                        embeds: [new EmbedBuilder()
                            .setTitle("Middleman Ticket Closed")
                            .addFields(
                                { name: "Ticket", value: `#${String(ticket.ticketNumber).padStart(4, "0")}`, inline: true },
                                { name: "Requester", value: `<@${ticket.requesterId}>`, inline: true },
                                { name: "Other Trader", value: `<@${ticket.traderId}>`, inline: true },
                                { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true }
                            )
                            .setFooter(makeFooter()).setTimestamp()]
                    });
                }

                setTimeout(async () => {
                    try { await interaction.channel.delete(); } catch (error) { console.error("Could not delete ticket:", error); }
                }, 5000);
                return;
            }

            const agreeMatch = interaction.customId.match(/^cross_agree_([12])_(.+)$/);
            if (agreeMatch) {
                const personNumber = Number(agreeMatch[1]);
                const tradeId = agreeMatch[2];
                const trade = data.crossTrades[tradeId];

                if (!trade || trade.channelId !== interaction.channel.id) {
                    return interaction.reply({ content: "This Cross Trade is no longer active.", ephemeral: true });
                }

                const expectedUser = personNumber === 1 ? trade.person1 : trade.person2;
                if (interaction.user.id !== expectedUser) {
                    return interaction.reply({ content: "Only the assigned trader can use this agreement button.", ephemeral: true });
                }

                if (trade.agreed[interaction.user.id]) {
                    return interaction.reply({ content: "You have already agreed to these rules.", ephemeral: true });
                }

                trade.agreed[interaction.user.id] = true;
                saveData();

                if (trade.agreed[trade.person1] && trade.agreed[trade.person2]) {
                    trade.status = "confirmed";
                    trade.confirmedAt = Date.now();
                    saveData();

                    const logChannel = interaction.guild.channels.cache.get(cfg("logChannelId"));
                    if (logChannel) {
                        await logChannel.send({
                            embeds: [new EmbedBuilder()
                                .setTitle("Cross Trade Confirmed")
                                .addFields(
                                    { name: "Person 1", value: `<@${trade.person1}>`, inline: true },
                                    { name: "Person 1 Stuff", value: trade.person1Stuff || "Not provided", inline: true },
                                    { name: "Person 1 Fees", value: trade.person1Fees || "Not provided", inline: true },
                                    { name: "Person 2", value: `<@${trade.person2}>`, inline: true },
                                    { name: "Person 2 Stuff", value: trade.person2Stuff || "Not provided", inline: true },
                                    { name: "Person 2 Fees", value: trade.person2Fees || "Not provided", inline: true },
                                    { name: "Confirmed By", value: `<@${trade.person1}> and <@${trade.person2}>`, inline: false }
                                )
                                .setFooter(makeFooter()).setTimestamp()]
                        });
                    }

                    await interaction.update({
                        embeds: [crossTradeRulesEmbed(trade).setTitle("CROSS TRADE CONFIRMED").setDescription("Both traders have agreed to the rules. The Cross Trade has been confirmed.")],
                        components: []
                    });
                    return;
                }

                return interaction.reply({
                    embeds: [new EmbedBuilder().setTitle("Agreement Recorded").setDescription("Your agreement has been recorded. The other trader still needs to agree.").setFooter(makeFooter())],
                    ephemeral: true
                });
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === "middleman_modal") {
                await interaction.deferReply({ ephemeral: true });
                const traderId = interaction.fields.getTextInputValue("trader_id").trim();

                if (!validId(traderId)) return interaction.editReply({ content: "Invalid Discord User ID. Please enter the numeric Discord User ID." });
                if (traderId === interaction.user.id) return interaction.editReply({ content: "You cannot use yourself as the other trader." });

                let trader;
                try { trader = await interaction.guild.members.fetch(traderId); } catch { trader = null; }
                if (!trader) {
                    return interaction.editReply({
                        embeds: [new EmbedBuilder().setTitle("Member Not Found").setDescription("The other trader is not currently in this server.\n\nThey must join the server before you can create a middleman ticket.").setFooter(makeFooter()).setTimestamp()]
                    });
                }

                const ticketNumber = data.nextTicket++;
                const ticketName = `mm-${String(ticketNumber).padStart(4, "0")}`;
                const botMember = interaction.guild.members.me;

                const overwrites = [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: traderId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: cfg("middlemanRoleId"), allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
                ];

                let channel;
                try {
                    channel = await interaction.guild.channels.create({
                        name: ticketName,
                        type: ChannelType.GuildText,
                        parent: cfg("ticketCategoryId") || undefined,
                        permissionOverwrites: overwrites
                    });
                } catch (error) {
                    console.error("Ticket creation error:", error);
                    return interaction.editReply({ content: "I could not create the ticket. Check the bot's permissions and your panel configuration." });
                }

                data.tickets[channel.id] = {
                    channelId: channel.id,
                    ticketNumber,
                    requesterId: interaction.user.id,
                    traderId,
                    claimedBy: null,
                    createdAt: Date.now(),
                    status: "open"
                };
                saveData();

                const ticketEmbed = new EmbedBuilder()
                    .setTitle("KA7X'S MIDDLEMAN TICKETS")
                    .setDescription("Your middleman ticket has been created.\n\nA middleman will claim the ticket when available.")
                    .addFields(
                        { name: "Ticket", value: `#${String(ticketNumber).padStart(4, "0")}`, inline: true },
                        { name: "Requester", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Other Trader", value: `<@${traderId}>`, inline: true },
                        { name: "Middleman", value: "Waiting for a middleman to claim", inline: false }
                    )
                    .setFooter(makeFooter()).setTimestamp();

                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("claim_ticket").setLabel("Claim Ticket").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("Close Ticket").setStyle(ButtonStyle.Secondary)
                );

                await channel.send({
                    content: `<@${interaction.user.id}> <@${traderId}> <@&${cfg("middlemanRoleId")}>`,
                    embeds: [ticketEmbed],
                    components: [buttons]
                });

                return interaction.editReply({
                    embeds: [new EmbedBuilder().setTitle("Middleman Ticket Created").setDescription(`Your ticket has been created: <#${channel.id}>`).setFooter(makeFooter())]
                });
            }

            if (interaction.customId === "crosstrade_first") {
                if (!isMiddleman(interaction)) return interaction.reply({ content: "Only Middleman Staff can use this form.", ephemeral: true });

                const person1 = getUserId(interaction.fields.getTextInputValue("person1_user"));
                const person2 = getUserId(interaction.fields.getTextInputValue("person2_user"));
                const person1Stuff = interaction.fields.getTextInputValue("person1_stuff").trim();
                const person2Stuff = interaction.fields.getTextInputValue("person2_stuff").trim();
                const person1Fees = interaction.fields.getTextInputValue("person1_fees").trim();

                if (!person1 || !person2) return interaction.reply({ content: "Both user fields must contain a valid Discord user ID or mention.", ephemeral: true });
                if (person1 === person2) return interaction.reply({ content: "Person 1 and Person 2 must be different users.", ephemeral: true });

                try {
                    await interaction.guild.members.fetch(person1);
                    await interaction.guild.members.fetch(person2);
                } catch {
                    return interaction.reply({ content: "Both traders must be members of this server.", ephemeral: true });
                }

                const pendingId = `${interaction.user.id}_${interaction.channel.id}_${Date.now()}`;
                pendingCrossTrades.set(pendingId, {
                    person1,
                    person2,
                    person1Stuff,
                    person2Stuff,
                    person1Fees,
                    channelId: interaction.channel.id,
                    staffId: interaction.user.id
                });

                setTimeout(() => pendingCrossTrades.delete(pendingId), 10 * 60 * 1000);

                const modal = new ModalBuilder()
                    .setCustomId(`crosstrade_second_${pendingId}`)
                    .setTitle("Cross Trade Fees");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("person2_fees")
                            .setLabel("Person 2 Fees")
                            .setPlaceholder("Enter Person 2 fees")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(1000)
                    )
                );

                return interaction.showModal(modal);
            }

            if (interaction.customId.startsWith("crosstrade_second_")) {
                if (!isMiddleman(interaction)) return interaction.reply({ content: "Only Middleman Staff can submit this form.", ephemeral: true });

                const pendingId = interaction.customId.slice("crosstrade_second_".length);
                const pending = pendingCrossTrades.get(pendingId);
                if (!pending || pending.channelId !== interaction.channel.id || pending.staffId !== interaction.user.id) {
                    return interaction.reply({ content: "This Cross Trade form expired. Please use /crosstrade again.", ephemeral: true });
                }
                pendingCrossTrades.delete(pendingId);

                const person2Fees = interaction.fields.getTextInputValue("person2_fees").trim();
                const tradeId = `${interaction.channel.id}_${Date.now()}`;

                const trade = {
                    tradeId,
                    channelId: interaction.channel.id,
                    person1: pending.person1,
                    person2: pending.person2,
                    person1Stuff: pending.person1Stuff,
                    person2Stuff: pending.person2Stuff,
                    person1Fees: pending.person1Fees,
                    person2Fees,
                    staffId: interaction.user.id,
                    agreed: {},
                    status: "waiting"
                };

                data.crossTrades[tradeId] = trade;
                saveData();

                await interaction.channel.send({
                    content: `<@${trade.person1}> <@${trade.person2}>`,
                    embeds: [crossTradeRulesEmbed(trade)],
                    components: [crossTradeButtons(tradeId)]
                });

                return interaction.reply({ content: "The Cross Trade rules have been sent to the ticket.", ephemeral: true });
            }
        }
    } catch (error) {
        console.error("Interaction error:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Something went wrong while processing that action.", ephemeral: true }).catch(() => {});
        }
    }
});

client.login(TOKEN);
