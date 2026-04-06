/* ============================================
   Pulse — AI Assistant (ChatGPT Panel)
   ============================================ */

let aiChatHistory = [];
let aiPanelOpen = false;

function toggleAiAssistant() {
  const panel = document.getElementById('ai-assistant-panel');
  if (!panel) return;
  aiPanelOpen = !aiPanelOpen;
  panel.classList.toggle('ai-panel-open', aiPanelOpen);
  if (aiPanelOpen && aiChatHistory.length === 0) {
    renderAiWelcome();
  }
}

function closeAiAssistant() {
  const panel = document.getElementById('ai-assistant-panel');
  if (panel) panel.classList.remove('ai-panel-open');
  aiPanelOpen = false;
}

function renderAiWelcome() {
  const body = document.getElementById('ai-chat-body');
  if (!body) return;
  body.innerHTML = `
    <div class="p-4 space-y-3">
      <div class="ai-bubble ai-bubble-assistant">
        <p class="text-sm">Hi! I'm your Pulse AI assistant. I can help you analyze your network and deal pipeline. What would you like to know?</p>
      </div>
      <div class="space-y-2 mt-4">
        <p class="text-xs text-surface-400 font-medium px-1">Quick questions</p>
        ${[
          'Summarize my deal pipeline',
          'Who should I follow up with this week?',
          'What deals are in due diligence?',
          'What is my pipeline value?',
          'Show me relationship health',
        ].map(q => `
          <button onclick="aiAskQuick(${JSON.stringify(q)})"
            class="w-full text-left text-xs px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-800 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-700 dark:hover:text-brand-300 transition-colors border border-surface-200 dark:border-surface-700">
            ${q}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

async function buildAiContext() {
  const [contacts, companies, calls, deals] = await Promise.all([
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getAll(STORES.deals).then(all => all.filter(d => d.userId === currentUser.id)),
  ]);

  const active = contacts.filter(c => !c.archived);
  const overdue = active.filter(c => c.nextFollowUpDate && new Date(c.nextFollowUpDate) < new Date());
  const dealsByStage = {};
  deals.forEach(d => { dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1; });
  const totalPipelineValue = deals
    .filter(d => !['Closed - Lost','Rejected'].includes(d.stage))
    .reduce((sum, d) => sum + (d.askingPrice || 0), 0);

  return `You are an AI assistant for ${currentUser.name}'s Search Fund CRM called Pulse.

CURRENT DATA SNAPSHOT:
- Total contacts: ${active.length}
- Companies tracked: ${companies.length}
- Calls logged: ${calls.length}
- Contacts overdue for follow-up: ${overdue.length}
- Total deals: ${deals.length}
- Active deals pipeline value: $${(totalPipelineValue / 1e6).toFixed(1)}M
- Deal stage breakdown: ${Object.entries(dealsByStage).map(([s, n]) => `${s}: ${n}`).join(', ')}
- Top overdue contacts: ${overdue.slice(0, 5).map(c => c.name).join(', ') || 'none'}
- Recent deals: ${deals.slice(-5).map(d => `${d.name} (${d.stage}, $${((d.askingPrice || 0) / 1e6).toFixed(1)}M)`).join('; ') || 'none'}

Be concise and actionable. Focus on search fund investing insights. Use bullet points when listing items.`;
}

async function aiAskQuick(question) {
  document.getElementById('ai-input').value = question;
  await sendAiMessage();
}

async function sendAiMessage() {
  const input = document.getElementById('ai-input');
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    showToast('Add an OpenAI or Claude API key in Settings to use the AI Assistant', 'warning');
    return;
  }

  input.value = '';
  addAiMessage('user', question);
  addAiThinking();

  try {
    const systemContext = await buildAiContext();
    const messages = [
      { role: 'system', content: systemContext },
      ...aiChatHistory.filter(m => m.role !== 'thinking'),
      { role: 'user', content: question }
    ];

    const answer = await callAIMessages(messages, 600, 0.7);
    removeAiThinking();
    addAiMessage('assistant', answer);
    aiChatHistory.push({ role: 'user', content: question });
    aiChatHistory.push({ role: 'assistant', content: answer });
    if (aiChatHistory.length > 20) aiChatHistory = aiChatHistory.slice(-20);
  } catch (err) {
    removeAiThinking();
    addAiMessage('error', 'Error: ' + err.message);
  }
}

function addAiMessage(role, content) {
  const body = document.getElementById('ai-chat-body');
  if (!body) return;

  // Remove welcome if present
  const welcome = body.querySelector('.ai-bubble-assistant');
  if (welcome && aiChatHistory.length === 0) body.innerHTML = '';

  const div = document.createElement('div');
  div.className = `ai-message-wrap ${role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}`;

  const bubble = document.createElement('div');
  bubble.className = `ai-bubble ${role === 'user' ? 'ai-bubble-user' : role === 'error' ? 'ai-bubble-error' : 'ai-bubble-assistant'}`;

  // Render markdown-lite for assistant
  const formatted = role === 'assistant'
    ? content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc">$1</li>')
        .replace(/(<li.*<\/li>\n?)+/g, m => `<ul class="space-y-1 my-1">${m}</ul>`)
        .replace(/\n\n/g, '</p><p class="mt-2">')
        .replace(/\n/g, '<br>')
    : escapeHtml(content);

  bubble.innerHTML = `<p class="text-sm leading-relaxed">${formatted}</p>`;
  div.appendChild(bubble);
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function addAiThinking() {
  const body = document.getElementById('ai-chat-body');
  if (!body) return;
  const div = document.createElement('div');
  div.id = 'ai-thinking';
  div.className = 'ai-message-wrap ai-msg-assistant';
  div.innerHTML = `<div class="ai-bubble ai-bubble-assistant">
    <div class="flex gap-1 items-center">
      <span class="ai-dot"></span><span class="ai-dot" style="animation-delay:.15s"></span><span class="ai-dot" style="animation-delay:.3s"></span>
    </div>
  </div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function removeAiThinking() {
  const t = document.getElementById('ai-thinking');
  if (t) t.remove();
}

function clearAiChat() {
  aiChatHistory = [];
  renderAiWelcome();
}

function handleAiInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAiMessage();
  }
}
