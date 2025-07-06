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
          // Add user message to UI
          this.addMessage(text, "user");
          input.value = "";
          this.renderMessages(messagesContainer);

          // Send message to API
          this.sendMessageToAPI(text, messagesContainer);
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

        // Special handling for loading messages
        if (message.isLoading) {
          // Create loading animation
          messageEl.innerHTML = `
            <div class="loading-indicator">
              <span class="dot">.</span>
              <span class="dot">.</span>
              <span class="dot">.</span>
            </div>
          `;

          // Add animation style
          const style = document.createElement("style");
          style.textContent = `
            .loading-indicator {
              display: inline-block;
            }
            .dot {
              display: inline-block;
              animation: pulse 1.4s infinite;
              animation-fill-mode: both;
              margin-right: 2px;
              font-weight: bold;
            }
            .dot:nth-child(2) {
              animation-delay: 0.2s;
            }
            .dot:nth-child(3) {
              animation-delay: 0.4s;
            }
            @keyframes pulse {
              0%, 80%, 100% {
                opacity: 0;
              }
              40% {
                opacity: 1;
              }
            }
          `;
          container.appendChild(style);
        } else {
          // Regular message
          messageEl.textContent = message.text;
        }

        container.appendChild(messageEl);
      });

      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    },

    // Send message to API
    sendMessageToAPI: function (text, messagesContainer) {
      console.log("VoiceroText: Sending message to API:", text);
      console.log("VoiceroText: messagesContainer:", messagesContainer);

      // Check if messagesContainer is valid
      if (!messagesContainer) {
        console.error("VoiceroText: messagesContainer is null or undefined");
        return;
      }

      // Show loading indicator
      const loadingMessage = {
        text: "Thinking...",
        type: "ai",
        isLoading: true,
        timestamp: new Date(), // Add timestamp for consistency
      };
      this.messages.push(loadingMessage);
      this.renderMessages(messagesContainer);

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
          full_text: window.VoiceroCore.pageData.fullText || "",
          buttons: window.VoiceroCore.pageData.buttons || [],
          forms: window.VoiceroCore.pageData.forms || [],
          sections: window.VoiceroCore.pageData.sections || [],
          images: window.VoiceroCore.pageData.images || [],
        };

        requestData.pageData = pageData;
        console.log("VoiceroText: Added page data:", pageData);
      } else {
        // Create minimal page data
        requestData.pageData = {
          url: window.location.href,
          full_text: document.body.innerText.substring(0, 1000), // First 1000 chars
          buttons: [],
          forms: [],
          sections: [],
          images: [],
        };
      }

      // Add past context from messages - format as expected by the API
      if (this.messages && this.messages.length > 0) {
        // Filter out loading messages and the current message being sent
        const validMessages = this.messages.filter(
          (msg) =>
            !msg.isLoading && // Filter out loading messages
            !(msg.type === "user" && msg.text === text), // Filter out the current message
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
          );
        });
      } catch (e) {
        console.error("VoiceroText: Error initiating API call:", e);
        apiPromise = Promise.reject(e);
      }

      apiPromise.catch((error) => {
        console.error("VoiceroText: Both API endpoints failed:", error);

        // Remove loading message
        this.messages = this.messages.filter((m) => !m.isLoading);

        // Add error message
        this.addMessage(
          "Sorry, I couldn't connect to the server. Please try again later.",
          "ai",
        );
        this.renderMessages(messagesContainer);

        // Debug: Add a fallback response for testing
        console.log("VoiceroText: Adding fallback response for testing");
        setTimeout(() => {
          this.addMessage(
            "This is a fallback response since the API call failed. In production, this would come from the server.",
            "ai",
          );
          this.renderMessages(messagesContainer);
        }, 1000);
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

    // Helper method to call API
    callAPI: function (url, data, headers, messagesContainer) {
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

          // Remove loading message
          this.messages = this.messages.filter((m) => !m.isLoading);

          // Add AI response to messages
          if (data && data.message) {
            this.addMessage(data.message, "ai");
          } else if (data && data.response) {
            this.addMessage(data.response, "ai");
          } else {
            this.addMessage(
              "I received your message, but I'm not sure how to respond.",
              "ai",
            );
          }

          // Store thread ID if returned
          if (data && data.threadId && window.VoiceroCore) {
            window.VoiceroCore.thread = window.VoiceroCore.thread || {};
            window.VoiceroCore.thread.id = data.threadId;
          }

          // Render updated messages
          this.renderMessages(messagesContainer);
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

    // If there's user text, add it as a user message and send to API
    if (text) {
      window.VoiceroText.addMessage(text, "user");

      // Re-render messages
      const container = document
        .querySelector("#voicero-chat-container")
        .shadowRoot.querySelector(".messages-container");
      if (container) {
        window.VoiceroText.renderMessages(container);

        // Send message to API
        window.VoiceroText.sendMessageToAPI(text, container);
      }
    }
  };
})(window, document);
