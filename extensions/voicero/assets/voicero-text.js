/**
 * VoiceroAI Text Module
 * Handles text chat functionality
 */

// Note: We can't use ES module syntax in regular JS files
// dynamic = "force-dynamic"; // Browser compatibility issue

// Use IIFE to avoid global variable conflicts
(function (window, document) {
  // Check if VoiceroText already exists to prevent redeclaration
  if (window.VoiceroText) {
    console.log("VoiceroText is already defined, not redefining");
    return;
  }

  // Text interface variables
  window.VoiceroText = {
    // debounce visibility toggles
    _isChatVisible: false, // tracks whether messages+header+input are up
    _lastChatToggle: 0, // timestamp of last minimize/maximize
    CHAT_TOGGLE_DEBOUNCE_MS: 500, // minimum time between toggles - increased from 200ms

    // Add session operation tracking
    isSessionOperationInProgress: false,
    lastSessionOperationTime: 0,
    sessionOperationTimeout: 3000, // maximum time a session operation can take before being considered stuck

    isWaitingForResponse: false,
    typingTimeout: null,
    typingIndicator: null,
    currentThreadId: null,
    apiBaseUrl: null, // Will be set by VoiceroCore after API connection
    visibilityGuardInterval: null,
    websiteData: null, // Store the website data including popup questions
    customInstructions: null, // Store custom instructions from API
    messages: [], // Initialize messages array
    initialized: false, // Initialize initialized flag
    lastProductUrl: null, // Store the last product URL for redirect
    isInterfaceBuilt: false, // Flag to check if interface is already built
    websiteColor: null, // Will be populated from VoiceroCore
    colorVariants: null, // Will be generated dynamically

    // Initialize the text module
    init: function () {
      // Check if already initialized
      if (this.initialized) return;

      // Mark as initialized
      this.initialized = true;

      console.log("VoiceroText: Initializing");

      // Initialize the hasShownWelcome flag
      this.hasShownWelcome = false;

      // Set session and thread from VoiceroCore if available
      if (window.VoiceroCore) {
        this.session = window.VoiceroCore.session;
        this.thread = window.VoiceroCore.thread;
        this.sessionId = window.VoiceroCore.sessionId;
        this.websiteId = window.VoiceroCore.websiteId;

        // IMPORTANT: Always get the latest website color from VoiceroCore
        if (window.VoiceroCore.websiteColor) {
          console.log(
            "VoiceroText: Using dynamic color from VoiceroCore:",
            window.VoiceroCore.websiteColor,
          );
          this.websiteColor = window.VoiceroCore.websiteColor;
        } else if (
          window.VoiceroCore.session &&
          window.VoiceroCore.session.website &&
          window.VoiceroCore.session.website.color
        ) {
          console.log(
            "VoiceroText: Using color from session.website:",
            window.VoiceroCore.session.website.color,
          );
          this.websiteColor = window.VoiceroCore.session.website.color;
        }
      }

      // Get API URL and color from Core if available
      if (window.VoiceroCore) {
        if (window.VoiceroCore.getApiBaseUrl) {
          this.apiBaseUrl = VoiceroCore.getApiBaseUrl();
        }

        // Get website color from VoiceroCore
        if (window.VoiceroCore.websiteColor) {
          console.log(
            "VoiceroText.init: Setting color from VoiceroCore:",
            window.VoiceroCore.websiteColor,
          );
          this.websiteColor = window.VoiceroCore.websiteColor;
        } else if (
          window.VoiceroCore.session &&
          window.VoiceroCore.session.website &&
          window.VoiceroCore.session.website.color
        ) {
          // Try to get from session.website if available
          console.log(
            "VoiceroText.init: Setting color from session.website:",
            window.VoiceroCore.session.website.color,
          );
          this.websiteColor = window.VoiceroCore.session.website.color;
        } else {
          // Fallback to default purple if nothing else available
          console.log(
            "VoiceroText.init: No dynamic color found, using default",
          );
          this.websiteColor = "#882be6";
        }

        // Generate color variants
        this.getColorVariants(this.websiteColor);

        // SECURITY: Direct API access and accessKey handling removed - now using server-side proxy
      } else {
        // Use default color when VoiceroCore isn't available
        this.websiteColor = "#882be6";
        this.getColorVariants(this.websiteColor);
      }

      // Create HTML structure for the chat interface but keep it hidden
      this.createChatInterface();

      // Make sure all UI elements have the correct colors
      setTimeout(() => this.applyDynamicColors(), 100);

      // CRITICAL: Ensure shadow host and text container are hidden on init
      // This prevents the interface from showing up when it shouldn't
      var shadowHost = document.getElementById("voicero-shadow-host");
      if (shadowHost) {
        shadowHost.style.display = "none";
      }

      // Also ensure the text chat container is hidden
      var textContainer = document.getElementById(
        "voicero-text-chat-container",
      );
      if (textContainer) {
        textContainer.style.display = "none";
      }
    },

    // Apply dynamic colors to all relevant elements
    applyDynamicColors: function () {
      if (!this.shadowRoot) return;

      // Make sure we have color variants
      if (!this.colorVariants) {
        this.getColorVariants(this.websiteColor);
      }

      // Get the main color - USE WEBSITE COLOR DIRECTLY INSTEAD OF VARIANTS
      var mainColor = this.websiteColor || "#882be6"; // Use website color directly

      // Don't set background color for send button (keep it transparent)
      var sendButton = this.shadowRoot.getElementById("send-message-btn");
      // No background color applied to keep it transparent

      // Update user message bubbles
      var userMessages = this.shadowRoot.querySelectorAll(
        ".user-message .message-content",
      );
      userMessages.forEach((msg) => {
        msg.style.backgroundColor = mainColor;
      });

      // Update read status color
      var readStatuses = this.shadowRoot.querySelectorAll(".read-status");
      readStatuses.forEach((status) => {
        if (status.textContent === "Read") {
          status.style.color = mainColor;
        }
      });

      // Update suggestions
      var suggestions = this.shadowRoot.querySelectorAll(".suggestion");
      suggestions.forEach((suggestion) => {
        suggestion.style.backgroundColor = mainColor;
      });

      // Add code to update CSS variables in the shadow DOM:
      // CRITICAL: Add CSS variables directly to shadow DOM
      var styleEl = document.createElement("style");
      styleEl.textContent = `
        :host {
          --voicero-theme-color: ${mainColor} !important;
          --voicero-theme-color-light: ${this.colorVariants.light} !important;
          --voicero-theme-color-hover: ${this.colorVariants.dark} !important;
        }
        
        /* Force contact form button to use website color */
        .contact-submit-btn {
          background-color: ${mainColor} !important;
          color: white !important;
        }
        
        .contact-form-message .contact-submit-btn {
          background-color: ${mainColor} !important;
          color: white !important;
        }

        /* Force rounded corners on header */
        #chat-controls-header {
          border-radius: 12px 12px 0 0 !important;
          overflow: hidden !important;
        }
      `;

      // Remove existing custom variables if any
      var existingVars = this.shadowRoot.getElementById("voicero-css-vars");
      if (existingVars) {
        existingVars.remove();
      }

      // Add new variables
      styleEl.id = "voicero-css-vars";
      this.shadowRoot.appendChild(styleEl);

      console.log(
        `VoiceroText: Applied CSS variables to shadow DOM: ${mainColor}`,
      );
    },

    // Open text chat interface
    openTextChat: function () {
      // CRITICAL: Stop infinite loop by adding flag
      if (this._isOpeningTextChat === true) {
        console.log("VoiceroText: Already opening text chat, preventing loop");
        return;
      }

      // Set flag to prevent recursive calls
      this._isOpeningTextChat = true;

      try {
        // CRITICAL: First remove any welcome container that might be causing floating elements
        const welcomeContainer = document.getElementById(
          "voicero-welcome-container",
        );
        if (welcomeContainer) {
          console.log(
            "VoiceroText: Removing existing welcome container before opening text chat",
          );
          welcomeContainer.remove();
        }

        // CRITICAL FIX: Force open regardless of textOpen state if there are messages
        if (
          window.VoiceroCore &&
          window.VoiceroCore.thread &&
          window.VoiceroCore.thread.messages &&
          window.VoiceroCore.thread.messages.length > 0
        ) {
          // Check for real messages (not system or page_data)
          const realMessages = window.VoiceroCore.thread.messages.filter(
            (msg) => msg.role !== "system" && msg.type !== "page_data",
          );

          if (realMessages.length > 0) {
            console.log(
              "VoiceroText: FORCING open because thread has",
              realMessages.length,
              "real messages",
            );

            // Force update the session state
            if (window.VoiceroCore && window.VoiceroCore.session) {
              window.VoiceroCore.session.textOpen = true;
            }
          }
        }
      } catch (e) {
        console.error("VoiceroText: Error in openTextChat:", e);
      }

      // IMPORTANT: Check for dynamic website color before opening
      if (window.VoiceroCore) {
        if (window.VoiceroCore.websiteColor) {
          console.log(
            "VoiceroText: Updating color from VoiceroCore before open:",
            window.VoiceroCore.websiteColor,
          );
          this.websiteColor = window.VoiceroCore.websiteColor;
          // Generate color variants with the updated color
          this.getColorVariants(this.websiteColor);
        } else if (
          window.VoiceroCore.session &&
          window.VoiceroCore.session.website &&
          window.VoiceroCore.session.website.color
        ) {
          console.log(
            "VoiceroText: Updating color from session.website before open:",
            window.VoiceroCore.session.website.color,
          );
          this.websiteColor = window.VoiceroCore.session.website.color;
          // Generate color variants with the updated color
          this.getColorVariants(this.websiteColor);
        }
      }

      console.log("VoiceroText: Opening text chat interface");

      // Check if thread has messages
      var hasMessages = this.messages && this.messages.length > 0;

      // Force reset the messages array if empty to prevent stale state
      if (!hasMessages) {
        console.log("VoiceroText: No messages found, resetting messages array");
        this.messages = [];
      }

      // Determine if we should show welcome message
      let shouldShowWelcome = false;
      if (window.VoiceroCore && window.VoiceroCore.appState) {
        // Show welcome if we haven't shown it before
        shouldShowWelcome =
          window.VoiceroCore.appState.hasShownTextWelcome === undefined ||
          window.VoiceroCore.appState.hasShownTextWelcome === false;

        // Mark that we've shown the welcome message
        if (shouldShowWelcome) {
          window.VoiceroCore.appState.hasShownTextWelcome = true;
          // Also set our internal flag for consistent tracking
          this.hasShownWelcome = false; // We want the welcome message to be shown once during this session
        }
      }

      // DO NOT update session state from here - VoiceroCore already handles this
      // This prevents infinite loops between components

      // Hide the toggle container when opening the chat interface
      var toggleContainer = document.getElementById("voice-toggle-container");
      if (toggleContainer) {
        toggleContainer.style.display = "none";
        toggleContainer.style.visibility = "hidden";
        toggleContainer.style.opacity = "0";
      }

      // Also hide the main button explicitly
      var mainButton = document.getElementById("chat-website-button");
      if (mainButton) {
        mainButton.style.display = "none";
        mainButton.style.visibility = "hidden";
        mainButton.style.opacity = "0";
      }

      // Hide the chooser popup (handled by VoiceroCore now)
      if (
        window.VoiceroCore &&
        typeof window.VoiceroCore.hideMainButton === "function"
      ) {
        window.VoiceroCore.hideMainButton();
      }

      // Check if we already initialized
      if (!this.initialized) {
        this.init();
        // If still not initialized after trying, report error and stop
        if (!this.initialized) {
          return;
        }
      }

      // Create isolated chat frame if not exists
      if (!this.shadowRoot) {
        this.createIsolatedChatFrame();
      }

      // Apply dynamic colors to all elements
      this.applyDynamicColors();

      // CRITICAL: First remove any existing welcome container to prevent conflicts
      const existingWelcome = document.getElementById(
        "voicero-welcome-container",
      );
      if (existingWelcome) {
        existingWelcome.remove();
      }

      // Show the shadow host (which contains the chat interface)
      var shadowHost = document.getElementById("voicero-text-chat-container");
      if (shadowHost) {
        // CRITICAL FIX: Reset ALL style properties that might be preventing display
        shadowHost.style.cssText = "";

        // Now set the required styles for visibility with !important flags
        shadowHost.style.cssText = `
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          height: auto !important;
          width: 400px !important; 
          z-index: 9999999 !important;
          border-radius: 12px !important;
          position: fixed !important;
          right: 20px !important;
          bottom: 20px !important;
          left: auto !important;
          transform: none !important;
          max-width: 450px !important;
          min-width: 320px !important;
          overflow: hidden !important;
          max-height: none !important;
        `;
      }

      // Make sure the header has high z-index
      if (this.shadowRoot) {
        var headerContainer = this.shadowRoot.getElementById(
          "chat-controls-header",
        );
        if (headerContainer) {
          headerContainer.style.zIndex = "9999999";
          headerContainer.style.borderRadius = "12px 12px 0 0 !important";
          headerContainer.style.overflow = "hidden"; // Ensure the border radius is visible
        }

        // Also ensure messages container has square corners
        var messagesContainer = this.shadowRoot.getElementById("chat-messages");
        if (messagesContainer) {
          messagesContainer.style.borderRadius = "0"; // Ensure square corners
        }
      }

      // Apply correct border radius for initial state
      this.updateChatContainerBorderRadius(false);

      // Set up input and button listeners
      this.setupEventListeners();

      // Set up button event handlers (ensure minimize/maximize work)
      this.setupButtonHandlers();

      // Load existing messages from session
      this.loadMessagesFromSession();

      // Initialize visibility state
      this._isChatVisible = true;
      this._lastChatToggle = Date.now();

      // CRITICAL FIX: Check for thread messages in VoiceroCore and show welcome if none exist
      let hasThreadMessages = false;

      console.log("VoiceroText: Checking for thread messages in VoiceroCore");

      // IMPORTANT: First check thread directly in VoiceroCore.thread
      if (window.VoiceroCore && window.VoiceroCore.thread) {
        console.log(
          "VoiceroText: Found direct thread in VoiceroCore:",
          window.VoiceroCore.thread,
        );

        if (
          window.VoiceroCore.thread.messages &&
          window.VoiceroCore.thread.messages.length > 0
        ) {
          // Check if there are any non-system messages
          const realMessages = window.VoiceroCore.thread.messages.filter(
            (msg) => msg.role !== "system" && msg.type !== "page_data",
          );

          hasThreadMessages = realMessages.length > 0;
          console.log(
            "VoiceroText: Direct thread has",
            realMessages.length,
            "real messages",
          );
        }
      }

      // Fallback: Check in session.threads if no messages found yet
      if (
        !hasThreadMessages &&
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.threads &&
        window.VoiceroCore.session.threads.length > 0
      ) {
        const currentThread = window.VoiceroCore.session.threads[0];
        if (
          currentThread &&
          currentThread.messages &&
          currentThread.messages.length > 0
        ) {
          // Check if there are any non-system messages
          const realMessages = currentThread.messages.filter(
            (msg) => msg.role !== "system" && msg.type !== "page_data",
          );

          hasThreadMessages = realMessages.length > 0;
          console.log(
            "VoiceroText: Session thread has",
            realMessages.length,
            "real messages",
          );
        }
      }

      // Show welcome screen if no messages in thread or no AI messages locally
      if (!hasThreadMessages || !this.hasAiMessages()) {
        console.log("VoiceroText: No messages found, showing welcome screen");

        // Hide control buttons when showing welcome screen
        var headerContainer = this.shadowRoot.getElementById(
          "chat-controls-header",
        );
        if (headerContainer) {
          var clearBtn = headerContainer.querySelector("#clear-text-chat");
          var closeBtn = headerContainer.querySelector("#close-text-chat");

          if (clearBtn) {
            clearBtn.style.display = "none";
          }

          if (closeBtn && closeBtn.parentNode) {
            closeBtn.parentNode.style.display = "none";
          }

          // Hide the entire header completely
          headerContainer.style.display = "none";
        }

        // COMPLETELY HIDE the input area
        var chatInputWrapper =
          this.shadowRoot.getElementById("chat-input-wrapper");
        if (chatInputWrapper) {
          chatInputWrapper.style.display = "none";
        }

        // Reset messages container styling for welcome screen
        var messagesContainer = this.shadowRoot.getElementById("chat-messages");
        if (messagesContainer) {
          messagesContainer.style.cssText = `
            padding: 0 !important;
            margin: 0 !important;
            height: 350px !important;
            max-height: 350px !important;
            background-color: transparent !important;
            border-radius: 12px !important;
            overflow: hidden !important;
            box-shadow: none !important;
          `;
        }

        this.showWelcomeScreen();
      } else {
        console.log("VoiceroText: Thread messages found, showing text chat");

        // IMPORTANT: Make sure the text interface is properly shown
        // Show all controls since we have messages
        var headerContainer = this.shadowRoot.getElementById(
          "chat-controls-header",
        );
        if (headerContainer) {
          headerContainer.style.display = "flex";

          var clearBtn = headerContainer.querySelector("#clear-text-chat");
          var closeBtn = headerContainer.querySelector("#close-text-chat");

          if (clearBtn) {
            clearBtn.style.display = "block";
          }

          if (closeBtn && closeBtn.parentNode) {
            closeBtn.parentNode.style.display = "flex";
          }
        }

        // Show the input area
        var chatInputWrapper =
          this.shadowRoot.getElementById("chat-input-wrapper");
        if (chatInputWrapper) {
          chatInputWrapper.style.display = "block";
        }

        // Make sure we load the messages from the session
        this.loadMessagesFromSession();
      }

      // Process existing AI messages to ensure report buttons are present
      setTimeout(() => {
        this.processExistingAIMessages();

        // Also directly trigger VoiceroSupport to process messages
        if (
          window.VoiceroSupport &&
          typeof window.VoiceroSupport.processExistingMessages === "function"
        ) {
          window.VoiceroSupport.processExistingMessages();
        }
      }, 500);

      // Set up continuous checking for welcome back message for 10 seconds
      // This ensures we catch messages that arrive shortly after the interface loads
      this.welcomeBackCheckCount = 0;
      this.maxWelcomeBackChecks = 20; // Check for 10 seconds (20 checks * 500ms)
      this.hasDisplayedWelcomeBack = false;

      // Clear any existing interval
      if (this.welcomeBackCheckInterval) {
        clearInterval(this.welcomeBackCheckInterval);
      }

      // Start checking for welcome back messages
      this.welcomeBackCheckInterval = setInterval(() => {
        this.checkForWelcomeBackMessage();

        // Increment counter
        this.welcomeBackCheckCount++;

        // Stop checking after max attempts
        if (this.welcomeBackCheckCount >= this.maxWelcomeBackChecks) {
          clearInterval(this.welcomeBackCheckInterval);
          console.log(
            "VoiceroText: Completed checking for welcome back messages",
          );
        }
      }, 500); // Check every 500ms

      // Set the fixed height immediately to avoid animation
      var messagesContainer = this.shadowRoot.getElementById("chat-messages");
      if (messagesContainer) {
        messagesContainer.style.height = "400px";
        messagesContainer.style.maxHeight = "400px";
        messagesContainer.style.minHeight = "400px";
        // Remove any transition that might cause animation
        messagesContainer.style.transition = "none";
      }

      // Force visible state
      this._isChatVisible = true;

      // CRITICAL: Reset the opening flag so we can open again later
      setTimeout(() => {
        this._isOpeningTextChat = false;
      }, 500);
    },

    // Check for welcome back message and display it if found
    checkForWelcomeBackMessage: function () {
      // Skip if we've already displayed a welcome back message
      if (this.hasDisplayedWelcomeBack) {
        return;
      }

      // Also check for global flag to prevent showing in multiple interfaces
      if (window.voiceroWelcomeBackDisplayed) {
        console.log(
          "VoiceroText: Welcome back message already displayed in another interface",
        );
        this.hasDisplayedWelcomeBack = true;
        return;
      }

      // Check for welcome back message
      if (
        window.VoiceroUserData &&
        typeof window.VoiceroUserData.getWelcomeBackMessage === "function"
      ) {
        var welcomeBackMessage = window.VoiceroUserData.getWelcomeBackMessage();

        if (welcomeBackMessage) {
          console.log(
            "VoiceroText: Found welcome back message during continuous check:",
            welcomeBackMessage,
          );

          // Check if the message is empty or just contains whitespace
          if (!welcomeBackMessage.trim()) {
            console.log(
              "VoiceroText: Welcome back message is empty, not displaying",
            );
            this.hasDisplayedWelcomeBack = true;
            return;
          }

          // Mark as displayed to prevent duplicates (both locally and globally)
          this.hasDisplayedWelcomeBack = true;
          window.voiceroWelcomeBackDisplayed = true;

          // Display the welcome back message
          this.addMessage(welcomeBackMessage, "ai");

          console.log(
            "VoiceroText: Welcome back message displayed, now clearing it",
          );

          // Clear the welcome back message
          if (
            window.VoiceroUserData &&
            typeof window.VoiceroUserData.clearWelcomeBackMessage === "function"
          ) {
            window.VoiceroUserData.clearWelcomeBackMessage();
            console.log(
              "VoiceroText: Welcome back message cleared from storage",
            );
          }

          // Clear the interval since we found the message
          if (this.welcomeBackCheckInterval) {
            clearInterval(this.welcomeBackCheckInterval);
            console.log(
              "VoiceroText: Stopped checking for welcome back messages after finding one",
            );
          }
        }
      }
    },

    // Load existing messages from session and display them
    loadMessagesFromSession: function () {
      // Flag to track if any messages were loaded
      let messagesLoaded = false;

      // Flag to check if we should show welcome message
      let shouldShowWelcome = false;

      // Check if textWelcome flag is set in session
      if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.textWelcome
      ) {
        shouldShowWelcome = true;
      }

      // Check if we have a session with threads
      if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.threads &&
        window.VoiceroCore.session.threads.length > 0
      ) {
        // Find the most recent thread by sorting the threads by lastMessageAt or createdAt
        var threads = [...window.VoiceroCore.session.threads];
        var sortedThreads = threads.sort((a, b) => {
          // First try to sort by lastMessageAt if available
          if (a.lastMessageAt && b.lastMessageAt) {
            return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
          }
          // Fall back to createdAt if lastMessageAt is not available
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // Use the most recent thread (first after sorting)
        var currentThread = sortedThreads[0];

        if (
          currentThread &&
          currentThread.messages &&
          currentThread.messages.length > 0
        ) {
          // Sort messages by createdAt (oldest first)
          var sortedMessages = [...currentThread.messages].sort((a, b) => {
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          // Clear existing messages if any
          var messagesContainer = this.shadowRoot
            ? this.shadowRoot.getElementById("chat-messages")
            : document.getElementById("chat-messages");

          if (messagesContainer) {
            // Keep the container but remove children (except initial suggestions)
            var children = Array.from(messagesContainer.children);
            for (var child of children) {
              if (child.id !== "initial-suggestions") {
                messagesContainer.removeChild(child);
              }
            }
          }

          // Add each message to the UI
          sortedMessages.forEach((msg) => {
            // Skip system messages and page_data messages
            if (msg.role === "system" || msg.type === "page_data") {
              return; // Skip this message
            }

            if (msg.role === "user") {
              // Add user message
              this.addMessage(msg.content, "user", true); // true = skip adding to messages array
              messagesLoaded = true;
            } else if (msg.role === "assistant") {
              try {
                // Parse the content which is a JSON string
                let content = msg.content;
                let aiMessage = "";

                try {
                  // Try to parse as JSON
                  var parsedContent = JSON.parse(content);
                  if (parsedContent.answer) {
                    aiMessage = parsedContent.answer;
                  }
                } catch (e) {
                  // If parsing fails, use the raw content

                  aiMessage = content;
                }

                // Add AI message
                this.addMessage(aiMessage, "ai", true); // true = skip adding to messages array
                messagesLoaded = true;
              } catch (e) {}
            }
          });

          // Store the complete message objects with metadata in the local array
          this.messages = sortedMessages
            .filter(
              (msg) =>
                // Filter out system messages and page_data messages from the messages array
                msg.role !== "system" && msg.type !== "page_data",
            )
            .map((msg) => ({
              ...msg, // Keep all original properties (id, createdAt, threadId, etc.)
              // Ensure 'content' is properly formatted for assistant messages
              content:
                msg.role === "assistant"
                  ? this.extractAnswerFromJson(msg.content)
                  : msg.content,
            }));

          // Store the thread ID
          this.currentThreadId = currentThread.threadId;

          // Scroll to bottom
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          // Process the AI messages to ensure report buttons are attached
          setTimeout(() => {
            this.processExistingAIMessages();
          }, 500);
        } else {
          // Still store the thread ID even if no messages
          this.currentThreadId = currentThread.threadId;

          // Thread exists but has no messages, mark as empty for welcome message
          shouldShowWelcome = true;
        }
      } else {
        // No threads available, mark as empty for welcome message
        shouldShowWelcome = true;
      }

      // If no messages were loaded, show welcome screen instead of welcome message
      if (!messagesLoaded) {
        console.log(
          "VoiceroText: No messages loaded, checking if we should show welcome screen",
        );

        // CRITICAL: Check if welcome creation is already in progress to prevent infinite loop
        if (window.voiceroWelcomeInProgress) {
          console.log(
            "VoiceroText: Welcome creation already in progress, skipping",
          );
          return;
        }

        // Always show the welcome screen if there are no AI messages
        if (!this.hasAiMessages()) {
          console.log(
            "VoiceroText: No AI messages found, showing welcome screen",
          );

          // Set a flag to prevent multiple welcome screens
          window.voiceroWelcomeInProgress = true;

          // Show welcome screen
          this.showWelcomeScreen();

          // Reset flag after a delay
          setTimeout(() => {
            window.voiceroWelcomeInProgress = false;
          }, 1000);
        } else if (shouldShowWelcome) {
          console.log(
            "VoiceroText: Has AI messages but shouldShowWelcome flag is true",
          );
          this.showWelcomeMessage();
        }
      }
    },

    // Helper function to display the welcome message - SIMPLIFIED
    showWelcomeMessage: function () {
      // This function is kept as a stub for backward compatibility
      console.log(
        "VoiceroText: showWelcomeMessage called - using showWelcomeScreen instead",
      );

      // Set the flag to indicate we've shown the welcome
      this.hasShownWelcome = true;

      // Just show the welcome screen instead
      this.showWelcomeScreen();

      // Update state to prevent showing welcome again
      if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
        window.VoiceroCore.updateWindowState({
          textWelcome: false,
        });
      }
    },

    // New function to process existing AI messages
    processExistingAIMessages: function () {
      if (!this.shadowRoot) return;

      var messagesContainer = this.shadowRoot.getElementById("chat-messages");
      if (!messagesContainer) return;

      // Find all AI messages
      var aiMessages = messagesContainer.querySelectorAll(
        ".ai-message:not(.placeholder):not(.typing-wrapper)",
      );

      // Skip if no messages
      if (!aiMessages || aiMessages.length === 0) return;

      // Get the icon path - try to find a consistent way to get the icon
      var iconSrc = "";

      // First try to use the extension URL from scripts
      var scripts = document.querySelectorAll("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src.includes("voicero-") || src.includes("voicero/")) {
          iconSrc = src.substring(0, src.lastIndexOf("/") + 1) + "icon.png";
          break;
        }
      }

      // If we couldn't find it from scripts, try common locations
      if (!iconSrc) {
        iconSrc = "./icon.png"; // Default to simple path
      }

      // Process each message
      aiMessages.forEach((message) => {
        // First check if we need to add the icon
        var messageContent = message.querySelector(".message-content");
        if (messageContent && !message.querySelector(".ai-icon-container")) {
          // Ensure the message content has relative positioning
          messageContent.style.position = "relative";

          // Create icon container
          var iconContainer = document.createElement("div");
          iconContainer.className = "ai-icon-container";
          iconContainer.style.cssText = `
            position: absolute;
            top: -15px;
            left: -15px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            overflow: hidden;
            z-index: 9999;
            background: white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
            border: 2px solid white;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          `;

          var icon = document.createElement("img");
          icon.src = iconSrc;
          icon.alt = "Suvi";
          icon.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          `;

          iconContainer.appendChild(icon);
          messageContent.appendChild(iconContainer);
        }

        // Check if there's already a report button
        if (message.querySelector(".voicero-report-button")) return;

        // Try to attach a report button
        if (window.VoiceroSupport) {
          if (typeof window.VoiceroSupport.processAIMessage === "function") {
            window.VoiceroSupport.processAIMessage(message, "text");
          } else if (
            typeof window.VoiceroSupport.attachReportButtonToMessage ===
            "function"
          ) {
            window.VoiceroSupport.attachReportButtonToMessage(message, "text");
          }
        } else {
          // Fallback: Add a basic report button
          var contentEl = message.querySelector(".message-content");
          if (contentEl && !contentEl.querySelector(".voicero-report-button")) {
            var reportButton = document.createElement("div");
            reportButton.className = "voicero-report-button";
            reportButton.innerHTML = "Report an AI problem";
            reportButton.style.cssText = `
              font-size: 12px;
              color: #888;
              margin-top: 10px;
              text-align: right;
              cursor: pointer;
              text-decoration: underline;
              display: block;
              opacity: 0.8;
            `;
            contentEl.appendChild(reportButton);
          }
        }
      });
    },

    // Helper to extract answer from JSON string
    extractAnswerFromJson: function (jsonString) {
      try {
        var parsed = JSON.parse(jsonString);
        return parsed.answer || jsonString;
      } catch (e) {
        return jsonString;
      }
    },

    // Add a message to the chat
    addMessage: function (text, role, skipAddToMessages = false) {
      // Create message element
      var message = document.createElement("div");
      message.className = role === "user" ? "user-message" : "ai-message";

      // Create message content
      var messageContent = document.createElement("div");
      messageContent.className = "message-content";

      // Set the content (handle HTML if needed)
      if (role === "ai") {
        // Position the message container relatively for absolute positioning of icon
        messageContent.style.position = "relative";

        // Add icon for AI messages - placing inside the message content for better positioning
        var iconContainer = document.createElement("div");
        iconContainer.className = "ai-icon-container";
        iconContainer.style.cssText = `
          position: absolute;
          top: -15px;
          left: -15px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          overflow: hidden;
          z-index: 9999;
          background: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          border: 2px solid white;
        `;

        // Get the icon from a hardcoded path to ensure it works
        var iconSrc = "";

        // First try to use the extension URL from scripts
        var scripts = document.querySelectorAll("script");
        for (var i = 0; i < scripts.length; i++) {
          var src = scripts[i].src || "";
          if (src.includes("voicero-") || src.includes("voicero/")) {
            iconSrc = src.substring(0, src.lastIndexOf("/") + 1) + "icon.png";
            break;
          }
        }

        // If we couldn't find it from scripts, try common locations
        if (!iconSrc) {
          // Try several common paths
          var possiblePaths = [
            "./icon.png",
            "/extensions/voicero/assets/icon.png",
            "https://cdn.shopify.com/extensions/voicero/assets/icon.png",
            "https://cdn.jsdelivr.net/gh/voicero/assets/icon.png",
            // Attempt to use a data URL as final fallback
            "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjODgyYmU2IiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIj48L2NpcmNsZT48cGF0aCBkPSJNMTIgOHY0TTEyIDE2aDAuMDEiPjwvcGF0aD48L3N2Zz4=",
          ];

          // Try to find the first working path
          iconSrc = possiblePaths[0]; // Default to first option initially

          // Also look for icon.png in the current page's HTML
          var imgElements = document.querySelectorAll("img");
          for (var i = 0; i < imgElements.length; i++) {
            var imgSrc = imgElements[i].src || "";
            if (imgSrc.includes("icon.png") || imgSrc.includes("suvi")) {
              iconSrc = imgSrc;
              console.log("Found icon in page:", iconSrc);
              break;
            }
          }
        }

        var icon = document.createElement("img");
        icon.src = iconSrc;
        icon.alt = "Suvi";
        icon.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
        `;

        // Force the icon to be visible with !important flags
        icon.style.cssText += `
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 99999 !important;
          position: relative !important;
        `;

        iconContainer.appendChild(icon);

        // CRITICAL FIX: First set the formatted content
        messageContent.innerHTML = this.formatContent(text);

        // THEN add the icon container to the message content
        // This ensures the icon isn't overwritten by the innerHTML operation
        messageContent.appendChild(iconContainer);

        // Debug logging to track icon addition
        console.log("Added AI message icon with src:", iconSrc);

        // Use event delegation instead of individual click handlers
        // We'll set up a single click handler on the message element
        if (messageContent.querySelectorAll(".welcome-question").length > 0) {
          message.setAttribute("data-has-questions", "true");
        }
      } else {
        messageContent.textContent = text;
      }

      // Append content to message
      message.appendChild(messageContent);

      // Add event delegation for welcome questions if needed
      if (message.getAttribute("data-has-questions") === "true") {
        // Use event delegation - one handler for the entire message
        message.addEventListener("click", (e) => {
          // Find if the click was on a welcome-question element
          let target = e.target;
          while (target !== message) {
            if (target.classList.contains("welcome-question")) {
              e.preventDefault();
              var questionText = target.getAttribute("data-question");
              if (questionText) {
                this.sendChatMessage(questionText);
              }
              break;
            }
            if (!target.parentElement) break; // Safety check
            target = target.parentElement;
          }
        });
      }

      // Find messages container
      var messagesContainer = this.shadowRoot
        ? this.shadowRoot.getElementById("chat-messages")
        : document.getElementById("chat-messages");

      if (messagesContainer) {
        // Append message to container
        messagesContainer.appendChild(message);
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      // Store message locally for context (unless skipAddToMessages is true)
      if (!skipAddToMessages) {
        // Add with metadata similar to what comes from the server
        var messageObj = {
          role: role,
          content: text,
          createdAt: new Date().toISOString(), // Add timestamp
          id: this.generateId(), // Generate a temporary ID
          type: "text",
        };

        // Add threadId if available
        if (this.currentThreadId) {
          messageObj.threadId = this.currentThreadId;
        } else if (
          window.VoiceroCore &&
          window.VoiceroCore.thread &&
          window.VoiceroCore.thread.threadId
        ) {
          messageObj.threadId = window.VoiceroCore.thread.threadId;
        }

        this.messages.push(messageObj);

        // Set message ID as data attribute on the DOM element for reporting
        message.dataset.messageId = messageObj.id;
      }

      // If this is an AI message, attach the support/report button using VoiceroSupport
      if (
        role === "ai" &&
        window.VoiceroSupport &&
        typeof window.VoiceroSupport.attachReportButtonToMessage === "function"
      ) {
        try {
          // Small delay to ensure the message is fully rendered
          setTimeout(() => {
            window.VoiceroSupport.attachReportButtonToMessage(message, "text");
          }, 50);
        } catch (e) {
          console.error("Failed to attach report button:", e);
        }
      }

      return message;
    },

    // Generate a temporary ID for messages
    generateId: function () {
      return window.VoiceroPageData && window.VoiceroPageData.generateId
        ? window.VoiceroPageData.generateId()
        : "temp-" +
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    },

    // Fetch website data from /api/connect endpoint
    fetchWebsiteData: function () {
      // Use direct API endpoint instead of WordPress AJAX
      fetch("https://www.voicero.ai/api/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(window.voiceroConfig?.getAuthHeaders
            ? window.voiceroConfig.getAuthHeaders()
            : {}),
        },
        body: JSON.stringify({
          url: window.location.href,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Website data fetch failed: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          // Use the website data from the response
          this.websiteData = data;

          // Store custom instructions if available
          if (data.website && data.website.customInstructions) {
            this.customInstructions = data.website.customInstructions;
          }

          // Update popup questions in the interface if it exists
          this.updatePopupQuestions();
        })
        .catch((error) => {
          this.createFallbackPopupQuestions();
        });
    },

    // Helper method for creating fallback popup questions
    createFallbackPopupQuestions: function () {
      // Create fallback popup questions if they don't exist
      if (
        !this.websiteData ||
        !this.websiteData.website ||
        !this.websiteData.website.popUpQuestions
      ) {
        this.websiteData = this.websiteData || {};
        this.websiteData.website = this.websiteData.website || {};
        this.websiteData.website.popUpQuestions = [
          { question: "What products do you offer?" },
          { question: "How can I contact customer support?" },
          { question: "Do you ship internationally?" },
        ];
        this.updatePopupQuestions();
      }
    },

    // Update popup questions in the interface with data from API
    updatePopupQuestions: function () {
      let customPopUpQuestions = [];
      let popUpQuestionsSource = "none";

      // Try to get questions from website data
      if (
        this.websiteData &&
        this.websiteData.website &&
        this.websiteData.website.popUpQuestions &&
        this.websiteData.website.popUpQuestions.length > 0
      ) {
        customPopUpQuestions = this.websiteData.website.popUpQuestions;
        popUpQuestionsSource = "websiteData";
      }
      // Try to get questions from VoiceroCore session
      else if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.popUpQuestions &&
        window.VoiceroCore.session.popUpQuestions.length > 0
      ) {
        customPopUpQuestions = window.VoiceroCore.session.popUpQuestions;
        popUpQuestionsSource = "VoiceroCore.session.popUpQuestions";
      }
      // Try to get questions directly from VoiceroCore
      else if (
        window.VoiceroCore &&
        window.VoiceroCore.popUpQuestions &&
        window.VoiceroCore.popUpQuestions.length > 0
      ) {
        customPopUpQuestions = window.VoiceroCore.popUpQuestions;
        popUpQuestionsSource = "VoiceroCore.popUpQuestions";
      }
      // Check for website property directly in VoiceroCore
      else if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.website &&
        window.VoiceroCore.session.website.popUpQuestions &&
        window.VoiceroCore.session.website.popUpQuestions.length > 0
      ) {
        customPopUpQuestions =
          window.VoiceroCore.session.website.popUpQuestions;
        popUpQuestionsSource = "VoiceroCore.session.website.popUpQuestions";
      }
      // Direct access to VoiceroCore's website object
      else if (
        window.VoiceroCore &&
        window.VoiceroCore.website &&
        window.VoiceroCore.website.popUpQuestions &&
        window.VoiceroCore.website.popUpQuestions.length > 0
      ) {
        customPopUpQuestions = window.VoiceroCore.website.popUpQuestions;
        popUpQuestionsSource = "VoiceroCore.website.popUpQuestions";
      }
      // Fallback to window global
      else if (
        window.voiceroPopUpQuestions &&
        window.voiceroPopUpQuestions.length > 0
      ) {
        customPopUpQuestions = window.voiceroPopUpQuestions;
        popUpQuestionsSource = "window.voiceroPopUpQuestions";
      }

      console.log(
        "VoiceroText: Updating popup questions from",
        popUpQuestionsSource,
        customPopUpQuestions,
      );

      if (!customPopUpQuestions || customPopUpQuestions.length === 0) {
        console.log("VoiceroText: No popup questions found");
        return;
      }

      var popupQuestions = customPopUpQuestions;

      // Store reference to this for event handlers
      var self = this;

      // Debug function to log DOM structure of suggestions
      var debugSuggestions = function (container, context) {
        if (!container) {
          return;
        }
        var initialSuggestions = container.querySelector(
          "#initial-suggestions",
        );
        if (!initialSuggestions) {
          return;
        }

        var suggestionContainer =
          initialSuggestions.querySelector("div:nth-child(2)");
        if (!suggestionContainer) {
          return;
        }
        var suggestions = suggestionContainer.querySelectorAll(".suggestion");
        suggestions.forEach(function (s, i) {});
      };

      // Find initial suggestions container in both shadow DOM and regular DOM
      var updateSuggestions = function (container) {
        if (!container) {
          return;
        }
        var suggestionsContainer = container.querySelector(
          "#initial-suggestions",
        );
        if (!suggestionsContainer) {
          // Debug the container's HTML to help diagnose issues

          return;
        }
        // Get the div that contains the suggestions
        var suggestionsDiv =
          suggestionsContainer.querySelector("div:nth-child(2)");
        if (!suggestionsDiv) {
          return;
        }
        // Clear existing suggestions
        suggestionsDiv.innerHTML = "";

        // Add new suggestions from API
        popupQuestions.forEach(function (item, index) {
          var questionText = item.question || "Ask me a question";

          // Get the main color for styling
          var mainColor = self.colorVariants
            ? self.colorVariants.main
            : "#882be6";

          suggestionsDiv.innerHTML +=
            '<div class="suggestion" style="' +
            "background: " +
            mainColor +
            ";" +
            "padding: 8px 12px;" +
            "border-radius: 17px;" +
            "cursor: pointer;" +
            "transition: all 0.2s ease;" +
            "color: white;" +
            "font-weight: 400;" +
            "text-align: left;" +
            "font-size: 14px;" +
            "margin-bottom: 8px;" +
            "box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);" +
            '">' +
            questionText +
            "</div>";
        });

        // Re-attach event listeners to the new suggestions
        var suggestions = suggestionsDiv.querySelectorAll(".suggestion");
        suggestions.forEach(function (suggestion) {
          suggestion.addEventListener("click", function () {
            var text = this.textContent.trim();
            // Use self to reference the VoiceroText object
            if (self.sendChatMessage) {
              self.sendChatMessage(text);
            } else {
            }
            // Hide suggestions
            suggestionsContainer.style.display = "none";
          });
        });

        // Make sure suggestions are visible
        suggestionsContainer.style.display = "block";
        suggestionsContainer.style.opacity = "1";
        suggestionsContainer.style.height = "auto";
      };

      // Update in regular DOM
      updateSuggestions(document);
      debugSuggestions(document, "regular DOM");

      // Update in shadow DOM if it exists
      if (this.shadowRoot) {
        updateSuggestions(this.shadowRoot);
        debugSuggestions(this.shadowRoot, "shadow DOM");
      } else {
      }
    },

    // Create the chat interface HTML structure
    createChatInterface: function () {
      try {
        // First check if elements already exist
        var existingInterface = document.getElementById("text-chat-interface");

        // Also check for standalone welcome container that might cause floating box
        var welcomeContainer = document.getElementById(
          "voicero-welcome-container",
        );
        if (welcomeContainer) {
          console.log(
            "VoiceroText: Found existing welcome container during interface creation, removing it",
          );
          welcomeContainer.remove();
        }

        if (existingInterface) {
          var messagesContainer = document.getElementById("chat-messages");
          if (messagesContainer) {
            return;
          } else {
            // Remove existing interface to rebuild it completely
            existingInterface.remove();
          }
        }

        // Make sure we have color variants
        if (!this.colorVariants) {
          this.getColorVariants(this.websiteColor);
        }

        // Get colors for styling
        var mainColor = this.colorVariants.main;
        var lightColor = this.colorVariants.light;
        var darkColor = this.colorVariants.dark;
        var superlightColor = this.colorVariants.superlight;
        var superdarkColor = this.colorVariants.superdark;

        // Add CSS styles
        var styleEl = document.createElement("style");
        styleEl.innerHTML = `
          @keyframes gradientMove {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }

          @keyframes gradientBorder {
            0% { background-position: 0% 50%; }
            25% { background-position: 25% 50%; }
            50% { background-position: 50% 50%; }
            75% { background-position: 75% 50%; }
            100% { background-position: 100% 50%; }
          }
          
          @keyframes simplePulse {
            0% { opacity: 0.7; }
            50% { opacity: 1; }
            100% { opacity: 0.7; }
          }
          
          .siri-active {
            position: relative !important;
            background-color: ${mainColor} !important;
            opacity: 0.8 !important;
            animation: simplePulse 1.5s ease-in-out infinite !important;
            border: none !important;
            overflow: visible !important;
          }
          
          /* Removed pulsing animation */
      

          /* Hide scrollbar for different browsers */
          #chat-messages {
            scrollbar-width: none !important; /* Firefox */
            -ms-overflow-style: none !important; /* IE and Edge */
            padding: 10px !important; 
            margin: 0 !important;
            background-color: #f2f2f7 !important;
            border-radius: 0 !important;
            transition: opacity 0.25s ease !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            height: 350px !important;
            max-height: 350px !important;
            min-height: 350px !important;
            position: relative !important;
          }
          
          #chat-messages::-webkit-scrollbar {
            display: none !important; /* Chrome, Safari, Opera */
          }
          
          #chat-controls-header {
            margin-bottom: 15px !important;
            margin-top: 0 !important;
            background-color: #f2f2f7 !important;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
            border-radius: 0 !important;
            padding: 10px 15px !important;
            width: 100% !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 9999999 !important; /* Very high z-index to ensure it stays on top */
          }

          .user-message {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 25px; /* Increased for status indicator space */
            position: relative;
            padding-right: 8px;
            padding-top: 2px;
          }

          .user-message .message-content {
            background: ${mainColor};
            color: white;
            border-radius: 18px;
            padding: 10px 15px;
            max-width: 70%;
            word-wrap: break-word;
            font-size: 15px;
            line-height: 1.4;
            text-align: left;
            box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
          }

          .ai-message {
            display: flex;
            justify-content: flex-start;
            margin-bottom: 16px; /* Increased from default */
            position: relative;
            padding-left: 8px;
            margin-top: 12px; /* Add space for icon */
          }

          .ai-message .message-content {
            background: #e5e5ea;
            color: #333;
            border-radius: 18px;
            padding: 10px 15px;
            max-width: 70%;
            word-wrap: break-word;
            font-size: 15px;
            line-height: 1.4;
            text-align: left;
            box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
            position: relative; /* Ensure positioning context */
          }
          
          .ai-message .ai-icon-container {
            position: absolute;
            top: -15px;
            left: -15px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            overflow: hidden;
            z-index: 9999;
            background: white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
            border: 2px solid white;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          
          .ai-message .ai-icon-container img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
          
          /* iPhone-style message grouping */
          .user-message:not(:last-child) .message-content {
            margin-bottom: 3px;
          }
          
          .ai-message:not(:last-child) .message-content {
            margin-bottom: 3px;
          }
          
          /* Message delivery status */
          .read-status {
            font-size: 11px;
            color: #8e8e93;
            text-align: right;
            margin-top: 2px;
            margin-right: 8px;
            position: absolute;
            right: 0;
            bottom: -15px;
            width: auto;
          }

          .chat-link {
            color: #2196F3;
            text-decoration: none;
            font-weight: 500;
            position: relative;
            transition: all 0.2s ease;
          }

          .chat-link:hover {
            text-decoration: underline;
            opacity: 0.9;
          }
          
          .voice-prompt {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin: 15px auto;
            padding: 10px 15px;
            background: #e5e5ea;
            border-radius: 18px;
            width: 80%;
            transition: all 0.3s ease;
          }
          
          .suggestion {
            background: ${this.websiteColor || "#882be6"} !important;
            padding: 10px 15px !important;
            border-radius: 17px !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            color: white !important;
            font-weight: 400 !important;
            text-align: left !important;
            font-size: 14px !important;
            margin-bottom: 8px !important;
            box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05) !important;
          }
          
          .suggestion:hover {
            opacity: 0.9 !important;
          }
        `;
        document.head.appendChild(styleEl);

        // Create interface container
        var interfaceContainer = document.createElement("div");
        interfaceContainer.id = "text-chat-interface";

        // Apply styles directly to match voice chat interface
        Object.assign(interfaceContainer.style, {
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "85%",
          maxWidth: "480px",
          minWidth: "280px",
          display: "none",
          zIndex: "2147483647",
          userSelect: "none",
          margin: "0",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
        });

        // Create shadow DOM host element
        let shadowHost = document.createElement("div");
        shadowHost.id = "voicero-text-chat-container";

        // Apply styles to match voice chat interface
        Object.assign(shadowHost.style, {
          position: "fixed",
          bottom: "20px",
          right: "20px",
          left: "auto",
          transform: "none",
          width: "375px",
          maxWidth: "375px",
          minWidth: "375px",
          zIndex: "2147483646",
          borderRadius: "12px",
          boxShadow: "none", // Remove box shadow
          overflow: "hidden",
          margin: "0",
          display: "none",
          background: "transparent",
          padding: "0",
          border: "none",
          backdropFilter: "none", // Remove any backdrop filter
          webkitBackdropFilter: "none", // Safari support
          opacity: "1", // Ensure full opacity
          position: "relative", // <-- Make parent relative for absolute child
        });
        document.body.appendChild(shadowHost);

        // Create shadow root
        this.shadowRoot = shadowHost.attachShadow({ mode: "open" });

        // Add styles and HTML content to shadow root
        this.shadowRoot.innerHTML = `
          <style>
            /* Same styles as in createChatInterface, but inside shadow DOM */
            @keyframes gradientMove {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }

            @keyframes gradientBorder {
              0% { background-position: 0% 50%; }
              25% { background-position: 25% 50%; }
              50% { background-position: 50% 50%; }
              75% { background-position: 75% 50%; }
              100% { background-position: 100% 50%; }
            }
            
            @keyframes simplePulse {
              0% { opacity: 0.7; }
              50% { opacity: 1; }
              100% { opacity: 0.7; }
            }
            
            .siri-active {
              position: relative !important;
              background-color: ${mainColor} !important;
              opacity: 0.8 !important;
              animation: simplePulse 1.5s ease-in-out infinite !important;
              border: none !important;
              overflow: visible !important;
            }
            
            /* Removed pulsing animation */
            
            
            
           
            
            

            /* Hide scrollbar for different browsers */
            #chat-messages {
              scrollbar-width: none !important; /* Firefox */
              -ms-overflow-style: none !important; /* IE and Edge */
              padding: 10px !important; 
              padding-bottom: 70px !important; /* Space for input box */
              margin: 0 !important;
              background-color: #f2f2f7 !important;
              border-radius: 0 !important;
              transition: max-height 0.25s ease, opacity 0.25s ease !important;
              overflow-y: auto !important;
              overflow-x: hidden !important;
              max-height: 33vh !important;
              height: auto !important;
              position: relative !important;
            }
            
            #chat-messages::-webkit-scrollbar {
              display: none !important; /* Chrome, Safari, Opera */
            }
            
            #chat-controls-header {
              margin-bottom: 15px !important;
              margin-top: 0 !important;
              background-color: #f2f2f7 !important;
              border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
              border-radius: 12px 12px 0 0 !important;
              padding: 10px 15px !important;
              width: 100% !important;
              left: 0 !important;
              right: 0 !important;
              z-index: 9999999 !important; /* Very high z-index to ensure it stays on top */
              overflow: hidden !important;
            }

            .user-message {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 16px; /* Increased from default */
              position: relative;
              padding-right: 8px;
            }

            .user-message .message-content {
              background: ${mainColor};
              color: white;
              border-radius: 18px;
              padding: 10px 15px;
              max-width: 70%;
              word-wrap: break-word;
              font-size: 15px;
              line-height: 1.4;
              text-align: left;
              box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
            }

            .ai-message {
              display: flex;
              justify-content: flex-start;
              margin-bottom: 16px; /* Increased from default */
              position: relative;
              padding-left: 8px;
              margin-top: 12px; /* Add space for icon */
            }

            .ai-message .message-content {
              background: #e5e5ea;
              color: #333;
              border-radius: 18px;
              padding: 10px 15px;
              max-width: 70%;
              word-wrap: break-word;
              font-size: 15px;
              line-height: 1.4;
              text-align: left;
              box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
              position: relative; /* Ensure positioning context */
            }
            
            .ai-message .ai-icon-container {
              position: absolute;
              top: -15px;
              left: -15px;
              width: 30px;
              height: 30px;
              border-radius: 50%;
              overflow: hidden;
              z-index: 9999;
              background: white;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
              border: 2px solid white;
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
            }
            
            .ai-message .ai-icon-container img {
              width: 100% !important;
              height: 100% !important;
              object-fit: cover !important;
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
            }
            
            /* iPhone-style message grouping */
            .user-message:not(:last-child) .message-content {
              margin-bottom: 3px;
            }
            
            .ai-message:not(:last-child) .message-content {
              margin-bottom: 3px;
            }
            
            /* Message delivery status */
            .read-status {
              font-size: 11px;
              color: #8e8e93;
              text-align: right;
              margin-top: 2px;
              margin-right: 8px;
            }

            .chat-link {
              color: #2196F3;
              text-decoration: none;
              font-weight: 500;
              position: relative;
              transition: all 0.2s ease;
            }

            .chat-link:hover {
              text-decoration: underline;
              opacity: 0.9;
            }
            
            .voice-prompt {
              text-align: center;
              color: #666;
              font-size: 14px;
              margin: 15px auto;
              padding: 10px 15px;
              background: #e5e5ea;
              border-radius: 18px;
              width: 80%;
              transition: all 0.3s ease;
            }
            
            .suggestion {
              background: ${this.websiteColor || "#882be6"} !important;
              padding: 10px 15px !important;
              border-radius: 17px !important;
              cursor: pointer !important;
              transition: all 0.2s ease !important;
              color: white !important;
              font-weight: 400 !important;
              text-align: left !important;
              font-size: 14px !important;
              margin-bottom: 8px !important;
              box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05) !important;
            }
            
            .suggestion:hover {
              opacity: 0.9 !important;
            }
          </style>

          <!-- IMPORTANT: Restructured layout - Maximize button first in the DOM order -->
          <!-- This is critical so it won't be affected by the messages container collapse -->
          <!-- Maximize chat button removed -->

          <div id="chat-controls-header" style="
            position: sticky !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: 38px !important;
            background: rgb(242, 242, 247) !important;
            z-index: 9999999 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 0 15px !important;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
            border-radius: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            transform: translateZ(0);
          ">
            <!-- Suvi header with avatar and name (left side) -->
            <div style="
              display: flex !important;
              align-items: center !important;
              gap: 8px !important;
            ">
              <div style="
                width: 28px !important;
                height: 28px !important;
                border-radius: 50% !important;
                overflow: hidden !important;
                position: relative !important;
                background-color: transparent !important;
              ">
                <img
                  src="${(() => {
                    // Try to build the correct path for Shopify theme extension assets
                    var extensionUrl = "";
                    var scripts = document.querySelectorAll("script");
                    for (var i = 0; i < scripts.length; i++) {
                      var src = scripts[i].src || "";
                      if (
                        src.includes("voicero-") ||
                        src.includes("voicero/")
                      ) {
                        extensionUrl = src.substring(
                          0,
                          src.lastIndexOf("/") + 1,
                        );
                        break;
                      }
                    }
                    return extensionUrl
                      ? extensionUrl + "icon.png"
                      : "./icon.png";
                  })()}"
                  alt="Suvi"
                  style="
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    border-radius: 50% !important;
                  "
                >
              </div>
              <div style="
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-start !important;
              ">
                <div style="
                  font-weight: bold !important;
                  color: black !important;
                  font-size: 14px !important;
                  line-height: 1 !important;
                ">Suvi</div>
                <div style="
                  font-size: 10px !important;
                  color: #666 !important;
                  line-height: 1 !important;
                ">AI Sales Rep</div>
              </div>
            </div>
            
            <!-- Control buttons (right side) -->
            <div style="
              display: flex !important;
              gap: 10px !important;
              align-items: center !important;
              margin: 0 !important;
              padding: 0 !important;
              height: 28px !important;
            ">
              <button id="clear-text-chat" title="Clear Chat History" style="
                background: none;
                border: none;
                cursor: pointer;
                padding: 5px 8px;
                border-radius: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                background-color: rgba(0, 0, 0, 0.07);
                font-size: 12px;
                color: #666;
              ">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" style="margin-right: 4px;">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Clear</span>
              </button>
            
              <button id="close-text-chat" style="
                background: none;
                border: none;
                cursor: pointer;
                padding: 5px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
              " title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
                  <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>

          <div id="chat-messages" style="
            background: #f2f2f7 !important;
            border-radius: 0 !important;
            padding: 10px !important;
            padding-bottom: 70px !important;
            margin: 0 !important;
            height: 400px !important;
            max-height: 400px !important;
            min-height: 400px !important;
            overflow-y: auto;
            overflow-x: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            position: relative;
            transition: all 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
          ">
            <div id="loading-bar" style="
              position: absolute;
              top: 0;
              left: 0;
              height: 3px;
              width: 0%;
              background: linear-gradient(90deg, ${
                this.colorVariants.main
              }, #ff4444, ${this.colorVariants.main});
              background-size: 200% 100%;
              border-radius: 3px;
              display: none;
              animation: gradientMove 2s linear infinite;
              z-index: 9999999;
            "></div>
            
            <div>
              <div id="initial-suggestions" style="
                padding: 0;
                opacity: 1;
                transition: all 0.3s ease;
              ">
                <!-- Initial suggestions will be dynamically added here -->
              </div>
            </div>
          </div>

          <div id="chat-input-wrapper" style="
            margin: auto 0 0 !important;
            padding: 0 15px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            background: white !important;
            border-radius: 0 0 12px 12px !important;
            z-index: 999999 !important;
          ">
            <div style="
              position: relative !important;
              width: 100% !important;
              padding: 12px 0 15px !important;
              display: flex !important;
              align-items: center !important;
            ">
                              <input
                  type="text"
                  id="chat-input"
                  placeholder="Ask a question"
                  style="
                    width: 100% !important;
                    padding: 12px 15px !important;
                    padding-right: 45px !important;
                    border: 1px solid rgba(0, 0, 0, 0.1) !important;
                    border-radius: 8px !important;
                    font-size: 14px !important;
                    color: #333 !important;
                    background: white !important;
                    outline: none !important;
                    box-sizing: border-box !important;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
                    position: relative !important;
                    z-index: 1 !important;
                  "
              >
              <div id="send-message-btn" style="
                position: absolute !important;
                right: 12px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                background: transparent !important;
                background-color: transparent !important;
                border: none !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 24px !important;
                height: 24px !important;
                z-index: 99999999 !important;
                pointer-events: auto !important;
              ">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
                </svg>
              </div>
            </div>
          </div>
        `;

        // Show initial suggestions
        var initialSuggestions = this.shadowRoot.getElementById(
          "initial-suggestions",
        );
        if (initialSuggestions) {
          initialSuggestions.style.display = "block";
          initialSuggestions.style.opacity = "1";
        }

        if (
          this.websiteData &&
          this.websiteData.website &&
          this.websiteData.website.popUpQuestions
        ) {
          this.updatePopupQuestions();
        }

        // Add initial suggestions again
        this.updatePopupQuestions();

        // Set up button event handlers
        this.setupButtonHandlers();

        return this.shadowRoot;
      } catch (error) {}
    },

    // Set up button event handlers
    setupButtonHandlers: function () {
      var shadowRoot = document.getElementById(
        "voicero-text-chat-container",
      ).shadowRoot;
      if (!shadowRoot) return;

      // Get control buttons
      var closeBtn = shadowRoot.getElementById("close-text-chat");
      var clearBtn = shadowRoot.getElementById("clear-text-chat");

      // Set up close button event handler
      if (closeBtn) {
        closeBtn.removeAttribute("onclick");
        closeBtn.addEventListener("click", () => {
          // Check if session operations are in progress
          if (this.isSessionBusy()) {
            console.log(
              "VoiceroText: Close button click ignored - session operation in progress",
            );
            return;
          }
          this.closeTextChat();
        });
      }

      // Set up clear button event handler
      if (clearBtn) {
        clearBtn.removeAttribute("onclick");
        clearBtn.addEventListener("click", () => this.clearChatHistory());
      }
    },

    // Clear chat history
    clearChatHistory: function () {
      console.log("VoiceroText: Clearing chat history");

      // Reset messages array
      this.messages = [];

      // Reset the welcome flag
      this.hasShownWelcome = false;

      // Hide the text chat interface first to prevent UI conflicts
      const textChatContainer = document.getElementById(
        "voicero-text-chat-container",
      );
      if (textChatContainer) {
        textChatContainer.style.display = "none";
      }

      // Update window state to hide text interface - SIMPLIFIED to only use textOpen
      if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
        window.VoiceroCore.updateWindowState({
          textOpen: false,
        });
      }

      // Call the session/clear API endpoint
      if (window.VoiceroCore && window.VoiceroCore.sessionId) {
        // Use direct API endpoint
        fetch("http://localhost:3000/api/session/clear", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(window.voiceroConfig?.getAuthHeaders
              ? window.voiceroConfig.getAuthHeaders()
              : {}),
          },
          body: JSON.stringify({
            sessionId: window.VoiceroCore.sessionId,
          }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Session clear failed: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            // Update the session and thread in VoiceroCore
            if (data.session) {
              if (window.VoiceroCore) {
                window.VoiceroCore.session = data.session;

                // Set the new thread (should be the first one in the array)
                if (data.session.threads && data.session.threads.length > 0) {
                  // Get the most recent thread (first in the array since it's sorted by lastMessageAt desc)
                  window.VoiceroCore.thread = data.session.threads[0];
                  window.VoiceroCore.currentThreadId =
                    data.session.threads[0].threadId;

                  // IMPORTANT: Also update this component's currentThreadId to ensure new requests use the new thread
                  this.currentThreadId = data.session.threads[0].threadId;
                }
              }
            }
          })
          .catch((error) => {
            // console.error("Failed to clear chat history:", error);
          });
      }

      // Use VoiceroWelcome module to show welcome screen
      if (
        window.VoiceroWelcome &&
        typeof window.VoiceroWelcome.createWelcomeContainer === "function"
      ) {
        console.log(
          "VoiceroText: Delegating to VoiceroWelcome module for welcome screen",
        );

        // Pass this instance to VoiceroWelcome for proper event handling
        window.VoiceroWelcome.voiceroTextInstance = this;

        // Let VoiceroWelcome handle creating and showing the welcome screen
        window.VoiceroWelcome.createWelcomeContainer();
      } else {
        console.error("VoiceroText: VoiceroWelcome module not available");
      }

      // Force hide the main button to ensure it doesn't appear during transition
      if (window.VoiceroCore && window.VoiceroCore.hideMainButton) {
        window.VoiceroCore.hideMainButton();
      }
    },

    // Send chat message to API
    sendChatToApi: function (messageText, threadId) {
      // Show loading indicator
      this.setLoadingIndicator(true);

      // Format the request body according to the API's expected structure
      var requestBody = {
        message: messageText,
        type: "text",
      };

      // Add interaction type from global variable if available
      if (window.voiceroInteractionType) {
        requestBody.interactionType = window.voiceroInteractionType;
        console.log(
          "[VOICERO TEXT] Adding interaction type:",
          window.voiceroInteractionType,
        );
      }

      // Add thread ID if available (priority order: passed in > current instance > most recent from session)
      if (threadId) {
        requestBody.threadId = threadId;
      } else if (this.currentThreadId) {
        requestBody.threadId = this.currentThreadId;
      } else if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.threads &&
        window.VoiceroCore.session.threads.length > 0
      ) {
        // Find the most recent thread by sorting the threads
        var threads = [...window.VoiceroCore.session.threads];
        var sortedThreads = threads.sort((a, b) => {
          // First try to sort by lastMessageAt if available
          if (a.lastMessageAt && b.lastMessageAt) {
            return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
          }
          // Fall back to createdAt if lastMessageAt is not available
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // Use the most recent thread ID
        requestBody.threadId = sortedThreads[0].threadId;
      } else if (
        window.VoiceroCore &&
        window.VoiceroCore.thread &&
        window.VoiceroCore.thread.threadId
      ) {
        requestBody.threadId = window.VoiceroCore.thread.threadId;
      }

      // Add website ID if available
      if (window.VoiceroCore && window.VoiceroCore.websiteId) {
        requestBody.websiteId = window.VoiceroCore.websiteId;
      }

      // Add current page URL and collect page data
      requestBody.currentPageUrl = window.location.href;

      // Collect page data for context
      requestBody.pageData = this.collectPageData();

      // Initialize pastContext array
      requestBody.pastContext = [];

      // Check if we have session thread messages available
      if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.threads &&
        window.VoiceroCore.session.threads.length > 0
      ) {
        // Find the most recent thread with the same approach
        var threads = [...window.VoiceroCore.session.threads];
        var sortedThreads = threads.sort((a, b) => {
          if (a.lastMessageAt && b.lastMessageAt) {
            return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
          }
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        var recentThread = sortedThreads[0];

        // Check if this thread has messages
        if (recentThread.messages && recentThread.messages.length > 0) {
          var threadMessages = recentThread.messages;

          // Sort messages by creation time to ensure proper order
          var sortedMessages = [...threadMessages].sort((a, b) => {
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          // Get last 5 user questions and last 5 AI responses in chronological order
          var userMessages = sortedMessages
            .filter((msg) => msg.role === "user")
            .slice(-5);

          var aiMessages = sortedMessages
            .filter((msg) => msg.role === "assistant")
            .slice(-5);

          // Combine all messages in chronological order
          var lastMessages = [...userMessages, ...aiMessages].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
          );

          // Add each message to pastContext with all metadata
          lastMessages.forEach((msg) => {
            if (msg.role === "user") {
              requestBody.pastContext.push({
                question: msg.content,
                role: "user",
                createdAt: msg.createdAt,
                pageUrl: msg.pageUrl || window.location.href,
                id: msg.id,
                threadId: msg.threadId,
              });
            } else if (msg.role === "assistant") {
              requestBody.pastContext.push({
                answer: msg.content,
                role: "assistant",
                createdAt: msg.createdAt,
                id: msg.id,
                threadId: msg.threadId,
              });
            }
          });
        }
      }
      // Fallback to local messages array if session data isn't available
      else if (this.messages && this.messages.length > 0) {
        // Get last 5 user questions and last 5 AI responses
        var userMessages = this.messages
          .filter((msg) => msg.role === "user")
          .slice(-5);

        var aiMessages = this.messages
          .filter((msg) => msg.role === "assistant")
          .slice(-5);

        // Combine all messages in chronological order
        var lastMessages = [...userMessages, ...aiMessages].sort((a, b) => {
          // Use createdAt if available, otherwise use order in array
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt) - new Date(b.createdAt);
          }
          return this.messages.indexOf(a) - this.messages.indexOf(b);
        });

        // Add each message to pastContext
        lastMessages.forEach((msg) => {
          if (msg.role === "user") {
            requestBody.pastContext.push({
              question: msg.content,
              role: "user",
              createdAt: msg.createdAt || new Date().toISOString(),
              pageUrl: msg.pageUrl || window.location.href,
              id: msg.id || this.generateId(),
            });
          } else if (msg.role === "assistant") {
            requestBody.pastContext.push({
              answer: msg.content,
              role: "assistant",
              createdAt: msg.createdAt || new Date().toISOString(),
              id: msg.id || this.generateId(),
            });
          }
        });
      }

      // Log request body for debugging
      console.log(
        "[VOICERO TEXT] Sending to /chat:",
        JSON.stringify(requestBody, null, 2),
      );

      // Try localhost first for the /shopify/hat route, then fall back to normal endpoint
      // First, attempt to use localhost:3000 with the /shopify/hat path
      return fetch("http://localhost:3000/api/shopify/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(window.voiceroConfig?.getAuthHeaders
            ? window.voiceroConfig.getAuthHeaders()
            : {}),
        },
        body: JSON.stringify(requestBody),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Local endpoint failed: ${response.status}`);
          }
          console.log("[VOICERO TEXT] Successfully used localhost endpoint");
          return response;
        })
        .catch((error) => {
          console.log(
            "[VOICERO TEXT] Localhost failed, falling back to voicero.ai:",
            error.message,
          );

          // Fallback to the original endpoint with the correct path
          return fetch("https://www.voicero.ai/api/shopify/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(window.voiceroConfig?.getAuthHeaders
                ? window.voiceroConfig.getAuthHeaders()
                : {}),
            },
            body: JSON.stringify(requestBody),
          });
        });
    },

    // Create typing indicator for AI messages

    // Set loading indicator state
    setLoadingIndicator: function (isLoading) {
      // Find loading bar in shadow DOM or regular DOM
      var getLoadingBar = () => {
        if (this.shadowRoot) {
          return this.shadowRoot.getElementById("loading-bar");
        }
        return document.getElementById("loading-bar");
      };
      var loadingBar = getLoadingBar();
      if (!loadingBar) {
        return;
      }

      if (isLoading) {
        // Show loading animation
        loadingBar.style.display = "block";
        loadingBar.style.width = "100%";
      } else {
        // Hide loading animation
        loadingBar.style.display = "none";
        loadingBar.style.width = "0%";
      }
    },

    // Send a chat message from the suggestion or input
    sendChatMessage: function (text) {
      // If no text provided, get from input field
      if (!text) {
        if (this.shadowRoot) {
          var chatInput = this.shadowRoot.getElementById("chat-input");
          if (chatInput) {
            text = chatInput.value.trim();
            chatInput.value = "";
          }
        }
      }
      // Exit if no text to send
      if (!text || text.length === 0) {
        return;
      }

      // If we're showing the welcome screen, reset the chat container first
      if (this.isShowingWelcomeScreen) {
        // Use our new helper function to reset the interface
        this.resetWelcomeScreenAndShowChat();

        // Reset the welcome screen flag
        this.isShowingWelcomeScreen = false;
      }

      // Add user message to UI
      this.addMessage(text, "user");

      // Hide suggestions if visible
      if (this.shadowRoot) {
        var suggestions = this.shadowRoot.getElementById("initial-suggestions");
        if (suggestions) {
          suggestions.style.display = "none";
        }
      }

      // Send message to API
      this.sendMessageToAPI(text);
    },

    // Send message to API (extracted for clarity)
    sendMessageToAPI: function (text) {
      // Set loading state
      this.isWaitingForResponse = true;

      // Get the send button
      let sendButton = null;
      if (this.shadowRoot) {
        sendButton = this.shadowRoot.getElementById("send-message-btn");

        // Force maintain position before any changes happen
        if (sendButton) {
          sendButton.style.cssText = `
            position: absolute !important;
            right: 12px !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 24px !important;
            height: 24px !important;
            z-index: 99999999 !important;
            pointer-events: auto !important;
          `;
        }
      }

      // Check if VoiceroWait is available and use it
      if (window.VoiceroWait) {
        // Add loading animation to send button
        if (sendButton) {
          window.VoiceroWait.addLoadingAnimation(sendButton);
        }

        // Show typing indicator in messages container
        if (this.shadowRoot) {
          // First ensure the animation styles are in the Shadow DOM
          this.ensureTypingAnimationInShadowDOM();

          var messagesContainer =
            this.shadowRoot.getElementById("chat-messages");
          if (messagesContainer) {
            this.typingIndicator =
              window.VoiceroWait.showTypingIndicator(messagesContainer);
          }
        }
      } else {
        // Fallback to classic animation if VoiceroWait is not available
        if (sendButton) {
          sendButton.classList.add("siri-active");
        }
      }

      // Function to remove typing indicator and animations
      var removeTypingIndicator = () => {
        if (window.VoiceroWait) {
          // Use VoiceroWait to hide the indicator
          window.VoiceroWait.hideTypingIndicator();

          // Remove loading animation from send button
          if (sendButton) {
            window.VoiceroWait.removeLoadingAnimation(sendButton);
          }
        } else {
          // Fallback to classic removal
          if (this.typingIndicator) {
            this.typingIndicator.remove();
            this.typingIndicator = null;
          }

          var typingElements = document.querySelectorAll(".typing-wrapper");
          typingElements.forEach((el) => el.remove());

          // Remove rainbow animation manually
          if (sendButton) {
            sendButton.classList.remove("siri-active");
          }
        }
      };

      // Send to API
      if (this.sendChatToApi) {
        this.sendChatToApi(text)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            // Turn off loading indicator
            this.setLoadingIndicator(false);

            // Remove typing indicator before showing response
            removeTypingIndicator();

            // Log the complete response data
            console.log(
              "[VOICERO TEXT] Received from /chat:",
              JSON.stringify(data, null, 2),
            );

            // Extract message from new response format
            let message = "";
            let action = null;
            let url = null;
            let actionContext = null;

            // Check if the response is a string that needs to be parsed
            if (typeof data.response === "string") {
              try {
                var parsedResponse = JSON.parse(data.response);
                message =
                  parsedResponse.answer || "Sorry, I don't have a response.";
                action = parsedResponse.action || null;
                actionContext = parsedResponse.action_context || null;
                if (action === "redirect" && actionContext?.url) {
                  url = actionContext.url;
                }
              } catch (e) {
                // If parsing fails, use the response as is
                message = data.response;
              }
            }
            // Check for the nested response object structure
            else if (data && data.response && data.response.answer) {
              message = data.response.answer;

              // Get action and check for action_context
              if (data.response.action) {
                action = data.response.action;

                // Get action_context if available
                if (data.response.action_context) {
                  actionContext = data.response.action_context;

                  // For redirect actions, get URL from action_context
                  if (action === "redirect" && actionContext.url) {
                    url = actionContext.url;
                  }
                }
              }

              // Fallback to old format if action_context is not available
              if (!url && data.response.url) {
                url = data.response.url;
              }
            }
            // Fall back to previous format with direct 'answer' field
            else if (data && data.answer) {
              message = data.answer;

              if (data.action) {
                action = data.action;

                // Get action_context if available
                if (data.action_context) {
                  actionContext = data.action_context;

                  // For redirect actions, get URL from action_context
                  if (action === "redirect" && actionContext.url) {
                    url = actionContext.url;
                  }
                }
              }

              // Fallback to old format if action_context is not available
              if (!url && data.url) {
                url = data.url;
              }
            }
            // Default fallback
            else {
              message = "I'm sorry, I couldn't process that request.";
            }

            // Add AI response to chat
            this.addMessage(message, "ai");

            // Save the thread ID if provided - AFTER receiving response
            if (data.threadId) {
              this.currentThreadId = data.threadId;

              // Update window state after receiving response
              if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
                window.VoiceroCore.updateWindowState({
                  textWelcome: false, // Don't show welcome again
                  threadId: data.threadId, // Update with the latest thread ID
                });
              }

              // Ensure VoiceroCore.thread is updated with the new thread
              if (
                window.VoiceroCore &&
                window.VoiceroCore.session &&
                window.VoiceroCore.session.threads
              ) {
                // Find the matching thread in the threads array
                var matchingThread = window.VoiceroCore.session.threads.find(
                  (thread) => thread.threadId === data.threadId,
                );

                if (matchingThread) {
                  // Update VoiceroCore.thread reference
                  window.VoiceroCore.thread = matchingThread;

                  // Update local messages array with the complete message objects
                  if (
                    matchingThread.messages &&
                    matchingThread.messages.length > 0
                  ) {
                    this.messages = matchingThread.messages.map((msg) => ({
                      ...msg,
                      content:
                        msg.role === "assistant"
                          ? this.extractAnswerFromJson(msg.content)
                          : msg.content,
                    }));
                  }
                }
              }
            }

            // Handle actions - directly pass to VoiceroActionHandler if available
            if (data.response && window.VoiceroActionHandler) {
              window.VoiceroActionHandler.handle(data.response);
            }
            // Handle redirect if needed
            if (action === "redirect" && url) {
              setTimeout(() => {
                window.location.href = url;
              }, 1000); // Small delay to let the user see the message
            }

            // Reset waiting state
            this.isWaitingForResponse = false;

            // IMPORTANT: Make sure send button is properly positioned at the end of all operations
            this.ensureSendButtonPosition();
            setTimeout(() => this.ensureSendButtonPosition(), 100);
            setTimeout(() => this.ensureSendButtonPosition(), 500);
          })
          .catch((error) => {
            // Turn off loading indicator
            this.setLoadingIndicator(false);
            // Remove typing indicator
            removeTypingIndicator();
            // Add error message
            let errorMessage =
              "I'm sorry, there was an error processing your request. Please try again later.";
            if (error.message && error.message.includes("500")) {
              errorMessage =
                "I'm sorry, but there was a server error. The website's content might not be accessible currently. Please try again in a moment.";
            }
            this.addMessage(errorMessage, "ai");
            this.isWaitingForResponse = false;

            // IMPORTANT: Make sure send button is properly positioned even after error
            this.ensureSendButtonPosition();
            setTimeout(() => this.ensureSendButtonPosition(), 100);
            setTimeout(() => this.ensureSendButtonPosition(), 500);
          });
      } else {
        // Turn off loading indicator
        this.setLoadingIndicator(false);
        // Remove typing indicator
        removeTypingIndicator();
        this.addMessage(
          "I'm sorry, I'm having trouble connecting to the server. Please try again later.",
          "ai",
        );
        this.isWaitingForResponse = false;
      }
    },

    // Send message from input field
    sendMessage: function () {
      this.sendMessageLogic();
    },

    // Create a new helper function to contain the send logic
    sendMessageLogic: function () {
      // Forward to sendChatMessage to handle the logic
      if (this.shadowRoot) {
        var chatInput = this.shadowRoot.getElementById("chat-input");
        if (chatInput) {
          var text = chatInput.value.trim();
          chatInput.value = "";
          if (text.length > 0) {
            this.sendChatMessage(text);
          }
        }
      }
    },

    // Update the sendChatMessage function to auto-maximize
    sendChatMessage: function (text) {
      this.sendChatMessageLogic(text);
    },

    // Ensure send button is correctly positioned
    ensureSendButtonPosition: function () {
      if (!this.shadowRoot) return;

      var sendButton = this.shadowRoot.getElementById("send-message-btn");
      if (sendButton) {
        sendButton.style.cssText = `
          position: absolute !important;
          right: 12px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          background: transparent !important;
          background-color: transparent !important;
          border: none !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 24px !important;
          height: 24px !important;
          z-index: 99999999 !important;
          pointer-events: auto !important;
        `;
      }
    },

    // Create a new helper function for sendChatMessage logic
    sendChatMessageLogic: function (text) {
      // If no text provided, get from input field
      if (!text) {
        if (this.shadowRoot) {
          var chatInput = this.shadowRoot.getElementById("chat-input");
          if (chatInput) {
            text = chatInput.value.trim();
            chatInput.value = "";

            // Ensure send button position after clearing input
            this.ensureSendButtonPosition();
          }
        }
      }
      // Exit if no text to send
      if (!text || text.length === 0) {
        return;
      }

      // Force maximize the chat window
      this.maximizeChat();

      // Add user message to UI
      this.addMessage(text, "user");

      // Hide suggestions if visible
      if (this.shadowRoot) {
        var suggestions = this.shadowRoot.getElementById("initial-suggestions");
        if (suggestions) {
          suggestions.style.display = "none";
        }
      }

      // Send message to API
      this.sendMessageToAPI(text);
    },

    // Close the text chat interface
    closeTextChat: function () {
      console.log("VoiceroText: Closing text chat");

      // CRITICAL: Prevent infinite loop with core
      if (this._isClosingTextChat === true) {
        console.log("VoiceroText: Already closing text chat, preventing loop");
        return;
      }

      // Set closing flags
      this._isClosingTextChat = true;
      this.isClosingTextChat = true;

      // CRITICAL: Don't block close operations
      // If we're waiting for response, we will still proceed with closing
      if (this.isWaitingForResponse) {
        console.log(
          "VoiceroText: Warning - closing while API response is pending",
        );
        // Continue with closing
      }

      this.isSessionOperationInProgress = true;
      this.lastSessionOperationTime = Date.now();

      // Store reference to this for callbacks
      var self = this;

      // First create reliable references to the elements we need
      var textInterface = document.getElementById("text-chat-interface");
      var shadowHost = document.getElementById("voicero-text-chat-container");

      // Do NOT update window state from here - VoiceroCore should handle it
      // This prevents infinite loops between components

      // Reset flags after a small delay
      setTimeout(() => {
        // Reset all flags
        self.isSessionOperationInProgress = false;
        self.isClosingTextChat = false;
        self._isClosingTextChat = false;

        // Then ensure core button is visible
        if (window.VoiceroCore && window.VoiceroCore.ensureMainButtonVisible) {
          window.VoiceroCore.ensureMainButtonVisible();
        }
      }, 300);

      // IMPORTANT: Store the shadow DOM reference to avoid it being garbage collected
      if (!this._cachedShadowRoot && this.shadowRoot) {
        this._cachedShadowRoot = this.shadowRoot;
      }

      // Hide both the interface and shadow host with more aggressive styling
      if (textInterface) {
        textInterface.style.cssText = `
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
          position: absolute !important;
          z-index: -1 !important;
        `;
      }
      if (shadowHost) {
        shadowHost.style.cssText = `
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
          position: absolute !important;
          z-index: -1 !important;
        `;
      }

      // Add multiple redundant attempts to ensure the chat is closed
      setTimeout(() => {
        if (shadowHost) {
          shadowHost.style.cssText = `
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          `;
        }
      }, 100);

      // Also attempt to show the main button with a delay
      setTimeout(() => {
        if (window.VoiceroCore) {
          window.VoiceroCore.ensureMainButtonVisible();
        }
      }, 200);
    },

    // Minimize the chat interface
    minimizeChat: function () {
      var now = Date.now();
      if (
        !this._isChatVisible ||
        now - this._lastChatToggle < this.CHAT_TOGGLE_DEBOUNCE_MS
      ) {
        return; // either already minimized or called too soon
      }

      // Check if session operations are in progress
      if (
        window.VoiceroCore &&
        window.VoiceroCore.isSessionBusy &&
        window.VoiceroCore.isSessionBusy()
      ) {
        console.log(
          "VoiceroText: Cannot minimize - session operation in progress",
        );
        return;
      }

      // Set busy flag
      this.isSessionOperationInProgress = true;
      this.lastSessionOperationTime = Date.now();

      this._lastChatToggle = now;
      this._isChatVisible = false;

      // Store reference to this for callbacks
      var self = this;

      // Update window state first (text open but window down)
      if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
        var updateResult = window.VoiceroCore.updateWindowState({
          textOpen: true,
          textOpenWindowUp: false, // Set to false when minimized
          coreOpen: false,
          voiceOpen: false,
          voiceOpenWindowUp: false,
        });

        // Check if updateResult is a Promise
        if (updateResult && typeof updateResult.finally === "function") {
          updateResult.finally(() => {
            // Reset busy flag after operation completes
            self.isSessionOperationInProgress = false;
          });
        } else {
          // If not a Promise, just reset the flag
          self.isSessionOperationInProgress = false;
        }
      } else {
        // Reset busy flag if VoiceroCore isn't available
        this.isSessionOperationInProgress = false;
      }

      // Get the necessary elements from shadow root
      var shadowRoot = document.getElementById(
        "voicero-text-chat-container",
      )?.shadowRoot;
      if (!shadowRoot) return;

      var messagesContainer = shadowRoot.getElementById("chat-messages");
      var headerContainer = shadowRoot.getElementById("chat-controls-header");
      var inputWrapper = shadowRoot.getElementById("chat-input-wrapper");
      var maximizeBtn = shadowRoot.getElementById("maximize-chat");

      // Make the maximize button visible first
      if (maximizeBtn) {
        // Important: Force visible the maximize button with fixed positioning
        maximizeBtn.style.display = "block";
        maximizeBtn.style.position = "fixed";
        maximizeBtn.style.bottom = "100px";
        maximizeBtn.style.right = "20px"; // Position from right side
        maximizeBtn.style.left = "auto"; // Remove left positioning
        maximizeBtn.style.transform = "none"; // Remove centering transform
        maximizeBtn.style.zIndex = "9999999";

        // Ensure the button's style is applied correctly
        var maximizeButton = maximizeBtn.querySelector("button");
        if (maximizeButton) {
          // Reapply the main styling to ensure it's consistent
          maximizeButton.style.position = "relative";
          maximizeButton.style.background = this.websiteColor || "#882be6"; // Use the dynamic website color
          maximizeButton.style.border = "none";
          maximizeButton.style.color = "white";
          maximizeButton.style.padding = "10px 20px";
          maximizeButton.style.borderRadius = "20px 20px 0 0";
          maximizeButton.style.fontSize = "14px";
          maximizeButton.style.fontWeight = "500";
          maximizeButton.style.cursor = "pointer";
          maximizeButton.style.display = "flex";
          maximizeButton.style.alignItems = "center";
          maximizeButton.style.justifyContent = "center";
          maximizeButton.style.minWidth = "160px";
          maximizeButton.style.marginBottom = "-30px"; // Updated to match the HTML creation
          maximizeButton.style.height = "40px";
          maximizeButton.style.overflow = "visible";
          maximizeButton.style.boxShadow = "none";
          maximizeButton.style.width = "auto";
        }
      }

      if (messagesContainer) {
        // Hide all message content
        var allMessages = messagesContainer.querySelectorAll(
          ".user-message, .ai-message, #initial-suggestions",
        );
        allMessages.forEach((msg) => {
          msg.style.display = "none";
        });

        // Just adjust maxHeight and opacity without removing from DOM
        messagesContainer.style.maxHeight = "0";
        messagesContainer.style.minHeight = "0";
        messagesContainer.style.height = "0";
        messagesContainer.style.padding = "0";
        messagesContainer.style.margin = "0";
        messagesContainer.style.overflow = "hidden";
        messagesContainer.style.border = "none";
        messagesContainer.style.opacity = "0"; // Make fully transparent
        messagesContainer.style.borderRadius = "0"; // Remove any border radius

        // Also hide padding container inside
        var paddingContainer = messagesContainer.querySelector(
          "div[style*='padding-top']",
        );
        if (paddingContainer) {
          paddingContainer.style.display = "none";
          paddingContainer.style.height = "0";
          paddingContainer.style.padding = "0";
          paddingContainer.style.margin = "0";
        }
      }

      // Hide the header when minimized
      if (headerContainer) {
        headerContainer.style.display = "none";
      }

      // Adjust input wrapper using the helper function
      this.updateChatContainerBorderRadius(true);

      // Additional styles for minimized state
      if (inputWrapper) {
        inputWrapper.style.marginTop = "40px"; // Add space above the input wrapper for the button
        inputWrapper.style.position = "relative";
      }
    },

    // Maximize the chat interface
    maximizeChat: function () {
      var now = Date.now();
      if (
        this._isChatVisible ||
        now - this._lastChatToggle < this.CHAT_TOGGLE_DEBOUNCE_MS
      ) {
        return; // either already maximized or called too soon
      }

      // Check if session operations are in progress
      if (
        window.VoiceroCore &&
        window.VoiceroCore.isSessionBusy &&
        window.VoiceroCore.isSessionBusy()
      ) {
        console.log(
          "VoiceroText: Cannot maximize - session operation in progress",
        );
        return;
      }

      // Set busy flag
      this.isSessionOperationInProgress = true;
      this.lastSessionOperationTime = Date.now();

      this._lastChatToggle = now;
      this._isChatVisible = true;

      // Store reference to this for callbacks
      var self = this;

      // Update window state first (text open with window up)
      if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
        var updateResult = window.VoiceroCore.updateWindowState({
          textOpen: true,
          textOpenWindowUp: true, // Set to true when maximized
          coreOpen: false,
          voiceOpen: false,
          voiceOpenWindowUp: false,
        });

        // Check if updateResult is a Promise
        if (updateResult && typeof updateResult.finally === "function") {
          updateResult.finally(() => {
            // Reset busy flag after operation completes
            self.isSessionOperationInProgress = false;
          });
        } else {
          // If not a Promise, just reset the flag
          self.isSessionOperationInProgress = false;
        }
      } else {
        // Reset busy flag if VoiceroCore isn't available
        this.isSessionOperationInProgress = false;
      }

      // Get the necessary elements from shadow root
      var shadowRoot = document.getElementById(
        "voicero-text-chat-container",
      )?.shadowRoot;
      if (!shadowRoot) return;

      var messagesContainer = shadowRoot.getElementById("chat-messages");
      var headerContainer = shadowRoot.getElementById("chat-controls-header");
      var inputWrapper = shadowRoot.getElementById("chat-input-wrapper");
      var maximizeBtn = shadowRoot.getElementById("maximize-chat");

      // Hide maximize button first
      if (maximizeBtn) {
        maximizeBtn.style.display = "none";
      }

      if (messagesContainer) {
        // Restore proper scrolling functionality
        messagesContainer.style.maxHeight = "33vh";
        messagesContainer.style.minHeight = "auto";
        messagesContainer.style.height = "auto";
        messagesContainer.style.padding = "10px"; // Reduced padding
        messagesContainer.style.paddingBottom = "70px"; // Extra padding for input box
        messagesContainer.style.margin = "0";
        messagesContainer.style.overflow = "auto";
        messagesContainer.style.overflowY = "scroll";
        messagesContainer.style.border = "";
        messagesContainer.style.opacity = "1";
        messagesContainer.style.borderRadius = "0"; // Square corners for maximized view

        // Remove padding-top container that could cause floating space
        var paddingContainer = messagesContainer.querySelector(
          "div[style*='padding-top']",
        );
        if (paddingContainer) {
          paddingContainer.style.paddingTop = "0";
          paddingContainer.style.marginTop = "0";
        }

        // Show all message content
        var allMessages = messagesContainer.querySelectorAll(
          ".user-message, .ai-message",
        );
        allMessages.forEach((msg) => {
          msg.style.display = "flex";
        });

        // Scroll to bottom after maximizing
        setTimeout(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
      }

      // Show the header with square corners
      if (headerContainer) {
        headerContainer.style.display = "flex";
        headerContainer.style.zIndex = "9999999";
        headerContainer.style.borderRadius = "0"; // Square corners for maximized view
      }

      // Restore input wrapper using the helper function
      this.updateChatContainerBorderRadius(false);

      // Additional styles for maximized state
      if (inputWrapper) {
        inputWrapper.style.marginTop = "0";
        inputWrapper.style.backgroundColor = "white";
        inputWrapper.style.boxShadow = "0 -2px 10px rgba(0, 0, 0, 0.05)";
        inputWrapper.style.zIndex = "999999";
      }
    },

    // Add message to the chat interface (used for both user and AI messages)
    addMessage: function (
      text,
      role,
      skipAddToMessages = false,
      isInitial = false,
    ) {
      if (!text) return;

      // Format message if needed
      if (
        window.VoiceroCore &&
        window.VoiceroCore.formatMarkdown &&
        role === "ai"
      ) {
        text = window.VoiceroCore.formatMarkdown(text);
      }

      // Create message element
      var messageDiv = document.createElement("div");
      messageDiv.className = role === "user" ? "user-message" : "ai-message";

      // Generate a unique ID for this message
      var messageId =
        "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      messageDiv.dataset.messageId = messageId;

      // Create message content
      var contentDiv = document.createElement("div");
      contentDiv.className = "message-content";

      // For AI messages, we need special handling to add the icon
      if (role === "ai") {
        // Set position relative for the content div
        contentDiv.style.position = "relative";

        // First set the formatted content
        contentDiv.innerHTML = this.formatContent(text);

        // Now create the icon
        var iconContainer = document.createElement("div");
        iconContainer.className = "ai-icon-container";
        iconContainer.style.cssText = `
          position: absolute;
          top: -15px;
          left: -15px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          overflow: hidden;
          z-index: 9999;
          background: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          border: 2px solid white;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        `;

        // Get the icon path
        var iconSrc = "";

        // First try to use the extension URL from scripts
        var scripts = document.querySelectorAll("script");
        for (var i = 0; i < scripts.length; i++) {
          var src = scripts[i].src || "";
          if (src.includes("voicero-") || src.includes("voicero/")) {
            iconSrc = src.substring(0, src.lastIndexOf("/") + 1) + "icon.png";
            break;
          }
        }

        // If still no icon, look in existing images on page
        if (!iconSrc) {
          var imgElements = document.querySelectorAll("img");
          for (var i = 0; i < imgElements.length; i++) {
            var imgSrc = imgElements[i].src || "";
            if (imgSrc.includes("icon.png") || imgSrc.includes("suvi")) {
              iconSrc = imgSrc;
              console.log("Found icon in page:", iconSrc);
              break;
            }
          }
        }

        // If still no icon, use a fallback
        if (!iconSrc) {
          iconSrc = "./icon.png";
        }

        var icon = document.createElement("img");
        icon.src = iconSrc;
        icon.alt = "Suvi";
        icon.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        `;

        iconContainer.appendChild(icon);
        contentDiv.appendChild(iconContainer);

        console.log("Added icon to new AI message:", iconSrc);
      } else if (role === "user") {
        contentDiv.innerHTML = text;

        // Apply the main color to user messages - use website color directly
        contentDiv.style.backgroundColor = this.websiteColor || "#882be6";

        // Add delivery status for user messages (iPhone-style) with fixed positioning
        var statusDiv = document.createElement("div");
        statusDiv.className = "read-status";
        statusDiv.textContent = "Delivered";
        statusDiv.style.cssText =
          "position: absolute; right: 8px; bottom: -20px; font-size: 11px; color: #8e8e93;";
        messageDiv.appendChild(statusDiv);
      } else {
        contentDiv.innerHTML = text;
      }

      if (isInitial) {
        contentDiv.style.background = "#e5e5ea";
        contentDiv.style.color = "#333";
        contentDiv.style.textAlign = "center";
        contentDiv.style.margin = "15px auto";
        contentDiv.style.width = "80%";
        contentDiv.style.borderRadius = "18px";
        messageDiv.style.justifyContent = "center";

        if (text.includes("voice-prompt")) {
          // Extract the actual text content
          var tempDiv = document.createElement("div");
          tempDiv.innerHTML = text;
          var promptContent = tempDiv.querySelector(".voice-prompt");
          if (promptContent) {
            var promptText = promptContent.textContent.trim();
            contentDiv.innerHTML = promptText;
          }
        }
      }

      // Add to message div if it hasn't been added yet
      if (!messageDiv.querySelector(".message-content")) {
        messageDiv.appendChild(contentDiv);
      }

      // Add to messages container in both shadow DOM and regular DOM
      if (this.shadowRoot) {
        var messagesContainer = this.shadowRoot.getElementById("chat-messages");
        if (messagesContainer) {
          // Find the initial suggestions div
          var initialSuggestions = messagesContainer.querySelector(
            "#initial-suggestions",
          );

          // Hide suggestions when adding real messages
          if (initialSuggestions && !isInitial) {
            initialSuggestions.style.display = "none";
          }

          // Insert new message before the input wrapper
          messagesContainer.appendChild(messageDiv);

          // Update all previous user message statuses to "Read" after AI responds
          if (role === "ai") {
            var userStatusDivs =
              messagesContainer.querySelectorAll(".read-status");
            userStatusDivs.forEach((div) => {
              div.textContent = "Read";
              div.style.color = this.websiteColor || "#882be6";
              // Ensure consistent positioning
              div.style.cssText = `position: absolute; right: 8px; bottom: -20px; font-size: 11px; color: ${this.websiteColor || "#882be6"};`;
            });
          }

          // Scroll to bottom
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }

      // Store message in history unless skipping
      if (!skipAddToMessages) {
        this.messages = this.messages || [];
        this.messages.push({
          role: role === "user" ? "user" : "assistant",
          content: text,
        });

        // Update VoiceroCore state if available
      }

      if (role === "ai" && !isInitial) {
        try {
          // Try three different methods to ensure the report button gets added

          // Method 1: Direct call to processAIMessage if available
          if (
            window.VoiceroSupport &&
            typeof window.VoiceroSupport.processAIMessage === "function"
          ) {
            // Small delay to ensure the message is fully rendered
            setTimeout(() => {
              window.VoiceroSupport.processAIMessage(messageDiv, "text");
            }, 50);
          }
          // Method 2: Call attachReportButtonToMessage directly
          else if (
            window.VoiceroSupport &&
            typeof window.VoiceroSupport.attachReportButtonToMessage ===
              "function"
          ) {
            // Small delay to ensure the message is fully rendered
            setTimeout(() => {
              window.VoiceroSupport.attachReportButtonToMessage(
                messageDiv,
                "text",
              );
            }, 50);
          }
          // Method 3: Force-adding the button directly
          else {
            setTimeout(() => {
              // If VoiceroSupport is not available, create a basic report button ourselves
              if (!messageDiv.querySelector(".voicero-report-button")) {
                var reportButton = document.createElement("div");
                reportButton.className = "voicero-report-button";
                reportButton.innerHTML = "Report an AI problem";
                reportButton.style.cssText = `
                  font-size: 12px;
                  color: #888;
                  margin-top: 10px;
                  text-align: right;
                  cursor: pointer;
                  text-decoration: underline;
                  display: block;
                  opacity: 0.8;
                `;

                // Find the content container or use direct message
                var contentContainer =
                  messageDiv.querySelector(".message-content");
                if (contentContainer) {
                  contentContainer.appendChild(reportButton);
                } else {
                  messageDiv.appendChild(reportButton);
                }
              }
            }, 100);
          }
        } catch (e) {
          console.error("Failed to attach report button:", e);
        }
      }

      return messageDiv;
    },

    // Create isolated chat frame if not exists
    createIsolatedChatFrame: function () {
      // Implementation will be added here
      this.createChatInterface();
    },

    // Set up event listeners for the chat interface
    setupEventListeners: function () {
      if (!this.shadowRoot) return;

      // Get input field and send button
      var chatInput = this.shadowRoot.getElementById("chat-input");
      var sendButton = this.shadowRoot.getElementById("send-message-btn");

      if (chatInput && sendButton) {
        // Clear existing event listeners if any
        chatInput.removeEventListener("keydown", this._handleInputKeydown);
        sendButton.removeEventListener("click", this._handleSendClick);

        // Remove Siri-like effect on focus since we only want it when generating response
        chatInput.removeEventListener("focus", this._handleInputFocus);
        chatInput.removeEventListener("blur", this._handleInputBlur);
        chatInput.removeEventListener("input", this._handleInputChange);

        // Store bound functions for event cleanup
        this._handleInputKeydown = (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        };

        this._handleSendClick = () => {
          this.sendMessage();
        };

        // Add event listeners
        chatInput.addEventListener("keydown", this._handleInputKeydown);
        sendButton.addEventListener("click", this._handleSendClick);

        // Focus the input field
        setTimeout(() => {
          chatInput.focus();
        }, 200);
      }
    },

    // Get color variants from a hex color
    getColorVariants: function (color) {
      // Use the shared utility function instead of duplicating the code
      if (window.VoiceroColor && window.VoiceroColor.getColorVariants) {
        this.colorVariants = window.VoiceroColor.getColorVariants(color);
        return this.colorVariants;
      }

      // Fallback implementation if utility isn't loaded
      if (!color) color = this.websiteColor || "#882be6";

      // Initialize with the main color
      var variants = {
        main: color,
        light: color,
        dark: color,
        superlight: color,
        superdark: color,
      };

      // If it's a hex color, we can calculate variants
      if (color.startsWith("#")) {
        try {
          // Convert hex to RGB for variants
          var r = parseInt(color.slice(1, 3), 16);
          var g = parseInt(color.slice(3, 5), 16);
          var b = parseInt(color.slice(5, 7), 16);

          // Create variants by adjusting brightness
          var lightR = Math.min(255, Math.floor(r * 1.2));
          var lightG = Math.min(255, Math.floor(g * 1.2));
          var lightB = Math.min(255, Math.floor(b * 1.2));

          var darkR = Math.floor(r * 0.8);
          var darkG = Math.floor(g * 0.8);
          var darkB = Math.floor(b * 0.8);

          var superlightR = Math.min(255, Math.floor(r * 1.5));
          var superlightG = Math.min(255, Math.floor(g * 1.5));
          var superlightB = Math.min(255, Math.floor(b * 1.5));

          var superdarkR = Math.floor(r * 0.6);
          var superdarkG = Math.floor(g * 0.6);
          var superdarkB = Math.floor(b * 0.6);

          // Convert back to hex
          variants.light = `#${lightR.toString(16).padStart(2, "0")}${lightG
            .toString(16)
            .padStart(2, "0")}${lightB.toString(16).padStart(2, "0")}`;
          variants.dark = `#${darkR.toString(16).padStart(2, "0")}${darkG
            .toString(16)
            .padStart(2, "0")}${darkB.toString(16).padStart(2, "0")}`;
          variants.superlight = `#${superlightR
            .toString(16)
            .padStart(2, "0")}${superlightG
            .toString(16)
            .padStart(2, "0")}${superlightB.toString(16).padStart(2, "0")}`;
          variants.superdark = `#${superdarkR
            .toString(16)
            .padStart(2, "0")}${superdarkG
            .toString(16)
            .padStart(2, "0")}${superdarkB.toString(16).padStart(2, "0")}`;
        } catch (e) {
          // Fallback to default variants
          variants.light = "#9370db";
          variants.dark = "#7a5abf";
          variants.superlight = "#d5c5f3";
          variants.superdark = "#5e3b96";
        }
      }

      this.colorVariants = variants;
      return variants;
    },

    // Helper methods for color variations
    colorLighter: function (color) {
      return window.VoiceroColor && window.VoiceroColor.colorLighter
        ? window.VoiceroColor.colorLighter(color)
        : !color
          ? "#d5c5f3"
          : !color.startsWith("#")
            ? color
            : "#d5c5f3";
    },

    colorLight: function (color) {
      return window.VoiceroColor && window.VoiceroColor.colorLight
        ? window.VoiceroColor.colorLight(color)
        : !color
          ? "#9370db"
          : !color.startsWith("#")
            ? color
            : "#9370db";
    },

    colorDark: function (color) {
      return window.VoiceroColor && window.VoiceroColor.colorDark
        ? window.VoiceroColor.colorDark(color)
        : !color
          ? "#7a5abf"
          : !color.startsWith("#")
            ? color
            : "#7a5abf";
    },

    colorDarker: function (color) {
      return window.VoiceroColor && window.VoiceroColor.colorDarker
        ? window.VoiceroColor.colorDarker(color)
        : !color
          ? "#5e3b96"
          : !color.startsWith("#")
            ? color
            : "#5e3b96";
    },

    adjustColor: function (color, adjustment) {
      return window.VoiceroColor && window.VoiceroColor.adjustColor
        ? window.VoiceroColor.adjustColor(color, adjustment)
        : !color
          ? "#ff4444"
          : !color.startsWith("#")
            ? color
            : "#ff4444";
    },

    // Collect page data for better context
    collectPageData: function () {
      // Use the shared utility function instead of duplicating the code
      return window.VoiceroPageData
        ? window.VoiceroPageData.collectPageData()
        : // Fallback implementation in case the utility isn't loaded
          {
            url: window.location.href,
            full_text: document.body.innerText.trim(),
            buttons: [],
            forms: [],
            sections: [],
            images: [],
          };
    },

    // Toggle functionality removed - text interface only

    // Format content with potential links
    formatContent: function (text) {
      if (!text) return "";

      // Check if text already contains HTML elements (like our welcome-question spans)
      var containsHtml = /<[a-z][\s\S]*>/i.test(text);

      if (containsHtml) {
        // If it already has HTML, just return it (our spans are already formatted)
        return text;
      }

      // Process URLs
      var urlRegex = /(https?:\/\/[^\s]+)/g;
      var processedText = text.replace(
        urlRegex,
        '<a href="$1" target="_blank" class="chat-link">$1</a>',
      );

      // Process markdown-style bold text
      let formattedText = processedText.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>",
      );

      // Process markdown-style italic text
      formattedText = formattedText.replace(/\*(.*?)\*/g, "<em>$1</em>");

      // Replace line breaks
      formattedText = formattedText.replace(/\n/g, "<br>");

      return formattedText;
    },

    // Show contact form in the chat interface
    showContactForm: function () {
      // Check if VoiceroContact module is available
      if (
        window.VoiceroContact &&
        typeof window.VoiceroContact.showContactForm === "function"
      ) {
        window.VoiceroContact.showContactForm();
      } else {
        console.error("VoiceroContact module not available");

        // Fallback: Display a message that contact form is not available
        this.addMessage(
          "I'm sorry, the contact form is not available right now. Please try again later or contact us directly.",
          "ai",
        );
      }
    },

    // Check if session operations are in progress
    isSessionBusy: function () {
      // If a session operation is explicitly marked as in progress
      if (this.isSessionOperationInProgress) {
        // Check if it's been too long (might be stuck)
        var currentTime = Date.now();
        var timeSinceLastOperation =
          currentTime - this.lastSessionOperationTime;

        if (timeSinceLastOperation > this.sessionOperationTimeout) {
          console.warn(
            "VoiceroText: Session operation timeout exceeded, resetting flag",
          );
          this.isSessionOperationInProgress = false;
          return false;
        }

        // CRITICAL: Reset flag if we're closing the text chat
        // This ensures we can always close when needed, even if another operation is in progress
        if (this.isClosingTextChat) {
          console.log(
            "VoiceroText: Resetting session busy flag for close operation",
          );
          this.isSessionOperationInProgress = false;
          return false;
        }

        return true;
      }

      // Also check if waiting for API response, but allow close operations
      if (this.isWaitingForResponse && !this.isClosingTextChat) {
        console.log("VoiceroText: Session busy - waiting for API response");
        return true;
      }

      return false;
    },

    // New helper function to ensure consistent border radius styles
    updateChatContainerBorderRadius: function (isMinimized) {
      if (!this.shadowRoot) return;

      var inputWrapper = this.shadowRoot.getElementById("chat-input-wrapper");
      if (!inputWrapper) return;

      // Get the inner container
      var innerWrapper = inputWrapper.querySelector("div");
      if (!innerWrapper) return;

      if (isMinimized) {
        // Full border radius for minimized state
        inputWrapper.style.borderRadius = "12px";
        innerWrapper.style.borderRadius = "10px";
      } else {
        // Bottom-only border radius for maximized state
        inputWrapper.style.borderRadius = "0 0 12px 12px";
        innerWrapper.style.borderRadius = "0 0 10px 10px";

        // Make sure messages container has square corners in maximized mode
        var messagesContainer = this.shadowRoot.getElementById("chat-messages");
        if (messagesContainer) {
          messagesContainer.style.borderRadius = "0 0 0 0"; // Square corners on top
        }

        // Ensure header has rounded corners at top
        var headerContainer = this.shadowRoot.getElementById(
          "chat-controls-header",
        );
        if (headerContainer) {
          headerContainer.style.borderRadius = "12px 12px 0 0 !important";
          headerContainer.style.overflow = "hidden"; // Ensure the border radius is visible
        }
      }
    },

    // Ensure typing animation keyframes are in Shadow DOM
    ensureTypingAnimationInShadowDOM: function () {
      if (!this.shadowRoot) return;

      // Check if animation styles already exist
      if (!this.shadowRoot.getElementById("voicero-typing-styles")) {
        console.log("Adding typing animation keyframes to Shadow DOM");

        // Create style element for Shadow DOM
        var styleEl = document.createElement("style");
        styleEl.id = "voicero-typing-styles";
        styleEl.textContent = `
          @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-6px); }
          }
          
          /* Ensure the typing dots have animation styling */
          .typing-dot {
            animation: typingBounce 1s infinite;
          }
          
          .typing-dot:nth-child(2) {
            animation-delay: 0.2s;
          }
          
          .typing-dot:nth-child(3) {
            animation-delay: 0.4s;
          }
        `;

        // Add to shadow DOM
        this.shadowRoot.appendChild(styleEl);
      }
    },

    // Check if there are any AI messages in the chat
    hasAiMessages: function () {
      // CRITICAL: If welcome screen is already showing or in progress, don't trigger another check
      if (window.voiceroWelcomeInProgress || this.isShowingWelcomeScreen) {
        console.log(
          "VoiceroText: Welcome already in progress, skipping AI message check",
        );
        return true; // Return true to prevent welcome screen from showing
      }

      console.log("VoiceroText: Checking if there are any AI messages");

      // IMPORTANT: First check VoiceroCore.thread for messages
      if (
        window.VoiceroCore &&
        window.VoiceroCore.thread &&
        window.VoiceroCore.thread.messages &&
        window.VoiceroCore.thread.messages.length > 0
      ) {
        const hasAiMsg = window.VoiceroCore.thread.messages.some(
          (msg) => msg.role === "assistant" || msg.role === "ai",
        );

        console.log(
          "VoiceroText: VoiceroCore.thread has AI messages:",
          hasAiMsg,
        );
        if (hasAiMsg) return true;
      }

      // Check internal messages array as fallback
      if (this.messages && this.messages.length > 0) {
        const hasAiMsg = this.messages.some(
          (msg) => msg.role === "assistant" || msg.role === "ai",
        );
        console.log("VoiceroText: Messages array has AI messages:", hasAiMsg);
        return hasAiMsg;
      }

      // Also check DOM if available
      if (this.shadowRoot) {
        var messagesContainer = this.shadowRoot.getElementById("chat-messages");
        if (messagesContainer) {
          const aiElements = messagesContainer.querySelectorAll(".ai-message");
          console.log(
            "VoiceroText: DOM has AI messages:",
            aiElements.length > 0,
          );

          // Check if these are real AI messages or just the welcome fallback
          if (aiElements.length > 0) {
            // If any message has content that's not just the fallback welcome message, count it as a real AI message
            for (let i = 0; i < aiElements.length; i++) {
              const msgContent = aiElements[i].textContent || "";
              // Skip counting the fallback welcome message as a real AI message
              if (
                !msgContent.includes(
                  "Hi there! I'm Suvi, an AI Sales Rep. How can I help you today?",
                )
              ) {
                return true;
              }
            }
            // If we only found the fallback welcome message, don't count it
            return false;
          }
          return false;
        }
      }

      console.log("VoiceroText: No AI messages found");
      return false;
    },

    // Reset the welcome screen and show the chat interface
    resetWelcomeScreenAndShowChat: function () {
      console.log(
        "VoiceroText: Resetting welcome screen and showing chat interface",
      );

      // CRITICAL: First remove any existing welcome container
      const existingWelcome = document.getElementById(
        "voicero-welcome-container",
      );
      if (existingWelcome) {
        existingWelcome.remove();
      }

      // IMPORTANT: Make sure the text chat container is visible with proper positioning
      const textChatContainer = document.getElementById(
        "voicero-text-chat-container",
      );
      if (textChatContainer) {
        textChatContainer.style.cssText = `
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          height: auto !important;
          width: 400px !important; 
          z-index: 9999999 !important;
          border-radius: 12px !important;
          position: fixed !important;
          right: 20px !important;
          bottom: 20px !important;
          left: auto !important;
          transform: none !important;
          max-width: 450px !important;
          min-width: 320px !important;
          overflow: hidden !important;
          max-height: none !important;
        `;
      }

      // Make sure we open the text chat interface
      this.openTextChat();

      // Wait for shadowRoot to be available after openTextChat
      setTimeout(() => {
        if (!this.shadowRoot) return;

        // Reset the container
        var messagesContainer = this.shadowRoot.getElementById("chat-messages");
        if (messagesContainer) {
          messagesContainer.innerHTML = "";

          // Remove the padding container creation to avoid floating space

          // Restore messages container styling
          messagesContainer.style.cssText = `
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
            padding: 10px !important; 
            padding-bottom: 70px !important; 
            margin: 0 !important;
            background-color: #f2f2f7 !important;
            border-radius: 0 !important;
            transition: opacity 0.25s ease !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            height: 350px !important;
            max-height: 350px !important;
            min-height: 350px !important;
            position: relative !important;
            `;
        }

        // Show the control buttons
        var headerContainer = this.shadowRoot.getElementById(
          "chat-controls-header",
        );
        if (headerContainer) {
          headerContainer.style.display = "flex";

          var clearBtn = headerContainer.querySelector("#clear-text-chat");
          var closeBtn = headerContainer.querySelector("#close-text-chat");

          if (clearBtn) {
            clearBtn.style.display = "block";
          }

          if (closeBtn && closeBtn.parentNode) {
            closeBtn.parentNode.style.display = "flex";
          }
        }

        // Show the chat input wrapper but keep it styled properly
        var chatInputWrapper =
          this.shadowRoot.getElementById("chat-input-wrapper");
        if (chatInputWrapper) {
          chatInputWrapper.style.display = "block";
        }

        // Update window state to ensure text interface is open - SIMPLIFIED to only use textOpen
        if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
          window.VoiceroCore.updateWindowState({
            textOpen: true,
          });
        }
      }, 100);
    },

    // Show initial welcome screen with buttons
    showWelcomeScreen: function () {
      console.log("VoiceroText: Showing welcome screen");

      // CRITICAL: Check for infinite recursion prevention flag
      if (window.voiceroWelcomeInProgress) {
        console.log(
          "VoiceroText: Welcome creation already in progress, skipping to prevent recursion",
        );
        return;
      }

      // Check if VoiceroWelcome module is available
      if (
        window.VoiceroWelcome &&
        typeof window.VoiceroWelcome.showWelcomeScreen === "function"
      ) {
        console.log("VoiceroText: Using VoiceroWelcome module");

        // Set recursion prevention flag
        window.voiceroWelcomeInProgress = true;

        // Call the welcome module with our shadow root
        window.VoiceroWelcome.showWelcomeScreen(this.shadowRoot);

        // Set our local flag to indicate welcome screen is showing
        this.isShowingWelcomeScreen = true;

        // Reset prevention flag after a delay
        setTimeout(() => {
          window.voiceroWelcomeInProgress = false;
        }, 500);

        return;
      }

      // Fallback to old implementation if welcome module isn't available
      if (!this.shadowRoot) return;

      var messagesContainer = this.shadowRoot.getElementById("chat-messages");
      if (!messagesContainer) return;

      console.warn(
        "VoiceroText: VoiceroWelcome module not found, using fallback welcome screen",
      );

      // Clear existing content
      messagesContainer.innerHTML = "";

      // Create a simple welcome message as fallback
      var welcomeMessage = document.createElement("div");
      welcomeMessage.className = "ai-message fallback-welcome";
      welcomeMessage.innerHTML = `
        <div class="message-content">
          <p>Hi there! I'm Suvi, an AI Sales Rep. How can I help you today?</p>
        </div>
      `;

      messagesContainer.appendChild(welcomeMessage);

      // Store flag that we're showing welcome screen
      this.isShowingWelcomeScreen = true;
    },
  };
})(window, document);
