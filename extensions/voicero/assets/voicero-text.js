/**
 * VoiceroAI Text Module
 * Handles chat interface functionality after welcome screen interaction
 */

// Use IIFE to avoid global variable conflicts
(function (window, document) {
  // Check if VoiceroText already exists to prevent redeclaration
  if (window.VoiceroText) {
    console.log("VoiceroText: Already defined, not redefining");
    return;
  }

  // Text interface variables
  window.VoiceroText = {
    initialized: false,
    websiteColor: null,
    messages: [],

    // Initialize the text module
    init: function (initialMessage = null) {
      // Check if already initialized
      if (this.initialized) return;

      // Mark as initialized
      this.initialized = true;

      // Set global flag to prevent welcome screen from appearing
      window.voiceroInChatMode = true;

      console.log("VoiceroText: Initializing");

      // Get website color from VoiceroCore
      if (window.VoiceroCore && window.VoiceroCore.websiteColor) {
        this.websiteColor = window.VoiceroCore.websiteColor;
      } else if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.website &&
        window.VoiceroCore.session.website.color
      ) {
        this.websiteColor = window.VoiceroCore.session.website.color;
      } else {
        // Fallback to default purple
        this.websiteColor = "#882be6";
      }

      // Initialize with a message if provided
      if (initialMessage) {
        this.addMessage(initialMessage.text, initialMessage.type);
      }

      // Create the chat interface
      this.createChatInterface();
    },

    // Create the chat interface container
    createChatInterface: function () {
      console.log("VoiceroText: Creating chat interface");

      // First remove any existing welcome container
      const existingWelcome = document.getElementById(
        "voicero-welcome-container",
      );
      if (existingWelcome) {
        existingWelcome.remove();
      }

      // Create fresh container for chat interface
      let chatContainer = document.createElement("div");
      chatContainer.id = "voicero-chat-container";
      chatContainer.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        width: 375px;
        max-width: 90vw;
        height: 500px;
        max-height: 80vh;
        z-index: 9999999 !important;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        background: white;
        display: flex;
        flex-direction: column;
        visibility: visible !important;
        opacity: 1 !important;
      `;

      document.body.appendChild(chatContainer);

      // Create shadow root for chat container
      let chatShadow = chatContainer.attachShadow({ mode: "open" });

      // Add basic styles to the shadow root
      const styleEl = document.createElement("style");
      styleEl.textContent = `
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
        .chat-header {
          padding: 10px 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        .header-left {
          display: flex;
          align-items: center;
        }
        .avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          margin-right: 12px;
          overflow: hidden;
        }
        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .name-container {
          display: flex;
          flex-direction: column;
        }
        .name {
          font-weight: bold;
          font-size: 16px;
          margin-bottom: -3px;
          color: #000; /* Ensure name is black and visible */
        }
        .role {
          font-size: 12px;
          color: #666; /* Dark gray for role */
        }
        .close-button {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .message {
          max-width: 80%;
          padding: 10px 15px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.4;
          color: #333; /* Ensure text is visible by default */
        }
        .ai-message {
          align-self: flex-start;
          background-color: #f0f0f0;
          color: #333; /* Explicitly set AI message text color to dark */
          border-bottom-left-radius: 4px;
        }
        .user-message {
          align-self: flex-end;
          background-color: ${this.websiteColor || "#882be6"};
          color: white; /* User message text is white for contrast */
          border-bottom-right-radius: 4px;
        }
        .input-container {
          padding: 10px 15px;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
          position: relative;
        }
        .input-wrapper {
          position: relative;
          width: 100%;
        }
        .message-input {
          width: 100%;
          padding: 12px 40px 12px 15px;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 20px;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
        }
        .send-button {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
        }
      `;
      chatShadow.appendChild(styleEl);

      // Create header
      const header = document.createElement("div");
      header.className = "chat-header";

      // Header left side (avatar and name)
      const headerLeft = document.createElement("div");
      headerLeft.className = "header-left";

      // Avatar
      const avatar = document.createElement("div");
      avatar.className = "avatar";

      // Try to build the correct path for Shopify theme extension assets
      var extensionUrl = "";
      var scripts = document.querySelectorAll("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src.includes("voicero-") || src.includes("voicero/")) {
          extensionUrl = src.substring(0, src.lastIndexOf("/") + 1);
          break;
        }
      }

      const avatarImg = document.createElement("img");
      avatarImg.src = extensionUrl ? extensionUrl + "icon.png" : "./icon.png";
      avatarImg.alt = "Support agent";
      avatar.appendChild(avatarImg);

      // Name and role
      const nameContainer = document.createElement("div");
      nameContainer.className = "name-container";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = "Suvi";

      const role = document.createElement("div");
      role.className = "role";
      role.textContent = "AI Sales Rep";

      nameContainer.appendChild(name);
      nameContainer.appendChild(role);

      headerLeft.appendChild(avatar);
      headerLeft.appendChild(nameContainer);

      // Close button
      const closeButton = document.createElement("div");
      closeButton.className = "close-button";
      closeButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
        <path d="M18 6L6 18M6 6l12 12"></path>
      </svg>`;

      closeButton.addEventListener("click", () => {
        console.log("VoiceroText: Chat closed by user");

        // Remove the chat container
        chatContainer.remove();

        // IMPORTANT: Reset all flags to ensure welcome screen can reappear
        window.voiceroInChatMode = false;
        window.voiceroWelcomeInProgress = false;

        // Reset the initialized state to allow reopening
        window.VoiceroText.initialized = false;
        window.VoiceroText.messages = [];

        console.log("VoiceroText: Reset all flags for welcome screen");
      });

      // Assemble header
      header.appendChild(headerLeft);
      header.appendChild(closeButton);
      chatShadow.appendChild(header);

      // Messages container
      const messagesContainer = document.createElement("div");
      messagesContainer.className = "messages-container";
      chatShadow.appendChild(messagesContainer);

      // Render existing messages if any
      this.renderMessages(messagesContainer);

      // Input container
      const inputContainer = document.createElement("div");
      inputContainer.className = "input-container";

      const inputWrapper = document.createElement("div");
      inputWrapper.className = "input-wrapper";

      const input = document.createElement("input");
      input.className = "message-input";
      input.type = "text";
      input.placeholder = "Type your message...";

      const sendButton = document.createElement("div");
      sendButton.className = "send-button";
      sendButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${this.websiteColor || "#882be6"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
      </svg>`;

      // Send message function
      const sendMessage = () => {
        const text = input.value.trim();
        if (text) {
          this.addMessage(text, "user");
          input.value = "";
          this.renderMessages(messagesContainer);

          // Simulate AI response (in a real implementation, this would call an API)
          setTimeout(() => {
            this.renderMessages(messagesContainer);
          }, 1000);
        }
      };

      // Add event listeners
      sendButton.addEventListener("click", sendMessage);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          sendMessage();
        }
      });

      inputWrapper.appendChild(input);
      inputWrapper.appendChild(sendButton);
      inputContainer.appendChild(inputWrapper);
      chatShadow.appendChild(inputContainer);

      // Set focus on input
      setTimeout(() => {
        input.focus();
      }, 300);
    },

    // Add a message to the messages array
    addMessage: function (text, type) {
      if (!text || !type) return;

      this.messages.push({
        text: text,
        type: type, // 'ai' or 'user'
        timestamp: new Date(),
      });

      console.log(`VoiceroText: Added ${type} message: ${text}`);
    },

    // Render all messages in the container
    renderMessages: function (container) {
      if (!container) return;

      // Clear existing messages
      container.innerHTML = "";

      // Add each message
      this.messages.forEach((message) => {
        const messageEl = document.createElement("div");
        messageEl.className = `message ${message.type}-message`;

        // Set text with proper styling to ensure visibility
        messageEl.style.cssText = `
          color: ${message.type === "ai" ? "#333" : "white"};
          font-weight: normal;
          word-break: break-word;
        `;

        // Use innerHTML for message text
        messageEl.textContent = message.text;

        container.appendChild(messageEl);
      });

      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    },
  };

  // Export a function to handle messages from welcome screen
  window.handleVoiceroWelcomeAction = function (action, text) {
    console.log(`VoiceroText: Handling action ${action} with text: ${text}`);

    // Set a global flag to prevent welcome screen from reappearing
    window.voiceroInChatMode = true;

    // Disable any welcome screen checks
    if (window.voiceroWelcomeCheckInterval) {
      clearInterval(window.voiceroWelcomeCheckInterval);
      console.log("VoiceroText: Cleared welcome check interval");
    }

    let initialMessage = null;

    // Handle different button actions
    if (action === "talk-to-sales") {
      initialMessage = {
        text: "Hi there! I'm Suvi, your AI Sales Rep. How can I help you today?",
        type: "ai",
      };
    } else if (action === "get-started") {
      initialMessage = {
        text: "Welcome! I'm here to help you get started. What would you like to know?",
        type: "ai",
      };
    } else if (action === "customer-support") {
      initialMessage = {
        text: "Hello! I'm Suvi from customer support. How can I assist you today?",
        type: "ai",
      };
    } else if (text) {
      // If it's a direct text input from user, don't add an automatic greeting
      initialMessage = null; // Skip the initial AI greeting
    }

    // Initialize text interface with initial message
    if (!window.VoiceroText.initialized) {
      window.VoiceroText.init(initialMessage);
    }

    // If there's user text, add it as a user message
    if (text) {
      window.VoiceroText.addMessage(text, "user");

      // Re-render messages
      const container = document
        .querySelector("#voicero-chat-container")
        .shadowRoot.querySelector(".messages-container");
      if (container) {
        window.VoiceroText.renderMessages(container);
      }
    }
  };
})(window, document);
