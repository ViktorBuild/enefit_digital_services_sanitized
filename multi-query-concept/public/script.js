async function startProcess() {
  const question = document.getElementById('question').value.trim();
  const status = document.getElementById('status');
  const flowContainer = document.getElementById('flow-container');
  const sendButton = document.getElementById('send');

  // Reset UI
  flowContainer.style.display = 'none';
  document.getElementById('variations-content').innerHTML = '';
  document.getElementById('initial-responses-content').innerHTML = '';
  document.getElementById('super-question-content').innerHTML = '';
  document.getElementById('final-response-content').innerHTML = '';
  
  // Hide all steps initially
  document.getElementById('step-variations').style.display = 'none';
  document.getElementById('step-initial').style.display = 'none';
  document.getElementById('step-super').style.display = 'none';
  document.getElementById('step-final').style.display = 'none';
  
  // Hide arrows initially
  const arrows = document.querySelectorAll('.arrow');
  arrows.forEach(arrow => arrow.style.display = 'none');
  
  status.textContent = '';
  status.className = '';

  if (!question) {
    status.textContent = 'Bitte geben Sie eine Frage ein.';
    status.className = 'status-error';
    return;
  }

  sendButton.disabled = true;
  status.textContent = 'Gesamtprozess wird gestartet...';
  status.className = 'status-info';
  flowContainer.style.display = 'block';

  try {
    // Step 1: Generate variations
    status.textContent = '5 Fragevarianten werden generiert...';
    document.getElementById('step-variations').style.display = 'block';
    document.getElementById('variations-content').innerHTML = '<div class="loading-indicator"><div class="spinner"></div>Wird geladen...</div>';
    
    const variationsResp = await fetch('/api/variations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    if (!variationsResp.ok) {
      let errorMessage = 'Fehler beim Generieren der Varianten';
      try {
        const err = await variationsResp.json();
        errorMessage = err.error || errorMessage;
      } catch (e) {
        errorMessage = `Serverfehler (${variationsResp.status}): ${variationsResp.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const variationsData = await variationsResp.json();
    const variationsContent = document.getElementById('variations-content');
    variationsContent.innerHTML = '';
    
    variationsData.variations.forEach((v, i) => {
      const el = document.createElement('div');
      el.className = 'variation-item';
      el.innerHTML = `<strong>Variante ${i+1}:</strong> ${escapeHtml(v)}`;
      variationsContent.appendChild(el);
    });

    // Step 2: Query chatbot with variations (show responses as they come)
    status.textContent = 'Antworten vom Custom Chatbot werden abgerufen...';
    document.getElementById('step-initial').style.display = 'block';
    document.querySelectorAll('.arrow')[0].style.display = 'block';
    const initialContent = document.getElementById('initial-responses-content');
    initialContent.innerHTML = '<div class="loading-indicator"><div class="spinner"></div>Warten auf Antworten...</div>';

    const chatbotResponses = [];
    
    // Query chatbot for each variation sequentially and show results immediately
    for (let i = 0; i < variationsData.variations.length; i++) {
      const variation = variationsData.variations[i];
      
      // Show loading for current question
      if (i === 0) {
        initialContent.innerHTML = '';
      }
      
      const loadingEl = document.createElement('div');
      loadingEl.className = 'response-item';
      loadingEl.id = `response-loading-${i}`;
      loadingEl.innerHTML = `<strong>Frage ${i+1} wird verarbeitet...</strong>`;
      initialContent.appendChild(loadingEl);

      try {
        const chatbotResp = await fetch('/api/chatbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: [variation] })
        });

        if (!chatbotResp.ok) {
          let errorMessage = 'Fehler bei der Chatbot-Abfrage';
          try {
            const err = await chatbotResp.json();
            errorMessage = err.error || errorMessage;
          } catch (e) {
            errorMessage = `Serverfehler (${chatbotResp.status})`;
          }
          throw new Error(errorMessage);
        }

        const chatbotData = await chatbotResp.json();
        const response = chatbotData.responses[0];
        chatbotResponses.push(response);

        // Update UI immediately
        const statusIcon = response.success ? '✅' : '❌';
        loadingEl.id = '';
        loadingEl.innerHTML = `
          <strong>${statusIcon} Antwort ${i+1} (auf: "${escapeHtml(response.question)}"):</strong>
          <pre>${escapeHtml(response.answer)}</pre>
        `;
        
        // Scroll to show new response
        loadingEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
      } catch (err) {
        chatbotResponses.push({
          question: variation,
          answer: 'Fehler: ' + err.message,
          success: false
        });
        
        loadingEl.id = '';
        loadingEl.innerHTML = `
          <strong>❌ Antwort ${i+1} (auf: "${escapeHtml(variation)}"):</strong>
          <pre>Fehler: ${escapeHtml(err.message)}</pre>
        `;
      }
    }

    // Step 3: Create super question from first 5 answers
    status.textContent = 'Super-Frage wird in Azure GPT erstellt...';
    document.getElementById('step-super').style.display = 'block';
    document.querySelectorAll('.arrow')[1].style.display = 'block';
    const superContent = document.getElementById('super-question-content');
    superContent.innerHTML = '<div class="loading-indicator"><div class="spinner"></div>Antworten werden analysiert und Super-Frage erstellt...</div>';

    const firstFiveAnswers = chatbotResponses.slice(0, 5).map(r => r.answer);
    
    const superQuestionResp = await fetch('/api/super-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: firstFiveAnswers })
    });

    if (!superQuestionResp.ok) {
      let errorMessage = 'Fehler beim Erstellen der Super-Frage';
      try {
        const err = await superQuestionResp.json();
        errorMessage = err.error || err.details || errorMessage;
      } catch (e) {
        errorMessage = `Serverfehler (${superQuestionResp.status})`;
      }
      throw new Error(errorMessage);
    }

    const superQuestionData = await superQuestionResp.json();
    superContent.innerHTML = '';
    
    const superBox = document.createElement('div');
    superBox.className = 'super-question-box';
    
    let sourcesHtml = '';
    if (superQuestionData.sources_mentioned && superQuestionData.sources_mentioned.length > 0) {
      sourcesHtml = `
        <div class="sources-box">
          <h5>Erwähnte Quellen:</h5>
          <ul>
            ${superQuestionData.sources_mentioned.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    let topicsHtml = '';
    if (superQuestionData.topics_collected && superQuestionData.topics_collected.length > 0) {
      topicsHtml = `
        <div class="topics-box">
          <h5>Gesammelte Themen:</h5>
          <ul>
            ${superQuestionData.topics_collected.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    superBox.innerHTML = `
      <h4>Super-Frage:</h4>
      <p style="font-size: 1.1em; margin: 10px 0; font-weight: 600;">${escapeHtml(superQuestionData.super_question)}</p>
      ${sourcesHtml || topicsHtml ? `
        <div class="sources-topics">
          ${sourcesHtml}
          ${topicsHtml}
        </div>
      ` : ''}
    `;
    superContent.appendChild(superBox);

    // Step 4: Query chatbot with super question
    status.textContent = 'Finale Antwort wird vom Custom Chatbot abgerufen...';
    document.getElementById('step-final').style.display = 'block';
    document.querySelectorAll('.arrow')[2].style.display = 'block';
    const finalContent = document.getElementById('final-response-content');
    finalContent.innerHTML = '<div class="loading-indicator"><div class="spinner"></div>Warten auf finale Antwort...</div>';

    const finalChatbotResp = await fetch('/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [superQuestionData.super_question] })
    });

    if (!finalChatbotResp.ok) {
      let errorMessage = 'Fehler beim Abrufen der finalen Antwort';
      try {
        const err = await finalChatbotResp.json();
        errorMessage = err.error || errorMessage;
      } catch (e) {
        errorMessage = `Serverfehler (${finalChatbotResp.status})`;
      }
      throw new Error(errorMessage);
    }

    const finalChatbotData = await finalChatbotResp.json();
    const finalResponse = finalChatbotData.responses[0];
    
    finalContent.innerHTML = '';
    const finalBox = document.createElement('div');
    finalBox.className = 'final-response';
    const statusIcon = finalResponse.success ? '✅' : '❌';
    finalBox.innerHTML = `
      <h4>${statusIcon} Finale konsolidierte Antwort:</h4>
      <pre>${escapeHtml(finalResponse.answer)}</pre>
    `;
    finalContent.appendChild(finalBox);

    status.textContent = 'Prozess erfolgreich abgeschlossen!';
    status.className = 'status-success';
    sendButton.disabled = false;

    // Scroll to top to see full flow
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (e) {
    console.error('Prozessfehler:', e);
    status.textContent = 'Fehler: ' + (e.message || 'Ein unbekannter Fehler ist aufgetreten');
    status.className = 'status-error';
    sendButton.disabled = false;
    
    // Show error in the current step if available
    const currentStep = document.querySelector('.flow-step[style*="block"]');
    if (currentStep) {
      const stepContent = currentStep.querySelector('.step-content');
      if (stepContent) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'status-error';
        errorDiv.style.marginTop = '15px';
        errorDiv.style.padding = '12px';
        errorDiv.style.borderRadius = '8px';
        errorDiv.innerHTML = `<strong>Fehler:</strong> ${escapeHtml(e.message || 'Unbekannter Fehler')}`;
        stepContent.appendChild(errorDiv);
      }
    }
  }
}

document.getElementById('send').addEventListener('click', startProcess);

function escapeHtml(text) {
  if (typeof text !== 'string') {
    text = String(text);
  }
  const map = { 
    '&': '&amp;', 
    '<': '&lt;', 
    '>': '&gt;', 
    '"': '&quot;', 
    "'": '&#039;' 
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Auto-start if 'q' parameter is present
function checkAutoStart() {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  if (query) {
    const questionInput = document.getElementById('question');
    if (questionInput) {
      questionInput.value = query;
      // Small delay to ensure everything is ready
      setTimeout(() => {
        startProcess();
      }, 100);
    }
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', checkAutoStart);
} else {
  checkAutoStart();
}
