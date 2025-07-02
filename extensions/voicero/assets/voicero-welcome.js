/**
 * VoiceroAI Welcome Module
 * Handles welcome screen functionality
 */

// Use IIFE to avoid global variable conflicts
(function (window, document) {
  // Check if VoiceroWelcome already exists to prevent redeclaration
  if (window.VoiceroWelcome) {
    console.log("VoiceroWelcome is already defined, not redefining");
    return;
  }

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
    },

    // Show initial welcome screen with buttons
    showWelcomeScreen: function (shadowRoot) {
      if (!shadowRoot) return;

      var messagesContainer = shadowRoot.getElementById("chat-messages");
      if (!messagesContainer) return;

      // Clear existing content
      messagesContainer.innerHTML = "";

      // Create welcome screen container
      var welcomeScreen = document.createElement("div");
      welcomeScreen.className = "welcome-screen";
      welcomeScreen.style.cssText = `
        display: flex;
        flex-direction: column;
        height: 400px;
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
      closeButton.addEventListener("click", () => {
        if (window.VoiceroText && window.VoiceroText.closeTextChat) {
          window.VoiceroText.closeTextChat();
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
        <p>I see you're exploring ${websiteName}, the most productive email app ever made. I'm available if you have questions or want to talk more!</p>
      `;
      messageContainer.appendChild(welcomeMessage);

      // Add message content to container
      messageContainer.appendChild(welcomeMessage);
      welcomeScreen.appendChild(messageContainer);

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
          // Reset welcome screen state in VoiceroText
          if (window.VoiceroText) {
            console.log("Button clicked: " + buttonData.action);

            // Prepare assistant message based on button clicked
            let assistantMessage = "";
            switch (buttonData.action) {
              case "talk-to-sales":
                assistantMessage =
                  "How can I help you talk to our sales team about our product?";
                break;
              case "get-started":
                assistantMessage =
                  "How can I help you get started with our product?";
                break;
              case "customer-support":
                assistantMessage =
                  "How can I assist you with customer support?";
                break;
              default:
                assistantMessage = "Hello! How can I help you today?";
            }

            // First reset welcome screen state
            window.VoiceroText.isShowingWelcomeScreen = false;

            // Reset the welcome screen and show chat interface
            if (window.VoiceroText.resetWelcomeScreenAndShowChat) {
              window.VoiceroText.resetWelcomeScreenAndShowChat();

              // Add message directly as AI response AFTER resetting the screen
              setTimeout(() => {
                if (window.VoiceroText.addMessage) {
                  window.VoiceroText.addMessage(assistantMessage, "ai");
                }
              }, 100);
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
        if (text && window.VoiceroText) {
          console.log("Send icon clicked with text: " + text);
          // First reset welcome screen state
          window.VoiceroText.isShowingWelcomeScreen = false;

          // Reset the welcome screen and show chat interface
          window.VoiceroText.resetWelcomeScreenAndShowChat();

          // Add the message after a short delay to ensure UI is ready
          setTimeout(() => {
            window.VoiceroText.sendChatMessage(text);
          }, 100);
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
          if (text && window.VoiceroText) {
            console.log("Enter key pressed with text: " + text);
            // First reset welcome screen state
            window.VoiceroText.isShowingWelcomeScreen = false;

            // Show the real UI
            window.VoiceroText.resetWelcomeScreenAndShowChat();

            // Send the user's actual message after a short delay
            setTimeout(() => {
              window.VoiceroText.sendChatMessage(text);
            }, 100);
          }
        }
      });

      // Add to container
      messagesContainer.appendChild(welcomeScreen);

      // Store flag that we're showing welcome screen
      if (window.VoiceroText) {
        window.VoiceroText.isShowingWelcomeScreen = true;
      }

      return welcomeScreen;
    },
  };

  // Initialize the module
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(function () {
      window.VoiceroWelcome.init();
    }, 1);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      window.VoiceroWelcome.init();
    });
  }
})(window, document);
