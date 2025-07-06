/**
 * VoiceroAI Core Module - Minimal Version
 */

(function (window, document) {
  var VoiceroCore = {
    apiBaseUrls: ["https://www.voicero.ai"],
    apiBaseUrl: null,
    apiConnected: false,
    session: null,
    websiteColor: "#882be6",
    isWebsiteActive: true,
    appState: {},
    currentPageUrl: window.location.href,

    init: function () {
      console.log("VoiceroCore: Initializing");

      // Set up global reference
      window.VoiceroCore = this;

      // Initialize appState
      this.appState = this.appState || {};
      this.appState.hasShownHelpBubble = false;

      // Store the initial page URL
      this.currentPageUrl = window.location.href;

      // Check for existing session ID in localStorage
      const savedSessionId = localStorage.getItem("voicero_session_id");
      const savedSession = localStorage.getItem("voicero_session");

      if (savedSessionId && savedSession) {
        try {
          // Parse saved session
          this.session = JSON.parse(savedSession);
          this.sessionId = savedSessionId;

          console.log(
            "VoiceroCore: Loaded existing session ID:",
            savedSessionId,
          );
          console.log(
            "VoiceroCore: Loaded existing session data:",
            this.session,
          );

          // Get thread ID if available
          const threadId = localStorage.getItem("voicero_thread_id");
          if (threadId) {
            console.log("VoiceroCore: Loaded existing thread ID:", threadId);
            // Initialize thread object
            this.thread = { id: threadId };
          }

          // Get website ID from session
          if (this.session && this.session.websiteId) {
            this.websiteId = this.session.websiteId;
            console.log(
              "VoiceroCore: Got websiteId from session:",
              this.websiteId,
            );

            // Set website ID in config for other modules
            if (window.voiceroConfig) {
              window.voiceroConfig.websiteId = this.websiteId;
            }
          }
        } catch (error) {
          console.error("VoiceroCore: Error parsing saved session:", error);
          // Clear invalid session data
          localStorage.removeItem("voicero_session_id");
          localStorage.removeItem("voicero_session");
          localStorage.removeItem("voicero_thread_id");
        }
      } else {
        console.log("VoiceroCore: No existing session found");
      }

      // Try to get website ID from config if not found in session
      if (
        !this.websiteId &&
        window.voiceroConfig &&
        window.voiceroConfig.websiteId
      ) {
        this.websiteId = window.voiceroConfig.websiteId;
        console.log("VoiceroCore: Got websiteId from config:", this.websiteId);
      }

      // If we have a website ID but no session, create a new session
      if (this.websiteId && !this.sessionId) {
        console.log(
          "VoiceroCore: Creating new session with website ID:",
          this.websiteId,
        );
        this.createSession();
      }
      // If we have a session ID but want to ensure we have the latest data
      else if (this.sessionId && this.websiteId) {
        console.log(
          "VoiceroCore: Fetching latest session data for ID:",
          this.sessionId,
        );
        this.fetchExistingSession(this.sessionId);
      }

      // Initialize the API connection
      console.log("VoiceroCore: Checking API connection");
      this.checkApiConnection();
    },

    // Create the main interface with the button
    createButton: function () {
      // Make sure theme colors are updated
      this.updateThemeColor(this.websiteColor);

      // Add CSS Animations for fade-in effect
      var styleEl = document.createElement("style");
      styleEl.innerHTML = `
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* Help Bubble Styles */
      #voicero-help-bubble {
        position: fixed;
        bottom: 80px;
        right: 30px;
        background-color: white;
        border: 1px solid #000;
        box-shadow: 4px 4px 0 rgb(0, 0, 0);
        border-radius: 8px;
        padding: 10px 15px;
        font-size: 16px;
        font-weight: bold;
        z-index: 2147483646;
        display: none;
        animation: fadeIn 0.3s ease-out;
        color: #000;
        font-family: Arial, sans-serif;
      }
      
      #voicero-help-bubble:after {
        content: "";
        position: absolute;
        bottom: -10px;
        right: 20px;
        border-width: 10px 10px 0;
        border-style: solid;
        border-color: white transparent transparent;
        display: block;
        width: 0;
      }
      
      #voicero-help-bubble:before {
        content: "";
        position: absolute;
        bottom: -11px;
        right: 19px;
        border-width: 11px 11px 0;
        border-style: solid;
        border-color: #000 transparent transparent;
        display: block;
        width: 0;
      }
      
      #voicero-help-close {
        position: absolute;
        top: 3px;
        left: 6px;
        cursor: pointer;
        font-size: 16px;
        color: #000;
        background: none;
        border: none;
        padding: 0 2px;
      }
      
      #voicero-help-close:hover {
        opacity: 0.7;
      }
    `;
      document.head.appendChild(styleEl);

      // Use the website color from API or default
      var themeColor = this.websiteColor || "#882be6";

      // Check if the container exists, otherwise append to body
      let container = document.getElementById("voicero-app-container");

      if (!container) {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="voicero-app-container"></div>`,
        );
        container = document.getElementById("voicero-app-container");
      }

      // Ensure the container is visible
      if (container) {
        container.style.display = "block";
        container.style.visibility = "visible";
        container.style.opacity = "1";
      }

      if (container) {
        // Create the button container inside the main container
        container.innerHTML = `<div id="voice-toggle-container"></div>`;
        var buttonContainer = document.getElementById("voice-toggle-container");

        if (buttonContainer) {
          // Apply styles directly to the element
          buttonContainer.style.cssText = `
          position: fixed !important;
          bottom: 20px !important;
          right: 20px !important;
          z-index: 999999 !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          margin: 0 !important;
          padding: 0 !important;
          transform: none !important;
          top: auto !important;
          left: auto !important;
          height: auto !important;
          width: auto !important;
          overflow: visible !important;
          pointer-events: auto !important;
        `;

          // Message icon
          var iconSvg = `<svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>`;

          // Add the main button with the icon
          buttonContainer.innerHTML = `
          <button id="chat-website-button" class="visible" style="background-color: ${themeColor}; animation: pulse 2s infinite; position: relative;">
            ${iconSvg}
          </button>
        `;

          // Add help bubble
          var clickMessage = this.clickMessage || "Need Help Shopping?";

          buttonContainer.insertAdjacentHTML(
            "beforeend",
            `<div id="voicero-help-bubble" style="bottom: 90px !important;">
              <button id="voicero-help-close">×</button>
              ${clickMessage}
            </div>`,
          );

          // Apply button animation
          this.applyButtonAnimation();

          // Add click handler for help bubble close button
          var helpBubble = document.getElementById("voicero-help-bubble");
          var helpClose = document.getElementById("voicero-help-close");

          if (helpClose && helpBubble) {
            helpClose.addEventListener("click", function (e) {
              e.preventDefault();
              e.stopPropagation();
              helpBubble.style.display = "none";
              // Mark as shown so it doesn't appear again this session
              if (window.VoiceroCore) {
                window.VoiceroCore.appState.hasShownHelpBubble = true;
              }
            });
          }

          // Show help bubble function
          this.showHelpBubble = function () {
            // If bubble has already been shown this session, don't show it again
            if (this.appState && this.appState.hasShownHelpBubble) {
              return;
            }

            var helpBubble = document.getElementById("voicero-help-bubble");
            var mainButton = document.getElementById("chat-website-button");

            // Only proceed if help bubble exists and main button is visible
            if (
              helpBubble &&
              mainButton &&
              window.getComputedStyle(mainButton).display !== "none" &&
              window.getComputedStyle(mainButton).visibility !== "hidden"
            ) {
              // Update the content of the help bubble
              helpBubble.innerHTML = `<button id="voicero-help-close">×</button>${clickMessage}`;

              // Add click handler for the close button
              var helpClose = helpBubble.querySelector("#voicero-help-close");
              if (helpClose) {
                helpClose.addEventListener("click", function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  helpBubble.style.display = "none";
                  if (window.VoiceroCore) {
                    window.VoiceroCore.appState.hasShownHelpBubble = true;
                  }
                });
              }

              helpBubble.style.display = "block";
              this.appState.hasShownHelpBubble = true;
            }
          };

          // Show help bubble after a delay
          setTimeout(() => this.showHelpBubble(), 2000);

          // Add click handler for the main button
          var mainButton = document.getElementById("chat-website-button");
          if (mainButton) {
            mainButton.addEventListener("click", function (e) {
              e.preventDefault();
              e.stopPropagation();

              // Hide help bubble when button is clicked
              var helpBubble = document.getElementById("voicero-help-bubble");
              if (helpBubble) {
                helpBubble.style.display = "none";
                window.VoiceroCore.appState.hasShownHelpBubble = true;
              }

              // Check if the welcome screen should be reopened
              if (
                window.VoiceroWelcome &&
                window.VoiceroWelcome.reopenWelcomeScreen
              ) {
                window.VoiceroWelcome.reopenWelcomeScreen();
                return;
              }

              // Just show welcome screen when button is clicked
              if (
                window.VoiceroWelcome &&
                window.VoiceroWelcome.createWelcomeContainer
              ) {
                window.VoiceroWelcome.createWelcomeContainer();
              }
            });
          }
        }
      }
    },

    // Check API connection
    checkApiConnection: function () {
      console.log("VoiceroCore: Starting API connection check");

      // Try each API base URL
      this.apiBaseUrls.forEach((baseUrl) => {
        console.log("VoiceroCore: Trying API URL:", baseUrl);

        // Get auth headers from config if available
        var headers = {
          Accept: "application/json",
          ...(window.voiceroConfig?.getAuthHeaders
            ? window.voiceroConfig.getAuthHeaders()
            : {}),
        };

        fetch(`${baseUrl}/api/connect`, {
          method: "GET",
          headers: headers,
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`API connection failed: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            console.log("VoiceroCore: API connection successful:", data);

            // Store the working API URL
            this.apiBaseUrl = baseUrl;
            this.apiConnected = true;
            this.isWebsiteActive = data.websiteFound;
            this.websiteId = data.website?.id;

            // Store website ID in voiceroConfig for other modules to access
            if (window.voiceroConfig && data.website?.id) {
              window.voiceroConfig.websiteId = data.website.id;
            }

            // Set website color if provided by API
            if (data.website?.color) {
              this.websiteColor = data.website.color;
              this.updateThemeColor(this.websiteColor);
            }

            // Save botName and customWelcomeMessage
            if (data.website?.botName) {
              this.botName = data.website.botName;
              window.voiceroBotName = data.website.botName;
            }

            if (data.website?.customWelcomeMessage) {
              this.customWelcomeMessage = data.website.customWelcomeMessage;
              window.voiceroCustomWelcomeMessage =
                data.website.customWelcomeMessage;
            }

            if (data.website?.clickMessage) {
              this.clickMessage = data.website.clickMessage;
              window.voiceroClickMessage = data.website.clickMessage;
            }

            // Create the button now that we have API connection
            this.createButton();

            // Check for existing session
            var savedSession = localStorage.getItem("voicero_session");
            if (savedSession) {
              try {
                this.session = JSON.parse(savedSession);
                console.log("VoiceroCore: Loaded saved session:", this.session);

                // Force create a new session if we don't have a thread
                if (
                  !this.session.threads ||
                  this.session.threads.length === 0
                ) {
                  console.log(
                    "VoiceroCore: No threads in saved session, creating new session",
                  );
                  this.createSession();
                }
              } catch (error) {
                console.error(
                  "VoiceroCore: Error parsing saved session:",
                  error,
                );
                this.createSession();
              }
            } else {
              console.log(
                "VoiceroCore: No saved session found, creating new session",
              );
              this.createSession();
            }
          })
          .catch((error) => {
            console.error("VoiceroCore: API connection failed:", error);

            // Try to create session anyway with default values
            if (window.voiceroConfig && window.voiceroConfig.websiteId) {
              console.log(
                "VoiceroCore: Attempting to create session with default values",
              );
              this.websiteId = window.voiceroConfig.websiteId;
              this.createSession();
            }
          });
      });
    },

    // Create a new session
    createSession: function () {
      console.log("VoiceroCore: Starting session creation");

      if (!this.websiteId) {
        console.error("VoiceroCore: Cannot create session - no website ID");
        return;
      }

      var proxyUrl = "http://localhost:3000/api/session";
      var currentPageUrl = window.location.href;
      var shopifyCustomerId = window.__VoiceroCustomerId || null;

      // Create request body
      var requestBody = JSON.stringify({
        websiteId: this.websiteId,
        pageUrl: currentPageUrl,
        ...(shopifyCustomerId && { shopifyCustomerId }),
      });

      console.log("VoiceroCore: Creating session with data:", requestBody);

      // Try to create session with fallback to production URL
      this.callSessionAPI(proxyUrl, requestBody)
        .catch((error) => {
          console.log(
            "VoiceroCore: Local session API failed, trying production:",
            error,
          );
          return this.callSessionAPI(
            "https://www.voicero.ai/api/session",
            requestBody,
          );
        })
        .catch((error) => {
          console.error(
            "VoiceroCore: Both session API endpoints failed:",
            error,
          );
        });
    },

    // Fetch existing session by ID
    fetchExistingSession: function (sessionId) {
      if (!sessionId) {
        console.error("VoiceroCore: Cannot fetch session - no session ID");
        return;
      }

      console.log("VoiceroCore: Fetching existing session:", sessionId);

      // Build the URL with query parameters
      const baseUrl = "http://localhost:3000/api/session";
      const url = `${baseUrl}?sessionId=${encodeURIComponent(sessionId)}&websiteId=${encodeURIComponent(this.websiteId)}&pageUrl=${encodeURIComponent(window.location.href)}`;

      // Get auth headers
      const headers = {
        Accept: "application/json",
        ...(window.voiceroConfig?.getAuthHeaders
          ? window.voiceroConfig.getAuthHeaders()
          : {}),
      };

      // Try local server first
      this.callSessionGetAPI(url, headers)
        .catch((error) => {
          console.log(
            "VoiceroCore: Local session GET failed, trying production:",
            error,
          );

          // Try production URL as fallback
          const prodUrl = `https://www.voicero.ai/api/session?sessionId=${encodeURIComponent(sessionId)}&websiteId=${encodeURIComponent(this.websiteId)}&pageUrl=${encodeURIComponent(window.location.href)}`;
          return this.callSessionGetAPI(prodUrl, headers);
        })
        .catch((error) => {
          console.error(
            "VoiceroCore: Both session GET endpoints failed:",
            error,
          );
        });
    },

    // Helper method to call session GET API
    callSessionGetAPI: function (url, headers) {
      return fetch(url, {
        method: "GET",
        headers: headers,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Get session failed: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("VoiceroCore: Session retrieved successfully:", data);

          // Process session data the same way as in callSessionAPI
          if (data.session) {
            // Store the complete session object
            this.session = data.session;
            console.log("VoiceroCore: Updated session data:", this.session);

            // Add our custom fields
            this.session.botName = this.botName || "";
            this.session.customWelcomeMessage = this.customWelcomeMessage || "";
            this.session.clickMessage =
              this.clickMessage || "Need Help Shopping?";
            this.session.websiteColor = this.websiteColor || "#882be6";

            // Store session in localStorage
            if (data.session.id) {
              this.sessionId = data.session.id;
              localStorage.setItem("voicero_session_id", data.session.id);
              localStorage.setItem(
                "voicero_session",
                JSON.stringify(this.session),
              );
            }
          }

          // Process thread data
          if (data.thread) {
            this.thread = data.thread;
            console.log("VoiceroCore: Updated thread data:", this.thread);

            // Get thread ID
            const threadId = data.thread.id || data.thread.threadId;
            if (threadId) {
              console.log("VoiceroCore: Storing updated thread ID:", threadId);
              localStorage.setItem("voicero_thread_id", threadId);
              this.thread.id = threadId;
            }
          }

          return data;
        });
    },

    // Helper method to call session API
    callSessionAPI: function (url, requestBody) {
      return fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(window.voiceroConfig?.getAuthHeaders
            ? window.voiceroConfig.getAuthHeaders()
            : {}),
        },
        body: requestBody,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Create session failed: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("VoiceroCore: Session created successfully:", data);

          // Store session data
          if (data.session) {
            // Store the complete session object to preserve all fields
            this.session = data.session;

            console.log("VoiceroCore: Full session data:", this.session);

            // Add our custom fields
            this.session.botName = this.botName || "";
            this.session.customWelcomeMessage = this.customWelcomeMessage || "";
            this.session.clickMessage =
              this.clickMessage || "Need Help Shopping?";
            this.session.websiteColor = this.websiteColor || "#882be6";

            // Log threads if present
            if (data.session.threads && data.session.threads.length > 0) {
              console.log(
                "VoiceroCore: Session has threads:",
                data.session.threads.length,
              );

              // Log the first thread ID
              const firstThread = data.session.threads[0];
              console.log(
                "VoiceroCore: First thread ID:",
                firstThread.id || firstThread.threadId,
              );
            }

            // Store session in localStorage
            if (data.session.id) {
              this.sessionId = data.session.id;
              localStorage.setItem("voicero_session_id", data.session.id);
              localStorage.setItem(
                "voicero_session",
                JSON.stringify(this.session),
              );
            }
          }

          // Store thread data if provided
          if (data.thread) {
            this.thread = data.thread;
            console.log("VoiceroCore: Stored thread:", this.thread);

            // Get the correct thread ID field
            const threadId = data.thread.id || data.thread.threadId;

            // Also store thread ID in localStorage
            if (threadId) {
              console.log(
                "VoiceroCore: Storing thread ID in localStorage:",
                threadId,
              );
              localStorage.setItem("voicero_thread_id", threadId);

              // Make sure thread.id is set
              this.thread.id = threadId;
            }
          } else if (
            data.session &&
            data.session.threads &&
            data.session.threads.length > 0
          ) {
            // If no separate thread data but threads in session, use the first thread
            this.thread = data.session.threads[0];
            console.log(
              "VoiceroCore: Using first thread from session:",
              this.thread,
            );

            // Get the correct thread ID field
            const threadId = this.thread.id || this.thread.threadId;

            // Store thread ID in localStorage
            if (threadId) {
              console.log(
                "VoiceroCore: Storing thread ID from session in localStorage:",
                threadId,
              );
              localStorage.setItem("voicero_thread_id", threadId);

              // Make sure thread.id is set
              this.thread.id = threadId;
            }
          }

          return data;
        });
    },

    // Update theme color in CSS variables
    updateThemeColor: function (color) {
      if (!color) color = this.websiteColor;

      // Update CSS variables with the theme color
      document.documentElement.style.setProperty(
        "--voicero-theme-color",
        color,
      );

      // Create a pulse style
      var pulseStyle = document.createElement("style");
      pulseStyle.innerHTML = `
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(136, 43, 230, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(136, 43, 230, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(136, 43, 230, 0);
          }
        }
      `;

      // Remove any existing pulse style and add the new one
      var existingPulseStyle = document.getElementById("voicero-pulse-style");
      if (existingPulseStyle) {
        existingPulseStyle.remove();
      }

      pulseStyle.id = "voicero-pulse-style";
      document.head.appendChild(pulseStyle);
    },

    // Add button animation
    applyButtonAnimation: function () {
      var button = document.getElementById("chat-website-button");
      if (button) {
        button.style.cssText = `
          background-color: ${this.websiteColor || "#882be6"};
          display: flex !important;
          visibility: visible !important;
          opacity: 1 !important;
          width: 50px !important;
          height: 50px !important;
          border-radius: 50% !important;
          justify-content: center !important;
          align-items: center !important;
          color: white !important;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2) !important;
          border: none !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          padding: 0 !important;
          margin: 0 !important;
          position: relative !important;
          z-index: 999999 !important;
          animation: pulse 2s infinite !important;
        `;
      }
    },
  };

  // Initialize on DOM content loaded
  document.addEventListener("DOMContentLoaded", function () {
    VoiceroCore.init();
  });

  // Also initialize immediately if DOM is already loaded
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(function () {
      VoiceroCore.init();
    }, 1);
  }

  // Expose global functions
  window.VoiceroCore = VoiceroCore;
})(window, document);
