require("dotenv").config();
const { Client, Events, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

// File path for storing promotion dates
const promotionFilePath = path.join(__dirname, "promotionDates.json");
const PREFIX = "!";

// Load existing promotion dates from file
let promotionDates = {};
if (fs.existsSync(promotionFilePath)) {
  try {
    const fileData = fs.readFileSync(promotionFilePath, "utf-8");
    if (fileData.trim()) {
      promotionDates = JSON.parse(fileData);
    } else {
      console.log("promotionDates.json is empty, starting fresh.");
    }
  } catch (error) {
    console.error("Error reading or parsing promotionDates.json:", error);
  }
} else {
  console.log("promotionDates.json not found, creating a new one.");
}

// Function to save promotion dates to the file
function savePromotionDates() {
  fs.writeFileSync(
    promotionFilePath,
    JSON.stringify(promotionDates, null, 2),
    "utf-8"
  );
}

const CONFIG = {
  ADMIN_ROLES: ["1233420465499017319", "1204875226110885979"],
  ROLES: {
    COMMANDER: "1186911102043435100",
    VICE_COMMANDER: "1233029491908149351",
    ELITE: "1186912762018926662",
    RANGER: "1186912800547811389",
    RECRUIT: "1227927464916025444",
    GUEST: "1204881159742423040",
  },
  CHANNELS: {
    BOT_CONTROL_LOG: "1318896486821658624",
    RECRUIT_CHAT: "1283840895208259634",
    ANNOUNCEMENTS: "1298239839556210808",
  },
};

// Simplified role hierarchy
const roleHierarchy = [
  ...CONFIG.ADMIN_ROLES,
  CONFIG.ROLES.COMMANDER,
  CONFIG.ROLES.VICE_COMMANDER,
  CONFIG.ROLES.ELITE,
  CONFIG.ROLES.RANGER,
  CONFIG.ROLES.RECRUIT,
  CONFIG.ROLES.GUEST,
];

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Utility Functions
function getRoleIndex(roleId) {
  return roleHierarchy.indexOf(roleId);
}

function getHighestRole(member) {
  let highestRoleIndex = -1;
  let highestRoleId = null;

  member.roles.cache.forEach((role) => {
    const index = getRoleIndex(role.id);
    if (index !== -1 && (highestRoleIndex === -1 || index < highestRoleIndex)) {
      highestRoleIndex = index;
      highestRoleId = role.id;
    }
  });

  return { roleId: highestRoleId, index: highestRoleIndex };
}

async function sendMessageToChannel(channelId, messageContent) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new Error("Channel not found");
    }
    await channel.send(messageContent);
    console.log("Message sent successfully!");
  } catch (error) {
    console.error("Failed to send message:", error.message);
  }
}

function getPromotionDate(member) {
  const promotionDateStr = promotionDates[member.id];
  return promotionDateStr ? new Date(promotionDateStr) : null;
}

// Bot Events
client.once(Events.ClientReady, () => {
  console.log("Bot is online and ready!");
});

// New Member Handler
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await member.guild.roles.fetch();
    await member.guild.channels.fetch();

    const guestRole = member.guild.roles.cache.get(CONFIG.ROLES.GUEST);
    if (!guestRole) {
      throw new Error("Guest role not found");
    }

    await member.roles.add(guestRole);
    const logChannel = member.guild.channels.cache.get(
      CONFIG.CHANNELS.BOT_CONTROL_LOG
    );

    if (logChannel) {
      await logChannel.send(
        `✅ Роль "гость" выдана новоприбывшему: ${member.user.tag}`
      );
    }
  } catch (error) {
    console.error("Error assigning guest role:", error);
    const logChannel = member.guild.channels.cache.get(
      CONFIG.CHANNELS.BOT_CONTROL_LOG
    );
    if (logChannel) {
      await logChannel.send(
        `❌ Ошибка при выдаче роли игроку: ${member.user.tag}\nError: ${error.message}. Пожалуйтесь Billie Joe`
      );
    }
  }
});

// Main Message Handler
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Handle recruit status check command
  if (message.content.startsWith(PREFIX + "рекрут")) {
    try {
      const member = message.member;
      if (!member) {
        return message.reply("Не могу найти информацию о твоем аккаунте.");
      }

      if (!member.roles.cache.has(CONFIG.ROLES.RECRUIT)) {
        return message.reply(
          "Эта команда доступна только для игроков с ролью 'Рекрут'."
        );
      }

      const promotionDate = getPromotionDate(member);
      if (!promotionDate) {
        return message.reply(
          "Не удалось найти дату твоего повышения. Обратись к администрации. (желательно в тикет в ветке 'подача заявки')"
        );
      }

      const currentDate = new Date();
      const timeLeft = new Date(promotionDate);
      timeLeft.setDate(timeLeft.getDate() + 14);
      const daysLeft = Math.floor(
        (timeLeft - currentDate) / (1000 * 60 * 60 * 24)
      );

      if (daysLeft > 0) {
        return message.reply(
          `У тебя осталось ${daysLeft} дней до возможного повышения до роли 'Стрелок' и принятия в основной состав. Покажи себя!`
        );
      } else {
        return message.reply(
          "2 недели истекло. Я отправил уведомление старшим командирам. Ожидай решения."
        );
      }
    } catch (error) {
      console.error("Error handling recruit command:", error);
      return message.reply("Произошла ошибка при выполнении команды.");
    }
  }

  // Handle promotion/demotion commands
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(" ");
    const displayNameToSearch = args[0];
    const command = args[1]?.toLowerCase();

    if (!displayNameToSearch || !["повысить", "понизить"].includes(command)) {
      return message.reply(
        "Укажите команду, например: '! <игрок> повысить' или '! <игрок> понизить'"
      );
    }

    try {
      const guild = message.guild;
      if (!guild)
        return message.reply("Эта команда доступна только в сервере.");

      await guild.members.fetch();
      const targetMember = guild.members.cache.find((m) =>
        m.displayName.toLowerCase().includes(displayNameToSearch.toLowerCase())
      );

      if (!targetMember) {
        return message.reply("Игрок с таким никнеймом не найден.");
      }

      const authorHighestRole = getHighestRole(message.member);
      const targetHighestRole = getHighestRole(targetMember);

      if (!authorHighestRole.roleId || !targetHighestRole.roleId) {
        return message.reply("Не удалось определить роли. Зовите Billie Joe.");
      }

      if (command === "понизить") {
        await handleDemotion(
          message,
          targetMember,
          authorHighestRole,
          targetHighestRole,
          guild
        );
      } else if (command === "повысить") {
        await handlePromotion(
          message,
          targetMember,
          authorHighestRole,
          targetHighestRole,
          guild
        );
      }
    } catch (error) {
      console.error("Error handling command:", error);
      await message.reply(
        "Произошла ошибка при выполнении команды. Жалуйтесь Billie Joe"
      );
    }
  }
});

// Promotion Handler
async function handlePromotion(
  message,
  targetMember,
  authorHighestRole,
  targetHighestRole,
  guild
) {
  try {
    if (targetHighestRole.index <= authorHighestRole.index) {
      return message.reply(
        "Вы не можете повысить пользователя, у которого такая же или более высокая роль."
      );
    }

    const newRoleIndex = targetHighestRole.index - 1;
    const newRoleId = roleHierarchy[newRoleIndex];

    if (!newRoleId) {
      return message.reply("Невозможно повысить дальше.");
    }

    const newRole = guild.roles.cache.get(newRoleId);
    if (!newRole) {
      return message.reply("Роль для повышения не найдена.");
    }

    await targetMember.roles.add(newRoleId);

    if (newRoleId === CONFIG.ROLES.RECRUIT) {
      promotionDates[targetMember.id] = new Date().toISOString();
      savePromotionDates();

      const msg = `Игрок <@${targetMember.id}> теперь в рекрутах. Добро пожаловать!\n В течении двух недель у вас будет держаться роль рекрута после чего командиры решат повышать вас или продлить рекрута. Если вы не подходите нашему клану я вам напишу в личные сообщения.\n Вам доступна команда ?рекрут что-бы узнать сколько у вас осталось до получения роли Стрелок с тегом ДШБ в игре/ другим вердиктом командования. \n Выполняйте команды, штурмуйте и не нарушайте правила. За каждым нарушением следует наказание!`;
      await sendMessageToChannel(CONFIG.CHANNELS.RECRUIT_CHAT, msg);
    }

    await message.reply(
      `${targetMember.displayName} был повышен до роли ${newRole.name}.`
    );
    await sendMessageToChannel(
      CONFIG.CHANNELS.ANNOUNCEMENTS,
      `Игрок <@${targetMember.id}> повышен до роли ${newRole.name}`
    );
  } catch (error) {
    console.error("Error in promotion handler:", error);
    throw error;
  }
}

// Demotion Handler
async function handleDemotion(
  message,
  targetMember,
  authorHighestRole,
  targetHighestRole,
  guild
) {
  try {
    if (authorHighestRole.index >= targetHighestRole.index) {
      return message.reply("Обращайтесь к командованию. Вам это еще не дано.");
    }

    if (targetHighestRole.roleId === CONFIG.ROLES.RECRUIT) {
      if (!CONFIG.ADMIN_ROLES.includes(authorHighestRole.roleId)) {
        return message.reply("Ты еще не дорос до понижения");
      }

      const filter = (response) => {
        return (
          response.author.id === message.author.id &&
          ["1", "2"].includes(response.content)
        );
      };

      await message.reply(
        "Вы пытаетесь понизить игрока до уровня 'Гость'. Выберите одну из следующих опций:\n" +
          "1. Сделать пользователя гостем\n" +
          "2. Выкинуть его из ДШБ"
      );

      try {
        const collected = await message.channel.awaitMessages({
          filter,
          max: 1,
          time: 30000,
          errors: ["time"],
        });

        const response = collected.first().content;

        if (response === "1") {
          await targetMember.roles.set([CONFIG.ROLES.GUEST]);
          await message.reply(`<@${targetMember.id}> был понижен до гостя.`);
          await sendMessageToChannel(
            CONFIG.CHANNELS.ANNOUNCEMENTS,
            `Игрок <@${targetMember.id}> понижен до гостя.`
          );
        } else if (response === "2") {
          try {
            await targetMember.send(
              "Вы, по тем или иным причинам, не подходите нашему сообществу."
            );
          } catch (error) {
            console.error("Не удалось отправить сообщение в лс:", error);
          }
          await targetMember.kick("Открываю двери...");
          await message.reply(`<@${targetMember.id}> был выкинут из сервера.`);
          await sendMessageToChannel(
            CONFIG.CHANNELS.ANNOUNCEMENTS,
            `Игрок <@${targetMember.id}> больше не с нами за нарушение правил ДШБ.`
          );
        }
      } catch (error) {
        return message.reply("Долго думаешь");
      }
    } else {
      const newRoleIndex = targetHighestRole.index + 1;
      const newRoleId = roleHierarchy[newRoleIndex];

      if (!newRoleId) {
        return message.reply(
          "Невозможно понизить дальше. Пиши старшим командирам"
        );
      }

      const newRole = guild.roles.cache.get(newRoleId);
      if (!newRole) {
        return message.reply("Роль для понижения не найдена.");
      }

      await targetMember.roles.add(newRoleId);
      await targetMember.roles.remove(targetHighestRole.roleId);

      await message.reply(
        `${targetMember.displayName} был понижен до роли ${newRole.name}.`
      );
      await sendMessageToChannel(
        CONFIG.CHANNELS.ANNOUNCEMENTS,
        `Игрок <@${targetMember.id}> понижен до роли ${newRole.name}`
      );
    }
  } catch (error) {
    console.error("Error in demotion handler:", error);
    throw error;
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Handle announcement command
  if (message.content.startsWith("*" + "объявление")) {
    // Remove the command part (!объявление) and trim any extra spaces
    const announcementContent = message.content
      .slice("*".length + "объявление".length)
      .trim();

    // Ensure there's some content to send
    if (!announcementContent) {
      return message.reply("Пожалуйста, укажите текст объявления.");
    }

    // Send the message to the announcement channel
    try {
      await sendMessageToChannel(
        CONFIG.CHANNELS.ANNOUNCEMENTS,
        announcementContent
      );
    } catch (error) {
      console.error("Ошибка при отправке объявления:", error);
      return message.reply("Произошла ошибка при отправке объявления.");
    }
  }
});
// Bot login
client.login(TOKEN);
