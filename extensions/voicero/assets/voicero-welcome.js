/**
 * VoiceroAI Welcome Module
 * Handles welcome screen functionality
 */

// Use IIFE to avoid global variable conflicts
(function (window, document) {
  // Set up global variable to track interaction type
  window.voiceroInteractionType = "noneSpecified";

  // Add global flag to prevent infinite recursion
  window.voiceroWelcomeInProgress = false;

  // Check if VoiceroWelcome already exists to prevent redeclaration
  if (window.VoiceroWelcome) {
    console.log("VoiceroWelcome: Already defined, not redefining");
    return;
  }

  // Helper function to check if there are existing thread messages
  var checkForThreadMessages = function () {
    console.log("VoiceroWelcome: Checking for existing thread messages");

    // Check if we're in chat mode - if so, don't show welcome screen
    console.log("VoiceroWelcome: Chat mode flag =", window.voiceroInChatMode);
    if (window.voiceroInChatMode === true) {
      console.log(
        "VoiceroWelcome: Already in chat mode, skipping welcome screen",
      );
      return true; // Pretend we have messages to prevent welcome screen
    }

    // Check if chat container already exists
    var chatContainer = document.getElementById("voicero-chat-container");
    if (chatContainer) {
      console.log(
        "VoiceroWelcome: Chat container already exists, skipping welcome screen",
      );
      return true;
    }

    // Check if VoiceroCore has thread messages
    if (
      window.VoiceroCore &&
      window.VoiceroCore.session &&
      window.VoiceroCore.session.threads &&
      window.VoiceroCore.session.threads.length > 0 &&
      window.VoiceroCore.session.threads[0].messages &&
      window.VoiceroCore.session.threads[0].messages.length > 0
    ) {
      console.log(
        `VoiceroWelcome: Found ${window.VoiceroCore.session.threads[0].messages.length} messages in thread`,
      );

      // DIRECT APPROACH: Open chat immediately
      console.log("VoiceroWelcome: Opening chat directly with VoiceroText");

      // Set flag to prevent welcome screen
      window.voiceroInChatMode = true;

      // Hide any existing welcome container
      var welcomeContainer = document.getElementById(
        "voicero-welcome-container",
      );
      if (welcomeContainer) {
        console.log("VoiceroWelcome: Removing existing welcome container");
        welcomeContainer.remove();
      }

      // Make sure the website color is properly set before initializing VoiceroText
      if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.websiteColor
      ) {
        console.log(
          "VoiceroWelcome: Found session color:",
          window.VoiceroCore.session.websiteColor,
        );

        // Set the color in VoiceroCore
        window.VoiceroCore.websiteColor =
          window.VoiceroCore.session.websiteColor;
      }

      // Initialize VoiceroText if available - with a slight delay to ensure everything is loaded
      setTimeout(() => {
        if (window.VoiceroText) {
          console.log("VoiceroWelcome: Initializing VoiceroText after delay");
          if (!window.VoiceroText.initialized) {
            window.VoiceroText.init();
          }
          window.VoiceroText.createChatContainer();
        }
      }, 500);

      return true; // Indicate we found messages
    }

    return false; // Indicate we didn't find messages
  };

  // Add global CSS for welcome screen
  var globalWelcomeStyle = document.createElement("style");
  globalWelcomeStyle.innerHTML = `
    #voicero-welcome-container {
      z-index: 9999999 !important;
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
    }
    #voice-toggle-container, #chat-website-button {
      z-index: 999999 !important;
    }
    
    /* Ensure the welcome screen always stays on top */
    @keyframes forceOnTop {
      0% { z-index: 9999999 !important; }
      100% { z-index: 9999999 !important; }
    }
    
    #voicero-welcome-container {
      animation: forceOnTop 0.1s forwards !important;
    }
  `;
  document.head.appendChild(globalWelcomeStyle);

  // Welcome interface variables
  window.VoiceroWelcome = {
    isShowingWelcomeScreen: false,
    websiteColor: null, // Will be populated from VoiceroCore
    initialized: false,

    // Initialize the welcome module
    init: function () {
      // Check if already initialized
      if (this.initialized) return;

      // Mark as initialized
      this.initialized = true;

      console.log("VoiceroWelcome: Initializing");

      // IMPORTANT: Always get the latest website color from VoiceroCore
      if (window.VoiceroCore && window.VoiceroCore.websiteColor) {
        console.log(
          "VoiceroWelcome: Using dynamic color from VoiceroCore:",
          window.VoiceroCore.websiteColor,
        );
        this.websiteColor = window.VoiceroCore.websiteColor;
      } else if (
        window.VoiceroCore &&
        window.VoiceroCore.session &&
        window.VoiceroCore.session.website &&
        window.VoiceroCore.session.website.color
      ) {
        console.log(
          "VoiceroWelcome: Using color from session.website:",
          window.VoiceroCore.session.website.color,
        );
        this.websiteColor = window.VoiceroCore.session.website.color;
      } else {
        // Fallback to default purple if nothing else available
        this.websiteColor = "#882be6";
      }

      // Never automatically show welcome screen
      console.log("VoiceroWelcome: Auto-popup disabled, welcome screen will not show automatically");
    },

    // Create the welcome container and show the welcome screen
    createWelcomeContainer: function () {
      console.log("VoiceroWelcome: Creating welcome container");

      // Reset chat mode flag when manually opening welcome screen
      window.voiceroInChatMode = false;
      
      // Reset the progress flag to allow manual opening
      window.voiceroWelcomeInProgress = false;

      // CRITICAL: First remove any existing welcome container to prevent duplicates
      var existingWelcome = document.getElementById(
        "voicero-welcome-container",
      );
      if (existingWelcome) {
        existingWelcome.remove();
      }

      // Mark session as showing welcome but don't hide the button

      // Create fresh container for welcome screen
      let welcomeContainer = document.createElement("div");
      welcomeContainer.id = "voicero-welcome-container";
      welcomeContainer.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        width: 320px;
        max-width: 90vw;
        max-height: 350px;
        z-index: 9999999 !important;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        background: white;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      `;

      // Force the welcome container to stay on top by manually positioning it
      // above all other elements in the DOM tree
      document.body.appendChild(welcomeContainer);

      // Re-append to body to ensure it's the last child (on top in the stacking order)
      document.body.appendChild(welcomeContainer);

      // Create shadow root for welcome container
      let welcomeShadow = welcomeContainer.attachShadow({ mode: "open" });

      // Add basic styles to the shadow root
      var styleEl = document.createElement("style");
      styleEl.textContent = `
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
        #chat-messages {
          height: 350px;
          background: white;
          border-radius: 12px;
          overflow: hidden;
        }
      `;
      welcomeShadow.appendChild(styleEl);

      // Initialize if needed
      if (!this.initialized && this.init) {
        this.init();
      }

      try {
        // Create a messages container first
        var messagesDiv = document.createElement("div");
        messagesDiv.id = "chat-messages";
        welcomeShadow.appendChild(messagesDiv);

        // Show the welcome screen
        this.showWelcomeScreen(welcomeShadow);
        console.log("VoiceroWelcome: Welcome screen shown successfully");
      } catch (error) {
        console.error("VoiceroWelcome: Error showing welcome screen:", error);

        // Fallback to simple HTML
        welcomeShadow.innerHTML += `
          <div id="chat-messages" style="padding: 20px; text-align: center;">
            <h3>Hi there! I'm Voicero, an AI Sales Rep.</h3>
            <p>How can I help you today?</p>
            <div style="margin-top: 20px;">
              <button style="background: #882be6; color: white; border: none; padding: 10px 15px; border-radius: 20px; margin: 5px; cursor: pointer;">Talk to Sales</button>
              <button style="background: #882be6; color: white; border: none; padding: 10px 15px; border-radius: 20px; margin: 5px; cursor: pointer;">Get Started</button>
            </div>
          </div>
        `;
      }

      // Make sure the welcome container is visible
      welcomeContainer.style.display = "block";
      welcomeContainer.style.visibility = "visible";
      welcomeContainer.style.opacity = "1";

      // Set flag that we're showing welcome screen
      this.isShowingWelcomeScreen = true;

      // Reset the flag after a short delay to allow future welcome screen creation
      setTimeout(() => {
        window.voiceroWelcomeInProgress = false;
      }, 500);

      return welcomeContainer;
    },

    // Show initial welcome screen with buttons
    showWelcomeScreen: function (shadowRoot) {
      if (!shadowRoot) {
        console.error(
          "VoiceroWelcome: No shadow root provided to showWelcomeScreen",
        );
        return;
      }

      console.log(
        "VoiceroWelcome: Showing welcome screen in shadow root",
        shadowRoot,
      );

      // Check if we're in an infinite loop
      if (window.voiceroWelcomeRecursionCount === undefined) {
        window.voiceroWelcomeRecursionCount = 1;
      } else {
        window.voiceroWelcomeRecursionCount++;

        // If we've called this too many times in succession, break the loop
        if (window.voiceroWelcomeRecursionCount > 3) {
          console.warn(
            "VoiceroWelcome: Detected potential infinite recursion, breaking loop",
          );
          window.voiceroWelcomeRecursionCount = 0;
          return;
        }
      }

      // Reset counter after a delay
      setTimeout(() => {
        window.voiceroWelcomeRecursionCount = 0;
      }, 1000);

      // If there's no messages container, create one
      var messagesContainer = shadowRoot.getElementById("chat-messages");
      if (!messagesContainer) {
        console.log(
          "VoiceroWelcome: Creating messages container in shadow root",
        );
        messagesContainer = document.createElement("div");
        messagesContainer.id = "chat-messages";
        shadowRoot.appendChild(messagesContainer);
      }

      // Clear existing content
      messagesContainer.innerHTML = "";

      // Create welcome screen container
      var welcomeScreen = document.createElement("div");
      welcomeScreen.className = "welcome-screen";
      welcomeScreen.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 350px;
        max-height: 350px;
        padding: 0;
        background-color: white;
        border-radius: 12px;
        position: relative;
        overflow: hidden;
      `;

      // Add close button that appears on hover
      var closeButton = document.createElement("div");
      closeButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round">
        <path d="M18 6L6 18M6 6l12 12"></path>
      </svg>`;
      closeButton.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 999;
        transition: all 0.2s ease;
        opacity: 0;
      `;

      // Store reference for button handlers
      var self = this;

      // Add hover functionality for the welcome screen
      welcomeScreen.addEventListener("mouseenter", function () {
        closeButton.style.opacity = "1";
      });

      welcomeScreen.addEventListener("mouseleave", function () {
        closeButton.style.opacity = "0";
      });

      // Add click handler to close button
      closeButton.addEventListener("click", function (e) {
        console.log("Close button clicked in welcome screen");

        // Stop event propagation
        e.stopPropagation();
        e.preventDefault();

        // CRITICAL: Force remove the welcome container immediately
        var welcomeContainer = document.getElementById(
          "voicero-welcome-container",
        );
        if (welcomeContainer) {
          console.log("VoiceroWelcome: Removing welcome container");
          welcomeContainer.style.display = "none";
          welcomeContainer.style.visibility = "hidden";
          welcomeContainer.style.opacity = "0";

          // Remove from DOM after hiding it
          setTimeout(() => welcomeContainer.remove(), 10);
        }

        // Set flag to indicate welcome is closed
        self.isShowingWelcomeScreen = false;

        // CRITICAL: Set flags to prevent welcome screen from reappearing
        window.voiceroInChatMode = true;
        window.voiceroWelcomeInProgress = true;

        // Clear any welcome check intervals
        if (window.voiceroWelcomeCheckInterval) {
          clearInterval(window.voiceroWelcomeCheckInterval);
        }
      });

      welcomeScreen.appendChild(closeButton);

      // Create header with avatar and name - left aligned
      var header = document.createElement("div");
      header.style.cssText = `
        padding: 10px 15px 5px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
      `;

      // Create avatar with actual image
      var avatar = document.createElement("div");
      avatar.style.cssText = `
        width: 40px;
        height: 40px;
        border-radius: 50%;
        margin-right: 12px;
        overflow: hidden;
        position: relative;
        background-color: transparent;
      `;

      // Use the actual icon image from assets with proper Shopify theme extension URL structure
      var avatarImg = document.createElement("img");

      // Try to build the correct path for Shopify theme extension assets
      var extensionUrl = "";

      // First try using the current script's path to determine the asset URL
      var scripts = document.querySelectorAll("script");
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";
        if (src.includes("voicero-") || src.includes("voicero/")) {
          extensionUrl = src.substring(0, src.lastIndexOf("/") + 1);
          break;
        }
      }

      // Use the extension URL or fall back to a relative path
      avatarImg.src = extensionUrl ? extensionUrl + "icon.png" : "./icon.png";
      avatarImg.alt = "Support agent";
      avatarImg.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
      `;
      avatar.appendChild(avatarImg);

      // Create name and role
      var nameContainer = document.createElement("div");
      nameContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      `;

      var name = document.createElement("div");
      name.textContent = "Voicero";
      name.style.cssText = `
        font-weight: bold;
        color: black;
        font-size: 16px;
        margin-bottom: -3px;
      `;

      var role = document.createElement("div");
      role.textContent = "AI Sales Rep";
      role.style.cssText = `
        font-size: 12px;
        color: #666;
        line-height: 1;
      `;

      nameContainer.appendChild(name);
      nameContainer.appendChild(role);

      header.appendChild(avatar);
      header.appendChild(nameContainer);
      welcomeScreen.appendChild(header);

      // Create welcome message
      var messageContainer = document.createElement("div");
      messageContainer.style.cssText = `
        padding: 8px 12px 50px;
        flex-grow: 1;
        overflow-y: auto;
      `;

      var welcomeMessage = document.createElement("div");
      welcomeMessage.style.cssText = `
        text-align: left;
        color: #333;
        padding: 0;
        margin-bottom: 8px;
        font-size: 14px;
        line-height: 1.4;
      `;

      // Get website name if available
      let websiteName = window.location.hostname || "our website";
      if (document.title) {
        var title = document.title;
        var separatorIndex = Math.min(
          title.indexOf(" - ") > -1 ? title.indexOf(" - ") : Infinity,
          title.indexOf(" | ") > -1 ? title.indexOf(" | ") : Infinity,
        );
        if (separatorIndex !== Infinity) {
          websiteName = title.substring(0, separatorIndex);
        } else {
          websiteName = title;
        }
      }

      welcomeMessage.innerHTML = `
        <p style="margin-top: 0;">Hi there! I'm Voicero, an AI Sales Rep. Looking for AI email responder info? Feel free to ask!</p>
        <p>I see you're exploring ${websiteName}. I'm available if you have questions or want to talk more!</p>
      `;
      messageContainer.appendChild(welcomeMessage);

      // Add message content to container
      messageContainer.appendChild(welcomeMessage);
      welcomeScreen.appendChild(messageContainer);

      // Ensure the welcome screen doesn't exceed viewport height
      var viewportHeight = window.innerHeight;
      var maxHeight = Math.min(350, viewportHeight * 0.8); // 80% of viewport or 350px, whichever is smaller
      welcomeScreen.style.height = maxHeight + "px";

      // Create buttons container - position right above input box
      var buttonsContainer = document.createElement("div");
      buttonsContainer.style.cssText = `
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        gap: 6px;
        margin: 0 12px 8px;
        padding: 0;
        position: absolute;
        bottom: 60px;
        left: 0;
        right: 0;
        width: calc(100% - 24px);
      `;

      // Add buttons
      var buttons = [
        { text: "Talk to Sales", action: "talk-to-sales" },
        { text: "Customer Support", action: "customer-support" },
      ];

      buttons.forEach((buttonData) => {
        var button = document.createElement("button");
        button.textContent = buttonData.text;
        button.dataset.action = buttonData.action;
        button.style.cssText = `
          flex: 1;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 14px;
          padding: 6px 8px;
          font-size: 12px;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s ease;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `;

        button.addEventListener("mouseover", function () {
          this.style.backgroundColor = "#f5f5f5";
        });

        button.addEventListener("mouseout", function () {
          this.style.backgroundColor = "white";
        });

        button.addEventListener("click", () => {
          console.log("Button clicked: " + buttonData.action);

          // Set global interaction type based on button clicked
          switch (buttonData.action) {
            case "talk-to-sales":
              window.voiceroInteractionType = "sales";
              break;
            case "customer-support":
              window.voiceroInteractionType = "support";
              break;
            default:
              window.voiceroInteractionType = "noneSpecified";
          }

          // SIMPLIFIED: Remove the welcome container
          var welcomeContainer = document.getElementById(
            "voicero-welcome-container",
          );
          if (welcomeContainer) {
            welcomeContainer.remove();
          }

          // Reset any existing VoiceroText state to ensure fresh start
          if (window.VoiceroText) {
            window.VoiceroText.initialized = false;
            if (window.VoiceroText.messages) {
              window.VoiceroText.messages = [];
            }
          }

          // Open chat interface with the selected action
          if (window.handleVoiceroWelcomeAction) {
            // Make sure we're not in chat mode before transitioning
            window.voiceroInChatMode = false;
            window.handleVoiceroWelcomeAction(buttonData.action);
          }
        });

        buttonsContainer.appendChild(button);
      });

      // Add buttons container directly to welcome screen
      welcomeScreen.appendChild(buttonsContainer);

      // Add a real input field for "Ask a question"
      var askContainer = document.createElement("div");
      askContainer.style.cssText = `
        margin: auto 0 16px;
        padding: 0 12px;
        width: 100%;
        box-sizing: border-box;
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
      `;

      // Create a wrapper for input and send icon
      var inputWrapper = document.createElement("div");
      inputWrapper.style.cssText = `
        position: relative;
        width: 100%;
      `;

      var askInput = document.createElement("input");
      askInput.type = "text";
      askInput.placeholder = "Ask a question";
      askInput.style.cssText = `
        width: 100%;
        padding: 10px 12px;
        padding-right: 36px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        font-size: 13px;
        color: #333;
        background: white;
        outline: none;
        box-sizing: border-box;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      `;

      // Add send icon
      var sendIcon = document.createElement("div");
      sendIcon.style.cssText = `
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      sendIcon.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
        </svg>
      `;

      // Add click handler for send icon
      sendIcon.addEventListener("click", () => {
        var text = askInput.value.trim();
        if (text) {
          console.log("Send icon clicked with text: " + text);
          this.handleUserInput(text);
        }
      });

      inputWrapper.appendChild(askInput);
      inputWrapper.appendChild(sendIcon);
      askContainer.appendChild(inputWrapper);
      welcomeScreen.appendChild(askContainer);

      // Set focus on the input field after a short delay
      setTimeout(() => {
        askInput.focus();
      }, 300);

      // Add event listener for Enter key
      askInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          var text = askInput.value.trim();
          if (text) {
            console.log("Enter key pressed with text: " + text);
            this.handleUserInput(text);
          }
        }
      });

      // Add to container
      messagesContainer.appendChild(welcomeScreen);
      return welcomeScreen;
    },

    // Handle user input from welcome screen
    handleUserInput: function (text) {
      if (!text) return;

      console.log("VoiceroWelcome: Handling user input: " + text);

      // Set default type for direct text input
      window.voiceroInteractionType = "general";

      // SIMPLIFIED: Remove welcome container
      var welcomeContainer = document.getElementById(
        "voicero-welcome-container",
      );
      if (welcomeContainer) {
        welcomeContainer.remove();
      }

      // Reset any existing VoiceroText state to ensure fresh start
      if (window.VoiceroText) {
        window.VoiceroText.initialized = false;
        if (window.VoiceroText.messages) {
          window.VoiceroText.messages = [];
        }
      }

      // Open chat interface with the user's text input
      if (window.handleVoiceroWelcomeAction) {
        // Make sure we're not in chat mode before transitioning
        window.voiceroInChatMode = false;
        window.handleVoiceroWelcomeAction(null, text);
      }
    },

    // Handle reopening the welcome screen from core button
    reopenWelcomeScreen: function () {
      console.log("VoiceroWelcome: Reopening welcome screen");

      // IMPORTANT: Reset chat mode flag to allow welcome screen to appear
      window.voiceroInChatMode = false;

      // Reset any other flags that might prevent welcome screen
      window.voiceroWelcomeInProgress = false;

      // Create the welcome container which will go on top
      this.createWelcomeContainer();

      // Force the core button to go behind by updating its z-index
      setTimeout(() => {
        var buttonContainer = document.getElementById("voice-toggle-container");
        var mainButton = document.getElementById("chat-website-button");

        if (buttonContainer) {
          buttonContainer.style.zIndex = "999999";
        }

        if (mainButton) {
          mainButton.style.zIndex = "999999";
        }
      }, 50);

      return true;
    },

    // Handle loading existing chat data from session
    loadExistingChat: function () {
      console.log("VoiceroWelcome: Loading existing chat data");

      // Set chat mode flag to true
      window.voiceroInChatMode = true;

      // Hide welcome screen if it exists
      var welcomeContainer = document.getElementById(
        "voicero-welcome-container",
      );
      if (welcomeContainer) {
        welcomeContainer.remove();
      }

      // Initialize VoiceroText if available
      if (window.VoiceroText && window.VoiceroText.createChatContainer) {
        console.log("VoiceroWelcome: Opening chat with VoiceroText");
        window.VoiceroText.createChatContainer();

        // Make sure VoiceroText loads the existing messages
        if (window.VoiceroText.loadExistingMessages) {
          setTimeout(() => {
            window.VoiceroText.loadExistingMessages();
          }, 200);
        }
      }
    },
  };

  // CRITICAL: Ensure the welcome screen is always shown on page load
  // Use multiple methods to ensure it loads reliably

  // Method 1: Initialize immediately if document is already loaded - but don't auto-show
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    console.log(
      "VoiceroWelcome: Document already loaded, initializing without auto-show",
    );
    // Only initialize, don't auto-show welcome screen
    window.VoiceroWelcome.initialized = true;
  }

  // Method 2: Add DOMContentLoaded listener as backup - but don't auto-show
  document.addEventListener("DOMContentLoaded", function () {
    console.log("VoiceroWelcome: DOMContentLoaded fired, initializing without auto-show");
    // Only initialize, don't auto-show welcome screen
    window.VoiceroWelcome.initialized = true;
  });

  // Method 3: Add window load event as final fallback - but don't auto-show
  window.addEventListener("load", function () {
    console.log("VoiceroWelcome: Window load event fired, initializing without auto-show");
    // Only initialize, don't auto-show welcome screen
    window.VoiceroWelcome.initialized = true;
  });

  // Method 4: Disabled recurring check - welcome screen no longer auto-appears
  console.log("VoiceroWelcome: Recurring welcome check disabled - no auto-popup");
})(window, document);
