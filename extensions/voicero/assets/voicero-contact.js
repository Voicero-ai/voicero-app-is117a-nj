/**
 * VoiceroAI Contact Form Module
 * Handles contact form functionality within the Voicero text interface
 */

var VoiceroContact = {
  // Initialize the contact module
  init: function () {
    // This will be called when loaded
    console.log("VoiceroContact module initialized");
  },

  // Create and display contact form in the chat interface
  showContactForm: function () {
    console.log("VoiceroContact: Creating contact form with BASIC styling");

    // Determine which interface is active
    let messagesContainer;
    let interfaceType = "text"; // Default to text interface

    // Check if called from voice interface
    if (document.getElementById("voice-messages")) {
      messagesContainer = document.getElementById("voice-messages");
      interfaceType = "voice";
      console.log("VoiceroContact: Using voice interface container");
    }
    // Otherwise use text interface - check for the new container structure
    else {
      // Find the chat container in the DOM
      var chatContainer = document.getElementById("voicero-chat-container");

      if (chatContainer && chatContainer.shadowRoot) {
        // Get the messages container from the shadow DOM
        messagesContainer = chatContainer.shadowRoot.querySelector(
          ".messages-container",
        );
        console.log("VoiceroContact: Found messages container in shadow DOM");
      }
    }

    // Exit if neither interface is available
    if (!messagesContainer) {
      console.error(
        "VoiceroContact: Messages container not found. Attempting fallback...",
      );

      // Try one more fallback approach
      var chatContainer = document.getElementById("voicero-chat-container");
      if (chatContainer && chatContainer.shadowRoot) {
        // Create the contact form directly in the chat container
        this.createContactFormInChat(chatContainer.shadowRoot);
        return;
      }

      console.error(
        "VoiceroContact: All fallback attempts failed. No container available.",
      );
      return;
    }

    // Get the main theme color
    let mainColor = "#882be6"; // Default purple
    if (window.VoiceroText && window.VoiceroText.websiteColor) {
      mainColor = window.VoiceroText.websiteColor;
      console.log("VoiceroContact: Using websiteColor:", mainColor);
    }

    // Create the contact form HTML - ULTRA SIMPLE VERSION
    var contactFormHTML = `
      <div class="contact-form-container">
        <h3>How can we help?</h3>
        <p>Please fill out the form below and we'll get back to you soon.</p>
        <div class="form-group">
          <label for="contact-email">Email:</label>
          <input type="email" id="contact-email" placeholder="Your email address" required>
        </div>
        <div class="form-group">
          <label for="contact-message">Message:</label>
          <textarea id="contact-message" placeholder="How can we help you?" rows="3" required></textarea>
        </div>
        <div class="form-actions">
          <button id="contact-submit" style="background-color: ${mainColor}; color: white; border-radius: 20px;">Submit</button>
          <button id="contact-cancel">Cancel</button>
        </div>
      </div>
    `;

    // Create a message element in the AI chat interface
    var messageDiv = document.createElement("div");
    messageDiv.className = "ai-message";

    // Create message content
    var contentDiv = document.createElement("div");
    contentDiv.className = "message-content contact-form-message";
    contentDiv.innerHTML = contactFormHTML;

    // Add to message div
    messageDiv.appendChild(contentDiv);

    // Add to messages container
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Apply basic styling directly to elements
    try {
      // Style the form container
      var formContainer = messageDiv.querySelector(".contact-form-container");
      if (formContainer) {
        formContainer.style.backgroundColor = "#ffffff";
        formContainer.style.padding = "10px";
        formContainer.style.borderRadius = "12px";
        formContainer.style.maxWidth = "280px"; // Reduce overall width
        formContainer.style.fontSize = "13px"; // Smaller font size
      }

      // Style the heading and paragraph
      var heading = formContainer.querySelector("h3");
      if (heading) {
        heading.style.fontSize = "15px";
        heading.style.margin = "0 0 5px 0";
      }

      var paragraph = formContainer.querySelector("p");
      if (paragraph) {
        paragraph.style.fontSize = "12px";
        paragraph.style.margin = "0 0 8px 0";
      }

      // Style form groups
      var formGroups = formContainer.querySelectorAll(".form-group");
      formGroups.forEach((group) => {
        group.style.marginBottom = "8px";
      });

      // Style labels
      var labels = formContainer.querySelectorAll("label");
      labels.forEach((label) => {
        label.style.fontSize = "12px";
        label.style.display = "block";
        label.style.marginBottom = "3px";
      });

      // Style the submit button
      var submitButton = messageDiv.querySelector("#contact-submit");
      if (submitButton) {
        submitButton.style.backgroundColor = mainColor;
        submitButton.style.color = "white";
        submitButton.style.border = "none";
        submitButton.style.padding = "6px 12px";
        submitButton.style.borderRadius = "20px";
        submitButton.style.cursor = "pointer";
        submitButton.style.fontSize = "12px";
      }

      // Style the cancel button
      var cancelButton = messageDiv.querySelector("#contact-cancel");
      if (cancelButton) {
        cancelButton.style.backgroundColor = "#f2f2f2";
        cancelButton.style.color = "#555";
        cancelButton.style.border = "none";
        cancelButton.style.padding = "6px 12px";
        cancelButton.style.borderRadius = "20px";
        cancelButton.style.cursor = "pointer";
        cancelButton.style.fontSize = "12px";
      }

      // Style form actions
      var formActions = messageDiv.querySelector(".form-actions");
      if (formActions) {
        formActions.style.display = "flex";
        formActions.style.justifyContent = "space-between";
        formActions.style.marginTop = "10px";
      }

      // Style inputs
      var inputs = messageDiv.querySelectorAll("input, textarea");
      inputs.forEach((input) => {
        input.style.width = "100%";
        input.style.padding = "6px";
        input.style.border = "1px solid #ddd";
        input.style.borderRadius = "8px";
        input.style.boxSizing = "border-box";
        input.style.fontSize = "12px";
      });

      // Make textarea smaller
      var textarea = messageDiv.querySelector("textarea");
      if (textarea) {
        textarea.rows = 2;
      }

      console.log("VoiceroContact: Compact styling applied successfully");
    } catch (e) {
      console.error("VoiceroContact: Error applying compact styling:", e);
    }

    // Set up event listeners for the form
    this.setupFormEventListeners(messageDiv, interfaceType);

    // Generate a unique ID for the message for reporting
    var messageId =
      "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    messageDiv.dataset.messageId = messageId;

    // Use VoiceroSupport to attach the report button if available
    if (window.VoiceroSupport) {
      // Use a small delay to ensure the DOM is ready
      setTimeout(() => {
        // Try processAIMessage first (newer method)
        if (typeof window.VoiceroSupport.processAIMessage === "function") {
          window.VoiceroSupport.processAIMessage(messageDiv, interfaceType);
        }
        // Fall back to attachReportButtonToMessage if available
        else if (
          typeof window.VoiceroSupport.attachReportButtonToMessage ===
          "function"
        ) {
          window.VoiceroSupport.attachReportButtonToMessage(
            messageDiv,
            interfaceType,
          );
        }
      }, 100);
    }

    console.log("VoiceroContact: Form created and added to messages container");
  },

  // Fallback method to create contact form directly in the chat container
  createContactFormInChat: function (shadowRoot) {
    console.log("VoiceroContact: Using fallback method to create contact form");

    // Create the contact form HTML
    var contactFormHTML = `
      <div class="contact-form-container">
        <h3>How can we help?</h3>
        <p>Please fill out the form below and we'll get back to you soon.</p>
        <div class="form-group">
          <label for="contact-email">Email:</label>
          <input type="email" id="contact-email" placeholder="Your email address" required>
        </div>
        <div class="form-group">
          <label for="contact-message">Message:</label>
          <textarea id="contact-message" placeholder="How can we help you?" rows="4" required></textarea>
        </div>
        <div class="form-actions">
          <button id="contact-submit" class="contact-submit-btn">Submit</button>
          <button id="contact-cancel" class="contact-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    // Create a message element in the AI chat interface
    var messageDiv = document.createElement("div");
    messageDiv.className = "message ai-message";

    // Create message content
    var contentDiv = document.createElement("div");
    contentDiv.className = "contact-form-message";
    contentDiv.innerHTML = contactFormHTML;

    // Style the form to match the chat interface
    contentDiv.style.maxWidth = "85%";
    contentDiv.style.width = "320px";
    contentDiv.style.padding = "0";
    contentDiv.style.backgroundColor = "#f0f0f0";
    contentDiv.style.borderRadius = "18px";
    contentDiv.style.borderBottomLeftRadius = "4px";
    contentDiv.style.marginBottom = "10px";
    contentDiv.style.overflow = "hidden";

    // Add to message div
    messageDiv.appendChild(contentDiv);

    // Add to shadow root
    shadowRoot.appendChild(messageDiv);

    // Apply styles to form elements
    this.applyFormStyles(messageDiv);

    // Set up event listeners for the form
    this.setupFormEventListeners(messageDiv, "text");

    // Generate a unique ID for the message for reporting
    var messageId =
      "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    messageDiv.dataset.messageId = messageId;

    // Use VoiceroSupport to attach the report button if available
    if (window.VoiceroSupport) {
      // Use a small delay to ensure the DOM is ready
      setTimeout(() => {
        // Try processAIMessage first (newer method)
        if (typeof window.VoiceroSupport.processAIMessage === "function") {
          window.VoiceroSupport.processAIMessage(messageDiv, "text");
        }
        // Fall back to attachReportButtonToMessage if available
        else if (
          typeof window.VoiceroSupport.attachReportButtonToMessage ===
          "function"
        ) {
          window.VoiceroSupport.attachReportButtonToMessage(messageDiv, "text");
        }
      }, 100);
    }
  },

  // Helper method to notify the user with proper message handling
  notifyUser: function (message) {
    // Use VoiceroText for notifications
    if (window.VoiceroText && window.VoiceroText.addMessage) {
      // Clear any existing typing indicator to prevent message overlap
      if (window.VoiceroText.typingIndicator) {
        if (window.VoiceroText.typingIndicator.parentNode) {
          window.VoiceroText.typingIndicator.parentNode.removeChild(
            window.VoiceroText.typingIndicator,
          );
        }
        window.VoiceroText.typingIndicator = null;
      }

      // Find the messages container and force a re-render if possible
      var messagesContainer = document
        .querySelector("#voicero-chat-container")
        ?.shadowRoot?.querySelector(".messages-container");
      if (messagesContainer) {
        window.VoiceroText.addMessage(message, "ai");
        window.VoiceroText.renderMessages(messagesContainer);
      } else {
        window.VoiceroText.addMessage(message, "ai");
      }
      return;
    }

    // Only log to console, don't show alert popup
    console.log("User notification:", message);
  },

  // Apply styles to the form elements
  applyFormStyles: function (formContainer) {
    // Get the main theme color from VoiceroText - voice functionality has been removed
    let mainColor;

    // Try various ways to get it from VoiceroText
    if (window.VoiceroText) {
      if (window.VoiceroText.websiteColor) {
        mainColor = window.VoiceroText.websiteColor;
        console.log(
          "VoiceroContact: Using websiteColor from VoiceroText:",
          mainColor,
        );
      } else if (
        window.VoiceroText.colorVariants &&
        window.VoiceroText.colorVariants.main
      ) {
        mainColor = window.VoiceroText.colorVariants.main;
        console.log(
          "VoiceroContact: Using colorVariants.main from VoiceroText:",
          mainColor,
        );
      } else if (window.VoiceroText.shadowRoot) {
        // Try to find color from send button which should have the website color
        var sendButton =
          window.VoiceroText.shadowRoot.getElementById("send-message-btn");
        if (sendButton && sendButton.style.backgroundColor) {
          mainColor = sendButton.style.backgroundColor;
          console.log(
            "VoiceroContact: Using extracted color from text UI:",
            mainColor,
          );
        }
      }
    }

    // Fallback to default purple if no color found
    if (!mainColor) {
      mainColor = "#882be6";
      console.log("VoiceroContact: Using fallback color:", mainColor);
    }

    // Apply styles to form elements
    var styles = `
      .contact-form-container {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background-color: #ffffff;
        border-radius: 12px !important;
        padding: 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        overflow: hidden !important;
      }

      .contact-form-message {
        border-radius: 12px !important;
        overflow: hidden !important;
      }

      .ai-message .contact-form-message {
        border-radius: 12px !important;
        border-bottom-left-radius: 4px !important;
        background-color: #ffffff !important;
        overflow: hidden !important;
      }

      .contact-form-container h3 {
        margin: 0 0 10px 0;
        font-size: 18px;
        color: #333;
        font-weight: 600;
      }

      .contact-form-container p {
        margin: 0 0 18px 0;
        font-size: 14px;
        color: #555;
        line-height: 1.4;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-group label {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        color: #444;
        font-weight: 500;
      }

      .form-group input,
      .form-group textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ddd;
        border-radius: 10px;
        font-size: 14px;
        box-sizing: border-box;
        transition: all 0.2s ease;
        background-color: #f9f9f9;
      }

      .form-group input:hover,
      .form-group textarea:hover {
        border-color: #bbb;
      }

      .form-group input:focus,
      .form-group textarea:focus {
        outline: none;
        border-color: ${mainColor};
        background-color: #fff;
        box-shadow: 0 0 0 3px rgba(${parseInt(mainColor.slice(1, 3), 16)},
                                   ${parseInt(mainColor.slice(3, 5), 16)},
                                   ${parseInt(mainColor.slice(5, 7), 16)}, 0.15);
      }

      .form-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
      }

      .contact-submit-btn,
      .contact-cancel-btn {
        padding: 10px 18px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        min-width: 100px;
        text-align: center;
      }

      .contact-submit-btn {
        background-color: ${mainColor} !important;
        color: white !important;
        box-shadow: 0 2px 5px rgba(${parseInt(mainColor.slice(1, 3), 16)},
                                  ${parseInt(mainColor.slice(3, 5), 16)},
                                  ${parseInt(mainColor.slice(5, 7), 16)}, 0.3);
      }

      .contact-submit-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(${parseInt(mainColor.slice(1, 3), 16)},
                                  ${parseInt(mainColor.slice(3, 5), 16)},
                                  ${parseInt(mainColor.slice(5, 7), 16)}, 0.4);
      }

      /* Force color with !important to override any other styles */
      .contact-form-message .contact-submit-btn {
        background-color: ${mainColor} !important;
        color: white !important;
      }

      .contact-cancel-btn {
        background-color: #f2f2f2;
        color: #555;
      }

      .contact-cancel-btn:hover {
        background-color: #e5e5e5;
      }

      .form-error {
        color: #e53935;
        font-size: 12px;
        margin-top: 5px;
        padding-left: 2px;
      }
    `;

    // Apply styles directly to the container element first
    if (formContainer) {
      var contactFormMessage = formContainer.querySelector(
        ".contact-form-message",
      );
      if (contactFormMessage) {
        contactFormMessage.style.cssText = `
          border-radius: 12px !important;
          background-color: #ffffff !important;
          overflow: hidden !important;
        `;
      }

      var contactFormContainer = formContainer.querySelector(
        ".contact-form-container",
      );
      if (contactFormContainer) {
        contactFormContainer.style.cssText = `
          border-radius: 12px !important;
          background-color: #ffffff !important;
          overflow: hidden !important;
        `;
      }
    }

    // Determine where to add the styles based on interface
    // For voice interface, add styles directly to the document head
    if (document.getElementById("voice-messages")) {
      // Check if style already exists
      var existingStyle = document.getElementById("voicero-contact-styles");
      if (existingStyle) {
        existingStyle.textContent = styles;
      } else {
        var styleEl = document.createElement("style");
        styleEl.id = "voicero-contact-styles";
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
      }
    }
    // For text interface with shadow DOM
    else {
      // Try to find the chat container and its shadow root
      var chatContainer = document.getElementById("voicero-chat-container");
      if (chatContainer && chatContainer.shadowRoot) {
        // Check if style already exists in shadow DOM
        var existingStyle = chatContainer.shadowRoot.getElementById(
          "voicero-contact-styles",
        );
        if (existingStyle) {
          existingStyle.textContent = styles;
        } else {
          var styleEl = document.createElement("style");
          styleEl.id = "voicero-contact-styles";
          styleEl.textContent = styles;
          chatContainer.shadowRoot.appendChild(styleEl);
        }
      }
      // Fallback to adding styles to document head
      else {
        var existingStyle = document.getElementById("voicero-contact-styles");
        if (existingStyle) {
          existingStyle.textContent = styles;
        } else {
          var styleEl = document.createElement("style");
          styleEl.id = "voicero-contact-styles";
          styleEl.textContent = styles;
          document.head.appendChild(styleEl);
        }
      }
    }
  },

  // Set up event listeners for the form
  setupFormEventListeners: function (formContainer, interfaceType) {
    // Get form elements
    var submitButton = formContainer.querySelector("#contact-submit");
    var cancelButton = formContainer.querySelector("#contact-cancel");
    var emailInput = formContainer.querySelector("#contact-email");
    var messageInput = formContainer.querySelector("#contact-message");

    // Directly set the button color to match current interface
    if (submitButton) {
      // Get the main theme color with more aggressive checks
      let buttonColor = "#882be6"; // Default purple

      // Get color from text interface
      if (window.VoiceroText && window.VoiceroText.websiteColor) {
        buttonColor = window.VoiceroText.websiteColor;
      }
      // If still default, try harder to get the color
      if (buttonColor === "#882be6") {
        if (window.VoiceroText && window.VoiceroText.websiteColor) {
          buttonColor = window.VoiceroText.websiteColor;
        }
        // Try to get from document style if available
        else if (
          document.documentElement.style.getPropertyValue(
            "--voicero-theme-color",
          )
        ) {
          buttonColor = document.documentElement.style.getPropertyValue(
            "--voicero-theme-color",
          );
        }
      }

      // Forcefully apply the color to the button
      submitButton.style.backgroundColor = buttonColor;

      // SUPER AGGRESSIVE APPROACH: Force the color with !important inline style
      submitButton.setAttribute(
        "style",
        `background-color: ${buttonColor} !important;
         color: white !important;
         border-radius: 20px !important;
         padding: 8px 16px !important;
         font-size: 13px !important;
         font-weight: 500 !important;
         cursor: pointer !important;
         transition: all 0.2s ease !important;
         border: none !important;
         min-width: 90px !important;
         text-align: center !important;
         box-shadow: 0 2px 5px rgba(${parseInt(buttonColor.slice(1, 3), 16)},
                                  ${parseInt(buttonColor.slice(3, 5), 16)},
                                  ${parseInt(buttonColor.slice(5, 7), 16)}, 0.3) !important;`,
      );

      // Also set a timeout to apply the color again after a short delay in case it gets overridden
      setTimeout(() => {
        submitButton.setAttribute(
          "style",
          `background-color: ${buttonColor} !important;
           color: white !important;
           border-radius: 20px !important;
           padding: 8px 16px !important;
           font-size: 13px !important;
           font-weight: 500 !important;
           cursor: pointer !important;
           transition: all 0.2s ease !important;
           border: none !important;
           min-width: 90px !important;
           text-align: center !important;
           box-shadow: 0 2px 5px rgba(${parseInt(buttonColor.slice(1, 3), 16)},
                                    ${parseInt(buttonColor.slice(3, 5), 16)},
                                    ${parseInt(buttonColor.slice(5, 7), 16)}, 0.3) !important;`,
        );
      }, 100);

      // And check again after the form is fully rendered
      setTimeout(() => {
        if (
          submitButton.style.backgroundColor !== buttonColor ||
          submitButton.style.borderRadius !== "20px"
        ) {
          submitButton.setAttribute(
            "style",
            `background-color: ${buttonColor} !important;
             color: white !important;
             border-radius: 20px !important;
             padding: 8px 16px !important;
             font-size: 13px !important;
             font-weight: 500 !important;
             cursor: pointer !important;
             transition: all 0.2s ease !important;
             border: none !important;
             min-width: 90px !important;
             text-align: center !important;
             box-shadow: 0 2px 5px rgba(${parseInt(buttonColor.slice(1, 3), 16)},
                                      ${parseInt(buttonColor.slice(3, 5), 16)},
                                      ${parseInt(buttonColor.slice(5, 7), 16)}, 0.3) !important;`,
          );
          console.log("VoiceroContact: Re-applied button color after render");
        }
      }, 500);
    }

    // Make sure cancel button is also properly rounded
    if (cancelButton) {
      cancelButton.setAttribute(
        "style",
        `background-color: #f2f2f2 !important;
         color: #555 !important;
         border-radius: 20px !important;
         padding: 8px 16px !important;
         font-size: 13px !important;
         font-weight: 500 !important;
         cursor: pointer !important;
         transition: all 0.2s ease !important;
         border: none !important;
         min-width: 90px !important;
         text-align: center !important;`,
      );
    }

    // Add submit handler
    if (submitButton) {
      submitButton.addEventListener("click", () => {
        // Basic validation
        if (!emailInput.value.trim()) {
          this.showFormError(emailInput, "Please enter your email address");
          return;
        }

        if (!this.validateEmail(emailInput.value.trim())) {
          this.showFormError(emailInput, "Please enter a valid email address");
          return;
        }

        if (!messageInput.value.trim()) {
          this.showFormError(messageInput, "Please enter your message");
          return;
        }

        // Check message length (must be at least 5 characters to match server validation)
        if (messageInput.value.trim().length < 5) {
          this.showFormError(
            messageInput,
            "Message must be at least 5 characters long",
          );
          return;
        }

        // Submit the form
        this.submitContactForm(
          emailInput.value.trim(),
          messageInput.value.trim(),
          formContainer,
          interfaceType,
        );
      });
    }

    // Add cancel handler
    if (cancelButton) {
      cancelButton.addEventListener("click", () => {
        // Remove the form from the chat
        formContainer.remove();

        // Add a cancellation message based on interface type
        var cancelMessage =
          "No problem! Let me know if you have any other questions.";

        this.notifyUser(cancelMessage);
      });
    }
  },

  // Show error for form field
  showFormError: function (inputElement, message) {
    // Remove any existing error message
    var parent = inputElement.parentElement;
    var existingError = parent.querySelector(".form-error");
    if (existingError) {
      existingError.remove();
    }

    // Add error styles to input
    inputElement.style.borderColor = "#ff3b30";

    // Create error message
    var errorDiv = document.createElement("div");
    errorDiv.className = "form-error";
    errorDiv.textContent = message;
    // Using the class styles from CSS

    // Add error message after input
    parent.appendChild(errorDiv);

    // Focus the input
    inputElement.focus();
  },

  // Validate email format
  validateEmail: function (email) {
    var re =
      /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
  },

  // Submit the contact form to the WordPress REST API
  submitContactForm: function (email, message, formContainer, interfaceType) {
    // Create submit in progress UI
    var submitButton = formContainer.querySelector("#contact-submit");
    var originalText = submitButton.textContent;
    submitButton.textContent = "Sending...";
    submitButton.disabled = true;
    submitButton.style.opacity = "0.7";

    // Create the request data
    var requestData = {
      email: email,
      message: message,
    };

    // Add threadId from the session if available
    if (window.VoiceroCore && window.VoiceroCore.session) {
      // Try to get the current thread ID - we need the 'id' property, not the 'threadId' property
      let threadId = null;

      // First check if VoiceroCore.thread is available
      if (window.VoiceroCore.thread && window.VoiceroCore.thread.id) {
        // Get the 'id' value from the thread object
        threadId = window.VoiceroCore.thread.id;
        console.log("Using thread.id:", threadId);
      }
      // If still not found, try to get the most recent thread from the session
      else if (
        window.VoiceroCore.session.threads &&
        window.VoiceroCore.session.threads.length > 0
      ) {
        // Sort threads by lastMessageAt or createdAt to get the most recent
        var threads = [...window.VoiceroCore.session.threads];
        var sortedThreads = threads.sort((a, b) => {
          if (a.lastMessageAt && b.lastMessageAt) {
            return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
          }
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // Get the most recent thread
        var thread = sortedThreads[0];

        // Use the id property (not the threadId property)
        if (thread.id) {
          threadId = thread.id;
          console.log("Using thread.id from session:", threadId);
        }
      }

      // Add threadId to request if found (must use camelCase to match the API)
      if (threadId) {
        requestData.threadId = threadId;
      }

      // Get websiteId - REQUIRED by the API
      if (window.VoiceroCore.websiteId) {
        requestData.websiteId = window.VoiceroCore.websiteId;
      } else if (window.VoiceroCore.session.websiteId) {
        requestData.websiteId = window.VoiceroCore.session.websiteId;
      } else {
        // Log error if websiteId is missing
        console.error("Contact form - Missing required websiteId");
      }

      console.log("VoiceroCore thread:", window.VoiceroCore.thread);
      console.log("VoiceroCore websiteId:", window.VoiceroCore.websiteId);
      console.log("Sending contact form data:", requestData);
    }

    // Send the request to the WordPress REST API
    fetch("https://www.voicero.ai/api/contacts/help", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    })
      .then((response) => {
        if (!response.ok) {
          // Get the error details from the response
          return response
            .json()
            .then((errorData) => {
              console.error("Contact form submission error:", errorData);
              throw new Error(errorData.error || "Network response was not ok");
            })
            .catch((jsonError) => {
              // If we can't parse the JSON, use the status text
              console.error(
                "Contact form error response parsing failed:",
                jsonError,
              );
              throw new Error(
                `Request failed: ${response.status} ${response.statusText}`,
              );
            });
        }
        return response.json();
      })
      .then((data) => {
        // Remove the form
        formContainer.remove();

        // Show success message based on interface type
        var successMessage =
          "Thank you for your message! We've received your request and will get back to you soon.";

        this.notifyUser(successMessage);
      })
      .catch((error) => {
        // Restore button state
        submitButton.textContent = originalText;
        submitButton.disabled = false;
        submitButton.style.opacity = "1";

        // Show error message
        var formActions = formContainer.querySelector(".form-actions");
        var existingError = formContainer.querySelector(".form-submit-error");

        if (existingError) {
          existingError.remove();
        }

        var errorDiv = document.createElement("div");
        errorDiv.className = "form-error";
        errorDiv.textContent =
          "There was a problem sending your message. Please try again.";
        // Using the class styles from CSS

        if (formActions) {
          formActions.parentNode.insertBefore(
            errorDiv,
            formActions.nextSibling,
          );
        }
      });
  },
};

// Initialize when document is ready
document.addEventListener("DOMContentLoaded", () => {
  // Initialize only if VoiceroText is available
  if (window.VoiceroText) {
    VoiceroContact.init();
  } else {
    // Wait for VoiceroText to be available
    let attempts = 0;
    var checkInterval = setInterval(() => {
      attempts++;
      if (window.VoiceroText) {
        clearInterval(checkInterval);
        VoiceroContact.init();
      } else if (attempts >= 50) {
        clearInterval(checkInterval);
        console.error("VoiceroText not available after 50 attempts");
      }
    }, 100);
  }
});

// Expose to global scope
window.VoiceroContact = VoiceroContact;
