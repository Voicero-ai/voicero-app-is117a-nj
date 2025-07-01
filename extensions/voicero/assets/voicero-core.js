/**
 * VoiceroAI Core Module - Minimal Version
 */

// Ensure compatibility with WordPress jQuery
(function (window, document) {
  // Create a minimal jQuery-like fallback when jQuery is not available
  var $ =
    window.jQuery ||
    function (selector) {
      // Return a simple object that implements a ready method
      return {
        ready: function (fn) {
          if (document.readyState !== "loading") {
            setTimeout(fn, 0);
          } else {
            document.addEventListener("DOMContentLoaded", fn);
          }
        },
      };
    };

  var VoiceroCore = {
    apiBaseUrls: ["https://www.voicero.ai"],
    apiBaseUrl: null, // Store the working API URL
    apiConnected: false, // Track connection status
    session: null, // Store the current session
    thread: null, // Store the current thread
    websiteColor: "#882be6", // Default color if not provided by API
    isInitializingSession: false, // Track if a session initialization is in progress
    sessionInitialized: false, // Track if session is fully initialized
    isWebsiteActive: false, // Track website active status
    isSessionOperationInProgress: false, // Track if any session operation is in progress
    lastSessionOperationTime: 0, // Track when the last session operation completed
    sessionOperationTimeout: 2000, // Timeout in ms to consider session operation as stuck
    appState: {}, // Store application state, including UI flags
    currentPageUrl: window.location.href, // Track current page URL
    autoHelpTimer: null, // Timer for automatic help popup
    hasShownAutoHelp: false, // Flag to track if auto help has been shown

    // Queue for pending window state updates
    pendingWindowStateUpdates: [],
    // Queue for pending session operations
    pendingSessionOperations: [],

    // Initialize on page load
    // Observe DOM for changes that might affect positioning
    // Set up URL change tracking
    setupUrlChangeTracking: function () {
      // Track initial URL as soon as session is available
      var checkSessionAndTrackUrl = () => {
        if (this.sessionId) {
          this.trackUrlMovement(window.location.href);
        } else {
          // If session ID isn't available yet, check again after a delay
          setTimeout(checkSessionAndTrackUrl, 1000);
        }
      };

      // Start the check
      checkSessionAndTrackUrl();

      // Listen for URL changes in SPAs using history API
      if (window.history && window.history.pushState) {
        // Store original methods
        var originalPushState = window.history.pushState;
        var originalReplaceState = window.history.replaceState;

        // Override pushState
        window.history.pushState = function () {
          originalPushState.apply(this, arguments);
          // Trigger a custom event
          var urlChangeEvent = new Event("urlChange");
          window.dispatchEvent(urlChangeEvent);
        };

        // Override replaceState
        window.history.replaceState = function () {
          originalReplaceState.apply(this, arguments);
          // Trigger a custom event
          var urlChangeEvent = new Event("urlChange");
          window.dispatchEvent(urlChangeEvent);
        };

        // Listen for our custom urlChange event
        window.addEventListener("urlChange", () => {
          if (this.sessionId) {
            this.trackUrlMovement(window.location.href);
          }
          // Reset auto help timer on URL change
          this.resetAutoHelpTimer();
        });

        // Also listen for popstate events
        window.addEventListener("popstate", () => {
          if (this.sessionId) {
            this.trackUrlMovement(window.location.href);
          }
          // Reset auto help timer on URL change
          this.resetAutoHelpTimer();
        });
      }

      // Check for URL changes every 2 seconds as a fallback
      setInterval(() => {
        if (this.sessionId && window.location.href !== this.currentPageUrl) {
          this.trackUrlMovement(window.location.href);
          // Reset auto help timer when URL changes
          this.resetAutoHelpTimer();
        }
      }, 2000);
    },

    setupPositionObserver: function () {
      // If we already have an observer, disconnect it first
      if (this.positionObserver) {
        this.positionObserver.disconnect();
      }

      // Create a mutation observer to watch for added elements
      this.positionObserver = new MutationObserver((mutations) => {
        // Check if any mutations might have affected bottom-right elements
        let shouldReposition = false;

        mutations.forEach((mutation) => {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            // Check if added nodes might be positioned in bottom right
            for (let i = 0; i < mutation.addedNodes.length; i++) {
              var node = mutation.addedNodes[i];
              if (node.nodeType === 1) {
                // Element node
                // Look for potential back-to-top buttons or similar elements
                if (
                  (node.classList &&
                    (node.classList.contains("back-to-top") ||
                      node.classList.contains("scroll-to-top"))) ||
                  node.tagName.toLowerCase() === "back-to-top"
                ) {
                  shouldReposition = true;
                  break;
                }
              }
            }
          }
        });

        // Reposition if needed
        if (shouldReposition) {
          console.log("VoiceroCore: DOM changed, repositioning button");
          this.ensureMainButtonVisible();
        }
      });

      // Start observing the body for all changes
      this.positionObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Also listen for window resize events
      window.addEventListener("resize", () => {
        // Debounce the resize event
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
          console.log("VoiceroCore: Window resized, checking button position");
          this.ensureMainButtonVisible();
        }, 200);
      });

      console.log("VoiceroCore: Position observer set up");
    },

    init: function () {
      console.log("VoiceroCore: Initializing");

      // Set up global reference
      window.VoiceroCore = this;

      // Initialize appState with default values - ensure it's always available
      this.appState = this.appState || {};
      this.appState.hasShownVoiceWelcome = false;
      this.appState.hasShownTextWelcome = false;
      this.appState.hasShownHelpBubble = false; // Track if help bubble has been shown
      this.appState.hasShownAutoHelp = false; // Track if auto help has been shown

      // Create additional backup for appState to prevent it from being undefined
      window.voiceroAppState = this.appState;

      // Set initializing flag to prevent button flickering during startup
      this.isInitializing = true;

      // Create global property to track button visibility timeouts
      this.buttonVisibilityTimeouts = [];

      // Track website active status - default to false until verified by API
      this.isWebsiteActive = false;

      // Make sure apiConnected is false by default until we get a successful API response
      this.apiConnected = false;

      // Store the initial page URL
      this.currentPageUrl = window.location.href;
      this.hasTrackedInitialUrl = false;

      // Set up URL change tracking
      this.setupUrlChangeTracking();

      // Check if config is available
      if (typeof voiceroConfig !== "undefined") {
        console.log("VoiceroCore: Config available:", voiceroConfig);
      } else {
        console.log("VoiceroCore: No config available");
      }

      // Step 1: First set up basic containers (but not the button yet)
      console.log("VoiceroCore: Creating interfaces - voicero - app- is117a");
      this.createTextChatInterface();

      // Make sure VoiceroText is loaded
      this.ensureTextModuleLoaded();

      // Step 2: Initialize the API connection - this will create the button
      console.log("VoiceroCore: Checking API connection");
      this.checkApiConnection();

      // Apply button animation to ensure it's attractive
      this.applyButtonAnimation();

      // Set up position observer to adjust button position when DOM changes
      this.setupPositionObserver();

      // Set up auto help timer after initialization
      this.setupAutoHelpTimer();

      // Clear initializing flag after a delay
      setTimeout(() => {
        console.log("VoiceroCore: Clearing initialization flag");
        this.isInitializing = false;
      }, 2000);

      // Don't force the button to show here anymore - wait for API
      // setTimeout(() => {
      //   this.ensureMainButtonVisible();
      // }, 500);
    },

    // Initialize API connection - empty since we call checkApiConnection directly now
    initializeApiConnection: function () {
      // This method is now empty as we call checkApiConnection directly from init
    },

    // Set up event listeners
    setupEventListeners: function () {
      // Don't create the button here - wait for API connection first

      // Create chat interface elements that might be needed
      this.createTextChatInterface();
      this.createVoiceChatInterface();
    },

    // Check for elements in the bottom right corner that might overlap with our button
    checkForBottomRightElements: function () {
      console.log("VoiceroCore: Checking for elements in bottom right corner");

      // Define elements we're looking for (by class or ID)
      var potentialOverlaps = [
        "back-to-top",
        "scroll-to-top",
        "scroll-top",
        "back-top",
        "to-top",
        "top-button",
        "scrolltop",
      ];

      // Look for these elements in the document
      let foundElement = null;
      let bottomOffset = 20; // Default bottom offset

      for (var selector of potentialOverlaps) {
        // Look by class, ID, or element name
        var elements = document.querySelectorAll(
          `.${selector}, #${selector}, ${selector}, [data-id="${selector}"]`,
        );

        if (elements.length > 0) {
          for (var el of elements) {
            var rect = el.getBoundingClientRect();
            var style = window.getComputedStyle(el);

            // Check if the element is positioned near the bottom right
            var isBottomRight =
              rect.bottom > window.innerHeight - 150 &&
              rect.right > window.innerWidth - 150 &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0";

            if (isBottomRight) {
              console.log(`VoiceroCore: Found overlap with element:`, el);
              foundElement = el;

              // Calculate the necessary offset to place our button above this element
              // We add 20px padding for good measure
              bottomOffset = window.innerHeight - rect.top + 20;
              break;
            }
          }
        }

        if (foundElement) break;
      }

      return {
        hasOverlap: !!foundElement,
        bottomOffset: bottomOffset,
        element: foundElement,
      };
    },

    // Create the main interface with the two option buttons
    createButton: function () {
      // DON'T SKIP BUTTON CREATION - Even if API isn't connected, we need the main button
      // Just log a warning instead of completely skipping
      if (!this.apiConnected) {
      }

      // Clean up any existing help bubble timeouts to prevent duplicates
      if (this.helpBubbleTimeouts && this.helpBubbleTimeouts.length > 0) {
        this.helpBubbleTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
        this.helpBubbleTimeouts = [];
      }
      if (this.helpBubbleTimeout) {
        clearTimeout(this.helpBubbleTimeout);
      }

      // Make sure theme colors are updated
      this.updateThemeColor(this.websiteColor);

      // Check for elements that might overlap with our button
      var overlapCheck = this.checkForBottomRightElements();

      // Add CSS Animations for fade-in effect only (button styling is now in updateThemeColor)
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
        // If the WordPress-added container doesn't exist, create one on the body

        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="voicero-app-container"></div>`,
        );
        container = document.getElementById("voicero-app-container");
      }

      // CRITICAL FIX: Always ensure the container is visible
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
          // Calculate bottom offset based on overlap check
          var bottomOffset = overlapCheck.hasOverlap
            ? overlapCheck.bottomOffset
            : 20;

          if (overlapCheck.hasOverlap) {
            console.log(
              `VoiceroCore: Adjusting button position to avoid overlap. Using bottom offset: ${bottomOffset}px`,
            );
          }

          // Apply styles directly to the element with !important to override injected styles
          buttonContainer.style.cssText = `
          position: fixed !important;
          bottom: ${bottomOffset}px !important;
          right: 20px !important;
          z-index: 2147483647 !important; /* Maximum z-index value to ensure it's always on top */
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          margin: 0 !important;
          padding: 0 !important;
          transform: none !important;
          top: auto !important;
          left: auto !important;
        `;

          // Always use message icon since we only have text interface now
          var iconSvg = `<svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>`;

          // Add the main button with the chosen icon
          buttonContainer.innerHTML = `
          <button id="chat-website-button" class="visible" style="background-color: ${themeColor}; animation: pulse 2s infinite; position: relative;">
            ${iconSvg}
          </button>
        `;

          // Add help bubble
          // Get clickMessage from multiple possible sources in order of priority
          var clickMessage =
            this.session && this.session.clickMessage
              ? this.session.clickMessage
              : this.clickMessage
                ? this.clickMessage
                : window.voiceroClickMessage
                  ? window.voiceroClickMessage
                  : "Need Help Shopping?";

          console.log(
            "VoiceroCore: Using clickMessage for help bubble:",
            clickMessage,
          );

          // Position the help bubble above the button by the appropriate offset
          var helpBubbleBottomOffset = overlapCheck.hasOverlap
            ? overlapCheck.bottomOffset + 60
            : 90;

          buttonContainer.insertAdjacentHTML(
            "beforeend",
            `<div id="voicero-help-bubble" style="bottom: ${helpBubbleBottomOffset}px !important;">
              <button id="voicero-help-close">×</button>
              ${clickMessage}
            </div>`,
          );

          // Apply enhanced button animation
          this.applyButtonAnimation();

          // ALWAYS force visibility on all devices
          var chatButtonEl = document.getElementById("chat-website-button");
          if (chatButtonEl) {
            chatButtonEl.style.cssText = `
              background-color: ${themeColor};
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
              z-index: 2147483647 !important;
            `;
          }

          // Calculate chooser position - needs to be at least 60px above the button
          var chooserBottomOffset = overlapCheck.hasOverlap
            ? overlapCheck.bottomOffset + 60
            : 80;

          // We no longer need the chooser element since we'll directly open the text interface
          buttonContainer.insertAdjacentHTML(
            "beforeend",
            `
            <div style="
              position: fixed !important;
              bottom: ${chooserBottomOffset}px !important;
              right: 20px !important;
              z-index: 10001 !important;
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              text-align: center;
              margin-top: 18px;
              line-height: 1;
            ">
              <div style="
                font-size: 10px;
                color: black;
                opacity: 0.8;
                margin-bottom: 2px;
              ">Powered by Voicero</div>
              <div style="
                font-size: 8px;
                color: black;
                opacity: 0.6;
              ">Voicero AI can make mistakes</div>
            </div>
          `,
          );

          // Add click handler for the main button to toggle the chooser
          var mainButton = document.getElementById("chat-website-button");
          var chooser = document.getElementById("interaction-chooser");

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

          // Improved help bubble display with multiple attempts and more relaxed conditions
          this.showHelpBubble = function () {
            // If bubble has already been shown this session, don't show it again
            if (
              window.VoiceroCore &&
              window.VoiceroCore.appState &&
              window.VoiceroCore.appState.hasShownHelpBubble
            ) {
              return;
            }

            // Check if any chat interface is open, don't show if one is
            var textInterface = document.getElementById(
              "voicero-text-chat-container",
            );
            var voiceInterface = document.getElementById(
              "voice-chat-interface",
            );
            if (
              (textInterface &&
                window.getComputedStyle(textInterface).display === "block") ||
              (voiceInterface &&
                window.getComputedStyle(voiceInterface).display === "block")
            ) {
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
              // Get the message content from multiple possible sources
              var updatedClickMessage =
                window.VoiceroCore.session &&
                window.VoiceroCore.session.clickMessage
                  ? window.VoiceroCore.session.clickMessage
                  : window.VoiceroCore.clickMessage
                    ? window.VoiceroCore.clickMessage
                    : window.voiceroClickMessage
                      ? window.voiceroClickMessage
                      : "Need Help Shopping?";

              // Update the content of the help bubble
              helpBubble.innerHTML = `<button id="voicero-help-close">×</button>${updatedClickMessage}`;

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

              console.log(
                "VoiceroCore: Showing help bubble with message:",
                updatedClickMessage,
              );
              helpBubble.style.display = "block";
              if (window.VoiceroCore) {
                window.VoiceroCore.appState.hasShownHelpBubble = true;
              }
            }
          };

          // Set multiple attempts to show the help bubble
          this.helpBubbleTimeouts = [
            setTimeout(() => this.showHelpBubble(), 2000), // First attempt after 2 seconds
            setTimeout(() => this.showHelpBubble(), 4000), // Second attempt after 4 seconds
            setTimeout(() => this.showHelpBubble(), 6000), // Third attempt after 6 seconds
          ];

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

              // Check if session operations are in progress
              if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
                console.log(
                  "VoiceroCore: Button click ignored - session operation in progress",
                );
                return;
              }

              // Check if text interface is already open
              var textInterface = document.getElementById(
                "voicero-text-chat-container",
              );

              if (textInterface && textInterface.style.display === "block") {
                // Close text interface if it's open
                if (window.VoiceroText && window.VoiceroText.closeTextChat) {
                  window.VoiceroText.closeTextChat();
                } else {
                  textInterface.style.display = "none";
                }
              } else {
                // Update session state directly to open text chat
                if (
                  window.VoiceroCore &&
                  window.VoiceroCore.updateWindowState
                ) {
                  window.VoiceroCore.updateWindowState({
                    textOpen: true,
                    textOpenWindowUp: true,
                    coreOpen: false,
                  });
                }

                // Create text interface if needed
                if (!textInterface) {
                  var container = document.getElementById(
                    "voicero-app-container",
                  );
                  if (container) {
                    container.insertAdjacentHTML(
                      "beforeend",
                      `<div id="voicero-text-chat-container" style="display: none;"></div>`,
                    );
                  }
                }

                // Try to open text interface
                if (window.VoiceroText && window.VoiceroText.openTextChat) {
                  window.VoiceroText.openTextChat();
                  // Force maximize after opening
                  setTimeout(() => {
                    if (window.VoiceroText && window.VoiceroText.maximizeChat) {
                      window.VoiceroText.maximizeChat();
                    }
                  }, 100);
                } else if (
                  window.VoiceroText &&
                  typeof window.VoiceroText.init === "function"
                ) {
                  // If VoiceroText exists but openTextChat doesn't, try initializing it first
                  console.log(
                    "VoiceroCore: VoiceroText found but openTextChat missing, initializing module",
                  );
                  window.VoiceroText.init();

                  // Try again after initialization
                  setTimeout(() => {
                    if (window.VoiceroText && window.VoiceroText.openTextChat) {
                      window.VoiceroText.openTextChat();

                      // Force maximize after opening
                      setTimeout(() => {
                        if (
                          window.VoiceroText &&
                          window.VoiceroText.maximizeChat
                        ) {
                          window.VoiceroText.maximizeChat();
                        }
                      }, 100);
                    }
                  }, 200);
                } else {
                  console.error(
                    "VoiceroCore: VoiceroText module not available or openTextChat method missing",
                  );
                  // Try to load the module
                  window.VoiceroCore.ensureTextModuleLoaded();
                }
              }
            });
          }

          // Add click handlers for voice and text buttons
          var voiceButton = document.getElementById("voice-chooser-button");
          var textButton = document.getElementById("text-chooser-button");

          if (voiceButton) {
            // Remove the inline onclick attribute
            voiceButton.removeAttribute("onclick");

            // Add event listener to open voice chat and update window state
            voiceButton.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();

              // Check if session operations are in progress
              if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
                console.log(
                  "VoiceroCore: Voice button click ignored - session operation in progress",
                );
                return;
              }

              // Hide the chooser
              if (chooser) {
                window.VoiceroCore.hideChooser();
              }

              // Update session state directly
              if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
                window.VoiceroCore.updateWindowState({
                  voiceOpen: true,
                  voiceOpenWindowUp: true,
                  textOpen: false,
                  textOpenWindowUp: false,
                  coreOpen: false,
                });
              }

              // Create voice interface if needed
              let voiceInterface = document.getElementById(
                "voice-chat-interface",
              );
              if (!voiceInterface) {
                container.insertAdjacentHTML(
                  "beforeend",
                  `<div id="voice-chat-interface" style="display: none;"></div>`,
                );
              }

              // Try to open voice interface
              if (window.VoiceroVoice && window.VoiceroVoice.openVoiceChat) {
                window.VoiceroVoice.openVoiceChat();
                // Force maximize after opening
                setTimeout(() => {
                  if (
                    window.VoiceroVoice &&
                    window.VoiceroVoice.maximizeVoiceChat
                  ) {
                    window.VoiceroVoice.maximizeVoiceChat();
                  }
                }, 100);
              }
            });
          }

          if (textButton) {
            // Remove the inline onclick attribute
            textButton.removeAttribute("onclick");

            // Add event listener to open text chat and update window state
            textButton.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();

              // Check if session operations are in progress
              if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
                console.log(
                  "VoiceroCore: Text button click ignored - session operation in progress",
                );
                return;
              }

              // Hide the chooser
              if (chooser) {
                window.VoiceroCore.hideChooser();
              }

              // Update session state directly
              if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
                window.VoiceroCore.updateWindowState({
                  textOpen: true,
                  textOpenWindowUp: true,
                  voiceOpen: false,
                  voiceOpenWindowUp: false,
                  coreOpen: false,
                });
              }

              // Create text interface if needed
              let textInterface = document.getElementById(
                "voicero-text-chat-container",
              );
              if (!textInterface) {
                container.insertAdjacentHTML(
                  "beforeend",
                  `<div id="voicero-text-chat-container" style="display: none;"></div>`,
                );
              }

              // Try to open text interface
              if (window.VoiceroText && window.VoiceroText.openTextChat) {
                window.VoiceroText.openTextChat();
                // Force maximize after opening
                setTimeout(() => {
                  if (window.VoiceroText && window.VoiceroText.maximizeChat) {
                    window.VoiceroText.maximizeChat();
                  }
                }, 100);
              }
            });
          }
        } else {
        }
      } else {
      }

      // Update the button icon based on current session
      this.updateButtonIcon();
    },

    // Create text chat interface (basic container elements)
    createTextChatInterface: function () {
      // Check if text chat interface already exists
      if (document.getElementById("voicero-text-chat-container")) {
        console.log("VoiceroCore: Text chat container already exists");
        return;
      }

      console.log("VoiceroCore: Creating text chat container");

      // Get the container or create it if not exists
      let container = document.getElementById("voicero-app-container");
      if (!container) {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="voicero-app-container"></div>`,
        );
        container = document.getElementById("voicero-app-container");
      }

      // Add the interface to the container
      if (container) {
        container.insertAdjacentHTML(
          "beforeend",
          `<div id="voicero-text-chat-container" style="display: none;"></div>`,
        );

        // Make sure VoiceroText is loaded
        this.ensureTextModuleLoaded();

        // Initialize VoiceroText if it exists
        setTimeout(() => {
          if (
            window.VoiceroText &&
            typeof window.VoiceroText.init === "function"
          ) {
            console.log(
              "VoiceroCore: Initializing VoiceroText after container creation",
            );
            window.VoiceroText.init();
          }
        }, 100);
      } else {
        console.error(
          "VoiceroCore: Failed to create text chat container - app container not found",
        );
      }
    },

    // Create voice chat interface (basic container elements)
    createVoiceChatInterface: function () {
      // Check if voice chat interface already exists
      if (document.getElementById("voice-chat-interface")) {
        return;
      }

      // Get the container or create it if not exists
      let container = document.getElementById("voicero-app-container");
      if (!container) {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="voicero-app-container"></div>`,
        );
        container = document.getElementById("voicero-app-container");
      }

      // Add the interface to the container
      if (container) {
        container.insertAdjacentHTML(
          "beforeend",
          `<div id="voice-chat-interface" style="display: none;"></div>`,
        );
      } else {
      }
    },

    // Format markdown (helper function that may be used by modules)
    formatMarkdown: function (text) {
      if (!text) return "";

      // Replace links
      text = text.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="chat-link" target="_blank">$1</a>',
      );

      // Replace bold
      text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

      // Replace italics
      text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

      // Replace line breaks
      text = text.replace(/\n/g, "<br>");

      return text;
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

        console.log("VoiceroCore: Using headers:", headers);

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

            // Set website color if provided by API
            if (data.website?.color) {
              this.websiteColor = data.website.color;
              // Update theme colors immediately
              this.updateThemeColor(this.websiteColor);
            }

            // Save ALL icon settings from API
            console.log(
              "VoiceroCore: Got ALL settings from API:",
              data.website,
            );

            // Save botName and customWelcomeMessage
            if (data.website?.botName) {
              console.log(
                "VoiceroCore: Got botName from API:",
                data.website.botName,
              );
              this.botName = data.website.botName;
              window.voiceroBotName = data.website.botName;
            }

            if (data.website?.customWelcomeMessage) {
              console.log(
                "VoiceroCore: Got customWelcomeMessage from API:",
                data.website.customWelcomeMessage,
              );
              this.customWelcomeMessage = data.website.customWelcomeMessage;
              window.voiceroCustomWelcomeMessage =
                data.website.customWelcomeMessage;
            }

            if (data.website?.clickMessage) {
              console.log(
                "VoiceroCore: Got clickMessage from API:",
                data.website.clickMessage,
              );
              this.clickMessage = data.website.clickMessage;
              window.voiceroClickMessage = data.website.clickMessage;
            }

            // ADDED: Store popup questions directly on VoiceroCore
            if (data.website?.popUpQuestions) {
              console.log(
                "VoiceroCore: Got popUpQuestions from API:",
                data.website.popUpQuestions,
              );
              this.popUpQuestions = data.website.popUpQuestions;
              window.voiceroPopUpQuestions = data.website.popUpQuestions;
            }

            // Save the entire website object
            this.website = data.website;

            // Save icon settings globally
            if (data.website?.iconBot) {
              console.log(
                "VoiceroCore: Got iconBot from API:",
                data.website.iconBot,
              );
              this.iconBot = data.website.iconBot;
              window.voiceroIconBot = data.website.iconBot;
            }

            if (data.website?.iconMessage) {
              console.log(
                "VoiceroCore: Got iconMessage from API:",
                data.website.iconMessage,
              );
              this.iconMessage = data.website.iconMessage;
              window.voiceroIconMessage = data.website.iconMessage;
            }

            if (data.website?.iconVoice) {
              console.log(
                "VoiceroCore: Got iconVoice from API:",
                data.website.iconVoice,
              );
              this.iconVoice = data.website.iconVoice;
              window.voiceroIconVoice = data.website.iconVoice;
            }

            // Save removeHighlight setting if provided by API
            if (data.website?.removeHighlight !== undefined) {
              console.log(
                "VoiceroCore: Got removeHighlight from API:",
                data.website.removeHighlight,
              );
              this.removeHighlight = data.website.removeHighlight;
              window.voiceroRemoveHighlight = data.website.removeHighlight;

              // Also update it directly in the session if it exists
              if (this.session) {
                this.session.removeHighlight = data.website.removeHighlight;
                console.log(
                  "VoiceroCore: Updated removeHighlight in session:",
                  this.session.removeHighlight,
                );
              }
            }

            console.log("VoiceroCore: Website ID:", this.websiteId);

            // Create the button now that we have API connection
            console.log("VoiceroCore: Creating button");
            this.createButton();

            // Check for existing session
            var savedSession = localStorage.getItem("voicero_session");
            if (savedSession) {
              try {
                var parsedSession = JSON.parse(savedSession);
                this.session = parsedSession;
                this.sessionId = parsedSession.id;

                // Fetch latest session data from API
                fetch(`${baseUrl}/api/session?sessionId=${this.sessionId}`, {
                  method: "GET",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    ...(window.voiceroConfig?.getAuthHeaders
                      ? window.voiceroConfig.getAuthHeaders()
                      : {}),
                  },
                })
                  .then((response) => {
                    if (!response.ok) {
                      throw new Error(
                        `Session fetch failed: ${response.status}`,
                      );
                    }
                    return response.json();
                  })
                  .then((data) => {
                    console.log("VoiceroCore: Latest session data:", data);
                    if (data.session) {
                      // Update local session with latest data
                      this.session = data.session;

                      // Make sure botName and customWelcomeMessage are transferred
                      if (data.website && data.website.botName) {
                        console.log(
                          "VoiceroCore: Setting botName in session from website data:",
                          data.website.botName,
                        );
                        this.session.botName = data.website.botName;
                      } else if (this.botName) {
                        console.log(
                          "VoiceroCore: Setting botName in session from core property:",
                          this.botName,
                        );
                        this.session.botName = this.botName;
                      }

                      if (data.website && data.website.customWelcomeMessage) {
                        console.log(
                          "VoiceroCore: Setting customWelcomeMessage in session from website data:",
                          data.website.customWelcomeMessage,
                        );
                        this.session.customWelcomeMessage =
                          data.website.customWelcomeMessage;
                      } else if (this.customWelcomeMessage) {
                        console.log(
                          "VoiceroCore: Setting customWelcomeMessage in session from core property:",
                          this.customWelcomeMessage,
                        );
                        this.session.customWelcomeMessage =
                          this.customWelcomeMessage;
                      }

                      // Make sure clickMessage is transferred
                      if (data.website && data.website.clickMessage) {
                        console.log(
                          "VoiceroCore: Setting clickMessage in session from website data:",
                          data.website.clickMessage,
                        );
                        this.session.clickMessage = data.website.clickMessage;
                      } else if (this.clickMessage) {
                        console.log(
                          "VoiceroCore: Setting clickMessage in session from core property:",
                          this.clickMessage,
                        );
                        this.session.clickMessage = this.clickMessage;
                      }

                      // Make sure removeHighlight setting is transferred from website data to session
                      if (
                        data.website &&
                        data.website.removeHighlight !== undefined
                      ) {
                        console.log(
                          "VoiceroCore: Setting removeHighlight in session from website data:",
                          data.website.removeHighlight,
                        );
                        this.session.removeHighlight =
                          data.website.removeHighlight;
                      } else if (this.removeHighlight !== undefined) {
                        console.log(
                          "VoiceroCore: Setting removeHighlight in session from core property:",
                          this.removeHighlight,
                        );
                        this.session.removeHighlight = this.removeHighlight;
                      }

                      localStorage.setItem(
                        "voicero_session",
                        JSON.stringify(data.session),
                      );
                      console.log("VoiceroCore: Updated session data saved");

                      // Make session available to other modules
                      if (window.VoiceroText) {
                        window.VoiceroText.session = this.session;
                      }
                      if (window.VoiceroVoice) {
                        window.VoiceroVoice.session = this.session;
                      }

                      // Check if we need to open any interfaces based on session state
                      if (data.session.voiceOpen === true) {
                        console.log(
                          "VoiceroCore: Opening voice interface from session state",
                        );
                        if (
                          window.VoiceroVoice &&
                          window.VoiceroVoice.openVoiceChat
                        ) {
                          // First ensure the voiceOpenWindowUp is set to true in the session
                          if (data.session) {
                            data.session.voiceOpenWindowUp = true;
                          }

                          // Then open the interface (always maximized)
                          window.VoiceroVoice.openVoiceChat();

                          // We no longer minimize based on session value when explicitly opening
                        }
                      } else if (data.session.textOpen === true) {
                        console.log(
                          "VoiceroCore: Opening text interface from session state",
                        );
                        if (
                          window.VoiceroText &&
                          window.VoiceroText.openTextChat
                        ) {
                          // First ensure the textOpenWindowUp is set to true in the session
                          if (data.session) {
                            data.session.textOpenWindowUp = true;
                          }

                          // Then open the interface (always maximized)
                          window.VoiceroText.openTextChat();

                          // We no longer minimize based on session value when explicitly opening
                        }
                      }
                    }
                  })
                  .catch((error) => {
                    console.error(
                      "VoiceroCore: Error fetching latest session:",
                      error,
                    );
                    // If session fetch fails, create a new one
                    console.log(
                      "VoiceroCore: Creating new session after fetch failure",
                    );
                    this.createSession();
                  });
              } catch (error) {
                console.error(
                  "VoiceroCore: Error parsing saved session:",
                  error,
                );
                console.log("VoiceroCore: Creating new session");
                this.createSession();
              }
            } else {
              console.log(
                "VoiceroCore: No saved session found, creating new one",
              );
              this.createSession();
            }
          })
          .catch((error) => {
            console.error("VoiceroCore: API connection failed:", error);
          });
      });
    },

    // Hide the main website button
    hideMainButton: function () {
      // Cancel any pending visibility calls that might conflict
      if (this.buttonVisibilityTimeouts) {
        this.buttonVisibilityTimeouts.forEach((timeoutId) =>
          clearTimeout(timeoutId),
        );
      }
      this.buttonVisibilityTimeouts = [];

      // Hide toggle container with comprehensive styles
      var toggleContainer = document.getElementById("voice-toggle-container");
      if (toggleContainer) {
        toggleContainer.style.cssText = `
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          z-index: -1 !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
          position: absolute !important;
        `;
      }

      // Hide main button with comprehensive styles
      var mainButton = document.getElementById("chat-website-button");
      if (mainButton) {
        mainButton.style.cssText = `
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          z-index: -1 !important;
          height: 0 !important;
          width: 0 !important;
          overflow: hidden !important;
          position: absolute !important;
        `;
      }

      // No chooser needed anymore - direct text interface only

      // Set a flag in the object to remember button is hidden
      this._buttonHidden = true;
    },

    // Initialize session
    initializeSession: function () {
      console.log("VoiceroCore: Starting session initialization");

      // Check if we have a saved session
      var savedSession = localStorage.getItem("voicero_session");
      if (savedSession) {
        try {
          console.log("VoiceroCore: Loading saved session");
          var parsedSession = JSON.parse(savedSession);
          this.session = parsedSession;
          this.sessionId = parsedSession.sessionId;
          this.websiteId = parsedSession.websiteId;

          // Load thread if available
          if (parsedSession.threads && parsedSession.threads.length > 0) {
            console.log("VoiceroCore: Loading thread from session");
            this.thread = parsedSession.threads[0];
            this.currentThreadId = parsedSession.threads[0].threadId;
          }

          console.log("VoiceroCore: Session loaded:", {
            sessionId: this.sessionId,
            websiteId: this.websiteId,
            threadId: this.currentThreadId,
            isOpen: this.session.voiceOpen,
            activeInterface: this.session.voiceOpen ? "voice" : "text",
          });

          // Check if we should show the interface
          if (this.session.voiceOpen || this.session.textOpen) {
            console.log("VoiceroCore: Should show interface");
            if (this.session.voiceOpen) {
              console.log("VoiceroCore: Opening voice interface");
              if (window.VoiceroVoice) {
                window.VoiceroVoice.openVoiceChat();
              }
            } else if (this.session.textOpen) {
              console.log("VoiceroCore: Opening text interface");
              if (window.VoiceroText) {
                window.VoiceroText.openTextChat();
              }
            }
          }
        } catch (error) {
          console.error("VoiceroCore: Error loading session:", error);
        }
      } else {
        console.log("VoiceroCore: No saved session found");
      }
    },

    // Process any pending window state updates
    processPendingWindowStateUpdates: function () {
      if (this.pendingWindowStateUpdates.length === 0 || !this.sessionId) {
        return;
      }

      // Process each pending update
      for (var update of this.pendingWindowStateUpdates) {
        this.updateWindowState(update);
      }

      // Clear the queue
      this.pendingWindowStateUpdates = [];
    },

    // Get an existing session by ID
    getSession: function (sessionId) {
      if (!this.websiteId || !sessionId) {
        this.isInitializingSession = false; // Reset flag even in error case
        return;
      }

      // Ask our REST proxy for this specific sessionId
      var currentUrl = encodeURIComponent(window.location.href);
      var proxyUrl = `https://www.voicero.ai/api/session?sessionId=${sessionId}&pageUrl=${currentUrl}`;

      fetch(proxyUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          if (!response.ok) {
            // If we can't get the session, try creating a new one
            if (response.status === 404) {
              // Set a flag to indicate we're calling from getSession to prevent checks
              this.createSessionFromGetSession();
              return null;
            }
            throw new Error(`Session request failed: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          if (!data) return; // Handle the case where we're creating a new session

          this.session = data.session;

          // Get the most recent thread
          if (
            data.session &&
            data.session.threads &&
            data.session.threads.length > 0
          ) {
            this.thread = data.session.threads[0];
          }

          // Ensure VoiceroCore.thread always matches session.threadId
          var active = this.session.threads.find(
            (t) => t.threadId === this.session.threadId,
          );
          // If session.threadId hasn't been set yet, fall back to the first one
          this.thread = active || this.session.threads[0];

          // Log detailed session info
          if (data.session) {
          }

          // Store session ID in global variable and localStorage
          if (data.session && data.session.id) {
            this.sessionId = data.session.id;
            localStorage.setItem("voicero_session_id", data.session.id);

            // Process any pending window state updates now that we have a sessionId
            this.processPendingWindowStateUpdates();

            // Ensure button visibility after session is established
            this.ensureMainButtonVisible();
          }

          // Make session available to other modules
          if (window.VoiceroText) {
            window.VoiceroText.session = this.session;
            window.VoiceroText.thread = this.thread;
          }

          if (window.VoiceroVoice) {
            window.VoiceroVoice.session = this.session;
            window.VoiceroVoice.thread = this.thread;
          }

          // Restore interface state based on session flags
          this.restoreInterfaceState();

          // Update the button icon based on loaded session
          this.updateButtonIcon();

          // Mark session as initialized and no longer initializing
          this.sessionInitialized = true;
          this.isInitializingSession = false;
        })
        .catch((error) => {
          // Reset initialization flag in error case
          this.isInitializingSession = false;

          // Try creating a new session as fallback
          this.createSessionFromGetSession();
        });
    },

    // Restore interface state based on session flags
    restoreInterfaceState: function () {
      if (!this.session) return;

      // Create a flag to track if we need to hide the button
      var shouldHideButton =
        this.session.textOpen === true || this.session.voiceOpen === true;

      // Hide the button first if needed, before any interface operations
      if (shouldHideButton) {
        // Hide button immediately to prevent flickering
        this.hideMainButton();

        // Set a flag to indicate we're currently restoring an interface
        this.isRestoringInterface = true;

        // Cancel any pending button visibility calls
        if (this.buttonVisibilityTimeouts) {
          this.buttonVisibilityTimeouts.forEach((timeoutId) =>
            clearTimeout(timeoutId),
          );
        }
        this.buttonVisibilityTimeouts = [];

        // Add more aggressive button hiding with multiple timers
        setTimeout(() => this.hideMainButton(), 100);
        setTimeout(() => this.hideMainButton(), 500);
        setTimeout(() => this.hideMainButton(), 1000);
        setTimeout(() => this.hideMainButton(), 2000);
      } else {
        // Check if we should show chooser based on session state
        if (this.session.chooserOpen === true) {
          console.log("VoiceroCore: Showing chooser from session state");
          setTimeout(() => this.displayChooser(), 300);
        } else {
          // No interfaces open and chooser not open, ensure button is visible
          this.ensureMainButtonVisible();
        }

        // Clear initialization flag after we've determined no interfaces need to be opened
        this.isInitializing = false;
        return;
      }

      // One-time function to ensure button stays hidden
      var ensureButtonHidden = () => {
        var toggleContainer = document.getElementById("voice-toggle-container");
        if (toggleContainer) {
          toggleContainer.style.cssText = `
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          `;
        }

        var mainButton = document.getElementById("chat-website-button");
        if (mainButton) {
          mainButton.style.cssText = `
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            z-index: -1 !important;
          `;
        }
      };

      // Check if text interface should be open
      if (this.session.textOpen === true) {
        // Make sure VoiceroText is initialized
        if (window.VoiceroText) {
          // First ensure the textOpenWindowUp is set to true in the session
          if (this.session) {
            this.session.textOpenWindowUp = true;
          }

          // Open the text chat (always maximized)
          window.VoiceroText.openTextChat();

          // We no longer minimize based on session value when explicitly opening

          // Multiple timeouts to ensure button stays hidden
          this.buttonVisibilityTimeouts = [
            setTimeout(() => ensureButtonHidden(), 300),
            setTimeout(() => ensureButtonHidden(), 800),
            setTimeout(() => ensureButtonHidden(), 1500),
            setTimeout(() => ensureButtonHidden(), 3000),
          ];
        }
      }
      // Check if voice interface should be open
      else if (this.session.voiceOpen === true) {
        // Make sure VoiceroVoice is initialized
        if (window.VoiceroVoice) {
          // First ensure the voiceOpenWindowUp is set to true in the session
          if (this.session) {
            this.session.voiceOpenWindowUp = true;
          }

          // Open voice chat (always maximized)
          window.VoiceroVoice.openVoiceChat();

          // We no longer minimize based on session value when explicitly opening

          // Check if auto mic should be activated
          if (this.session.autoMic === true) {
            setTimeout(() => {
              if (window.VoiceroVoice && window.VoiceroVoice.toggleMic) {
                window.VoiceroVoice.toggleMic();
              }
            }, 1000); // Longer delay for mic activation
          }

          // Multiple timeouts to ensure button stays hidden
          this.buttonVisibilityTimeouts = [
            setTimeout(() => ensureButtonHidden(), 300),
            setTimeout(() => ensureButtonHidden(), 800),
            setTimeout(() => ensureButtonHidden(), 1500),
            setTimeout(() => ensureButtonHidden(), 3000),
          ];
        }
      }

      // Clear restoration flag after a short delay
      setTimeout(() => {
        this.isRestoringInterface = false;

        // Also clear initialization flag after interface restoration is complete
        this.isInitializing = false;

        // One final check to make sure button stays hidden if interfaces are open
        if (this.session.textOpen === true || this.session.voiceOpen === true) {
          this.hideMainButton();
        }
      }, 2000);
    },

    // Create a new session specifically called from getSession
    createSessionFromGetSession: function () {
      // This is a wrapper to avoid infinite loops

      // Always allow this call to proceed even if isInitializingSession is true
      this.isInitializingSession = false;
      this.createSession();
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
            "VoiceroCore: Session operation timeout exceeded, resetting flag",
          );
          this.isSessionOperationInProgress = false;
          return false;
        }
        return true;
      }

      // Also check if VoiceroText is waiting for an API response
      if (window.VoiceroText && window.VoiceroText.isWaitingForResponse) {
        console.log(
          "VoiceroCore: Session busy - VoiceroText is waiting for API response",
        );
        return true;
      }

      return false;
    },

    // Create a new session
    createSession: function () {
      console.log("VoiceroCore: Starting session creation");

      if (!this.websiteId) {
        console.error("VoiceroCore: Cannot create session - no website ID");
        this.isInitializingSession = false;
        return;
      }

      // Set the initializing flags
      this.isInitializingSession = true;
      this.isSessionOperationInProgress = true;
      this.lastSessionOperationTime = Date.now();
      console.log("VoiceroCore: Session initialization started");

      var proxyUrl = "https://www.voicero.ai/api/session";

      // Check if Shopify customer ID is available
      var shopifyCustomerId = window.__VoiceroCustomerId || null;

      // Get current page URL
      var currentPageUrl = window.location.href;

      // Create request body with websiteId, pageUrl and shopifyCustomerId if available
      var requestBody = JSON.stringify({
        websiteId: this.websiteId,
        pageUrl: currentPageUrl,
        ...(shopifyCustomerId && { shopifyCustomerId }),
      });

      console.log("VoiceroCore: Creating session with body:", requestBody);

      try {
        fetch(proxyUrl, {
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

            // Store session and thread data
            if (data.session) {
              this.session = data.session;

              // Transfer global properties to session if not already set in API response
              if (this.botName && !data.session.botName) {
                this.session.botName = this.botName;
              }
              if (
                this.customWelcomeMessage &&
                !data.session.customWelcomeMessage
              ) {
                this.session.customWelcomeMessage = this.customWelcomeMessage;
              }

              console.log("VoiceroCore: Session stored:", this.session);

              // Store session ID in localStorage
              if (data.session.id) {
                this.sessionId = data.session.id;

                // Add clickMessage to session if available from API but not in session
                if (this.clickMessage && !data.session.clickMessage) {
                  data.session.clickMessage = this.clickMessage;
                  console.log(
                    "VoiceroCore: Added clickMessage to session:",
                    this.clickMessage,
                  );
                }

                // Store both the session ID and the full session object
                localStorage.setItem("voicero_session_id", data.session.id);
                localStorage.setItem(
                  "voicero_session",
                  JSON.stringify(data.session),
                );
                console.log(
                  "VoiceroCore: Session ID saved to localStorage:",
                  this.sessionId,
                );

                // Verify the storage
                var storedSessionId =
                  localStorage.getItem("voicero_session_id");
                var storedSession = localStorage.getItem("voicero_session");
                console.log(
                  "VoiceroCore: Verified stored session ID:",
                  storedSessionId,
                );
                console.log(
                  "VoiceroCore: Verified stored session:",
                  storedSession,
                );
              }
            }

            if (data.thread) {
              this.thread = data.thread;
              console.log("VoiceroCore: Thread stored:", this.thread);
            }

            // Make session available to other modules
            if (window.VoiceroText) {
              window.VoiceroText.session = this.session;
              window.VoiceroText.thread = this.thread;
            }

            if (window.VoiceroVoice) {
              window.VoiceroVoice.session = this.session;
              window.VoiceroVoice.thread = this.thread;
            }

            // Mark session as initialized
            this.sessionInitialized = true;
            this.isInitializingSession = false;
            this.isSessionOperationInProgress = false;
            this.lastSessionOperationTime = Date.now();
            console.log("VoiceroCore: Session initialization complete");

            // Track the current URL with the new session ID
            this.trackUrlMovement(window.location.href);
          })
          .catch((error) => {
            console.error("VoiceroCore: Session creation failed:", error);
            this.isInitializingSession = false;
            this.isSessionOperationInProgress = false;
            this.lastSessionOperationTime = Date.now();
            this.sessionInitialized = false;
          });
      } catch (error) {
        console.error("VoiceroCore: Session creation error:", error);
        this.isInitializingSession = false;
        this.isSessionOperationInProgress = false;
        this.lastSessionOperationTime = Date.now();
        this.sessionInitialized = false;
      }
    },

    // Fallback method to try creating a session using jQuery AJAX
    _createSessionFallback: function () {
      // Get Shopify customer ID if available
      var shopifyCustomerId = window.__VoiceroCustomerId || null;

      // Only run if jQuery is available
      if (typeof window.jQuery === "undefined") {
        // Use fetch as a fallback if jQuery isn't available
        var currentPageUrl = window.location.href;
        fetch("https://www.voicero.ai/api/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            websiteId: this.websiteId,
            pageUrl: currentPageUrl,
            ...(shopifyCustomerId && { shopifyCustomerId }),
          }),
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.session && data.session.id) {
              this.session = data.session;
              this.sessionId = data.session.id;

              try {
                localStorage.setItem("voicero_session_id", data.session.id);
              } catch (e) {}
            }

            this.sessionInitialized = true;
            this.isInitializingSession = false;
            this.createButton();
          })
          .catch(() => {
            this.isInitializingSession = false;
            this.sessionInitialized = false;
            this.createButton();
          });
        return;
      }

      // Use jQuery if available
      var currentPageUrl = window.location.href;
      window.jQuery.ajax({
        url: "https://www.voicero.ai/api/session",
        type: "POST",
        data: JSON.stringify({
          websiteId: this.websiteId,
          pageUrl: currentPageUrl,
          ...(shopifyCustomerId && { shopifyCustomerId }),
        }),
        contentType: "application/json",
        dataType: "json",
        success: (data) => {
          if (data.session && data.session.id) {
            this.session = data.session;
            this.sessionId = data.session.id;

            try {
              localStorage.setItem("voicero_session_id", data.session.id);
            } catch (e) {}
          }

          this.sessionInitialized = true;
          this.isInitializingSession = false;
          this.createButton();
        },
        error: (xhr, status, error) => {
          this.isInitializingSession = false;
          this.sessionInitialized = false;
          this.createButton();
        },
      });
    },

    // Get the working API base URL
    getApiBaseUrl: function () {
      return this.apiBaseUrl || this.apiBaseUrls[0];
    },

    // Track URL movement to the backend
    trackUrlMovement: function (url) {
      if (!this.sessionId || !url) return;

      // Don't track if URL hasn't changed
      if (url === this.currentPageUrl && this.hasTrackedInitialUrl) return;

      // Update current URL
      this.currentPageUrl = url;
      this.hasTrackedInitialUrl = true;

      console.log("VoiceroCore: Tracking URL movement:", url);

      var apiUrl = `https://www.voicero.ai/api/session/url-movement`;

      fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(window.voiceroConfig?.getAuthHeaders
            ? window.voiceroConfig.getAuthHeaders()
            : {}),
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          url: url,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`URL movement tracking failed: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          console.log("VoiceroCore: URL movement tracked successfully:", data);
        })
        .catch((error) => {
          console.error("VoiceroCore: URL movement tracking error:", error);
        });
    },

    // Show the chooser interface when an active interface is closed
    showChooser: function () {
      // Check if we already have the right state to avoid redundant updates
      if (this.session && this.session.chooserOpen === true) {
        console.log(
          "VoiceroCore: Chooser already marked as open in session, just showing UI",
        );
      } else {
        // Make sure chooserOpen is set to true in the session
        if (this.session) {
          console.log("VoiceroCore: Updating session with chooserOpen=true");
          this.session.chooserOpen = true;
          // Update the window state
          this.updateWindowState({
            chooserOpen: true,
            coreOpen: true,
            textOpen: false,
            voiceOpen: false,
          });
        }
      }

      // Delegate to the new VoiceroChooser module
      if (window.VoiceroChooser && window.VoiceroChooser.showChooser) {
        window.VoiceroChooser.showChooser();
      } else {
        console.error("VoiceroCore: VoiceroChooser module not available");

        // Fallback if module not available - try to show it directly
        var chooser = document.getElementById("interaction-chooser");
        if (chooser) {
          chooser.style.display = "flex";
          chooser.style.visibility = "visible";
          chooser.style.opacity = "1";
        }
      }

      // Ensure the main button is visible
      this.ensureMainButtonVisible();
    },

    // Create the interaction chooser with consistent HTML and styles
    createChooser: function () {
      // Delegate to the new VoiceroChooser module
      if (window.VoiceroChooser && window.VoiceroChooser.createChooser) {
        window.VoiceroChooser.createChooser();
      } else {
        console.error("VoiceroCore: VoiceroChooser module not available");
      }
    },

    // Ensure the main button is always visible
    ensureMainButtonVisible: function () {
      // Don't show button if we're currently restoring an interface that should have it hidden
      if (this.isRestoringInterface || this.isInitializing) {
        return;
      }

      // Also check if any interfaces are currently visible in the DOM
      var textInterface = document.getElementById(
        "voicero-text-chat-container",
      );
      if (
        textInterface &&
        window.getComputedStyle(textInterface).display === "block"
      ) {
        this.hideMainButton();
        return;
      }

      var voiceInterface = document.getElementById("voice-chat-interface");
      if (
        voiceInterface &&
        window.getComputedStyle(voiceInterface).display === "block"
      ) {
        this.hideMainButton();
        return;
      }

      // Make sure the container is visible
      var container = document.getElementById("voicero-app-container");
      if (container) {
        container.style.display = "block";
        container.style.visibility = "visible";
        container.style.opacity = "1";
      }

      // Check for elements that might overlap with our button
      var overlapCheck = this.checkForBottomRightElements();

      // Calculate bottom offset based on overlap check
      var bottomOffset = overlapCheck.hasOverlap
        ? overlapCheck.bottomOffset
        : 20;

      if (overlapCheck.hasOverlap) {
        console.log(
          `VoiceroCore: Repositioning button to avoid overlap. Using bottom offset: ${bottomOffset}px`,
        );
      }

      // Make sure button container is visible
      var buttonContainer = document.getElementById("voice-toggle-container");
      if (buttonContainer) {
        buttonContainer.style.display = "block";
        buttonContainer.style.visibility = "visible";
        buttonContainer.style.opacity = "1";

        // Apply critical positioning styles
        buttonContainer.style.cssText = `
          position: fixed !important;
          bottom: ${bottomOffset}px !important;
          right: 20px !important;
          z-index: 2147483647 !important;
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          margin: 0 !important;
          padding: 0 !important;
          transform: none !important;
          top: auto !important;
          left: auto !important;
        `;
      }

      // Make sure the main button is visible
      var mainButton = document.getElementById("chat-website-button");
      if (mainButton) {
        var themeColor = this.websiteColor || "#882be6";
        mainButton.style.cssText = `
          background-color: ${themeColor};
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
          z-index: 2147483647 !important;
          animation: pulse 2s infinite !important;
        `;
      }

      // Apply button animation
      this.applyButtonAnimation();

      // Update the button icon
      this.updateButtonIcon();

      // Try to show help bubble whenever button becomes visible
      // (but only if it hasn't been shown before)
      if (
        this.showHelpBubble &&
        this.appState &&
        !this.appState.hasShownHelpBubble
      ) {
        setTimeout(() => {
          if (this.showHelpBubble) {
            this.showHelpBubble();
          }
        }, 500);
      }
    },

    // Add control buttons to interface
    addControlButtons: function (container, type) {
      // This function can be called by VoiceroText or VoiceroVoice
      // to add common control elements
    },

    // Update window state via API
    updateWindowState: function (windowState) {
      console.log("VoiceroCore: Updating window state", windowState);

      // Check for redundant chooserOpen updates but NEVER skip them
      if (windowState.chooserOpen !== undefined && this.session) {
        if (windowState.chooserOpen === this.session.chooserOpen) {
          console.log(
            "VoiceroCore: Note: chooserOpen value matches current state, but proceeding anyway for toggle: ",
            windowState.chooserOpen,
          );
        }
      }

      this.isSessionOperationInProgress = true;
      this.lastSessionOperationTime = Date.now();

      // Set coreOpen to false if either text or voice interface is open
      if (windowState.textOpen === true || windowState.voiceOpen === true) {
        windowState.coreOpen = false;
        // Also set chooserOpen to false to be explicit
        windowState.chooserOpen = false;
        // Hide the main button when voice or text interface is open
        this.hideMainButton();
      } else if (windowState.chooserOpen === true) {
        // If chooserOpen is explicitly set to true, respect that
        windowState.coreOpen = true;
        // Always recreate the chooser to ensure correct styling
        this.createChooser();
        // Then show it after a short delay
        setTimeout(() => {
          // Double-check that suppressChooser hasn't been set in the meantime
          if (!this.session || !this.session.suppressChooser) {
            console.log("[DEBUG] Showing chooser because chooserOpen is true");
            this.showChooser();
          }
        }, 100);
      } else if (!windowState.suppressChooser) {
        // Only set coreOpen to true if both interfaces are closed and chooser isn't suppressed
        windowState.coreOpen = true;
        // Set chooserOpen to false by default unless something else changes it
        if (windowState.chooserOpen === undefined) {
          windowState.chooserOpen = false;
        }
      }

      // Store original suppressChooser value
      var hadSuppressChooser = windowState.suppressChooser === true;

      // Check if session initialization is in progress
      if (this.isInitializingSession) {
        console.log(
          "VoiceroCore: Session initializing, queuing window state update",
        );
        this.pendingWindowStateUpdates.push(windowState);
        return;
      }

      // Check if we have a session ID
      if (!this.sessionId) {
        // Add to pending updates queue
        this.pendingWindowStateUpdates.push(windowState);

        // If session is not initialized yet, trigger initialization
        if (!this.sessionInitialized && !this.isInitializingSession) {
          this.initializeSession();
        }

        // Immediately update local session values even without sessionId
        if (this.session) {
          // Update our local session with new values
          Object.assign(this.session, windowState);

          // CRITICAL: Reset suppressChooser after applying it to prevent lingering
          if (hadSuppressChooser && this.session) {
            setTimeout(() => {
              if (this.session) {
                console.log("[DEBUG] Auto-resetting suppressChooser to false");
                this.session.suppressChooser = false;
              }
            }, 500);
          }

          // Check if iconBot was updated and update the button icon
          if (windowState.iconBot) {
            console.log(
              "VoiceroCore: iconBot changed to:",
              windowState.iconBot,
            );
            this.updateButtonIcon();
          }

          // Check if removeHighlight was updated
          if (windowState.removeHighlight !== undefined) {
            console.log(
              "VoiceroCore: removeHighlight changed to:",
              windowState.removeHighlight,
            );
            // Update the local property too for redundancy
            this.removeHighlight = windowState.removeHighlight;
          }

          // Propagate the immediate updates to other modules
          if (window.VoiceroText) {
            window.VoiceroText.session = this.session;
          }

          if (window.VoiceroVoice) {
            window.VoiceroVoice.session = this.session;
          }
        }

        return;
      }

      // Immediately update local session values for instant access
      if (this.session) {
        // Update our local session with new values
        Object.assign(this.session, windowState);

        // CRITICAL: Reset suppressChooser after applying it to prevent lingering
        if (hadSuppressChooser && this.session) {
          setTimeout(() => {
            if (this.session) {
              console.log("[DEBUG] Auto-resetting suppressChooser to false");
              this.session.suppressChooser = false;
            }
          }, 500);
        }

        // Check if iconBot was updated and update the button icon
        if (windowState.iconBot) {
          console.log("VoiceroCore: iconBot changed to:", windowState.iconBot);
          this.updateButtonIcon();
        }

        // Check if removeHighlight was updated
        if (windowState.removeHighlight !== undefined) {
          console.log(
            "VoiceroCore: removeHighlight changed to:",
            windowState.removeHighlight,
          );
          // Update the local property too for redundancy
          this.removeHighlight = windowState.removeHighlight;
        }

        // Propagate the immediate updates to other modules
        if (window.VoiceroText) {
          window.VoiceroText.session = this.session;
        }

        if (window.VoiceroVoice) {
          window.VoiceroVoice.session = this.session;
        }
      }

      // Store the values we need for the API call to avoid timing issues
      var sessionIdForApi = this.sessionId;
      var windowStateForApi = { ...windowState };

      // Use setTimeout to ensure the API call happens after navigation
      setTimeout(() => {
        // Verify we have a valid sessionId
        if (
          !sessionIdForApi ||
          typeof sessionIdForApi !== "string" ||
          sessionIdForApi.trim() === ""
        ) {
          return;
        }

        // Make API call to persist the changes
        var proxyUrl = "https://www.voicero.ai/api/session/windows";

        // Format the request body to match what the Next.js API expects
        var requestBody = {
          sessionId: sessionIdForApi,
          windowState: windowStateForApi,
        };

        console.log("VoiceroCore: Updating window state:", requestBody);

        fetch(proxyUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(window.voiceroConfig?.getAuthHeaders
              ? window.voiceroConfig.getAuthHeaders()
              : {}),
          },
          body: JSON.stringify(requestBody),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Window state update failed: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            console.log(
              "VoiceroCore: Window state updated successfully:",
              data,
            );
            // Update our local session data with the full server response
            if (data.session) {
              // Need to update the global VoiceroCore session
              if (window.VoiceroCore) {
                window.VoiceroCore.session = data.session;
              }

              // Propagate the updated session to other modules
              if (window.VoiceroText) {
                window.VoiceroText.session = data.session;
              }

              if (window.VoiceroVoice) {
                window.VoiceroVoice.session = data.session;
              }
            }

            this.isSessionOperationInProgress = false;
            this.lastSessionOperationTime = Date.now();
          })
          .catch((error) => {
            console.error("VoiceroCore: Window state update failed:", error);

            this.isSessionOperationInProgress = false;
            this.lastSessionOperationTime = Date.now();
          });
      }, 0);
    },

    // Update theme color in CSS variables
    updateThemeColor: function (color) {
      if (!color) color = this.websiteColor;

      // Update CSS variables with the theme color
      document.documentElement.style.setProperty(
        "--voicero-theme-color",
        color,
      );

      // Create lighter and darker variants
      let lighterVariant = color;
      let hoverVariant = color;

      // If it's a hex color, we can calculate variants
      if (color.startsWith("#")) {
        try {
          // Convert hex to RGB for the lighter variant
          var r = parseInt(color.slice(1, 3), 16);
          var g = parseInt(color.slice(3, 5), 16);
          var b = parseInt(color.slice(5, 7), 16);

          // Create a lighter variant by adjusting brightness
          var lighterR = Math.min(255, Math.floor(r * 1.2));
          var lighterG = Math.min(255, Math.floor(g * 1.2));
          var lighterB = Math.min(255, Math.floor(b * 1.2));

          // Create a darker variant for hover
          var darkerR = Math.floor(r * 0.8);
          var darkerG = Math.floor(g * 0.8);
          var darkerB = Math.floor(b * 0.8);

          // Convert back to hex
          lighterVariant = `#${lighterR.toString(16).padStart(2, "0")}${lighterG
            .toString(16)
            .padStart(2, "0")}${lighterB.toString(16).padStart(2, "0")}`;
          hoverVariant = `#${darkerR.toString(16).padStart(2, "0")}${darkerG
            .toString(16)
            .padStart(2, "0")}${darkerB.toString(16).padStart(2, "0")}`;

          // Create a more robust enhanced pulsing style
          var pulseStyle = document.createElement("style");
          pulseStyle.innerHTML = `
            /* Button Pulse Animation */
            @keyframes pulse {
              0% {
                box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0.4);
              }
              70% {
                box-shadow: 0 0 0 10px rgba(${r}, ${g}, ${b}, 0);
              }
              100% {
                box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0);
              }
            }
            
            #chat-website-button {
              transition: all 0.2s ease !important;
              animation: pulse 2s infinite !important;
              position: relative !important;
            }
            
            #chat-website-button:hover {
              transform: scale(1.1) !important;
              box-shadow: 0 6px 20px rgba(${r}, ${g}, ${b}, 0.3) !important;
              animation: none !important;
            }
            
            #chat-website-button:active {
              transform: scale(0.95) !important;
              box-shadow: 0 2px 10px rgba(${r}, ${g}, ${b}, 0.2) !important;
            }

            /* Animated ring around button */
            #chat-website-button::after {
              content: '' !important;
              position: absolute !important;
              top: -8px !important;
              left: -8px !important;
              right: -8px !important;
              bottom: -8px !important;
              border-radius: 50% !important;
              border: 2px solid rgba(${r}, ${g}, ${b}, 0.7) !important;
              opacity: 0 !important;
              animation: ringPulse 2s ease-out infinite !important;
              pointer-events: none !important;
            }
            
            @keyframes ringPulse {
              0% {
                transform: scale(0.95);
                opacity: 0.7;
              }
              50% {
                transform: scale(1.1);
                opacity: 0;
              }
              100% {
                transform: scale(0.95);
                opacity: 0.7;
              }
            }
          `;

          // Remove any existing pulse style and add the new one
          var existingPulseStyle = document.getElementById(
            "voicero-pulse-style",
          );
          if (existingPulseStyle) {
            existingPulseStyle.remove();
          }

          pulseStyle.id = "voicero-pulse-style";
          document.head.appendChild(pulseStyle);
        } catch (e) {
          // Fallback to default variants
          lighterVariant = "#9370db";
          hoverVariant = "#7a5abf";
        }
      }

      // Set the variant colors
      document.documentElement.style.setProperty(
        "--voicero-theme-color-light",
        lighterVariant,
      );
      document.documentElement.style.setProperty(
        "--voicero-theme-color-hover",
        hoverVariant,
      );
    },

    // BULLETPROOF FAILSAFE to ensure button always exists and is visible
    setupButtonFailsafe: function () {
      // Only set up failsafe if website is active
      if (!this.isWebsiteActive) {
        return;
      }

      // Set multiple timers at different intervals to guarantee button creation
      setTimeout(() => this.createFailsafeButton(), 1000);
      setTimeout(() => this.createFailsafeButton(), 2000);
      setTimeout(() => this.createFailsafeButton(), 5000);

      // Also add window load event listener as an additional guarantee
      window.addEventListener("load", () => {
        // Check if site is active before creating button
        if (this.isWebsiteActive) {
          setTimeout(() => this.createFailsafeButton(), 500);
        }
      });

      // Add visibility change listener to ensure button when tab becomes visible
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.isWebsiteActive) {
          setTimeout(() => this.createFailsafeButton(), 300);
        }
      });
    },

    // Create a failsafe button if one doesn't exist
    createFailsafeButton: function () {
      // CRITICAL: Only create button if website is active
      if (!this.isWebsiteActive) {
        // Actually hide the button if it exists and site is inactive
        this.hideMainButton();
        return;
      }

      // Check if button already exists
      if (document.getElementById("chat-website-button")) {
        this.ensureMainButtonVisible();
        return;
      }

      // Create app container if it doesn't exist
      let container = document.getElementById("voicero-app-container");
      if (!container) {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="voicero-app-container" style="display:block!important;visibility:visible!important;opacity:1!important;"></div>`,
        );
        container = document.getElementById("voicero-app-container");
      } else {
        // Force container visibility
        container.style.cssText =
          "display:block!important;visibility:visible!important;opacity:1!important;";
      }

      // Check if button container exists, create if not
      let buttonContainer = document.getElementById("voice-toggle-container");
      if (!buttonContainer) {
        container.insertAdjacentHTML(
          "beforeend",
          `<div id="voice-toggle-container" style="position:fixed!important;bottom:20px!important;right:20px!important;z-index:2147483647!important;display:block!important;visibility:visible!important;opacity:1!important;"></div>`,
        );
        buttonContainer = document.getElementById("voice-toggle-container");
      } else {
        // Force button container visibility
        buttonContainer.style.cssText =
          "position:fixed!important;bottom:20px!important;right:20px!important;z-index:2147483647!important;display:block!important;visibility:visible!important;opacity:1!important;";
      }

      // If the main button does not exist, create it with absolute guaranteed visibility
      var chatButton = document.getElementById("chat-website-button");
      if (!chatButton && buttonContainer) {
        var themeColor = this.websiteColor || "#882be6";

        // Get the iconBot value from session if available
        var iconBot =
          this.session && this.session.iconBot
            ? this.session.iconBot
            : "message";
        let iconSvg = "";

        // Choose the appropriate SVG based on iconBot value
        if (iconBot === "bot") {
          iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="24" height="24" fill="currentColor">
            <rect x="12" y="16" width="40" height="32" rx="10" ry="10" stroke="white" stroke-width="2" fill="currentColor"/>
            <circle cx="22" cy="32" r="4" fill="white"/>
            <circle cx="42" cy="32" r="4" fill="white"/>
            <path d="M24 42c4 4 12 4 16 0" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/>
            <line x1="32" y1="8" x2="32" y2="16" stroke="white" stroke-width="2"/>
            <circle cx="32" cy="6" r="2" fill="white"/>
          </svg>`;
        } else if (iconBot === "voice") {
          iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 9v6h4l5 5V4L9 9H5zm13.54.12a1 1 0 1 0-1.41 1.42 3 3 0 0 1 0 4.24 1 1 0 1 0 1.41 1.41 5 5 0 0 0 0-7.07z"/>
          </svg>`;
        } else {
          // Default to message icon
          iconSvg = `<svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>`;
        }

        buttonContainer.insertAdjacentHTML(
          "beforeend",
          `<button id="chat-website-button" class="visible" style="background-color:${themeColor};display:flex!important;visibility:visible!important;opacity:1!important;width:50px!important;height:50px!important;border-radius:50%!important;justify-content:center!important;align-items:center!important;color:white!important;box-shadow:0 4px 15px rgba(0,0,0,0.2)!important;border:none!important;cursor:pointer!important;transition:all 0.2s ease!important;padding:0!important;margin:0!important;position:relative!important;z-index:2147483647!important;animation:pulse 2s infinite!important;">
            ${iconSvg}
          </button>`,
        );
      }

      // ALWAYS add click handler to ensure the button works
      this.attachButtonClickHandler();

      // Final insurance: force both elements to be visible with inline styles
      var mainButton = document.getElementById("chat-website-button");
      if (mainButton) {
        mainButton.setAttribute(
          "style",
          `background-color:${
            this.websiteColor || "#882be6"
          };display:flex!important;visibility:visible!important;opacity:1!important;width:50px!important;height:50px!important;border-radius:50%!important;justify-content:center!important;align-items:center!important;color:white!important;box-shadow:0 4px 15px rgba(0,0,0,0.2)!important;border:none!important;cursor:pointer!important;transition:all 0.2s ease!important;padding:0!important;margin:0!important;position:relative!important;z-index:2147483647!important;`,
        );
      }
    },

    // Attach bulletproof click handler to button
    attachButtonClickHandler: function () {
      var mainButton = document.getElementById("chat-website-button");
      if (!mainButton) return;

      // Remove existing listeners to prevent duplicates
      var newButton = mainButton.cloneNode(true);
      if (mainButton.parentNode) {
        mainButton.parentNode.replaceChild(newButton, mainButton);
      }

      // Add the new bulletproof click handler
      newButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if session operations are in progress
        if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
          console.log(
            "VoiceroCore: Button click ignored - session operation in progress",
          );
          return;
        }

        // Create chooser if it doesn't exist
        let chooser = document.getElementById("interaction-chooser");
        if (!chooser) {
          var themeColor = this.websiteColor || "#882be6";
          var buttonContainer = document.getElementById(
            "voice-toggle-container",
          );

          if (buttonContainer) {
            buttonContainer.insertAdjacentHTML(
              "beforeend",
              `<div
                id="interaction-chooser"
                style="
                  position: fixed !important;
                  bottom: 80px !important;
                  right: 20px !important;
                  z-index: 10001 !important;
                  background-color: #c8c8c8 !important;
                  border-radius: 12px !important;
                  box-shadow: 6px 6px 0 ${themeColor} !important;
                  padding: 15px !important;
                  width: 280px !important;
                  border: 1px solid rgb(0, 0, 0) !important;
                  display: none !important;
                  visibility: hidden !important;
                  opacity: 0 !important;
                  flex-direction: column !important;
                  align-items: center !important;
                  margin: 0 !important;
                  transform: none !important;
                  pointer-events: auto !important;
                "
              >
                <div
                  id="voice-chooser-button"
                  class="interaction-option voice"
                  style="
                    position: relative;
                    display: flex;
                    align-items: center;
                    padding: 10px 10px;
                    margin-bottom: 10px;
                    margin-left: -30px;
                    cursor: pointer;
                    border-radius: 8px;
                    background-color: white;
                    border: 1px solid rgb(0, 0, 0);
                    box-shadow: 4px 4px 0 rgb(0, 0, 0);
                    transition: all 0.2s ease;
                    width: 200px;
                  "
                >
                  <span style="font-weight: 700; color: rgb(0, 0, 0); font-size: 16px; width: 100%; text-align: center; white-space: nowrap;">
                    Voice Conversation
                  </span>
                  <svg width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" style="position: absolute; right: -50px; width: 35px; height: 35px;">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <path d="M12 19v4"/>
                    <path d="M8 23h8"/>
                  </svg>
                </div>

                <div
                  id="text-chooser-button"
                  class="interaction-option text"
                  style="
                    position: relative;
                    display: flex;
                    align-items: center;
                    padding: 10px 10px;
                    margin-left: -30px;
                    cursor: pointer;
                    border-radius: 8px;
                    background-color: white;
                    border: 1px solid rgb(0, 0, 0);
                    box-shadow: 4px 4px 0 rgb(0, 0, 0);
                    transition: all 0.2s ease;
                    width: 200px;
                  "
                >
                  <span style="font-weight: 700; color: rgb(0, 0, 0); font-size: 16px; width: 100%; text-align: center; white-space: nowrap;">
                    Message
                  </span>
                  <svg width="35" height="35" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" style="position: absolute; right: -50px; width: 35px; height: 35px;">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
              </div>`,
            );

            chooser = document.getElementById("interaction-chooser");

            // Add click handlers to the new options
            var voiceButton = document.getElementById("voice-chooser-button");
            if (voiceButton) {
              voiceButton.addEventListener("click", () => {
                // Check if session operations are in progress
                if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
                  console.log(
                    "VoiceroCore: Voice button click ignored - session operation in progress",
                  );
                  return;
                }

                if (chooser) {
                  window.VoiceroCore.hideChooser();
                }

                // Update session state directly
                if (
                  window.VoiceroCore &&
                  window.VoiceroCore.updateWindowState
                ) {
                  window.VoiceroCore.updateWindowState({
                    voiceOpen: true,
                    voiceOpenWindowUp: true,
                    textOpen: false,
                    textOpenWindowUp: false,
                    coreOpen: false,
                  });
                }

                // Create voice interface if needed
                let voiceInterface = document.getElementById(
                  "voice-chat-interface",
                );
                if (!voiceInterface) {
                  container.insertAdjacentHTML(
                    "beforeend",
                    `<div id="voice-chat-interface" style="display: none;"></div>`,
                  );
                }

                // Try to open voice interface
                if (window.VoiceroVoice && window.VoiceroVoice.openVoiceChat) {
                  window.VoiceroVoice.openVoiceChat();
                  // Force maximize after opening
                  setTimeout(() => {
                    if (
                      window.VoiceroVoice &&
                      window.VoiceroVoice.maximizeVoiceChat
                    ) {
                      window.VoiceroVoice.maximizeVoiceChat();
                    }
                  }, 100);
                }
              });
            }

            var textButton = document.getElementById("text-chooser-button");
            if (textButton) {
              textButton.addEventListener("click", () => {
                // Check if session operations are in progress
                if (window.VoiceroCore && window.VoiceroCore.isSessionBusy()) {
                  console.log(
                    "VoiceroCore: Text button click ignored - session operation in progress",
                  );
                  return;
                }

                if (chooser) {
                  window.VoiceroCore.hideChooser();
                }

                // Update session state directly
                if (
                  window.VoiceroCore &&
                  window.VoiceroCore.updateWindowState
                ) {
                  window.VoiceroCore.updateWindowState({
                    textOpen: true,
                    textOpenWindowUp: true,
                    voiceOpen: false,
                    voiceOpenWindowUp: false,
                    coreOpen: false,
                  });
                }

                // Create text interface if needed
                let textInterface = document.getElementById(
                  "voicero-text-chat-container",
                );
                if (!textInterface) {
                  container.insertAdjacentHTML(
                    "beforeend",
                    `<div id="voicero-text-chat-container" style="display: none;"></div>`,
                  );
                }

                // Try to open text interface
                if (window.VoiceroText && window.VoiceroText.openTextChat) {
                  window.VoiceroText.openTextChat();
                  // Force maximize after opening
                  setTimeout(() => {
                    if (window.VoiceroText && window.VoiceroText.maximizeChat) {
                      window.VoiceroText.maximizeChat();
                    }
                  }, 100);
                }
              });
            }
          }
        }

        // Skip chooser and directly open text interface
        console.log(
          "VoiceroCore: Main button clicked - opening text interface directly",
        );

        // Check if text interface is already open
        var textInterface = document.getElementById(
          "voicero-text-chat-container",
        );

        if (textInterface && textInterface.style.display === "block") {
          // Close text interface if it's open
          if (window.VoiceroText && window.VoiceroText.closeTextChat) {
            window.VoiceroText.closeTextChat();
          } else {
            textInterface.style.display = "none";
          }
        } else {
          // Update session state directly to open text chat
          if (window.VoiceroCore && window.VoiceroCore.updateWindowState) {
            window.VoiceroCore.updateWindowState({
              textOpen: true,
              textOpenWindowUp: true,
              coreOpen: false,
            });
          }

          // Create text interface if needed
          if (!textInterface) {
            var container = document.getElementById("voicero-app-container");
            if (container) {
              container.insertAdjacentHTML(
                "beforeend",
                `<div id="voicero-text-chat-container" style="display: none;"></div>`,
              );
            }
          }

          // Try to open text interface
          if (window.VoiceroText && window.VoiceroText.openTextChat) {
            window.VoiceroText.openTextChat();
            // Force maximize after opening
            setTimeout(() => {
              if (window.VoiceroText && window.VoiceroText.maximizeChat) {
                window.VoiceroText.maximizeChat();
              }
            }, 100);
          } else {
            console.log(
              "VoiceroCore: VoiceroText not available, trying to load it",
            );

            // Try to load VoiceroText module
            if (
              window.VoiceroCore &&
              window.VoiceroCore.ensureTextModuleLoaded
            ) {
              window.VoiceroCore.ensureTextModuleLoaded();

              // Try again after a delay
              setTimeout(() => {
                if (window.VoiceroText && window.VoiceroText.openTextChat) {
                  window.VoiceroText.openTextChat();

                  // Force maximize after opening
                  setTimeout(() => {
                    if (window.VoiceroText && window.VoiceroText.maximizeChat) {
                      window.VoiceroText.maximizeChat();
                    }
                  }, 100);
                }
              }, 300);
            }
          }
        }
      });
    },

    // Force remove all buttons from the DOM
    removeAllButtons: function () {
      // Try to remove the toggle container completely
      var toggleContainer = document.getElementById("voice-toggle-container");
      if (toggleContainer && toggleContainer.parentNode) {
        toggleContainer.parentNode.removeChild(toggleContainer);
      }

      // Also look for any stray buttons
      var mainButton = document.getElementById("chat-website-button");
      if (mainButton && mainButton.parentNode) {
        mainButton.parentNode.removeChild(mainButton);
      }

      // Remove all chooser interfaces
      var chooser = document.getElementById("interaction-chooser");
      if (chooser && chooser.parentNode) {
        chooser.parentNode.removeChild(chooser);
      }
    },

    // Create the UI
    initializeUI: function () {
      // Set initializing flag to prevent multiple operations
      this.isInitializing = true;

      // Create global property to track button visibility timeouts
      this.buttonVisibilityTimeouts = [];

      // Create main container
      // ... existing code ...

      // After initialization, clear the flag with a short delay
      setTimeout(() => {
        this.isInitializing = false;
      }, 1000);
    },

    // Helper to determine if the chooser should be displayed
    shouldShowChooser: function () {
      // Delegate to the new VoiceroChooser module
      if (window.VoiceroChooser && window.VoiceroChooser.shouldShowChooser) {
        return window.VoiceroChooser.shouldShowChooser();
      } else {
        console.error("VoiceroCore: VoiceroChooser module not available");
        return false;
      }
    },

    // Helper function to convert hex color to RGB
    hexToRgb: function (hex) {
      // Check if it's already a valid hex color
      if (!hex || typeof hex !== "string" || !hex.startsWith("#")) {
        // Return default if not a valid hex
        return { r: 136, g: 43, b: 230 };
      }

      // Remove # if present
      hex = hex.replace(/^#/, "");

      // Parse hex values
      var bigint = parseInt(hex, 16);
      var r = (bigint >> 16) & 255;
      var g = (bigint >> 8) & 255;
      var b = bigint & 255;

      return { r, g, b };
    },

    // Add button animation directly
    applyButtonAnimation: function () {
      // Create a standalone animation style that doesn't depend on other functions
      var animStyle = document.createElement("style");

      // Get the theme color
      var color = this.websiteColor || "#882be6";

      // Parse RGB components for animation
      let r = 136,
        g = 43,
        b = 230; // Default fallback
      try {
        if (color.startsWith("#")) {
          r = parseInt(color.slice(1, 3), 16);
          g = parseInt(color.slice(3, 5), 16);
          b = parseInt(color.slice(5, 7), 16);
        }
      } catch (e) {
        console.error("Color parsing error:", e);
      }

      // Define button animations
      animStyle.innerHTML = `
        /* Button pulse effect */
        @keyframes voiceroButtonPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0.7);
            transform: scale(1);
          }
          70% {
            box-shadow: 0 0 0 15px rgba(${r}, ${g}, ${b}, 0);
            transform: scale(1.05);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0);
            transform: scale(1);
          }
        }
        
        /* Special ring animation */
        @keyframes voiceroRingPulse {
          0% {
            transform: scale(0.9);
            opacity: 0.7;
          }
          70% {
            transform: scale(1.2);
            opacity: 0;
          }
          100% {
            transform: scale(0.9);
            opacity: 0;
          }
        }
        
        /* Apply animation to button */
        #chat-website-button {
          animation: voiceroButtonPulse 2s infinite cubic-bezier(0.66, 0, 0.33, 1) !important;
          position: relative !important;
        }
        
        /* Add ring effect */
        #chat-website-button::after {
          content: "" !important;
          position: absolute !important;
          width: 100% !important;
          height: 100% !important;
          top: 0 !important;
          left: 0 !important;
          border-radius: 50% !important;
          box-shadow: 0 0 0 5px rgba(${r}, ${g}, ${b}, 0.5) !important;
          animation: voiceroRingPulse 2s infinite cubic-bezier(0.66, 0, 0.33, 1) !important;
          pointer-events: none !important;
        }
      `;

      // Add an ID to find and remove it later if needed
      animStyle.id = "voicero-button-animation";

      // Remove existing animation if present
      var existingAnim = document.getElementById("voicero-button-animation");
      if (existingAnim) {
        existingAnim.remove();
      }

      // Add to document
      document.head.appendChild(animStyle);

      // Also apply animation directly to button for redundancy
      setTimeout(() => {
        var button = document.getElementById("chat-website-button");
        if (button) {
          button.style.animation =
            "voiceroButtonPulse 2s infinite cubic-bezier(0.66, 0, 0.33, 1)";
          button.style.position = "relative";
        }
      }, 100);
    },

    // Helper to hide the chooser interface
    hideChooser: function () {
      // Always update the session state for consistency
      console.log("VoiceroCore: Setting chooserOpen to false in session");
      if (this.session) {
        this.session.chooserOpen = false;

        // Update window state to persist the chooserOpen flag
        this.updateWindowState({
          chooserOpen: false,
        });
      }

      // Delegate to the new VoiceroChooser module
      if (window.VoiceroChooser && window.VoiceroChooser.hideChooser) {
        window.VoiceroChooser.hideChooser();
      } else {
        // Fallback if VoiceroChooser is not available
        var chooser = document.getElementById("interaction-chooser");
        if (chooser) {
          chooser.style.display = "none";
          chooser.style.visibility = "hidden";
          chooser.style.opacity = "0";
        }
      }
    },

    // Helper to display the chooser interface
    displayChooser: function () {
      // Make session update conditional but ALWAYS show the UI
      if (this.session && this.session.chooserOpen === true) {
        console.log(
          "VoiceroCore: Chooser already open in session, just ensuring UI is visible",
        );
      } else {
        // Update the session state
        if (this.session) {
          console.log("VoiceroCore: Setting chooserOpen to true");
          this.session.chooserOpen = true;

          // Update window state to persist the chooserOpen flag and ensure other interfaces are closed
          this.updateWindowState({
            chooserOpen: true,
            coreOpen: true,
            voiceOpen: false,
            voiceOpenWindowUp: false,
            textOpen: false,
            textOpenWindowUp: false,
          });
        }
      }

      // ALWAYS hide any open interfaces
      var textInterface = document.getElementById(
        "voicero-text-chat-container",
      );
      if (textInterface) {
        textInterface.style.display = "none";
      }

      var voiceInterface = document.getElementById("voice-chat-interface");
      if (voiceInterface) {
        voiceInterface.style.display = "none";
      }

      // ALWAYS show the UI, regardless of state
      console.log("VoiceroCore: Showing chooser UI unconditionally");

      // First check if VoiceroChooser module is available
      if (window.VoiceroChooser && window.VoiceroChooser.showChooser) {
        window.VoiceroChooser.showChooser();
      } else {
        // Fallback if VoiceroChooser is not available
        var chooser = document.getElementById("interaction-chooser");
        if (chooser) {
          chooser.style.display = "flex";
          chooser.style.visibility = "visible";
          chooser.style.opacity = "1";
        }
      }

      // Also make sure main button is visible
      this.ensureMainButtonVisible();
    },

    // Update the main button icon - always use message icon
    updateButtonIcon: function () {
      // Get button element
      var button = document.getElementById("chat-website-button");
      if (!button) return;

      // Always use the message icon since we only have text interface now
      var iconSvg = `<svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="currentColor" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>`;

      // Update the button's inner HTML
      button.innerHTML = iconSvg;
    },

    // Ensure VoiceroText module is loaded and available
    ensureTextModuleLoaded: function () {
      // Check if VoiceroText is already available
      if (window.VoiceroText) {
        console.log("VoiceroCore: VoiceroText module already loaded");
        return;
      }

      console.log("VoiceroCore: Loading VoiceroText module");

      // Check if the text script is already in the document
      var existingScript = document.querySelector(
        'script[src*="voicero-text.js"]',
      );
      if (existingScript) {
        console.log("VoiceroCore: VoiceroText script already exists in DOM");
        return;
      }

      // Create and append the script element to load VoiceroText
      var script = document.createElement("script");
      // Try to get the current script's path to determine the correct path for voicero-text.js
      var currentScript =
        document.currentScript ||
        document.querySelector('script[src*="voicero-core.js"]');

      if (currentScript && currentScript.src) {
        // Use the same directory as the current script
        var scriptPath = currentScript.src.substring(
          0,
          currentScript.src.lastIndexOf("/"),
        );
        script.src = `${scriptPath}/voicero-text.js`;
        console.log("VoiceroCore: Loading VoiceroText from path:", script.src);
      } else {
        // Fallback to relative path
        script.src = "./voicero-text.js";
        console.log("VoiceroCore: Loading VoiceroText from fallback path");
      }
      script.async = true;

      // Store reference to VoiceroCore for use in callback
      var self = this;

      script.onload = () => {
        console.log("VoiceroCore: VoiceroText module loaded successfully");

        // Initialize VoiceroText if it exists after loading
        if (
          window.VoiceroText &&
          typeof window.VoiceroText.init === "function"
        ) {
          console.log("VoiceroCore: Initializing VoiceroText module");
          window.VoiceroText.init();

          // Share session data with VoiceroText
          if (window.VoiceroCore && window.VoiceroCore.session) {
            console.log("VoiceroCore: Sharing session data with VoiceroText");
            window.VoiceroText.session = window.VoiceroCore.session;
          }
          if (window.VoiceroCore && window.VoiceroCore.thread) {
            window.VoiceroText.thread = window.VoiceroCore.thread;
          }

          // Only try to open text interface if the session explicitly has textOpen = true
          setTimeout(() => {
            if (
              window.VoiceroCore &&
              window.VoiceroCore.session &&
              window.VoiceroCore.session.textOpen === true &&
              window.VoiceroText &&
              window.VoiceroText.openTextChat
            ) {
              console.log(
                "VoiceroCore: Auto-opening text interface after module load (session has textOpen=true)",
              );
              window.VoiceroText.openTextChat();
            } else {
              console.log(
                "VoiceroCore: NOT auto-opening text interface after module load (session doesn't have textOpen=true)",
              );
            }
          }, 100);
        }
      };
      script.onerror = () => {
        console.error("VoiceroCore: Failed to load VoiceroText module");
      };

      document.head.appendChild(script);
    },

    // Setup automatic help timer
    setupAutoHelpTimer: function () {
      console.log("VoiceroCore: Setting up auto help timer (60 seconds)");

      // Clear any existing timer
      if (this.autoHelpTimer) {
        clearTimeout(this.autoHelpTimer);
      }

      // Set new timer for 60 seconds
      this.autoHelpTimer = setTimeout(() => {
        this.showAutoHelp();
      }, 60000); // 60 seconds
    },

    // Reset automatic help timer (called on URL changes)
    resetAutoHelpTimer: function () {
      console.log("VoiceroCore: Resetting auto help timer");

      // Reset the shown flag when navigating to a new page
      this.hasShownAutoHelp = false;
      this.appState.hasShownAutoHelp = false;

      // Reset the timer
      this.setupAutoHelpTimer();
    },

    // Show automatic help bubble with API-provided text
    showAutoHelp: function () {
      // Don't show if already shown this session or if any chat interface is open
      if (this.hasShownAutoHelp || this.appState.hasShownAutoHelp) {
        return;
      }

      // Check if any chat interface is open, don't show if one is
      var textInterface = document.getElementById(
        "voicero-text-chat-container",
      );
      var voiceInterface = document.getElementById("voice-chat-interface");

      if (
        (textInterface &&
          window.getComputedStyle(textInterface).display === "block") ||
        (voiceInterface &&
          window.getComputedStyle(voiceInterface).display === "block")
      ) {
        return;
      }

      console.log("VoiceroCore: Fetching auto help message from API");

      // Get the current page URL and title
      var url = window.location.href;
      var title = document.title;

      // Prepare data for API call - include all required fields
      var apiData = {
        url: url,
        title: title,
        sessionId: this.sessionId || "",
        websiteId: this.websiteId || "",
        metadata: {
          path: window.location.pathname,
          query: window.location.search,
          userAgent: navigator.userAgent,
        },
        // Add optional fields that may improve the response
        pageContent: document.body.innerText.substring(0, 1000), // First 1000 chars of page text
        pageStructure: {
          headings: Array.from(
            document.querySelectorAll("h1, h2, h3, h4, h5, h6"),
          )
            .map((h) => ({
              level: h.tagName.toLowerCase(),
              text: h.innerText,
            }))
            .slice(0, 10),
          paragraphs: Array.from(document.querySelectorAll("p"))
            .map((p) => p.innerText)
            .slice(0, 5),
        },
        userQuestion: "I'm browsing this page and might need assistance.",
      };

      // Make API call to get help text
      fetch("https://www.voicero.ai/api/needHelp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(apiData),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          return response.json();
        })
        .then((responseData) => {
          // API response could be either a string directly or a JSON object
          let helpText = responseData;

          // Handle various response formats
          if (typeof responseData === "object" && responseData !== null) {
            // Try to extract the message from the response object
            helpText =
              responseData.message ||
              responseData.text ||
              responseData.response ||
              (Array.isArray(responseData) ? responseData[0] : responseData) ||
              "Need help with something? Click me!";
          }

          // Show the help bubble with the API-provided text
          this.displayAutoHelpBubble(
            helpText || "Need help with something? Click me!",
          );
        })
        .catch((error) => {
          console.error(
            "VoiceroCore: Error fetching auto help message:",
            error,
          );

          // Try again with text response if JSON parsing failed
          if (error.name === "SyntaxError") {
            fetch("https://www.voicero.ai/api/needHelp", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "text/plain",
              },
              body: JSON.stringify(apiData),
            })
              .then((response) => response.text())
              .then((plainText) => {
                this.displayAutoHelpBubble(plainText || "Need help shopping?");
              })
              .catch((fallbackError) => {
                console.error(
                  "VoiceroCore: Fallback API error:",
                  fallbackError,
                );
                this.displayAutoHelpBubble(
                  "Need help shopping? I'm here to assist!",
                );
              });
          } else {
            // Show default message if API call fails
            this.displayAutoHelpBubble(
              "Need help shopping? I'm here to assist!",
            );
          }
        });
    },

    // Display the auto help as a modal in the center of the screen with provided text
    displayAutoHelpBubble: function (helpText) {
      var mainButton = document.getElementById("chat-website-button");
      if (!mainButton) return;

      // Mark as shown
      this.hasShownAutoHelp = true;
      this.appState.hasShownAutoHelp = true;

      // Remove any existing modal
      let existingModal = document.getElementById("voicero-auto-help-modal");
      if (existingModal) {
        existingModal.parentNode.removeChild(existingModal);
      }

      // Create overlay and modal container
      var modalOverlay = document.createElement("div");
      modalOverlay.id = "voicero-auto-help-modal";

      // Add modal styles
      modalOverlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background-color: rgba(0, 0, 0, 0.5) !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        z-index: 2147483646 !important;
        animation: fadeIn 0.3s ease-out !important;
      `;

      // Create the modal content
      var modalHTML = `
        <div class="voicero-modal-content" style="
          background-color: white !important;
          border: 2px solid #000 !important;
          box-shadow: 8px 8px 0 rgb(0, 0, 0) !important;
          border-radius: 12px !important;
          padding: 20px 25px !important;
          max-width: 450px !important;
          width: 80% !important;
          position: relative !important;
          font-family: Arial, sans-serif !important;
          animation: scaleIn 0.3s ease-out !important;
        ">
          <button id="voicero-auto-help-close" style="
            position: absolute !important;
            top: 10px !important;
            right: 15px !important;
            cursor: pointer !important;
            font-size: 20px !important;
            font-weight: bold !important;
            color: #000 !important;
            background: none !important;
            border: none !important;
            padding: 0 5px !important;
            line-height: 1 !important;
          ">×</button>
          
          <h3 style="
            margin-top: 0 !important;
            color: ${this.websiteColor || "#882be6"} !important;
            font-size: 18px !important;
            margin-bottom: 15px !important;
          ">Need Help?</h3>
          
          <div style="
            font-size: 16px !important;
            line-height: 1.5 !important;
            color: #333 !important;
            margin-bottom: 20px !important;
          ">${helpText}</div>
          
          <div style="display: flex !important; justify-content: center !important;">
            <button id="voicero-auto-help-chat-btn" style="
              background-color: ${this.websiteColor || "#882be6"} !important;
              color: white !important;
              padding: 10px 20px !important;
              border-radius: 6px !important;
              font-size: 16px !important;
              font-weight: bold !important;
              border: none !important;
              box-shadow: 3px 3px 0 rgba(0,0,0,0.3) !important;
              cursor: pointer !important;
              transition: all 0.2s ease !important;
            ">Start Chat</button>
          </div>
        </div>
      `;

      // Add animation styles
      var animStyle = document.createElement("style");
      animStyle.innerHTML = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `;
      document.head.appendChild(animStyle);

      // Add the modal HTML to the overlay
      modalOverlay.innerHTML = modalHTML;

      // Append the overlay to the body
      document.body.appendChild(modalOverlay);

      // Add click handlers
      var closeButton = document.getElementById("voicero-auto-help-close");
      if (closeButton) {
        closeButton.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          modalOverlay.style.display = "none";
          modalOverlay.remove();
        });
      }

      // Add click handler for chat button
      var chatButton = document.getElementById("voicero-auto-help-chat-btn");
      if (chatButton) {
        chatButton.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();

          // Hide and remove the modal
          modalOverlay.style.display = "none";
          modalOverlay.remove();

          // Click the main button to open chat
          var mainButton = document.getElementById("chat-website-button");
          if (mainButton) {
            mainButton.click();
          }
        });
      }

      // Close modal when clicking outside the content
      modalOverlay.addEventListener("click", function (e) {
        // Only close if the click was directly on the overlay, not its children
        if (e.target === modalOverlay) {
          modalOverlay.style.display = "none";
          modalOverlay.remove();
        }
      });

      // Add pulse animation to the main button to draw attention
      this.enhanceButtonAnimation();
    },

    // Enhanced pulse animation for the button when auto help appears
    enhanceButtonAnimation: function () {
      var button = document.getElementById("chat-website-button");
      if (!button) return;

      // Add extra attention-grabbing styles
      button.style.animation =
        "voiceroButtonPulseEnhanced 1s infinite alternate";

      // Add the enhanced animation styles if they don't exist
      if (!document.getElementById("voicero-enhanced-pulse")) {
        var enhancedStyle = document.createElement("style");
        enhancedStyle.id = "voicero-enhanced-pulse";
        enhancedStyle.innerHTML = `
          @keyframes voiceroButtonPulseEnhanced {
            0% { transform: scale(1); box-shadow: 0 0 10px 5px rgba(136, 43, 230, 0.7); }
            100% { transform: scale(1.1); box-shadow: 0 0 20px 10px rgba(136, 43, 230, 0.5); }
          }
        `;
        document.head.appendChild(enhancedStyle);
      }

      // Reset to normal animation after 5 seconds
      setTimeout(() => {
        if (button) {
          button.style.animation =
            "voiceroButtonPulse 2s infinite cubic-bezier(0.66, 0, 0.33, 1)";
        }
      }, 5000);
    },
  };

  // Initialize on DOM content loaded
  if (typeof $ === "function") {
    $(document).ready(function () {
      VoiceroCore.init();
    });
  } else {
    // Direct fallback if $ isn't working as expected
    if (document.readyState !== "loading") {
      setTimeout(function () {
        VoiceroCore.init();
      }, 0);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        VoiceroCore.init();
      });
    }
  }

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
