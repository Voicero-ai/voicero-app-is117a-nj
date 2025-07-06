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

      // Debug: Log VoiceroCore session data
      this.debugLogSessionData();

      // Ensure required modules are loaded
      this.ensureRequiredModulesLoaded();

      // Get website color from VoiceroCore
      if (window.VoiceroCore && window.VoiceroCore.websiteColor) {
        this.websiteColor = window.VoiceroCore.websiteColor;
        console.log(
          "VoiceroText: Using color from VoiceroCore:",
          this.websiteColor,
        );
      } else if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.websiteColor
      ) {
        this.websiteColor = window.VoiceroCore.session.websiteColor;
        console.log(
          "VoiceroText: Using color from session:",
          this.websiteColor,
        );
      } else if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.website &&
        window.VoiceroCore.session.website.color
      ) {
        this.websiteColor = window.VoiceroCore.session.website.color;
        console.log(
          "VoiceroText: Using color from session.website:",
          this.websiteColor,
        );
      } else {
        // Fallback to default purple
        this.websiteColor = "#882be6";
        console.log("VoiceroText: Using default color:", this.websiteColor);
      }

      // Initialize with a message if provided
      if (initialMessage) {
        this.addMessage(initialMessage.text, initialMessage.type);
      }

      // Create the chat interface
      this.createChatInterface();
    },

    // Ensure required modules are loaded
    ensureRequiredModulesLoaded: function () {
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

      // Load VoiceroActionHandler first (highest priority)
      if (!window.VoiceroActionHandler) {
        console.log("VoiceroText: Loading VoiceroActionHandler module");

        // Create and append the script
        var actionScript = document.createElement("script");
        actionScript.src = extensionUrl
          ? extensionUrl + "voicero-action-handler.js"
          : "./voicero-action-handler.js";
        document.head.appendChild(actionScript);

        // Initialize immediately when loaded
        actionScript.onload = function () {
          if (
            window.VoiceroActionHandler &&
            typeof window.VoiceroActionHandler.init === "function"
          ) {
            console.log("VoiceroText: Initializing VoiceroActionHandler");
            window.VoiceroActionHandler.init();
          }
        };
      }

      // Load VoiceroSupport
      if (!window.VoiceroSupport) {
        console.log("VoiceroText: Loading VoiceroSupport module");

        // Create and append the script
        var supportScript = document.createElement("script");
        supportScript.src = extensionUrl
          ? extensionUrl + "voicero-support.js"
          : "./voicero-support.js";
        document.head.appendChild(supportScript);
      }

      // Load VoiceroContact
      if (!window.VoiceroContact) {
        console.log("VoiceroText: Loading VoiceroContact module");

        // Create and append the script
        var contactScript = document.createElement("script");
        contactScript.src = extensionUrl
          ? extensionUrl + "voicero-contact.js"
          : "./voicero-contact.js";
        document.head.appendChild(contactScript);
      }

      // Initialize modules after a short delay
      setTimeout(() => {
        if (
          window.VoiceroSupport &&
          typeof window.VoiceroSupport.init === "function"
        ) {
          window.VoiceroSupport.init();
        }
        if (
          window.VoiceroActionHandler &&
          typeof window.VoiceroActionHandler.init === "function"
        ) {
          window.VoiceroActionHandler.init();
        }
      }, 500);
    },

    // Create the chat interface container
    createChatContainer: function () {
      console.log("VoiceroText: Creating chat container");

      // Wait for VoiceroCore to be fully initialized
      if (window.VoiceroCore && !window.VoiceroCore.coreInitialized) {
        console.log(
          "VoiceroText: Waiting for VoiceroCore to be fully initialized",
        );

        // Try again after a delay
        setTimeout(() => {
          console.log(
            "VoiceroText: Retrying creating chat container after delay",
          );
          this.createChatContainer();
        }, 800);

        return;
      }

      // Initialize if not already done
      if (!this.initialized) {
        this.init();
      }

      // Remove any existing chat container first
      const existingChat = document.getElementById("voicero-chat-container");
      if (existingChat) {
        console.log("VoiceroText: Removing existing chat container");
        existingChat.remove();
      }

      // Create the chat interface
      this.createChatInterface();

      // Load existing messages immediately
      console.log("VoiceroText: Loading existing messages immediately");
      this.loadExistingMessages();

      // Make sure the chat container is visible
      const chatContainer = document.getElementById("voicero-chat-container");
      if (chatContainer) {
        console.log("VoiceroText: Ensuring chat container is visible");
        chatContainer.style.display = "flex";
        chatContainer.style.visibility = "visible";
        chatContainer.style.opacity = "1";
        chatContainer.style.zIndex = "9999999";
      }
    },

    // Load existing messages from VoiceroCore session
    loadExistingMessages: function () {
      console.log("VoiceroText: Loading existing messages from session");

      // Wait for VoiceroCore to be fully initialized
      if (window.VoiceroCore && !window.VoiceroCore.coreInitialized) {
        console.log(
          "VoiceroText: Waiting for VoiceroCore to be fully initialized",
        );

        // Try again after a delay
        setTimeout(() => {
          console.log("VoiceroText: Retrying loading messages after delay");
          this.loadExistingMessages();
        }, 800);

        return false;
      }

      // Check if VoiceroCore has thread messages
      if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.threads &&
        window.VoiceroCore.session.threads.length > 0
      ) {
        const threads = window.VoiceroCore.session.threads;
        console.log(`VoiceroText: Found ${threads.length} threads in session`);

        // Get the most recent thread
        const latestThread = threads[0];

        if (
          latestThread &&
          latestThread.messages &&
          latestThread.messages.length > 0
        ) {
          // Sort messages by createdAt timestamp
          const messages = [...latestThread.messages].sort((a, b) => {
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          console.log(
            `VoiceroText: Latest thread has ${messages.length} messages, sorted by timestamp`,
          );

          // Clear existing messages
          this.messages = [];

          // Simple loop to add messages
          for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (message && message.role && message.content) {
              // Map role to our message type
              const type = message.role === "user" ? "user" : "ai";

              // Just extract the text for display
              let displayText = message.content;

              // If content is JSON with answer field, extract it
              if (
                typeof displayText === "string" &&
                displayText.includes('"answer"')
              ) {
                try {
                  const parsed = JSON.parse(displayText);
                  if (parsed && parsed.answer) {
                    displayText = parsed.answer;
                    console.log("Extracted answer:", displayText);
                  }
                } catch (e) {
                  // Just use the original text if parsing fails
                  console.log("Failed to parse JSON:", e);
                }
              }

              // Add to our messages array
              this.messages.push({
                text: displayText,
                type: type,
                timestamp: new Date(message.createdAt || Date.now()),
                isHistorical: true, // Flag to prevent action processing
                createdAt: message.createdAt, // Store original timestamp
              });

              // Force scroll to bottom after each message is added
              const chatContainer = document.getElementById(
                "voicero-chat-container",
              );
              if (chatContainer && chatContainer.shadowRoot) {
                const messagesContainer =
                  chatContainer.shadowRoot.querySelector(".messages-container");
                if (messagesContainer) {
                  window.VoiceroText.scrollToBottom(messagesContainer);
                }
              }

              console.log(
                `Added ${type} message from ${message.createdAt}: ${displayText.substring(0, 30)}...`,
              );
            }
          }

          // Find the messages container and render messages
          const chatContainer = document.getElementById(
            "voicero-chat-container",
          );
          if (chatContainer && chatContainer.shadowRoot) {
            const messagesContainer = chatContainer.shadowRoot.querySelector(
              ".messages-container",
            );
            if (messagesContainer) {
              // Render the loaded messages
              this.renderMessages(messagesContainer);
              console.log("Rendered messages in container");

              // Use the scrollToBottom helper method
              this.scrollToBottom(messagesContainer);
              console.log("Using scrollToBottom helper for reliable scrolling");
            } else {
              console.log("Messages container not found in shadow DOM");
            }
          } else {
            console.log("Chat container or shadow root not found");
          }

          console.log(
            `VoiceroText: Loaded ${this.messages.length} messages from session`,
          );
          return true;
        }
      }

      console.log("No messages found in session");
      return false;
    },

    // Create the chat interface
    createChatInterface: function () {
      console.log("VoiceroText: Creating chat interface");

      // First remove any existing welcome container
      const existingWelcome = document.getElementById(
        "voicero-welcome-container",
      );
      if (existingWelcome) {
        console.log("VoiceroText: Removing welcome container");
        existingWelcome.remove();
      }

      // Also remove any existing chat container to prevent duplicates
      const existingChat = document.getElementById("voicero-chat-container");
      if (existingChat) {
        console.log("VoiceroText: Removing existing chat container");
        existingChat.remove();
      }

      // Make sure we have the latest website color
      if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.websiteColor
      ) {
        this.websiteColor = window.VoiceroCore.session.websiteColor;
        console.log(
          "VoiceroText: Updated color from session:",
          this.websiteColor,
        );
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
        display: flex !important;
        flex-direction: column;
        visibility: visible !important;
        opacity: 1 !important;
      `;

      document.body.appendChild(chatContainer);

      // Create shadow root for chat container
      let chatShadow = chatContainer.attachShadow({ mode: "open" });

      // Add basic styles to the shadow root
      const styleEl = document.createElement("style");

      // Get the current website color
      const themeColor = this.websiteColor || "#882be6";
      console.log("VoiceroText: Using color for styles:", themeColor);

      // Create RGB values from hex color for the animation
      let r = 136,
        g = 43,
        b = 230; // Default purple RGB

      // Try to convert the theme color to RGB
      if (
        themeColor.startsWith("#") &&
        (themeColor.length === 7 || themeColor.length === 4)
      ) {
        try {
          if (themeColor.length === 7) {
            r = parseInt(themeColor.substring(1, 3), 16);
            g = parseInt(themeColor.substring(3, 5), 16);
            b = parseInt(themeColor.substring(5, 7), 16);
          } else {
            // For #RGB format
            r = parseInt(themeColor.charAt(1) + themeColor.charAt(1), 16);
            g = parseInt(themeColor.charAt(2) + themeColor.charAt(2), 16);
            b = parseInt(themeColor.charAt(3) + themeColor.charAt(3), 16);
          }
          console.log(
            `VoiceroText: Converted theme color to RGB: ${r}, ${g}, ${b}`,
          );
        } catch (e) {
          console.log(
            "VoiceroText: Error converting theme color to RGB, using default",
          );
        }
      }

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
          
          /* Hide scrollbar but keep scrolling functionality */
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE and Edge */
        }
        
        /* Hide scrollbar for Chrome, Safari and Opera */
        .messages-container::-webkit-scrollbar {
          display: none;
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
          background-color: ${themeColor};
          color: white; /* User message text is white for contrast */
          border-bottom-right-radius: 4px;
        }
        
        /* Markdown styling */
        .ai-message a {
          color: ${themeColor};
          text-decoration: underline;
        }
        .ai-message a:hover {
          opacity: 0.8;
        }
        .ai-message p {
          margin: 0 0 8px 0;
        }
        .ai-message p:last-child {
          margin-bottom: 0;
        }
        .ai-message h1, .ai-message h2, .ai-message h3 {
          margin: 10px 0 5px 0;
          font-weight: bold;
        }
        .ai-message h1 {
          font-size: 18px;
        }
        .ai-message h2 {
          font-size: 16px;
        }
        .ai-message h3 {
          font-size: 15px;
        }
        .ai-message ul, .ai-message ol {
          margin: 5px 0;
          padding-left: 20px;
        }
        .ai-message li {
          margin: 3px 0;
        }
        .ai-message code {
          background-color: rgba(0,0,0,0.05);
          padding: 2px 4px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.9em;
        }
        .ai-message hr {
          border: 0;
          height: 1px;
          background-color: rgba(0,0,0,0.1);
          margin: 10px 0;
        }
        .ai-message strong {
          font-weight: bold;
        }
        .ai-message em {
          font-style: italic;
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
        /* Add Siri-like animation for the send button */
        .siri-active {
          animation: siri-pulse 1.5s infinite;
        }
        @keyframes siri-pulse {
          0% { box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(${r}, ${g}, ${b}, 0); }
          100% { box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0); }
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
      name.textContent = "Voicero";

      const role = document.createElement("div");
      role.className = "role";
      role.textContent = "AI Sales Rep";

      nameContainer.appendChild(name);
      nameContainer.appendChild(role);

      headerLeft.appendChild(avatar);
      headerLeft.appendChild(nameContainer);

      // Header right side (close button)
      const headerRight = document.createElement("div");
      headerRight.className = "header-right"; // Added class for styling

      // Add close button
      var closeButton = document.createElement("div");
      closeButton.className = "close-button";
      closeButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
        <path d="M18 6L6 18M6 6l12 12"></path>
      </svg>`;

      // Add click handler for close button
      closeButton.addEventListener("click", () => {
        console.log("VoiceroText: Close button clicked");

        // Call session clear API
        this.clearSession()
          .then(() => {
            console.log("VoiceroText: Session cleared successfully");
          })
          .catch((error) => {
            console.error("VoiceroText: Error clearing session:", error);
          })
          .finally(() => {
            // Remove the chat container regardless of API success/failure
            const chatContainer = document.getElementById(
              "voicero-chat-container",
            );
            if (chatContainer) {
              chatContainer.remove();
            }

            // Reset chat mode flag
            window.voiceroInChatMode = false;
          });
      });

      headerRight.appendChild(closeButton);

      // Add header to chat container
      header.appendChild(headerLeft);
      header.appendChild(headerRight);
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

      // Use the current website color for the send button
      const buttonColor = this.websiteColor || "#882be6";

      sendButton.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${buttonColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
      </svg>`;

      // Send message function
      const sendMessage = () => {
        const text = input.value.trim();
        if (text) {
          // Add user message to UI
          this.addMessage(text, "user");
          input.value = "";
          this.renderMessages(messagesContainer);

          // Send message to API
          this.sendMessageToAPI(text, messagesContainer, sendButton);
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

    // Helper method to ensure scrolling to the bottom of the messages container
    scrollToBottom: function (container) {
      if (!container) return;

      // Immediate scroll
      container.scrollTop = container.scrollHeight;

      // Multiple delayed scrolls to ensure it works even with dynamic content
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;

        // Try again after images might have loaded
        setTimeout(() => {
          container.scrollTop = container.scrollHeight;

          // Final attempt after all possible content has rendered
          setTimeout(() => {
            container.scrollTop = container.scrollHeight;
          }, 500);
        }, 200);
      }, 50);
    },

    // Add a message to the messages array
    addMessage: function (text, type) {
      if (!text || !type) return;

      // Clear any existing typing indicator to prevent message overlap
      if (this.typingIndicator) {
        if (this.typingIndicator.parentNode) {
          this.typingIndicator.parentNode.removeChild(this.typingIndicator);
        }
        this.typingIndicator = null;
      }

      // Ensure text is a string and handle JSON objects/strings
      let messageText = "";
      let action = null;
      let action_context = null;

      // Case 1: If it's already a JSON object
      if (typeof text === "object" && text !== null) {
        console.log("VoiceroText: Processing JSON object message:", text);
        // Extract the answer field if it exists
        if (text.answer) {
          messageText = text.answer;
          action = text.action || "none";
          action_context = text.action_context || {};
        } else {
          // Otherwise stringify the object
          messageText = JSON.stringify(text);
        }
      }
      // Case 2: If it's a string that looks like JSON
      else if (
        typeof text === "string" &&
        ((text.trim().startsWith("{") && text.trim().endsWith("}")) ||
          text.includes('"answer":') ||
          text.includes('"action":'))
      ) {
        console.log("VoiceroText: Processing JSON string message:", text);
        try {
          const jsonObj = JSON.parse(text);
          // Extract the answer field if it exists
          if (jsonObj.answer) {
            messageText = jsonObj.answer;
            action = jsonObj.action || "none";
            action_context = jsonObj.action_context || {};
            console.log(
              "VoiceroText: Extracted answer from JSON:",
              messageText,
            );
          } else {
            messageText = text;
          }
        } catch (e) {
          // If parsing fails, use the original text
          console.log("VoiceroText: Failed to parse JSON string:", e);
          messageText = text;
        }
      }
      // Case 3: Regular string
      else if (typeof text === "string") {
        messageText = text;
      }
      // Case 4: Fallback for anything else
      else {
        messageText = String(text || "No message content");
      }

      // Create timestamp for the message
      const now = new Date();
      const timestamp = now.toISOString();

      // Add to messages array
      this.messages.push({
        text: messageText,
        type: type,
        timestamp: now,
        action: action,
        action_context: action_context,
        createdAt: timestamp, // Store ISO string timestamp for sorting
      });

      console.log(
        `VoiceroText: Added ${type} message at ${timestamp}: ${messageText}`,
      );

      // Handle action if this is an AI message and we have an action
      // IMPORTANT: Skip action processing for historical messages
      if (
        type === "ai" &&
        action &&
        action !== "none" &&
        !this.messages[this.messages.length - 1].isHistorical
      ) {
        console.log(
          "VoiceroText: Handling action immediately:",
          action,
          action_context,
        );

        // Special case for redirect action - handle it directly for reliability
        if (action === "redirect" && action_context && action_context.url) {
          console.log(
            "VoiceroText: Handling redirect action directly to:",
            action_context.url,
          );
          setTimeout(() => {
            window.location.href = action_context.url;
          }, 1000); // Short delay to allow message to be displayed
          return messageText;
        }

        // For other actions, use VoiceroActionHandler if available
        if (window.VoiceroActionHandler) {
          setTimeout(() => {
            window.VoiceroActionHandler.handle({
              answer: messageText,
              action: action,
              action_context: action_context,
            });
          }, 100);
        } else {
          // If VoiceroActionHandler is not available, try to load it
          this.ensureRequiredModulesLoaded();

          // And try again after a delay
          setTimeout(() => {
            if (window.VoiceroActionHandler) {
              window.VoiceroActionHandler.handle({
                answer: messageText,
                action: action,
                action_context: action_context,
              });
            } else if (
              action === "redirect" &&
              action_context &&
              action_context.url
            ) {
              // Last resort for redirect action
              window.location.href = action_context.url;
            }
          }, 500);
        }
      }

      return messageText;
    },

    // Format markdown text to HTML
    formatMarkdown: function (text) {
      if (!text) return "";

      let formattedText = text;

      // Handle bold text with **text**
      formattedText = formattedText.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>",
      );

      // Handle italic text with *text*
      formattedText = formattedText.replace(/\*(.*?)\*/g, "<em>$1</em>");

      // Handle links with [text](url)
      formattedText = formattedText.replace(
        /\[(.*?)\]\((.*?)\)/g,
        '<a href="$2">$1</a>',
      );

      // Handle headers
      formattedText = formattedText.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
      formattedText = formattedText.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
      formattedText = formattedText.replace(/^# (.*?)$/gm, "<h1>$1</h1>");

      // Handle lists
      formattedText = formattedText.replace(/^\s*[-*] (.*?)$/gm, "<li>$1</li>");

      // Wrap lists in <ul> tags
      if (formattedText.includes("<li>")) {
        formattedText = formattedText.replace(
          /(<li>.*?<\/li>)/gs,
          "<ul>$1</ul>",
        );
        // Fix nested lists
        formattedText = formattedText.replace(/<\/ul>\s*<ul>/g, "");
      }

      // Handle horizontal rules with ---
      formattedText = formattedText.replace(/^---$/gm, "<hr>");

      // Handle code blocks
      formattedText = formattedText.replace(/`([^`]+)`/g, "<code>$1</code>");

      // Handle paragraphs - convert double newlines to paragraph breaks
      formattedText = formattedText.replace(/\n\n/g, "</p><p>");

      // Handle single newlines
      formattedText = formattedText.replace(/\n/g, "<br>");

      // Wrap in paragraphs if not already wrapped
      if (!formattedText.includes("<p>")) {
        formattedText = "<p>" + formattedText + "</p>";
      }

      return formattedText;
    },

    // Render all messages in the container
    renderMessages: function (container) {
      if (!container) {
        console.log(
          "VoiceroText: No container provided for rendering messages",
        );
        return;
      }

      // Clear existing messages
      container.innerHTML = "";
      console.log(`VoiceroText: Rendering ${this.messages.length} messages`);

      // Add each message in chronological order
      this.messages.forEach((message, index) => {
        console.log(
          `Rendering message ${index}: ${message.type} - ${typeof message.text === "string" ? message.text.substring(0, 30) : "non-string"}`,
        );

        // Create message element with class based on type
        const messageEl = document.createElement("div");
        messageEl.className = `message ${message.type}-message`;

        // Handle AI messages with markdown/HTML formatting
        if (message.type === "ai") {
          // Process message text to handle markdown
          const formattedText = this.formatMarkdown(message.text);

          // Set innerHTML instead of textContent to preserve formatting
          messageEl.innerHTML = formattedText;

          // Add links to all anchor tags
          const links = messageEl.querySelectorAll("a");
          links.forEach((link) => {
            if (!link.getAttribute("target")) {
              link.setAttribute("target", "_blank");
            }
            // Style links to match theme color
            link.style.color = this.websiteColor || "#882be6";
          });
        } else {
          // For user messages, just use text content
          messageEl.textContent = message.text;
        }

        // Add to container
        container.appendChild(messageEl);

        // Add report button to AI messages
        if (message.type === "ai" && window.VoiceroSupport) {
          setTimeout(() => {
            try {
              window.VoiceroSupport.processAIMessage(messageEl, "text");
            } catch (e) {
              console.error("Error adding report button:", e);
            }
          }, 100);
        }
      });

      // Use the scrollToBottom helper method
      this.scrollToBottom(container);
      console.log(
        "VoiceroText: Using scrollToBottom helper for reliable scrolling",
      );
    },

    // Send message to API
    sendMessageToAPI: function (text, messagesContainer, sendButton) {
      console.log("VoiceroText: Sending message to API:", text);
      console.log("VoiceroText: messagesContainer:", messagesContainer);

      // Check if messagesContainer is valid
      if (!messagesContainer) {
        console.error("VoiceroText: messagesContainer is null or undefined");
        return;
      }

      // Create and show typing indicator directly in the shadow DOM
      const typingWrapper = document.createElement("div");
      typingWrapper.className = "ai-message";
      typingWrapper.style.cssText = `
        align-self: flex-start;
        display: flex;
        justify-content: flex-start;
        margin: 8px 0;
        padding: 0;
        border-radius: 50px;
      `;

      const typingIndicator = document.createElement("div");
      typingIndicator.id = "voicero-typing-indicator";
      typingIndicator.style.cssText = `
        background-color: transparent;
        padding: 8px 12px;
        border-radius: 50px;
        margin: 5px;
        display: flex;
        align-items: center;
        gap: 6px;
      `;

      // Create the three bouncing dots
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        dot.className = "typing-dot";
        dot.style.cssText = `
          width: 8px;
          height: 8px;
          background: #999999;
          border-radius: 50%;
          display: inline-block;
          animation: typingBounce 1s infinite;
          animation-delay: ${i * 0.2}s;
        `;
        typingIndicator.appendChild(dot);
      }

      // Add the animation keyframes to the shadow DOM
      const styleEl = document.createElement("style");
      styleEl.textContent = `
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `;

      // Append everything to the messages container
      typingWrapper.appendChild(typingIndicator);
      messagesContainer.appendChild(styleEl);
      messagesContainer.appendChild(typingWrapper);

      // Store reference for later removal
      this.typingIndicator = typingWrapper;

      // Use the scrollToBottom helper method
      this.scrollToBottom(messagesContainer);

      // Add loading animation to send button if VoiceroWait is available
      if (window.VoiceroWait && sendButton) {
        window.VoiceroWait.addLoadingAnimation(sendButton);
      }

      // Prepare request data - following the exact structure expected by the API
      const requestData = {
        message: text,
        type: "text",
        interactionType: window.voiceroInteractionType || "noneSpecified",
        currentPageUrl: window.location.href,
      };

      // Get website ID - this is required by the API
      let websiteId = null;

      // Get access key - the API needs either websiteId or accessKey
      let accessKey = null;

      if (window.voiceroConfig) {
        // Get website ID from config
        if (window.voiceroConfig.websiteId) {
          websiteId = window.voiceroConfig.websiteId;
          console.log("VoiceroText: Using website ID from config:", websiteId);
        }

        // Get access key if available (from auth headers)
        if (window.voiceroConfig.getAuthHeaders) {
          const authHeaders = window.voiceroConfig.getAuthHeaders();
          if (authHeaders && authHeaders.Authorization) {
            const authHeader = authHeaders.Authorization;
            if (authHeader.startsWith("Bearer ")) {
              accessKey = authHeader.substring(7); // Remove 'Bearer ' prefix
              console.log("VoiceroText: Found access key in auth headers");
            }
          }
        }
      }

      // Fallback to VoiceroCore for website ID
      if (!websiteId && window.VoiceroCore && window.VoiceroCore.websiteId) {
        websiteId = window.VoiceroCore.websiteId;
        console.log(
          "VoiceroText: Using website ID from VoiceroCore:",
          websiteId,
        );
      }

      // Add website ID to request (required)
      if (websiteId) {
        requestData.websiteId = websiteId;
      }

      // Add access key if available
      if (accessKey) {
        requestData.accessKey = accessKey;
      }

      // Get thread ID from various possible sources
      let threadId = null;

      // Try to get thread ID from VoiceroCore
      if (window.VoiceroCore) {
        // Check direct thread property
        if (window.VoiceroCore.thread && window.VoiceroCore.thread.id) {
          threadId = window.VoiceroCore.thread.id;
          console.log(
            "VoiceroText: Found thread ID in VoiceroCore.thread:",
            threadId,
          );
        }
        // Check session.threads array
        else if (
          window.VoiceroCore.session &&
          window.VoiceroCore.session.threads &&
          window.VoiceroCore.session.threads.length > 0
        ) {
          const firstThread = window.VoiceroCore.session.threads[0];
          threadId = firstThread.id || firstThread.threadId;
          console.log(
            "VoiceroText: Found thread ID in session.threads:",
            threadId,
          );
        }
        // Check localStorage
        else {
          const storedThreadId = localStorage.getItem("voicero_thread_id");
          if (storedThreadId) {
            threadId = storedThreadId;
            console.log(
              "VoiceroText: Found thread ID in localStorage:",
              threadId,
            );
          }
        }
      }

      // Add thread ID if found
      if (threadId) {
        requestData.threadId = threadId;
      }

      // Add page data if available - ensure it matches the expected structure
      if (window.VoiceroCore && window.VoiceroCore.pageData) {
        // Make sure pageData has the expected structure
        const pageData = {
          url: window.location.href,
          full_text:
            window.VoiceroCore.pageData.fullText || this.collectFullPageText(),
          buttons: window.VoiceroCore.pageData.buttons || [],
          forms: window.VoiceroCore.pageData.forms || [],
          sections: window.VoiceroCore.pageData.sections || [],
          images: window.VoiceroCore.pageData.images || [],
        };

        requestData.pageData = pageData;
        console.log(
          "VoiceroText: Added page data with full text length:",
          pageData.full_text.length,
        );
      } else {
        // Create more comprehensive page data
        const fullText = this.collectFullPageText();
        requestData.pageData = {
          url: window.location.href,
          full_text: fullText,
          buttons: [],
          forms: [],
          sections: [],
          images: [],
        };
        console.log(
          "VoiceroText: Created page data with full text length:",
          fullText.length,
        );
      }

      // Add past context from messages - format as expected by the API
      if (this.messages && this.messages.length > 0) {
        // Filter out the current message being sent
        const validMessages = this.messages.filter(
          (msg) => !(msg.type === "user" && msg.text === text), // Filter out the current message
        );

        // Only add past context if there are valid previous messages
        if (validMessages.length > 0) {
          const pastContext = validMessages.map((msg) => {
            // For user messages
            if (msg.type === "user") {
              return {
                question: msg.text,
                role: "user",
                createdAt: msg.timestamp
                  ? msg.timestamp.toISOString()
                  : new Date().toISOString(),
                pageUrl: window.location.href,
                threadId: threadId || undefined,
              };
            }
            // For AI messages
            else {
              return {
                answer: msg.text,
                role: "assistant",
                createdAt: msg.timestamp
                  ? msg.timestamp.toISOString()
                  : new Date().toISOString(),
                pageUrl: window.location.href,
                threadId: threadId || undefined,
              };
            }
          });

          requestData.pastContext = pastContext;
          console.log("VoiceroText: Added past context:", pastContext);
        } else {
          // Send empty array if no valid past messages
          requestData.pastContext = [];
          console.log(
            "VoiceroText: No valid past messages, sending empty pastContext",
          );
        }
      } else {
        // Send empty array if no messages
        requestData.pastContext = [];
        console.log("VoiceroText: No messages, sending empty pastContext");
      }

      // Get auth headers
      const headers = {
        "Content-Type": "application/json",
      };

      // Add authorization if available
      if (window.voiceroConfig && window.voiceroConfig.getAuthHeaders) {
        Object.assign(headers, window.voiceroConfig.getAuthHeaders());
      }

      // Try localhost first, then fallback to production

      // Make sure we're sending the full page content for better context
      if (
        requestData.pageData &&
        (!requestData.pageData.full_text ||
          requestData.pageData.full_text.length < 1000)
      ) {
        console.log(
          "VoiceroText: Page content is missing or too short, collecting full page text",
        );
        requestData.pageData.full_text = this.collectFullPageText();
        console.log(
          `VoiceroText: Updated page content length: ${requestData.pageData.full_text.length} characters`,
        );
      }

      console.log("VoiceroText: Request data:", JSON.stringify(requestData));
      console.log("VoiceroText: Headers:", JSON.stringify(headers));

      // Debug: Add a fallback response in case API calls fail
      let apiPromise;

      try {
        console.log("VoiceroText: Trying localhost API");
        apiPromise = this.callAPI(
          "http://localhost:3000/api/shopify/chat",
          requestData,
          headers,
          messagesContainer,
          sendButton,
        ).catch((error) => {
          console.log(
            "VoiceroText: Localhost API failed, trying production:",
            error,
          );
          return this.callAPI(
            "https://www.voicero.ai/api/shopify/chat",
            requestData,
            headers,
            messagesContainer,
            sendButton,
          );
        });
      } catch (e) {
        console.error("VoiceroText: Error initiating API call:", e);
        apiPromise = Promise.reject(e);
      }

      apiPromise.catch((error) => {
        console.error("VoiceroText: Both API endpoints failed:", error);

        // Hide typing indicator
        if (this.typingIndicator) {
          if (this.typingIndicator.parentNode) {
            this.typingIndicator.parentNode.removeChild(this.typingIndicator);
          }
          this.typingIndicator = null;
        }

        // Remove loading animation from send button
        if (window.VoiceroWait && sendButton) {
          window.VoiceroWait.removeLoadingAnimation(sendButton);
        }

        // Add error message
        const errorMessage =
          "Sorry, I couldn't connect to the server. Please try again later.";
        this.addMessage(errorMessage, "ai");
        this.renderMessages(messagesContainer);

        // Try to load the action handler if it's not already loaded
        this.ensureRequiredModulesLoaded();
      });
    },

    // Debug function to log session data
    debugLogSessionData: function () {
      console.log("VoiceroText: Debugging session data");

      if (window.VoiceroCore) {
        console.log("VoiceroCore exists:", window.VoiceroCore);
        console.log("VoiceroCore.session:", window.VoiceroCore.session);
        console.log("VoiceroCore.thread:", window.VoiceroCore.thread);

        // Check localStorage
        const sessionId = localStorage.getItem("voicero_session_id");
        const sessionData = localStorage.getItem("voicero_session");
        const threadId = localStorage.getItem("voicero_thread_id");

        console.log("localStorage session ID:", sessionId);
        console.log("localStorage session data:", sessionData);
        console.log("localStorage thread ID:", threadId);

        // If no thread ID found, try to create a new session
        if (
          !window.VoiceroCore.thread &&
          !threadId &&
          window.VoiceroCore.createSession
        ) {
          console.log(
            "VoiceroText: No thread ID found, trying to create a new session",
          );
          window.VoiceroCore.createSession();
        }
      } else {
        console.log("VoiceroCore not found");
      }
    },

    // Collect all text content from the page
    collectFullPageText: function () {
      console.log("VoiceroText: Collecting full page text content");

      try {
        // Get all visible text elements
        const textElements = document.querySelectorAll(
          "p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, a, button, label",
        );

        // Create an array to store all text content
        let textContent = [];

        // Function to check if an element is visible
        const isVisible = (element) => {
          if (
            !element.offsetParent &&
            element.offsetHeight === 0 &&
            element.offsetWidth === 0
          )
            return false;
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        };

        // Process each element
        textElements.forEach((element) => {
          // Skip script and style elements
          if (element.tagName === "SCRIPT" || element.tagName === "STYLE")
            return;

          // Skip hidden elements
          if (!isVisible(element)) return;

          // Get the direct text content of this element (not including children)
          let directText = "";
          for (let node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent.trim();
              if (text) directText += text + " ";
            }
          }

          // If this element has direct text content, add it to our collection
          if (directText.trim()) {
            textContent.push(directText.trim());
          }
        });

        // Join all text with newlines to preserve structure
        const fullText = textContent.join("\n");
        console.log(
          `VoiceroText: Collected ${fullText.length} characters of text from ${textContent.length} elements`,
        );

        return fullText;
      } catch (error) {
        console.error("VoiceroText: Error collecting page text:", error);
        // Fallback to basic method
        return document.body.innerText;
      }
    },

    // Helper method to call API
    callAPI: function (url, data, headers, messagesContainer, sendButton) {
      return fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `API returned ${response.status}: ${response.statusText}`,
            );
          }
          return response.json();
        })
        .then((data) => {
          console.log("VoiceroText: API response:", data);

          // Hide typing indicator
          if (this.typingIndicator) {
            if (this.typingIndicator.parentNode) {
              this.typingIndicator.parentNode.removeChild(this.typingIndicator);
            }
            this.typingIndicator = null;
          }

          // Remove loading animation from send button
          if (window.VoiceroWait && sendButton) {
            window.VoiceroWait.removeLoadingAnimation(sendButton);
          }

          // Parse response and handle JSON object
          let messageText = "";
          let action = "none";
          let action_context = {};

          // Handle different response formats
          if (typeof data === "object") {
            // Handle JSON object response with answer and action fields
            if (data.answer) {
              messageText = data.answer;
              action = data.action || "none";
              action_context = data.action_context || {};
            } else if (data.message) {
              messageText = data.message;
            } else if (data.response) {
              messageText = data.response;
            } else if (data.content) {
              messageText = data.content;
            } else {
              messageText =
                "I received your message, but I'm not sure how to respond.";
            }
          } else if (typeof data === "string") {
            // Handle string response
            messageText = data;
          } else {
            messageText =
              "I received your message, but I'm not sure how to respond.";
          }

          // For actions that will generate their own messages (like get_orders),
          // we'll skip adding the initial response to avoid duplication
          if (action === "get_orders" || action === "track_order") {
            // Store the action and context for processing, but don't display the initial message
            console.log(
              `VoiceroText: Skipping initial message display for ${action} action with context:`,
              action_context,
            );

            // Handle action with VoiceroActionHandler if available
            if (window.VoiceroActionHandler && action !== "none") {
              // Use a small delay to ensure typing indicators are cleared
              setTimeout(() => {
                try {
                  window.VoiceroActionHandler.handle({
                    answer: messageText,
                    action: action,
                    action_context: action_context,
                  });
                } catch (error) {
                  console.error(`Error handling ${action} action:`, error);
                  // Fallback to showing the original message if handler fails
                  this.addMessage(messageText, "ai");
                }
              }, 100);
            }
          } else {
            // For normal actions or no action, add AI response to messages
            this.addMessage(messageText, "ai");
          }

          // Store thread ID if returned
          if (data && data.threadId && window.VoiceroCore) {
            window.VoiceroCore.thread = window.VoiceroCore.thread || {};
            window.VoiceroCore.thread.id = data.threadId;
          }

          // Render updated messages
          this.renderMessages(messagesContainer);

          // Make sure we scroll to the bottom after rendering
          this.scrollToBottom(messagesContainer);

          // Ensure VoiceroSupport is initialized
          if (window.VoiceroSupport && !window.VoiceroSupport.initialized) {
            window.VoiceroSupport.init();
          }

          // Handle action with VoiceroActionHandler if available
          if (window.VoiceroActionHandler && action !== "none" && action) {
            // Get the last message we just added
            const lastMessage = this.messages[this.messages.length - 1];

            // Skip action processing for historical messages
            if (lastMessage && lastMessage.isHistorical) {
              console.log(
                "VoiceroText: Skipping action for historical message",
              );
              return data;
            }

            console.log(
              "VoiceroText: Handling action:",
              action,
              action_context,
            );
            setTimeout(() => {
              window.VoiceroActionHandler.handle({
                answer: messageText,
                action: action,
                action_context: action_context,
              });
            }, 100);
          }
        });
    },

    // Clear session and create a new thread
    clearSession: function () {
      console.log("VoiceroText: Clearing session");

      // Get session ID from VoiceroCore
      const sessionId =
        window.VoiceroCore?.sessionId ||
        localStorage.getItem("voicero_session_id");

      if (!sessionId) {
        console.error("VoiceroText: No session ID found for clearing");
        return Promise.reject("No session ID found");
      }

      // Try local API endpoint first
      const localApiUrl = "http://localhost:3000/api/session/clear";
      const prodApiUrl = "https://www.voicero.ai/api/session/clear";

      // Get auth headers if available
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(window.voiceroConfig?.getAuthHeaders
          ? window.voiceroConfig.getAuthHeaders()
          : {}),
      };

      // Call the API
      return fetch(localApiUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ sessionId }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Local API failed with status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("VoiceroText: Session cleared successfully:", data);

          // Update local storage with new thread if provided
          if (
            data.session &&
            data.session.threads &&
            data.session.threads.length > 0
          ) {
            const newThread = data.session.threads[0];
            const newThreadId = newThread.id || newThread.threadId;

            if (newThreadId) {
              console.log("VoiceroText: Updating thread ID to:", newThreadId);
              localStorage.setItem("voicero_thread_id", newThreadId);

              // Update VoiceroCore thread data
              if (window.VoiceroCore) {
                window.VoiceroCore.thread = newThread;
                window.VoiceroCore.thread.id = newThreadId;
              }
            }

            // Update session in local storage
            localStorage.setItem(
              "voicero_session",
              JSON.stringify(data.session),
            );

            // Update VoiceroCore session
            if (window.VoiceroCore) {
              window.VoiceroCore.session = data.session;
            }
          }

          return data;
        })
        .catch((error) => {
          console.log(
            "VoiceroText: Local API failed, trying production:",
            error,
          );

          // Try production API as fallback
          return fetch(prodApiUrl, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ sessionId }),
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error(
                  `Production API failed with status: ${response.status}`,
                );
              }
              return response.json();
            })
            .then((data) => {
              console.log(
                "VoiceroText: Session cleared successfully (production):",
                data,
              );

              // Update local storage with new thread if provided
              if (
                data.session &&
                data.session.threads &&
                data.session.threads.length > 0
              ) {
                const newThread = data.session.threads[0];
                const newThreadId = newThread.id || newThread.threadId;

                if (newThreadId) {
                  console.log(
                    "VoiceroText: Updating thread ID to:",
                    newThreadId,
                  );
                  localStorage.setItem("voicero_thread_id", newThreadId);

                  // Update VoiceroCore thread data
                  if (window.VoiceroCore) {
                    window.VoiceroCore.thread = newThread;
                    window.VoiceroCore.thread.id = newThreadId;
                  }
                }

                // Update session in local storage
                localStorage.setItem(
                  "voicero_session",
                  JSON.stringify(data.session),
                );

                // Update VoiceroCore session
                if (window.VoiceroCore) {
                  window.VoiceroCore.session = data.session;
                }
              }

              return data;
            });
        });
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
        text: "Hi there! I'm Voicero, your AI Sales Rep. How can I help you today?",
        type: "ai",
      };
    } else if (action === "get-started") {
      initialMessage = {
        text: "Welcome! I'm here to help you get started. What would you like to know?",
        type: "ai",
      };
    } else if (action === "customer-support") {
      initialMessage = {
        text: "Hello! I'm Voicero from customer support. How can I assist you today?",
        type: "ai",
      };
    } else if (action === "load-existing-chat") {
      // Special case for loading existing chat - don't add initial message
      console.log("VoiceroText: Loading existing chat from session");
      initialMessage = null;

      // Initialize without initial message
      if (!window.VoiceroText.initialized) {
        window.VoiceroText.init();
      }

      // Create chat container which will load messages
      window.VoiceroText.createChatContainer();

      // Skip the rest of the function since we're handling loading separately
      return;
    } else if (text) {
      // If it's a direct text input from user, don't add an automatic greeting
      initialMessage = null; // Skip the initial AI greeting
    }

    // Initialize text interface with initial message
    if (!window.VoiceroText.initialized) {
      window.VoiceroText.init(initialMessage);
    }

    // If there's user text, add it as a user message and send to API
    if (text) {
      window.VoiceroText.addMessage(text, "user");

      // Re-render messages
      const container = document
        .querySelector("#voicero-chat-container")
        .shadowRoot.querySelector(".messages-container");
      if (container) {
        window.VoiceroText.renderMessages(container);

        // Make sure we scroll to the bottom
        window.VoiceroText.scrollToBottom(container);

        // Get the send button for animation
        const sendButton = document
          .querySelector("#voicero-chat-container")
          .shadowRoot.querySelector(".send-button");

        // Send message to API
        window.VoiceroText.sendMessageToAPI(text, container, sendButton);
      }
    }
  };
})(window, document);
