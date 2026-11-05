// js/chat.js
document.addEventListener("DOMContentLoaded", function() {
  const chatWidget = document.getElementById('chat-widget');
  const chatToggle = document.getElementById('chat-toggle');

  // Переключение видимости чата
  chatToggle.addEventListener('click', function() {
    chatWidget.classList.toggle('minimized');
  });

  // Пример обработчика отправки сообщения (можно расширить функционал)
  const chatSend = document.getElementById('chat-send');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.querySelector('.chat-messages');

  chatSend.addEventListener('click', function() {
    const message = chatInput.value.trim();
    if (message !== '') {
      // Создаем новый элемент сообщения
      const messageElem = document.createElement('div');
      messageElem.textContent = message;
      messageElem.classList.add('chat-message');
      chatMessages.appendChild(messageElem);
      chatInput.value = '';
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
});
