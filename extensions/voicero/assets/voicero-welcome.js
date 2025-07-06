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
    console.log("VoiceroWelcome is already defined, not redefining");
    return;
  }

  // Add global CSS to ensure welcome screen is always on top
  const globalWelcomeStyle = document.createElement("style");
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
    voiceroTextInstance: null, // Store reference to VoiceroText instance

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

      // Always show the welcome screen on initialization
      setTimeout(() => {
        this.createWelcomeContainer();
      }, 500);
    },

    // Create the welcome container and show the welcome screen
    createWelcomeContainer: function () {
      console.log("VoiceroWelcome: Creating welcome container");

      // CRITICAL: Check if welcome creation is already in progress
      if (window.voiceroWelcomeInProgress) {
        console.log(
          "VoiceroWelcome: Welcome creation already in progress, skipping",
        );
        return;
      }

      // Set flag to prevent recursive calls
      window.voiceroWelcomeInProgress = true;

      // CRITICAL: First remove any existing welcome container to prevent duplicates
      const existingWelcome = document.getElementById(
        "voicero-welcome-container",
      );
      if (existingWelcome) {
        existingWelcome.remove();
      }

      // Mark session as showing welcome but don't hide the button
      if (window.VoiceroCore) {
        // Update session state to show welcome
        if (window.VoiceroCore.updateWindowState) {
          console.log("VoiceroWelcome: Setting textWelcome=true");
          window.VoiceroCore.updateWindowState({
            textWelcome: true,
          });
        }
      }

      // Create fresh container for welcome screen
      let welcomeContainer = document.createElement("div");
      welcomeContainer.id = "voicero-welcome-container";
      welcomeContainer.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        width: 375px;
        max-width: 90vw;
        max-height: 400px;
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
      const styleEl = document.createElement("style");
      styleEl.textContent = `
        :host {
          display: block;
          width: 100%;
          height: 100%;
        }
        #chat-messages {
          height: 400px;
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
        const messagesDiv = document.createElement("div");
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
            <h3>Hi there! I'm Suvi, an AI Sales Rep.</h3>
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
      if (window.VoiceroText) {
        window.VoiceroText.isShowingWelcomeScreen = true;
      }

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
        height: 400px;
        max-height: 400px;
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

      // Store reference to VoiceroText for button handlers
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
        const welcomeContainer = document.getElementById(
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

        // Update session state - only one call needed
        if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
          window.VoiceroCore.updateWindowState({
            textWelcome: false,
          });
        }

        // Set flag to indicate welcome is closed
        self.isShowingWelcomeScreen = false;
        if (window.VoiceroText) {
          window.VoiceroText.isShowingWelcomeScreen = false;
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
      name.textContent = "Suvi";
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
        padding: 10px 15px 60px;
        flex-grow: 1;
        overflow-y: auto;
      `;

      var welcomeMessage = document.createElement("div");
      welcomeMessage.style.cssText = `
        text-align: left;
        color: #333;
        padding: 0;
        margin-bottom: 10px;
        font-size: 16px;
        line-height: 1.5;
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
        <p style="margin-top: 0;">Hi there! I'm Suvi, an AI Sales Rep. Looking for AI email responder info? Feel free to ask!</p>
        <p>I see you're exploring ${websiteName}. I'm available if you have questions or want to talk more!</p>
      `;
      messageContainer.appendChild(welcomeMessage);

      // Add message content to container
      messageContainer.appendChild(welcomeMessage);
      welcomeScreen.appendChild(messageContainer);

      // Ensure the welcome screen doesn't exceed viewport height
      const viewportHeight = window.innerHeight;
      const maxHeight = Math.min(400, viewportHeight * 0.8); // 80% of viewport or 400px, whichever is smaller
      welcomeScreen.style.height = maxHeight + "px";

      // Create buttons container - position right above input box
      var buttonsContainer = document.createElement("div");
      buttonsContainer.style.cssText = `
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        gap: 8px;
        margin: 0 15px 10px;
        padding: 0;
        position: absolute;
        bottom: 70px;
        left: 0;
        right: 0;
        width: calc(100% - 30px);
      `;

      // Add buttons
      var buttons = [
        { text: "Talk to Sales", action: "talk-to-sales" },
        { text: "Get Started", action: "get-started" },
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
          border-radius: 16px;
          padding: 8px 10px;
          font-size: 13px;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s ease;
          white-space: nowrap;
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
              assistantMessage =
                "How can I help you talk to our sales team about our product?";
              break;
            case "get-started":
              window.voiceroInteractionType = "general";
              assistantMessage =
                "How can I help you get started with our product?";
              break;
            case "customer-support":
              window.voiceroInteractionType = "support";
              assistantMessage = "How can I assist you with customer support?";
              break;
            default:
              window.voiceroInteractionType = "noneSpecified";
              assistantMessage = "Hello! How can I help you today?";
          }

          // Store reference to VoiceroWelcome to use in the closure
          const voiceroWelcome = self;

          // First check if we have a direct reference to the VoiceroText instance
          if (voiceroWelcome.voiceroTextInstance) {
            // First reset welcome screen state
            voiceroWelcome.voiceroTextInstance.isShowingWelcomeScreen = false;

            // Reset the welcome screen and show chat interface
            if (
              voiceroWelcome.voiceroTextInstance.resetWelcomeScreenAndShowChat
            ) {
              voiceroWelcome.voiceroTextInstance.resetWelcomeScreenAndShowChat();

              // Display message in UI only without adding to backend thread
              setTimeout(() => {
                // Just use the original addMessage method but only render to UI without sending to backend
                if (voiceroWelcome.voiceroTextInstance.addMessage) {
                  console.log(
                    "VoiceroWelcome: Force displaying message in UI:",
                    assistantMessage,
                  );
                  // Force using the original method with UI-only flag if it has one
                  try {
                    // Try to call with UI-only flag if it accepts it
                    voiceroWelcome.voiceroTextInstance.addMessage(
                      assistantMessage,
                      "ai",
                      true,
                    );
                  } catch (e) {
                    // If error, fall back to standard call
                    voiceroWelcome.voiceroTextInstance.addMessage(
                      assistantMessage,
                      "ai",
                    );
                  }

                  // Important: Prevent the message from being sent to backend
                  // Find and remove from pending messages if that exists
                  if (voiceroWelcome.voiceroTextInstance.pendingMessages) {
                    voiceroWelcome.voiceroTextInstance.pendingMessages =
                      voiceroWelcome.voiceroTextInstance.pendingMessages.filter(
                        (msg) => msg.content !== assistantMessage,
                      );
                  }
                }

                // As a backup, also try DOM insertion
                // Find all possible message containers
                const containers = [
                  document.querySelector(".voicero-chat-messages"),
                  document.querySelector(".chat-messages"),
                  document.querySelector(".message-container"),
                  document.getElementById("voicero-messages"),
                  document.getElementById("chat-messages"),
                ].filter(Boolean);

                if (containers.length > 0) {
                  // Create styled message element
                  const messageEl = document.createElement("div");
                  messageEl.className = "voicero-message voicero-ai-message";
                  messageEl.style.cssText = `
                    padding: 10px 15px;
                    background-color: #f0f0f0;
                    border-radius: 15px;
                    margin-bottom: 10px;
                    display: inline-block;
                    max-width: 80%;
                  `;
                  messageEl.innerHTML = `<div class="voicero-message-content">${assistantMessage}</div>`;

                  // Add to all found containers for redundancy
                  containers.forEach((container) => {
                    container.appendChild(messageEl.cloneNode(true));
                    container.scrollTop = container.scrollHeight;
                  });
                }
              }, 300);
            } else {
              // If resetWelcomeScreenAndShowChat isn't available, try openTextChat
              if (voiceroWelcome.voiceroTextInstance.openTextChat) {
                voiceroWelcome.voiceroTextInstance.openTextChat();

                // Display message in UI only without adding to backend thread
                setTimeout(() => {
                  // Just use the original addMessage method but only render to UI without sending to backend
                  if (voiceroWelcome.voiceroTextInstance.addMessage) {
                    console.log(
                      "VoiceroWelcome: Force displaying message in UI:",
                      assistantMessage,
                    );
                    // Force using the original method with UI-only flag if it has one
                    try {
                      // Try to call with UI-only flag if it accepts it
                      voiceroWelcome.voiceroTextInstance.addMessage(
                        assistantMessage,
                        "ai",
                        true,
                      );
                    } catch (e) {
                      // If error, fall back to standard call
                      voiceroWelcome.voiceroTextInstance.addMessage(
                        assistantMessage,
                        "ai",
                      );
                    }

                    // Important: Prevent the message from being sent to backend
                    // Find and remove from pending messages if that exists
                    if (voiceroWelcome.voiceroTextInstance.pendingMessages) {
                      voiceroWelcome.voiceroTextInstance.pendingMessages =
                        voiceroWelcome.voiceroTextInstance.pendingMessages.filter(
                          (msg) => msg.content !== assistantMessage,
                        );
                    }
                  }

                  // As a backup, also try DOM insertion
                  // Find all possible message containers
                  const containers = [
                    document.querySelector(".voicero-chat-messages"),
                    document.querySelector(".chat-messages"),
                    document.querySelector(".message-container"),
                    document.getElementById("voicero-messages"),
                    document.getElementById("chat-messages"),
                  ].filter(Boolean);

                  if (containers.length > 0) {
                    // Create styled message element
                    const messageEl = document.createElement("div");
                    messageEl.className = "voicero-message voicero-ai-message";
                    messageEl.style.cssText = `
                      padding: 10px 15px;
                      background-color: #f0f0f0;
                      border-radius: 15px;
                      margin-bottom: 10px;
                      display: inline-block;
                      max-width: 80%;
                    `;
                    messageEl.innerHTML = `<div class="voicero-message-content">${assistantMessage}</div>`;

                    // Add to all found containers for redundancy
                    containers.forEach((container) => {
                      container.appendChild(messageEl.cloneNode(true));
                      container.scrollTop = container.scrollHeight;
                    });
                  }
                }, 300);
              }
            }
          }
          // Fallback to global VoiceroText
          else if (window.VoiceroText) {
            // First reset welcome screen state
            window.VoiceroText.isShowingWelcomeScreen = false;

            // Reset the welcome screen and show chat interface
            if (window.VoiceroText.resetWelcomeScreenAndShowChat) {
              window.VoiceroText.resetWelcomeScreenAndShowChat();

              // Display message in UI only without adding to backend thread
              setTimeout(() => {
                // Just use the original addMessage method but only render to UI without sending to backend
                if (window.VoiceroText.addMessage) {
                  console.log(
                    "VoiceroWelcome: Force displaying message in UI (global):",
                    assistantMessage,
                  );
                  // Force using the original method with UI-only flag if it has one
                  try {
                    // Try to call with UI-only flag if it accepts it
                    window.VoiceroText.addMessage(assistantMessage, "ai", true);
                  } catch (e) {
                    // If error, fall back to standard call
                    window.VoiceroText.addMessage(assistantMessage, "ai");
                  }

                  // Important: Prevent the message from being sent to backend
                  // Find and remove from pending messages if that exists
                  if (window.VoiceroText.pendingMessages) {
                    window.VoiceroText.pendingMessages =
                      window.VoiceroText.pendingMessages.filter(
                        (msg) => msg.content !== assistantMessage,
                      );
                  }
                }

                // As a backup, also try DOM insertion
                // Find all possible message containers
                const containers = [
                  document.querySelector(".voicero-chat-messages"),
                  document.querySelector(".chat-messages"),
                  document.querySelector(".message-container"),
                  document.getElementById("voicero-messages"),
                  document.getElementById("chat-messages"),
                ].filter(Boolean);

                if (containers.length > 0) {
                  // Create styled message element
                  const messageEl = document.createElement("div");
                  messageEl.className = "voicero-message voicero-ai-message";
                  messageEl.style.cssText = `
                    padding: 10px 15px;
                    background-color: #f0f0f0;
                    border-radius: 15px;
                    margin-bottom: 10px;
                    display: inline-block;
                    max-width: 80%;
                  `;
                  messageEl.innerHTML = `<div class="voicero-message-content">${assistantMessage}</div>`;

                  // Add to all found containers for redundancy
                  containers.forEach((container) => {
                    container.appendChild(messageEl.cloneNode(true));
                    container.scrollTop = container.scrollHeight;
                  });
                }
              }, 300);
            } else {
              // If resetWelcomeScreenAndShowChat isn't available, try openTextChat
              if (window.VoiceroText.openTextChat) {
                window.VoiceroText.openTextChat();

                // Display message in UI only without adding to backend thread
                setTimeout(() => {
                  // Just use the original addMessage method but only render to UI without sending to backend
                  if (window.VoiceroText.addMessage) {
                    console.log(
                      "VoiceroWelcome: Force displaying message in UI (global):",
                      assistantMessage,
                    );
                    // Force using the original method with UI-only flag if it has one
                    try {
                      // Try to call with UI-only flag if it accepts it
                      window.VoiceroText.addMessage(
                        assistantMessage,
                        "ai",
                        true,
                      );
                    } catch (e) {
                      // If error, fall back to standard call
                      window.VoiceroText.addMessage(assistantMessage, "ai");
                    }

                    // Important: Prevent the message from being sent to backend
                    // Find and remove from pending messages if that exists
                    if (window.VoiceroText.pendingMessages) {
                      window.VoiceroText.pendingMessages =
                        window.VoiceroText.pendingMessages.filter(
                          (msg) => msg.content !== assistantMessage,
                        );
                    }
                  }

                  // As a backup, also try DOM insertion
                  // Find all possible message containers
                  const containers = [
                    document.querySelector(".voicero-chat-messages"),
                    document.querySelector(".chat-messages"),
                    document.querySelector(".message-container"),
                    document.getElementById("voicero-messages"),
                    document.getElementById("chat-messages"),
                  ].filter(Boolean);

                  if (containers.length > 0) {
                    // Create styled message element
                    const messageEl = document.createElement("div");
                    messageEl.className = "voicero-message voicero-ai-message";
                    messageEl.style.cssText = `
                      padding: 10px 15px;
                      background-color: #f0f0f0;
                      border-radius: 15px;
                      margin-bottom: 10px;
                      display: inline-block;
                      max-width: 80%;
                    `;
                    messageEl.innerHTML = `<div class="voicero-message-content">${assistantMessage}</div>`;

                    // Add to all found containers for redundancy
                    containers.forEach((container) => {
                      container.appendChild(messageEl.cloneNode(true));
                      container.scrollTop = container.scrollHeight;
                    });
                  }
                }, 300);
              }
            }
          }
        });

        buttonsContainer.appendChild(button);
      });

      // Add buttons container directly to welcome screen
      welcomeScreen.appendChild(buttonsContainer);

      // Add a real input field for "Ask a question"
      var askContainer = document.createElement("div");
      askContainer.style.cssText = `
        margin: auto 0 20px;
        padding: 0 15px;
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
        padding: 12px 15px;
        padding-right: 40px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        font-size: 14px;
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
        const text = askInput.value.trim();
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
          const text = askInput.value.trim();
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

    // New helper method to handle user input from welcome screen
    handleUserInput: function (text) {
      if (!text) return;

      console.log("VoiceroWelcome: Handling user input: " + text);

      // Set default type for direct text input
      window.voiceroInteractionType = "noneSpecified";

      // Store the text for later use
      const userText = text;

      // Store a reference to this for use in closures
      const self = this;

      // Remove the welcome container
      const welcomeContainer = document.getElementById(
        "voicero-welcome-container",
      );
      if (welcomeContainer) {
        welcomeContainer.remove();
      }

      // Update session state
      if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
        window.VoiceroCore.updateWindowState({
          textWelcome: false,
        });
      }

      // First try to use the direct instance reference
      if (this.voiceroTextInstance) {
        console.log(
          "VoiceroWelcome: Using direct instance reference to handle input",
        );

        // Reset welcome screen state
        this.voiceroTextInstance.isShowingWelcomeScreen = false;

        // First explicitly make the text container visible
        const textChatContainer = document.getElementById(
          "voicero-text-chat-container",
        );
        if (textChatContainer) {
          textChatContainer.style.cssText = "";
          textChatContainer.style.display = "block";
          textChatContainer.style.visibility = "visible";
          textChatContainer.style.opacity = "1";
          textChatContainer.style.pointerEvents = "auto";
        }

        // Open the text chat interface
        this.voiceroTextInstance.openTextChat();

        // Send the message after a longer delay to ensure UI is ready
        setTimeout(() => {
          console.log(
            "VoiceroWelcome: Sending message via direct instance: " + userText,
          );
          self.voiceroTextInstance.sendChatMessage(userText);
        }, 500);
      }
      // Fallback to global VoiceroText
      else if (window.VoiceroText) {
        console.log("VoiceroWelcome: Using global VoiceroText to handle input");

        // Reset welcome screen state
        window.VoiceroText.isShowingWelcomeScreen = false;

        // First explicitly make the text container visible
        const textChatContainer = document.getElementById(
          "voicero-text-chat-container",
        );
        if (textChatContainer) {
          textChatContainer.style.cssText = "";
          textChatContainer.style.display = "block";
          textChatContainer.style.visibility = "visible";
          textChatContainer.style.opacity = "1";
          textChatContainer.style.pointerEvents = "auto";
        }

        // Open the text chat interface
        window.VoiceroText.openTextChat();

        // Send the message after a longer delay to ensure UI is ready
        setTimeout(() => {
          console.log(
            "VoiceroWelcome: Sending message via global instance: " + userText,
          );
          window.VoiceroText.sendChatMessage(userText);
        }, 500);
      } else {
        console.error(
          "VoiceroWelcome: No VoiceroText instance available to handle input",
        );
      }
    },

    // Handle reopening the welcome screen from core button
    reopenWelcomeScreen: function () {
      console.log("VoiceroWelcome: Reopening welcome screen");

      // Create the welcome container which will go on top
      this.createWelcomeContainer();

      // Force the core button to go behind by updating its z-index
      setTimeout(() => {
        const buttonContainer = document.getElementById(
          "voice-toggle-container",
        );
        const mainButton = document.getElementById("chat-website-button");

        if (buttonContainer) {
          buttonContainer.style.zIndex = "999999";
        }

        if (mainButton) {
          mainButton.style.zIndex = "999999";
        }
      }, 50);

      return true;
    },
  };

  // Initialize the module
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(function () {
      // Always initialize welcome
      window.VoiceroWelcome.init();
    }, 100); // Slight delay to ensure DOM is ready
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      // Always initialize welcome
      window.VoiceroWelcome.init();
    });
  }
})(window, document);
