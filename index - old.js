const { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GatewayIntentBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Discord-Bot initialisieren
const bot = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

// Supabase-Client
const supabase = createClient(
  'https://sjphbnpxtbwlffsvjaeg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqcGhibnB4dGJ3bGZmc3ZqYWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwOTIyMDcsImV4cCI6MjA2NzY2ODIwN30.ZRcBt0UMXY8H_V-J59trErPtImsoutTfrxGpWs--JUU'
);

// Konfiguration
const TASK_CHANNEL_ID = '1392627782399430676';
const MAX_BUTTON_ROWS = 5;
const MESSAGE_STORAGE_PATH = path.join(__dirname, 'message_storage.json');
let taskMessage = null;

// Kategorie-Mapping
const CATEGORIES = {
  1: { name: 'Vorbereitung & Kommunikation', defaultIcon: '📢' },
  2: { name: 'Feste Offi-Aufgaben', defaultIcon: '⚔️' }
};

// Funktion zum Erstellen von Button-Rows
function createButtonRows(tasks) {
  const rows = [];
  let currentRow = new ActionRowBuilder();
  
  tasks.forEach((task, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`task_${task.id}`)
      .setLabel(task.name.slice(0, 40))
      .setStyle(task.completed ? ButtonStyle.Success : ButtonStyle.Primary)
      .setEmoji(task.completed ? '✅' : '🔲');

    currentRow.addComponents(button);

    if (currentRow.components.length === 5 || index === tasks.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  return rows.slice(0, MAX_BUTTON_ROWS);
}

// Nachrichten-ID speichern/laden
function saveMessageId(messageId) {
  fs.writeFileSync(MESSAGE_STORAGE_PATH, JSON.stringify({ messageId }));
}

function loadMessageId() {
  try {
    if (fs.existsSync(MESSAGE_STORAGE_PATH)) {
      const data = fs.readFileSync(MESSAGE_STORAGE_PATH, 'utf8');
      return JSON.parse(data).messageId;
    }
  } catch (error) {
    console.error('Fehler beim Lesen der Nachrichten-ID:', error);
  }
  return null;
}

// Task-Nachricht aktualisieren
async function updateTaskMessage() {
  const channel = bot.channels.cache.get(TASK_CHANNEL_ID);
  if (!channel) return;

  const savedMessageId = loadMessageId();
  
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .order('category', { ascending: true });

    if (error) throw error;

    const embed = new EmbedBuilder()
      .setTitle('[🎯 WoW Task Manager]')
	  .setURL('https://silver-chaja-e8dc74.netlify.app')
      .setColor('#5865F2')
      .setDescription(`**Fortschritt:** ✅ ${tasks.filter(t => t.completed).length}/${tasks.length}\n────────────────────`);

    // Nach Kategorien gruppieren
    const categories = [...new Set(tasks.map(task => task.category))];
    
    for (const categoryId of categories) {
      const categoryTasks = tasks.filter(task => task.category === categoryId);
      const completedInCategory = categoryTasks.filter(task => task.completed).length;
      const categoryInfo = CATEGORIES[categoryId] || { name: `Kategorie ${categoryId}`, defaultIcon: '📌' };
      const categoryIcon = categoryTasks[0]?.icon || categoryInfo.defaultIcon;

      const taskList = categoryTasks.map(task => {
        const status = task.completed ? '✅' : '🔲';
        const icon = task.icon ? `${task.icon} ` : '';
        const completedBy = task.completed && task.completed_by 
          ? ` | Erledigt von: **${task.completed_by}**`
          : '';
        return `${status} ${icon}${task.name.slice(0, 50)}${completedBy}`;
      }).join('\n') || '*Keine Tasks*';

      embed.addFields({
        name: `${categoryIcon} **${categoryInfo.name}** (${completedInCategory}/${categoryTasks.length})`,
        value: taskList,
        inline: false
      });
    }

    const buttonRows = createButtonRows(tasks);

    if (savedMessageId) {
      try {
        taskMessage = await channel.messages.fetch(savedMessageId);
        await taskMessage.edit({ embeds: [embed], components: buttonRows });
      } catch (error) {
        console.log('Nachricht nicht gefunden, neue wird erstellt...');
        taskMessage = await channel.send({ embeds: [embed], components: buttonRows });
        saveMessageId(taskMessage.id);
      }
    } else {
      taskMessage = await channel.send({ embeds: [embed], components: buttonRows });
      saveMessageId(taskMessage.id);
    }

  } catch (error) {
    console.error('Fehler:', error);
  }
}

bot.on('ready', async () => {
  console.log(`Bot eingeloggt als ${bot.user.tag}`);
  await updateTaskMessage();
});

bot.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const taskId = interaction.customId.split('_')[1];
  const username = interaction.user.username;

  try {
    const { data: task } = await supabase
      .from('tasks')
      .select('completed')
      .eq('id', taskId)
      .single();

    const { error } = await supabase
      .from('tasks')
      .update({ 
        completed: !task.completed,
        completed_by: !task.completed ? username : null
      })
      .eq('id', taskId);

    if (error) throw error;

    await interaction.deferUpdate();
    await updateTaskMessage();

  } catch (err) {
    console.error('Interaktionsfehler:', err);
    await interaction.reply({
      content: '❌ Fehler beim Aktualisieren',
      ephemeral: true
    });
  }
});

// Realtime-Updates
supabase
  .channel('tasks')
  .on('postgres_changes', { 
    event: '*', 
    schema: 'public', 
    table: 'tasks' 
  }, () => updateTaskMessage())
  .subscribe();

bot.login('MTM5MjYyMTE0ODk4MTY5MDQzOA.GNhS3j.7P0MvwEpospOr8dU6XGeCiZEjbluIox_dyOKYU');