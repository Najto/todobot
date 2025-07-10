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
const MESSAGE_STORAGE_PATH = path.join(__dirname, 'message_storage.json');
let taskMessage = null;
let currentFilter = null;

// Kategorie-Mapping
const CATEGORIES = {
  1: { name: 'Vorbereitung & Kommunikation', icon: '📢' },
  2: { name: 'Feste Offi-Aufgaben', icon: '⚔️' },
  3: { name: 'Spieler-Feedback', icon: '💬' },
  4: { name: 'Organisation', icon: '📋' }
};

// Hilfsfunktionen
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

  try {
    // Tasks abrugen (gefiltert)
    let query = supabase.from('tasks').select('*');
    if (currentFilter) query = query.eq('category', currentFilter);
    
    const { data: tasks, error } = await query.order('category', { ascending: true });
    if (error) throw error;

    // Fortschritt berechnen
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;

    // Embed erstellen
    const embed = new EmbedBuilder()
      .setTitle('[📋 WoW Task Manager](https://silver-chaja-e8dc74.netlify.app/)')
      .setColor('#5865F2')
      .setDescription(
        `**Fortschritt:** ✅ ${completedTasks}/${totalTasks}\n` +
        `**Filter:** ${currentFilter ? CATEGORIES[currentFilter]?.name || `Kategorie ${currentFilter}` : 'Alle'}\n` +
        `**Letzte Aktualisierung:** <t:${Math.floor(Date.now()/1000)}:R>\n────────────────────`
      );

    // Tasks nach Kategorien gruppieren
    const categories = [...new Set(tasks.map(task => task.category))];
    
    categories.forEach(categoryId => {
      const categoryTasks = tasks.filter(task => task.category === categoryId);
      const completedInCategory = categoryTasks.filter(task => task.completed).length;
      const categoryInfo = CATEGORIES[categoryId] || { name: `Kategorie ${categoryId}`, icon: '📌' };

      embed.addFields({
        name: `${categoryInfo.icon} ${categoryInfo.name} (${completedInCategory}/${categoryTasks.length})`,
        value: categoryTasks.map(task => {
          let line = `${task.completed ? '✅' : '🔲'} `;
          if (task.selected_by) line += `🔘 `;
          line += `${task.name.slice(0, 30)}`;
          if (task.completed) line += ` | **${task.completed_by}**`;
          return line;
        }).join('\n') || '*Keine Tasks*',
        inline: true
      });
    });

    // Button-Komponenten
    const categoryButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('filter_all')
        .setLabel('Alle')
        .setStyle(currentFilter === null ? ButtonStyle.Primary : ButtonStyle.Secondary),
      ...Object.keys(CATEGORIES).map(categoryId => 
        new ButtonBuilder()
          .setCustomId(`filter_${categoryId}`)
          .setLabel(CATEGORIES[categoryId].name.slice(0, 12))
          .setStyle(currentFilter === Number(categoryId) ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji(CATEGORIES[categoryId].icon)
      )
    );

    // Task-Auswahl-Buttons (max. 5 Buttons pro Reihe)
    const taskSelectButtons = [];
    const visibleTasks = tasks.slice(0, 5); // Zeige nur die ersten 5 Tasks für Buttons
    if (visibleTasks.length > 0) {
      taskSelectButtons.push(
        new ActionRowBuilder().addComponents(
          visibleTasks.map(task => 
            new ButtonBuilder()
              .setCustomId(`select_${task.id}`)
              .setLabel(task.name.slice(0, 15))
              .setStyle(task.selected_by ? ButtonStyle.Primary : ButtonStyle.Secondary)
          )
        )
      );
    }

    const actionButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('refresh')
        .setLabel('Aktualisieren')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId('mark_done')
        .setLabel('Als erledigt')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('mark_pending')
        .setLabel('Ausstehend')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⌛'),
      new ButtonBuilder()
        .setCustomId('clear_selection')
        .setLabel('Auswahl löschen')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

    // Nachricht bearbeiten/erstellen
    const components = [categoryButtons, ...taskSelectButtons, actionButtons];
    if (!taskMessage) {
      taskMessage = await channel.send({ embeds: [embed], components });
      saveMessageId(taskMessage.id);
    } else {
      await taskMessage.edit({ embeds: [embed], components });
    }

  } catch (error) {
    console.error('Fehler:', error);
  }
}

// Bot-Events
bot.on('ready', async () => {
  console.log(`Bot eingeloggt als ${bot.user.tag}`);
  await updateTaskMessage();
});

bot.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  try {
    await interaction.deferUpdate();
    const { customId, user } = interaction;
    const userId = user.id;
    const username = user.username;

    // Filter-Buttons
    if (customId.startsWith('filter_')) {
      currentFilter = customId === 'filter_all' ? null : Number(customId.split('_')[1]);
    }

    // Task-Auswahl
    else if (customId.startsWith('select_')) {
      const taskId = customId.split('_')[1];
      // Zuerst alle Auswahlen des Users zurücksetzen
      await supabase
        .from('tasks')
        .update({ selected_by: null })
        .eq('selected_by', userId);
      // Dann neuen Task auswählen
      await supabase
        .from('tasks')
        .update({ selected_by: userId })
        .eq('id', taskId);
    }

    // Als erledigt markieren
    else if (customId === 'mark_done') {
      const { data: selectedTask } = await supabase
        .from('tasks')
        .select('id,name')
        .eq('selected_by', userId)
        .single();

      if (selectedTask) {
        await supabase
          .from('tasks')
          .update({ 
            completed: true,
            completed_by: username,
            selected_by: null
          })
          .eq('id', selectedTask.id);
      }
    }

    // Als ausstehend markieren
    else if (customId === 'mark_pending') {
      const { data: selectedTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('selected_by', userId)
        .single();

      if (selectedTask) {
        await supabase
          .from('tasks')
          .update({ 
            completed: false,
            completed_by: null,
            selected_by: null
          })
          .eq('id', selectedTask.id);
      }
    }

    // Auswahl löschen
    else if (customId === 'clear_selection') {
      await supabase
        .from('tasks')
        .update({ selected_by: null })
        .eq('selected_by', userId);
    }

    await updateTaskMessage();

  } catch (error) {
    console.error('Interaktionsfehler:', error);
    await interaction.followUp({ 
      content: '❌ Fehler bei der Verarbeitung', 
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