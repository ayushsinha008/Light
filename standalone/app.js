/* ==========================================================================
   Light - AI Engine & Interactive Features
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const state = {
    chatHistory: JSON.parse(localStorage.getItem('light_history')) || [
      {
        id: 'hist-1',
        title: 'Python BeautifulSoup Web Scraper',
        date: 'today',
        messages: [
          { role: 'user', content: 'Write a Python script to scrape news headlines with BeautifulSoup' },
          { role: 'ai', content: "Here is a complete Python script using `requests` and `BeautifulSoup` to scrape news headlines:\n\n```python\nimport requests\nfrom bs4 import BeautifulSoup\n\nurl = 'https://news.ycombinator.com/'\nresponse = requests.get(url)\n\nif response.status_code == 200:\n    soup = BeautifulSoup(response.text, 'html.parser')\n    titles = soup.find_all('span', class_='titleline')\n    \n    for idx, title in enumerate(titles, 1):\n        print(f'{idx}. {title.text}')\n```\n\nThis script fetches the HTML from Hacker News and extracts all article headlines neatly!" }
        ]
      },
      {
        id: 'hist-2',
        title: 'Quantum Entanglement Explanation',
        date: 'today',
        messages: [
          { role: 'user', content: 'Explain quantum entanglement in simple terms for a 10 year old' },
          { role: 'ai', content: 'Imagine you have a pair of magic socks! 🧦✨\n\nIf you put one sock in a box and send it to the Moon, and keep the other sock on Earth, the moment you open your box on Earth and see a RED sock, you instantly know the sock on the Moon is BLUE—without even looking at it!\n\nQuantum entanglement means two tiny particles are connected like magic socks. Whatever happens to one instantly tells us about the other, no matter how far apart they are!' }
        ]
      }
    ],
    currentChatId: null,
    isListening: false
  };

  // ==========================================
  // DOM ELEMENTS
  // ==========================================
  const sidebar = document.getElementById('sidebar');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const sidebarToggleText = document.getElementById('sidebarToggleText');
  const sidebarToggleIcon = document.getElementById('sidebarToggleIcon');
  const newChatBtn = document.getElementById('newChatBtn');
  const historySearchInput = document.getElementById('historySearchInput');
  const historyTodayList = document.getElementById('historyTodayList');
  const historyPastList = document.getElementById('historyPastList');

  const heroView = document.getElementById('heroView');
  const chatView = document.getElementById('chatView');
  const chatMessagesLog = document.getElementById('chatMessagesLog');

  const promptInput = document.getElementById('promptInput');
  const sendPromptBtn = document.getElementById('sendPromptBtn');
  const btnVoice = document.getElementById('btnVoice');
  const chatVoiceBtn = document.getElementById('chatVoiceBtn');
  const chatFollowUpInput = document.getElementById('chatFollowUpInput');
  const chatSendFollowUpBtn = document.getElementById('chatSendFollowUpBtn');

  // Mascot Elements
  const mascotWrapper = document.getElementById('mascotWrapper');
  const mascotCharacter = document.getElementById('mascotCharacter');
  const mascotSpeechText = document.getElementById('mascotSpeechText');
  const mascotMouth = document.getElementById('mascotMouth');
  const leftPupil = document.getElementById('leftPupil');
  const rightPupil = document.getElementById('rightPupil');

  // Theme Elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');

  // Speech Recognition instance
  let recognition = null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ==========================================
  // INITIALIZATION
  // ==========================================
  function init() {
    renderHistory();
    setupMascotEyeTracking();
    bindEvents();
    autoResizeTextarea(promptInput);
  }

  // ==========================================
  // 1. CARTOON MASCOT ENGINE & INTERACTION
  // ==========================================
  function setupMascotEyeTracking() {
    document.addEventListener('mousemove', (e) => {
      if (!mascotCharacter) return;

      const rect = mascotCharacter.getBoundingClientRect();
      const mascotCenterX = rect.left + rect.width / 2;
      const mascotCenterY = rect.top + rect.height / 2;

      // Angle to cursor
      const angle = Math.atan2(e.clientY - mascotCenterY, e.clientX - mascotCenterX);
      const distance = Math.min(6, Math.hypot(e.clientX - mascotCenterX, e.clientY - mascotCenterY) / 45);

      const pupilX = Math.cos(angle) * distance;
      const pupilY = Math.sin(angle) * distance;

      if (leftPupil && rightPupil) {
        leftPupil.style.transform = `translate(${pupilX}px, ${pupilY}px)`;
        rightPupil.style.transform = `translate(${pupilX}px, ${pupilY}px)`;
      }
    });
  }

  const mascotQuotes = [
    "Hi! Ask me anything or speak your task via the mic!",
    "I'm ready to write code, compose essays, or automate tasks!",
    "Did you know? I can browse websites and process code simultaneously!",
    "Fun fact: I love fast algorithms and sleek UI ⚡",
    "Type your query below or hit the voice button to speak!"
  ];

  if (mascotWrapper) {
    mascotWrapper.addEventListener('click', () => {
      const randomQuote = mascotQuotes[Math.floor(Math.random() * mascotQuotes.length)];
      if (mascotSpeechText) mascotSpeechText.textContent = randomQuote;
      
      if (mascotMouth) mascotMouth.setAttribute('d', 'M 82 108 Q 100 130 118 108');
      if (mascotCharacter) mascotCharacter.classList.add('excited');

      setTimeout(() => {
        if (mascotCharacter) mascotCharacter.classList.remove('excited');
        if (mascotMouth) mascotMouth.setAttribute('d', 'M 88 112 Q 100 122 112 112');
      }, 2000);
    });
  }

  // Reactions while typing
  if (promptInput) {
    promptInput.addEventListener('focus', () => {
      if (mascotSpeechText) mascotSpeechText.textContent = "Ooh, I see you typing! What are we creating?";
      if (mascotMouth) mascotMouth.setAttribute('d', 'M 84 110 Q 100 126 116 110');
    });

    promptInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (sendPromptBtn) sendPromptBtn.disabled = val.length === 0;

      if (val.length > 0) {
        if (mascotCharacter) mascotCharacter.classList.add('excited');
        if (mascotSpeechText) mascotSpeechText.textContent = "Great idea! Hit Send or Enter 🚀";
      } else {
        if (mascotCharacter) mascotCharacter.classList.remove('excited');
        if (mascotSpeechText) mascotSpeechText.textContent = "Hi there! Ready to create something cool?";
      }
    });

    promptInput.addEventListener('blur', () => {
      if (mascotCharacter) mascotCharacter.classList.remove('excited');
    });
  }

  // ==========================================
  // 2. VOICE SPEECH RECOGNITION
  // ==========================================
  function toggleSpeech(targetInput, voiceButton) {
    if (!SpeechRecognition) {
      showToast("Voice input is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    if (state.isListening) {
      if (recognition) recognition.stop();
      state.isListening = false;
      if (voiceButton) voiceButton.classList.remove('listening');
      showToast("Microphone stopped");
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      state.isListening = true;
      if (voiceButton) voiceButton.classList.add('listening');
      if (mascotSpeechText) mascotSpeechText.textContent = "Listening to you speak... 🎙️";
      if (mascotCharacter) mascotCharacter.classList.add('excited');
      showToast("Listening... speak your prompt");
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (targetInput) {
        targetInput.value = transcript;
        if (sendPromptBtn) sendPromptBtn.disabled = transcript.trim().length === 0;
      }
    };

    recognition.onerror = (event) => {
      state.isListening = false;
      if (voiceButton) voiceButton.classList.remove('listening');
      if (mascotCharacter) mascotCharacter.classList.remove('excited');
      showToast("Voice input error: " + event.error);
    };

    recognition.onend = () => {
      state.isListening = false;
      if (voiceButton) voiceButton.classList.remove('listening');
      if (mascotCharacter) mascotCharacter.classList.remove('excited');
      if (targetInput && targetInput.value.trim().length > 0) {
        if (mascotSpeechText) mascotSpeechText.textContent = "Got your voice prompt! Click Send to run.";
      }
    };

    try {
      recognition.start();
    } catch (e) {
      state.isListening = false;
      if (voiceButton) voiceButton.classList.remove('listening');
      showToast("Could not access microphone");
    }
  }

  // ==========================================
  // 3. SEARCH & CHAT STREAMING LOGIC
  // ==========================================
  function handleQuerySubmit(promptText) {
    if (!promptText || promptText.trim() === '') return;

    // Show mascot thinking state
    if (mascotSpeechText) mascotSpeechText.textContent = "Processing your query... 🧠";
    if (mascotCharacter) mascotCharacter.classList.add('thinking');

    // Switch View
    if (heroView) heroView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';

    // Build or get Chat Session
    let session = state.currentChatId 
      ? state.chatHistory.find(c => c.id === state.currentChatId) 
      : null;

    if (!session) {
      session = {
        id: 'hist-' + Date.now(),
        title: promptText.length > 30 ? promptText.substring(0, 30) + '...' : promptText,
        date: 'today',
        messages: []
      };
      state.chatHistory.unshift(session);
      state.currentChatId = session.id;
      localStorage.setItem('light_history', JSON.stringify(state.chatHistory));
      renderHistory();
    }

    // Append User Message
    session.messages.push({ role: 'user', content: promptText });
    renderChatMessages(session.messages);

    // Clear Inputs
    if (promptInput) promptInput.value = '';
    if (sendPromptBtn) sendPromptBtn.disabled = true;
    if (chatFollowUpInput) chatFollowUpInput.value = '';

    // Generate Simulated Streaming AI Response
    setTimeout(() => {
      const aiResponseText = generateMockAIResponse(promptText);
      simulateStreamingResponse(session, aiResponseText);
    }, 600);
  }

  function simulateStreamingResponse(session, fullText) {
    const msgId = 'ai-msg-' + Date.now();
    
    // Append AI placeholder
    const aiRow = document.createElement('div');
    aiRow.className = 'message-row ai-row';
    aiRow.innerHTML = `
      <div class="message-avatar"><i class="ri-sparkling-2-fill"></i></div>
      <div class="message-bubble" id="${msgId}">
        <span class="cursor-blink"></span>
      </div>
    `;
    if (chatMessagesLog) {
      chatMessagesLog.appendChild(aiRow);
      scrollToBottom();
    }

    const bubbleEl = document.getElementById(msgId);
    let index = 0;

    const interval = setInterval(() => {
      if (index < fullText.length) {
        index += Math.floor(Math.random() * 3) + 2;
        const currentSnippet = fullText.substring(0, index);
        if (bubbleEl) bubbleEl.innerHTML = formatMarkdownText(currentSnippet) + '<span class="cursor-blink"></span>';
        scrollToBottom();
      } else {
        clearInterval(interval);
        if (bubbleEl) bubbleEl.innerHTML = formatMarkdownText(fullText);
        
        // Save to session
        session.messages.push({ role: 'ai', content: fullText });
        localStorage.setItem('light_history', JSON.stringify(state.chatHistory));
        
        // Mascot happy state restored
        if (mascotCharacter) mascotCharacter.classList.remove('thinking');
        if (mascotSpeechText) mascotSpeechText.textContent = "Response complete! Need anything else?";
      }
    }, 25);
  }

  function generateMockAIResponse(prompt) {
    const lower = prompt.toLowerCase();
    
    if (lower.includes('python') || lower.includes('code') || lower.includes('scrape')) {
      return "Here is a clean Python solution for your request:\n\n```python\nimport requests\nfrom bs4 import BeautifulSoup\n\nurl = 'https://news.ycombinator.com/'\nresponse = requests.get(url)\n\nif response.status_code == 200:\n    soup = BeautifulSoup(response.text, 'html.parser')\n    titles = soup.find_all('span', class_='titleline')\n    for idx, title in enumerate(titles, 1):\n        print(f'{idx}. {title.text}')\n```\n\nThis script executes efficiently and extracts article titles cleanly.";
    }

    if (lower.includes('idea') || lower.includes('brainstorm') || lower.includes('youtube')) {
      return "Here are 4 high-engagement concepts for **" + prompt + "**:\n\n1. **'I Built an AI Browser Agent in 24 Hours'** - Real-time development and surprising results.\n2. **'10 Secret AI Tools You Haven't Tried'** - Rapid breakdown of underrated web apps.\n3. **'Can AI Beat a Senior Developer?'** - Fun coding challenge comparison.\n4. **'The Future of Ambient AI Interfaces'** - Exploring dynamic mascots and on-device privacy.";
    }

    return "Here is a summary addressing **\"" + prompt + "\"**:\n\n- **Core Action**: Processing request with on-device intelligence.\n- **Automation Plan**: Execute structured tasks without streaming private screens to cloud.\n- **Key Takeaway**: Fast, privacy-first assistance.\n\nLet me know if you would like me to perform any follow-up actions!";
  }

  function renderChatMessages(messages) {
    if (!chatMessagesLog) return;
    chatMessagesLog.innerHTML = '';
    messages.forEach(msg => {
      const row = document.createElement('div');
      row.className = `message-row ${msg.role === 'user' ? 'user-row' : 'ai-row'}`;
      
      const avatar = msg.role === 'user' 
        ? '<i class="ri-user-3-line"></i>' 
        : '<i class="ri-sparkling-2-fill"></i>';

      row.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-bubble">${formatMarkdownText(msg.content)}</div>
      `;
      chatMessagesLog.appendChild(row);
    });
    scrollToBottom();
  }

  function formatMarkdownText(text) {
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks ```python ... ```
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; overflow-x: auto; margin: 10px 0; border: 1px solid var(--border-color);"><code>${code}</code></pre>`;
    });

    // Bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Inline code `text`
    formatted = formatted.replace(/`(.*?)`/g, '<code style="background: rgba(99,102,241,0.2); padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>');
    // Newlines
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  function scrollToBottom() {
    if (chatMessagesLog) chatMessagesLog.scrollTop = chatMessagesLog.scrollHeight;
  }

  // ==========================================
  // 4. CHAT HISTORY SIDEBAR MANAGEMENT
  // ==========================================
  function renderHistory(filterText = '') {
    if (!historyTodayList || !historyPastList) return;
    historyTodayList.innerHTML = '';
    historyPastList.innerHTML = '';

    const filtered = state.chatHistory.filter(item => 
      item.title.toLowerCase().includes(filterText.toLowerCase())
    );

    if (filtered.length === 0) {
      historyTodayList.innerHTML = '<div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted);">No matching history</div>';
      return;
    }

    filtered.forEach(item => {
      const el = document.createElement('div');
      el.className = `history-item ${item.id === state.currentChatId ? 'active' : ''}`;
      el.innerHTML = `
        <i class="ri-chat-3-line"></i>
        <span class="history-item-title">${item.title}</span>
        <div class="history-actions">
          <i class="ri-delete-bin-line delete-hist-btn" data-id="${item.id}" title="Delete"></i>
        </div>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-hist-btn')) {
          e.stopPropagation();
          deleteHistoryItem(item.id);
          return;
        }
        loadChatSession(item.id);
      });

      if (item.date === 'today') {
        historyTodayList.appendChild(el);
      } else {
        historyPastList.appendChild(el);
      }
    });
  }

  function loadChatSession(id) {
    state.currentChatId = id;
    const session = state.chatHistory.find(c => c.id === id);
    if (!session) return;

    if (heroView) heroView.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';
    renderChatMessages(session.messages);
    renderHistory();
  }

  function deleteHistoryItem(id) {
    state.chatHistory = state.chatHistory.filter(c => c.id !== id);
    localStorage.setItem('light_history', JSON.stringify(state.chatHistory));
    if (state.currentChatId === id) {
      startNewChat();
    } else {
      renderHistory();
    }
    showToast('Chat history deleted');
  }

  function startNewChat() {
    state.currentChatId = null;
    if (heroView) heroView.style.display = 'flex';
    if (chatView) chatView.style.display = 'none';
    if (promptInput) promptInput.value = '';
    if (sendPromptBtn) sendPromptBtn.disabled = true;
    renderHistory();
  }

  // ==========================================
  // 5. EVENT BINDINGS
  // ==========================================
  function bindEvents() {
    // Sidebar toggle (Hide / Show Sidebar)
    if (toggleSidebarBtn && sidebar) {
      toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        if (sidebarToggleText) {
          sidebarToggleText.textContent = isCollapsed ? 'Show Sidebar' : 'Hide Sidebar';
        }
        if (sidebarToggleIcon) {
          sidebarToggleIcon.className = isCollapsed ? 'ri-sidebar-unfold-line' : 'ri-sidebar-fold-line';
        }
      });
    }

    // New Chat
    if (newChatBtn) newChatBtn.addEventListener('click', startNewChat);

    // History filter search
    if (historySearchInput) {
      historySearchInput.addEventListener('input', (e) => {
        renderHistory(e.target.value);
      });
    }

    // Voice button events
    if (btnVoice) {
      btnVoice.addEventListener('click', () => toggleSpeech(promptInput, btnVoice));
    }
    if (chatVoiceBtn) {
      chatVoiceBtn.addEventListener('click', () => toggleSpeech(chatFollowUpInput, chatVoiceBtn));
    }

    // Prompt Submissions
    if (sendPromptBtn && promptInput) {
      sendPromptBtn.addEventListener('click', () => handleQuerySubmit(promptInput.value));
      
      promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleQuerySubmit(promptInput.value);
        }
      });
    }

    if (chatSendFollowUpBtn && chatFollowUpInput) {
      chatSendFollowUpBtn.addEventListener('click', () => handleQuerySubmit(chatFollowUpInput.value));
      chatFollowUpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleQuerySubmit(chatFollowUpInput.value);
        }
      });
    }

    // Quick Suggestion Cards
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) handleQuerySubmit(prompt);
      });
    });

    // Theme Toggle
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', toggleTheme);
    }
  }

  function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    if (themeIcon) themeIcon.className = isLight ? 'ri-sun-line' : 'ri-moon-line';
    showToast(`Switched to ${isLight ? 'Light' : 'Dark'} theme`);
  }

  function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = (textarea.scrollHeight) + 'px';
    });
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    toastMessage.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // Run initialization
  init();
});
