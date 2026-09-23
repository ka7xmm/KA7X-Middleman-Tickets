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

/*
========================================
KA7X'S MIDDLEMAN TICKETS
========================================
*/

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

/*
========================================
DATA
========================================
*/

const DATA_FILE = "./middleman-data.json";

let data = {
    nextTicket: 1,
    tickets: {}
};

if (fs.existsSync(DATA_FILE)) {
    try {
        data = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );
    } catch {
        console.log("Could not read data file. Creating a new one.");
    }
}

function saveData() {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(data, null, 2)
    );
}

/*
========================================
CLIENT
========================================
*/

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

/*
========================================
SLASH COMMAND
========================================
*/

const commands = [
    new SlashCommandBuilder()
        .setName("panel")
        .setDescription("Send the KA7X'S Middleman Tickets panel.")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )
        .toJSON()
];

/*
========================================
REGISTER COMMAND
========================================
*/

async function registerCommands() {
    const rest = new REST({ version: "10" })
        .setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("Registered /panel");
    } catch (error) {
        console.error(
            "Failed to register /panel:",
            error
        );
    }
}

/*
========================================
READY
========================================
*/

client.once("ready", async () => {
    console.log("--------------------------------");
    console.log("KA7X'S MIDDLEMAN TICKETS");
    console.log("--------------------------------");
    console.log(`Logged in as ${client.user.tag}`);

    await registerCommands();

    client.user.setPresence({
        activities: [
            {
                name: "Middleman Tickets",
                type: 3
            }
        ],
        status: "online"
    });
});

/*
========================================
PANEL
========================================
*/

function createPanel() {
    const embed = new EmbedBuilder()
        .setTitle("KA7X'S MIDDLEMAN TICKETS")
        .setDescription(
            "Need a middleman for your trade?\n\n" +
            "Click the button below to create a middleman ticket.\n\n" +
            "Both traders must be members of this server."
        )
        .setFooter({
            text: "KA7X'S MIDDLEMAN TICKETS"
        })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("create_middleman")
            .setLabel("Regular Middleman")
            .setStyle(ButtonStyle.Primary)
    );

    return {
        embeds: [embed],
        components: [row]
    };
}

/*
========================================
/panel
========================================
*/

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName !== "panel") {
        return;
    }

    await interaction.channel.send(
        createPanel()
    );

    await interaction.reply({
        content: "The middleman panel has been sent.",
        ephemeral: true
    });
});

/*
========================================
CREATE TICKET BUTTON
========================================
*/

client.on("interactionCreate", async interaction => {

    if (!interaction.isButton()) {
        return;
    }

    if (interaction.customId !== "create_middleman") {
        return;
    }

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

    const row = new ActionRowBuilder()
        .addComponents(traderInput);

    modal.addComponents(row);

    await interaction.showModal(modal);
});

/*
========================================
MODAL
========================================
*/

client.on("interactionCreate", async interaction => {

    if (!interaction.isModalSubmit()) {
        return;
    }

    if (interaction.customId !== "middleman_modal") {
        return;
    }

    await interaction.deferReply({
        ephemeral: true
    });

    const traderId =
        interaction.fields.getTextInputValue(
            "trader_id"
        ).trim();

    if (!/^\d{17,20}$/.test(traderId)) {

        return interaction.editReply({
            content:
                "Invalid Discord User ID. Please enter the numeric Discord User ID."
        });
    }

    if (traderId === interaction.user.id) {

        return interaction.editReply({
            content:
                "You cannot use yourself as the other trader."
        });
    }

    /*
    ========================================
    CHECK IF TRADER IS IN SERVER
    ========================================
    */

    let trader;

    try {
        trader = await interaction.guild.members.fetch(
            traderId
        );
    } catch {
        trader = null;
    }

    /*
    ========================================
    NOT IN SERVER
    ========================================
    */

    if (!trader) {

        const embed = new EmbedBuilder()
            .setTitle("Member Not Found")
            .setDescription(
                "The other trader is not currently in this server.\n\n" +
                "They must join the server before you can create a middleman ticket."
            )
            .setFooter({
                text: "KA7X'S MIDDLEMAN TICKETS"
            })
            .setTimestamp();

        return interaction.editReply({
            embeds: [embed]
        });
    }

    /*
    ========================================
    MEMBER FOUND
    ========================================
    */

    const foundEmbed = new EmbedBuilder()
        .setTitle("Member Found")
        .setDescription(
            "The other trader is currently a member of this server.\n\n" +
            "Creating your middleman ticket..."
        )
        .setFooter({
            text: "KA7X'S MIDDLEMAN TICKETS"
        });

    await interaction.editReply({
        embeds: [foundEmbed]
    });

    /*
    ========================================
    TICKET NUMBER
    ========================================
    */

    const ticketNumber = data.nextTicket;

    data.nextTicket++;

    saveData();

    const ticketName =
        `mm-${String(ticketNumber).padStart(4, "0")}`;

    /*
    ========================================
    PERMISSIONS
    ========================================
    */

    const overwrites = [
        {
            id: interaction.guild.id,
            deny: [
                PermissionFlagsBits.ViewChannel
            ]
        },
        {
            id: interaction.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        },
        {
            id: traderId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        },
        {
            id: MIDDLEMAN_ROLE_ID,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        },
        {
            id: interaction.guild.members.me.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels
            ]
        }
    ];

    /*
    ========================================
    CREATE CHANNEL
    ========================================
    */

    let channel;

    try {

        channel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: TICKET_CATEGORY_ID,
            permissionOverwrites: overwrites
        });

    } catch (error) {

        console.error(
            "Ticket creation error:",
            error
        );

        return interaction.editReply({
            content:
                "I could not create the ticket. Check the bot's permissions and your IDs in .env."
        });
    }

    /*
    ========================================
    SAVE TICKET
    ========================================
    */

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

    /*
    ========================================
    TICKET EMBED
    ========================================
    */

    const ticketEmbed = new EmbedBuilder()
        .setTitle("KA7X'S MIDDLEMAN TICKETS")
        .setDescription(
            "Your middleman ticket has been created.\n\n" +
            "A middleman will claim the ticket when available."
        )
        .addFields(
            {
                name: "Ticket",
                value:
                    `#${String(ticketNumber).padStart(4, "0")}`,
                inline: true
            },
            {
                name: "Requester",
                value:
                    `<@${interaction.user.id}>`,
                inline: true
            },
            {
                name: "Other Trader",
                value:
                    `<@${traderId}>`,
                inline: true
            },
            {
                name: "Middleman",
                value:
                    "Waiting for a middleman to claim",
                inline: false
            }
        )
        .setFooter({
            text: "KA7X'S MIDDLEMAN TICKETS"
        })
        .setTimestamp();

    const buttons = new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId("claim_ticket")
                .setLabel("Claim Ticket")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger)
        );

    await channel.send({
        content:
            `<@${interaction.user.id}> <@${traderId}> <@&${MIDDLEMAN_ROLE_ID}>`,

        embeds: [ticketEmbed],

        components: [buttons]
    });

    /*
    ========================================
    SUCCESS
    ========================================
    */

    const successEmbed = new EmbedBuilder()
        .setTitle("Middleman Ticket Created")
        .setDescription(
            `Your ticket has been created: <#${channel.id}>`
        )
        .addFields({
            name: "Ticket",
            value:
                `#${String(ticketNumber).padStart(4, "0")}`
        })
        .setFooter({
            text: "KA7X'S MIDDLEMAN TICKETS"
        });

    await interaction.editReply({
        embeds: [successEmbed]
    });
});

/*
========================================
BUTTON HANDLER
========================================
*/

client.on("interactionCreate", async interaction => {

    if (!interaction.isButton()) {
        return;
    }

    const ticket =
        data.tickets[interaction.channel.id];

    if (!ticket) {
        return;
    }

    /*
    ========================================
    CLAIM
    ========================================
    */

    if (interaction.customId === "claim_ticket") {

        if (
            !interaction.member.roles.cache.has(
                MIDDLEMAN_ROLE_ID
            )
        ) {

            return interaction.reply({
                content:
                    "You do not have permission to claim this ticket.",
                ephemeral: true
            });
        }

        if (ticket.claimedBy) {

            return interaction.reply({
                content:
                    `This ticket is already claimed by <@${ticket.claimedBy}>.`,
                ephemeral: true
            });
        }

        ticket.claimedBy =
            interaction.user.id;

        saveData();

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("Ticket Claimed")
                    .setDescription(
                        `<@${interaction.user.id}> is now handling this middleman ticket.`
                    )
                    .setFooter({
                        text: "KA7X'S MIDDLEMAN TICKETS"
                    })
                    .setTimestamp()
            ]
        });

        return;
    }

    /*
    ========================================
    CLOSE
    ========================================
    */

    if (interaction.customId === "close_ticket") {

        const allowed =
            interaction.user.id === ticket.requesterId ||
            interaction.user.id === ticket.traderId ||
            interaction.member.roles.cache.has(
                MIDDLEMAN_ROLE_ID
            );

        if (!allowed) {

            return interaction.reply({
                content:
                    "You do not have permission to close this ticket.",
                ephemeral: true
            });
        }

        ticket.status = "closed";

        saveData();

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("Ticket Closed")
                    .setDescription(
                        "This middleman ticket will be deleted in 5 seconds."
                    )
                    .setFooter({
                        text: "KA7X'S MIDDLEMAN TICKETS"
                    })
                    .setTimestamp()
            ]
        });

        /*
        ========================================
        LOG
        ========================================
        */

        const logChannel =
            interaction.guild.channels.cache.get(
                LOG_CHANNEL_ID
            );

        if (logChannel) {

            const logEmbed = new EmbedBuilder()
                .setTitle("Middleman Ticket Closed")
                .addFields(
                    {
                        name: "Ticket",
                        value:
                            `#${String(ticket.ticketNumber).padStart(4, "0")}`,
                        inline: true
                    },
                    {
                        name: "Requester",
                        value:
                            `<@${ticket.requesterId}>`,
                        inline: true
                    },
                    {
                        name: "Other Trader",
                        value:
                            `<@${ticket.traderId}>`,
                        inline: true
                    },
                    {
                        name: "Closed By",
                        value:
                            `<@${interaction.user.id}>`,
                        inline: true
                    }
                )
                .setFooter({
                    text: "KA7X'S MIDDLEMAN TICKETS"
                })
                .setTimestamp();

            await logChannel.send({
                embeds: [logEmbed]
            });
        }

        setTimeout(async () => {

            try {
                await interaction.channel.delete();
            } catch (error) {
                console.error(
                    "Could not delete ticket:",
                    error
                );
            }

        }, 5000);
    }
});

/*
========================================
LOGIN
========================================
*/

client.login(TOKEN);
