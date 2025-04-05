var content = function() {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  var _a, _b;
  const browser$1 = ((_b = (_a = globalThis.browser) == null ? void 0 : _a.runtime) == null ? void 0 : _b.id) ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  function defineContentScript(definition2) {
    return definition2;
  }
  const definition = defineContentScript({
    matches: ["*://bsky.app/*", "*://*.bsky.social/*"],
    main() {
      console.log("Notisky content script loaded");
      const isRealBrowser = (() => {
        try {
          return typeof browser !== "undefined" && typeof browser.runtime !== "undefined" && typeof browser.runtime.sendMessage === "function" && !browser.runtime.sendMessage.toString().includes("not implemented");
        } catch (e) {
          console.log("Notisky: Not in a real browser environment", e);
          return false;
        }
      })();
      let lastNotificationCount = 0;
      let lastMessageCount = 0;
      let isObserving = false;
      let updateTimer = null;
      let originalFavicon = null;
      let userPreferences = {
        updateSiteIcon: true,
        updateExtensionIcon: true,
        enableNotifications: true,
        keepPageAlive: true,
        refreshInterval: 1
        // Default to 1 minute
      };
      let extensionContextValid = true;
      let reconnectAttemptTimer = null;
      let reconnectAttemptCount = 0;
      const MAX_RECONNECT_ATTEMPTS = 10;
      const RECONNECT_DELAY = 5e3;
      function saveOriginalFavicon() {
        try {
          console.log("Notisky: Attempting to save original favicon");
          if (originalFavicon) {
            console.log("Notisky: Original favicon already saved:", originalFavicon);
            return;
          }
          const faviconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
          if (faviconLinks.length > 0) {
            originalFavicon = faviconLinks[0].getAttribute("href");
            console.log("Notisky: Saved original favicon:", originalFavicon);
            if (!originalFavicon) {
              console.log("Notisky: Invalid href attribute on favicon link, using default");
              originalFavicon = "https://bsky.app/static/favicon-32x32.png";
              return;
            }
            try {
              let faviconUrl;
              if (originalFavicon.startsWith("data:")) {
                console.log("Notisky: Favicon is a data URL, using as-is");
                return;
              } else if (originalFavicon.startsWith("http://") || originalFavicon.startsWith("https://")) {
                faviconUrl = new URL(originalFavicon);
                const currentUrl = new URL(window.location.href);
                if (faviconUrl.origin !== currentUrl.origin) {
                  console.log("Notisky: Favicon is from different origin, using default to avoid CORS issues");
                  originalFavicon = "https://bsky.app/static/favicon-32x32.png";
                }
              } else {
                console.log("Notisky: Converting relative favicon URL to absolute");
                faviconUrl = new URL(originalFavicon, window.location.href);
                originalFavicon = faviconUrl.href;
              }
            } catch (urlError) {
              console.log("Notisky: Error parsing favicon URL, using default", urlError);
              originalFavicon = "https://bsky.app/static/favicon-32x32.png";
            }
          } else {
            const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
            if (appleTouchIcon && appleTouchIcon.getAttribute("href")) {
              originalFavicon = appleTouchIcon.getAttribute("href") || "";
              console.log("Notisky: Using apple-touch-icon as favicon:", originalFavicon);
            } else {
              try {
                const domain = window.location.hostname;
                if (domain.includes("bsky.app")) {
                  originalFavicon = "https://bsky.app/static/favicon-32x32.png";
                } else if (domain.includes("bsky.social")) {
                  originalFavicon = "https://bsky.social/static/favicon-32x32.png";
                } else {
                  originalFavicon = "/favicon.ico";
                }
                console.log("Notisky: Using constructed favicon path:", originalFavicon);
              } catch (e) {
                originalFavicon = "https://bsky.app/static/favicon-32x32.png";
                console.log("Notisky: Using default Bluesky favicon");
              }
            }
          }
        } catch (error) {
          console.error("Notisky: Error saving original favicon", error);
          originalFavicon = "https://bsky.app/static/favicon-32x32.png";
        }
      }
      function createFaviconWithBadge(count) {
        try {
          if (count <= 0) {
            console.log("Notisky: Returning original favicon (no notifications)");
            return Promise.resolve(originalFavicon || "https://bsky.app/static/favicon-32x32.png");
          }
          let iconType;
          if (count > 30) {
            iconType = "30plus";
          } else {
            iconType = count.toString();
          }
          if (isRealBrowser && extensionContextValid) {
            try {
              const badgeIconUrl = browser.runtime.getURL(`/icon/notification/${iconType}_32.png`);
              console.log(`Notisky: Using extension badge icon: ${badgeIconUrl}`);
              return Promise.resolve(badgeIconUrl);
            } catch (error) {
              console.log("Notisky: Error getting badge icon URL, falling back to dynamic generation", error);
            }
          } else {
            console.log("Notisky: Not using extension resources, falling back to dynamic generation");
          }
          console.log("Notisky: Generating dynamic badge icon");
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            console.warn("Notisky: Could not get canvas context, returning original favicon");
            return Promise.resolve(originalFavicon || "https://bsky.app/static/favicon-32x32.png");
          }
          ctx.clearRect(0, 0, 32, 32);
          const badgeSize = Math.max(32 * 0.9, 14);
          const badgeX = 32 / 2;
          const badgeY = 32 / 2;
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = "#FF4A4A";
          ctx.fill();
          let countText;
          if (count > 30) {
            countText = "30+";
          } else {
            countText = count.toString();
          }
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const fontSize = Math.max(badgeSize * 0.5, 7);
          ctx.font = `bold ${fontSize}px Arial`;
          if (countText.length > 1) {
            ctx.font = `bold ${fontSize * 0.8}px Arial`;
          }
          if (countText.length > 2) {
            ctx.font = `bold ${fontSize * 0.7}px Arial`;
          }
          ctx.fillText(countText, badgeX, badgeY);
          const dataUrl = canvas.toDataURL("image/png");
          console.log("Notisky: Generated dynamic badge icon");
          return Promise.resolve(dataUrl);
        } catch (error) {
          console.error("Notisky: Error creating favicon", error);
          return Promise.resolve(originalFavicon || "https://bsky.app/static/favicon-32x32.png");
        }
      }
      function applyFavicon(faviconUrl) {
        try {
          if (!faviconUrl) {
            console.warn("Notisky: No favicon URL provided, skipping update");
            return;
          }
          if (!userPreferences.updateSiteIcon) {
            console.log("Notisky: Site icon updates disabled in preferences, skipping update");
            return;
          }
          Promise.resolve(faviconUrl).then((url) => {
            if (!url) {
              console.warn("Notisky: Empty favicon URL after promise resolution, skipping update");
              return;
            }
            console.log(`Notisky: Applying favicon: ${url.substring(0, 50)}${url.length > 50 ? "..." : ""}`);
            try {
              let linkElements = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
              if (linkElements.length > 0) {
                linkElements.forEach((link) => {
                  link.setAttribute("href", url);
                });
                console.log(`Notisky: Updated ${linkElements.length} existing favicon links`);
              } else {
                const link = document.createElement("link");
                link.rel = "icon";
                link.type = "image/png";
                link.href = url;
                document.head.appendChild(link);
                console.log("Notisky: Created new favicon link");
              }
              setTimeout(() => {
                const currentFavicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                if (currentFavicon) {
                  const currentHref = currentFavicon.getAttribute("href");
                  if (currentHref !== url) {
                    console.warn("Notisky: Favicon update may not have applied correctly");
                  } else {
                    console.log("Notisky: Favicon update verified");
                  }
                }
              }, 100);
            } catch (domError) {
              console.error("Notisky: DOM error when applying favicon", domError);
            }
          }).catch((error) => {
            console.error("Notisky: Error resolving favicon URL", error);
          });
        } catch (error) {
          console.error("Notisky: Critical error applying favicon", error);
        }
      }
      function updateExtensionIcon(count) {
        try {
          if (!isRealBrowser || !userPreferences.updateExtensionIcon) return;
          safelyMessageBackground({
            action: "updateNotificationCount",
            count
          }).then((response) => {
            if (response && response.success) {
              console.log("Notisky: Extension icon update successful");
            } else if (response === null) {
            } else {
              console.log("Notisky: No success response from extension icon update");
            }
          }).catch((error) => {
            console.error("Notisky: Unexpected error in extension icon update", error);
          });
        } catch (error) {
          handleInvalidContext(error);
        }
      }
      function getBadgeCount(element) {
        var _a2;
        if (!element) return 0;
        try {
          const text = ((_a2 = element.textContent) == null ? void 0 : _a2.trim()) || "";
          if (!text) return 0;
          if (text.endsWith("+")) {
            return parseInt(text.slice(0, -1), 10);
          }
          return parseInt(text, 10) || 0;
        } catch (error) {
          console.error("Notisky: Error getting badge count", error);
          return 0;
        }
      }
      function findNotificationBadges() {
        try {
          const badges = document.querySelectorAll('div[aria-label*="unread item"]');
          let notificationBadge = null;
          let messageBadge = null;
          badges.forEach((badge) => {
            const parentLink = badge.closest("a");
            if (!parentLink) return;
            const href = parentLink.getAttribute("href");
            if (href === "/notifications") {
              notificationBadge = badge;
            } else if (href === "/messages") {
              messageBadge = badge;
            }
          });
          return {
            notificationBadge,
            messageBadge
          };
        } catch (error) {
          console.error("Notisky: Error finding notification badges", error);
          return { notificationBadge: null, messageBadge: null };
        }
      }
      function updateBadges(forceUpdate = false) {
        try {
          if (isRealBrowser && !extensionContextValid) {
            console.log("Notisky: Skipping badge update due to invalid extension context");
            return;
          }
          const { notificationBadge, messageBadge } = findNotificationBadges();
          const notificationCount = getBadgeCount(notificationBadge);
          const messageCount = getBadgeCount(messageBadge);
          const totalCount = notificationCount + messageCount;
          console.log(`Notisky: Found notification count: ${notificationCount}, message count: ${messageCount}, total: ${totalCount}`);
          if (forceUpdate || totalCount !== lastNotificationCount + lastMessageCount) {
            console.log(`Notisky: Updating icons with count ${totalCount}`);
            try {
              createFaviconWithBadge(totalCount).then((iconUrl) => {
                if (iconUrl) {
                  applyFavicon(iconUrl);
                } else {
                  console.error("Notisky: Failed to create badge icon, favicon not updated");
                }
              }).catch((error) => {
                console.error("Notisky: Error in favicon creation/application chain", error);
                if (originalFavicon) {
                  applyFavicon(originalFavicon);
                }
              });
            } catch (error) {
              console.error("Notisky: Critical error in favicon update process", error);
            }
            try {
              updateExtensionIcon(totalCount);
            } catch (error) {
              console.error("Notisky: Error updating extension icon", error);
            }
            if (isRealBrowser) {
              try {
                browser.storage.local.set({
                  notificationCounts: {
                    notification: notificationCount,
                    message: messageCount,
                    total: totalCount
                  }
                }).catch((error) => {
                  console.warn("Notisky: Failed to save notification counts to storage", error);
                  handleInvalidContext(error);
                });
              } catch (error) {
                console.warn("Notisky: Error accessing storage", error);
                handleInvalidContext(error);
              }
            }
          }
          const newNotifications = notificationCount - lastNotificationCount;
          const newMessages = messageCount - lastMessageCount;
          if (newNotifications > 0 && userPreferences.enableNotifications) {
            sendNotification(
              "New Bluesky Notifications",
              `You have ${newNotifications} new notification${newNotifications > 1 ? "s" : ""}`,
              "notification"
            );
          }
          if (newMessages > 0 && userPreferences.enableNotifications) {
            sendNotification(
              "New Bluesky Messages",
              `You have ${newMessages} new message${newMessages > 1 ? "s" : ""}`,
              "message"
            );
          }
          lastNotificationCount = notificationCount;
          lastMessageCount = messageCount;
        } catch (error) {
          console.error("Notisky: Error updating badges", error);
          handleInvalidContext(error);
        }
      }
      function observeBadges() {
        try {
          if (isObserving || isRealBrowser && !extensionContextValid) {
            console.log("Notisky: Not starting badge observation (already observing or invalid context)");
            return;
          }
          isObserving = true;
          updateTimer = window.setInterval(() => {
            if (isRealBrowser && !extensionContextValid) {
              console.log("Notisky: Skipping scheduled badge update due to invalid context");
              return;
            }
            updateBadges();
          }, userPreferences.refreshInterval * 60 * 1e3);
          console.log("Notisky: Started observing badges");
        } catch (error) {
          console.error("Notisky: Error observing badges", error);
          handleInvalidContext(error);
        }
      }
      function stopObservingBadges() {
        try {
          if (!isObserving) return;
          isObserving = false;
          if (updateTimer !== null) {
            clearInterval(updateTimer);
            updateTimer = null;
          }
          console.log("Notisky: Stopped observing badges");
        } catch (error) {
          console.error("Notisky: Error stopping observation", error);
        }
      }
      function sendNotification(title, message, type = "notification") {
        try {
          if (!isRealBrowser || !userPreferences.enableNotifications) return;
          safelyMessageBackground({
            action: "sendNotification",
            title,
            message,
            type
          });
        } catch (error) {
          console.error("Notisky: Error sending notification", error);
        }
      }
      function safelyMessageBackground(message, retryCount = 0) {
        return new Promise((resolve, reject) => {
          try {
            if (!isRealBrowser) {
              console.log("Notisky: Not in a real browser environment, skipping message", message);
              resolve(null);
              return;
            }
            if (!extensionContextValid) {
              if (message.action === "ping") {
                console.log("Notisky: Attempting ping despite invalid context state");
              } else {
                console.log(`Notisky: Skipping message due to invalid extension context: ${message.action}`);
                resolve(null);
                return;
              }
            }
            browser.runtime.sendMessage(message).then(resolve).catch((error) => {
              const errorMessage = (error == null ? void 0 : error.message) || "Unknown error";
              const isContextError = errorMessage.includes("Extension context invalidated") || errorMessage.includes("Invalid extension context") || errorMessage.includes("Extension context is invalidated") || errorMessage.includes("Could not establish connection") || errorMessage.includes("Receiving end does not exist") || errorMessage.includes("Service worker") || typeof error.code === "number" && error.code === 15;
              if (isContextError) {
                console.log(`Notisky: Extension context invalidated for message: ${message.action}`, error);
                handleInvalidContext(error);
                const importantActions = ["getPreferences", "updateNotificationCount"];
                if (importantActions.includes(message.action) && retryCount < 2) {
                  console.log(`Notisky: Will retry important action "${message.action}" after a delay`);
                  try {
                    if (browser.runtime && browser.runtime.connect) {
                      const port = browser.runtime.connect({ name: "notisky-wake-up" });
                      setTimeout(() => {
                        try {
                          port.disconnect();
                        } catch {
                        }
                        setTimeout(() => {
                          console.log(`Notisky: Retrying "${message.action}" (attempt ${retryCount + 1})`);
                          safelyMessageBackground(message, retryCount + 1).then(resolve).catch(() => resolve(null));
                        }, 800);
                      }, 200);
                      return;
                    }
                  } catch {
                  }
                }
                resolve(null);
              } else {
                console.error(`Notisky: Error sending message: ${message.action}`, error);
                reject(error);
              }
            });
          } catch (error) {
            console.error("Notisky: Error in safelyMessageBackground", error);
            resolve(null);
          }
        });
      }
      function checkExtensionContext() {
        if (!isRealBrowser) return;
        console.log("Notisky: Checking extension context validity");
        try {
          pingBackgroundScript().then((isValid) => {
            if (isValid) {
              if (!extensionContextValid) {
                console.log("Notisky: Extension context has been restored via ping");
                extensionContextValid = true;
                if (reconnectAttemptTimer) {
                  clearInterval(reconnectAttemptTimer);
                  reconnectAttemptTimer = null;
                  reconnectAttemptCount = 0;
                }
                setTimeout(() => {
                  initialize();
                }, 1e3);
              }
              return;
            }
            tryStorageAccessCheck();
          }).catch(() => {
            tryStorageAccessCheck();
          });
        } catch (error) {
          tryStorageAccessCheck();
        }
      }
      function tryStorageAccessCheck() {
        try {
          browser.storage.local.get("contextCheck").then(() => {
            if (!extensionContextValid) {
              console.log("Notisky: Extension context has been restored via storage access");
              extensionContextValid = true;
              if (reconnectAttemptTimer) {
                clearInterval(reconnectAttemptTimer);
                reconnectAttemptTimer = null;
                reconnectAttemptCount = 0;
              }
              setTimeout(() => {
                initialize();
              }, 1e3);
            }
          }).catch((error) => {
            handleInvalidContext(error);
          });
        } catch (error) {
          handleInvalidContext(error);
        }
      }
      function pingBackgroundScript() {
        return new Promise((resolve) => {
          if (!isRealBrowser) {
            resolve(false);
            return;
          }
          try {
            const pingTimeout = setTimeout(() => {
              console.log("Notisky: Ping timed out");
              resolve(false);
            }, 2e3);
            const isMV3 = typeof browser !== "undefined" && typeof browser.runtime !== "undefined" && typeof browser.runtime.getManifest === "function" && browser.runtime.getManifest().manifest_version === 3;
            console.log("Notisky: Running in MV3 mode?", isMV3);
            if (isMV3) {
              try {
                const extensionId = browser.runtime.id;
                console.log("Notisky: Extension ID available:", extensionId);
              } catch (e) {
                console.log("Notisky: Extension runtime ID not accessible, service worker may be inactive");
                clearTimeout(pingTimeout);
                resolve(false);
                return;
              }
            }
            browser.runtime.sendMessage({ action: "ping" }).then((response) => {
              clearTimeout(pingTimeout);
              if (response && response.success && response.message === "pong") {
                console.log("Notisky: Ping successful");
                resolve(true);
              } else {
                console.log("Notisky: Ping returned unexpected response", response);
                resolve(false);
              }
            }).catch((error) => {
              clearTimeout(pingTimeout);
              console.log("Notisky: Ping error", error);
              if (error.message && (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist") || error.message.includes("Service worker") || error.message.includes("status code: 15") || error.message.includes("Extension context invalidated"))) {
                console.log("Notisky: Service worker may be terminated or not ready");
                try {
                  if (browser.runtime && browser.runtime.connect) {
                    const port = browser.runtime.connect();
                    setTimeout(() => {
                      try {
                        port.disconnect();
                        console.log("Notisky: Attempted to wake up service worker");
                      } catch (e) {
                        console.log("Notisky: Error disconnecting port", e);
                      }
                    }, 100);
                    setTimeout(() => {
                      browser.runtime.sendMessage({ action: "ping" }).then((response) => {
                        if (response && response.success) {
                          console.log("Notisky: Service worker woken up successfully");
                          resolve(true);
                        } else {
                          resolve(false);
                        }
                      }).catch(() => resolve(false));
                    }, 500);
                    return;
                  }
                } catch (e) {
                  console.log("Notisky: Failed to wake up service worker", e);
                }
              }
              resolve(false);
            });
          } catch (error) {
            console.log("Notisky: Error sending ping", error);
            resolve(false);
          }
        });
      }
      function handleInvalidContext(error) {
        if (extensionContextValid) {
          console.log("Notisky: Extension context has become invalid", error);
          extensionContextValid = false;
          reconnectAttemptCount = 0;
          if (reconnectAttemptTimer) {
            clearInterval(reconnectAttemptTimer);
          }
          reconnectAttemptTimer = window.setInterval(() => {
            reconnectAttemptCount++;
            console.log(`Notisky: Reconnection attempt ${reconnectAttemptCount} of ${MAX_RECONNECT_ATTEMPTS}`);
            checkExtensionContext();
            if (reconnectAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
              console.log("Notisky: Multiple reconnection attempts failed, reloading page");
              clearInterval(reconnectAttemptTimer);
              reconnectAttemptTimer = null;
              if (window.location.hostname.includes("bsky.app") || window.location.hostname.includes("bsky.social")) {
                console.log("Notisky: Reloading page to recover from invalid context");
                try {
                  localStorage.setItem("notiskyReloadTime", Date.now().toString());
                  localStorage.setItem("notiskyReloadReason", "extension_context_invalid");
                } catch (e) {
                }
                window.location.reload();
              }
            }
          }, RECONNECT_DELAY);
        }
      }
      function initialize() {
        console.log("Notisky: Initializing content script");
        lastNotificationCount = 0;
        lastMessageCount = 0;
        isObserving = false;
        if (updateTimer !== null) {
          clearInterval(updateTimer);
          updateTimer = null;
        }
        saveOriginalFavicon();
        if (isRealBrowser) {
          checkExtensionContext();
          setInterval(() => {
            checkExtensionContext();
          }, 60 * 1e3);
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              console.log("Notisky: Tab became visible, checking extension context");
              checkExtensionContext();
            }
          });
        }
        if (!isRealBrowser || extensionContextValid) {
          if (isRealBrowser) {
            safelyMessageBackground({ action: "getPreferences" }).then((response) => {
              if (response && response.preferences) {
                userPreferences = response.preferences;
                console.log("Notisky: Loaded user preferences", userPreferences);
              } else {
                console.log("Notisky: Using default preferences due to error or extension reload");
              }
              observeBadges();
              updateBadges(true);
            }).catch((error) => {
              console.error("Notisky: Error loading preferences, using defaults", error);
              observeBadges();
              updateBadges(true);
            });
          } else {
            observeBadges();
            updateBadges(true);
          }
        } else {
          console.log("Notisky: Skipping initialization due to invalid extension context");
        }
      }
      if (isRealBrowser) {
        browser.storage.sync.get({
          updateSiteIcon: true,
          updateExtensionIcon: true,
          enableNotifications: true,
          keepPageAlive: true,
          refreshInterval: 1
        }).then((items) => {
          userPreferences = items;
          console.log("Notisky: Loaded user preferences", userPreferences);
          initialize();
        }).catch((error) => {
          console.error("Notisky: Error loading preferences", error);
          initialize();
        });
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
          try {
            if (message.action === "checkForUpdates") {
              console.log("Notisky: Received request to check for updates");
              updateBadges(true);
              sendResponse({ success: true });
            }
            return true;
          } catch (error) {
            console.error("Notisky: Error handling message from background", error);
            sendResponse({ success: false, error: error.message });
            return true;
          }
        });
        browser.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === "sync") {
            let needRestart = false;
            for (const key in changes) {
              if (Object.prototype.hasOwnProperty.call(userPreferences, key)) {
                if (key === "refreshInterval" && updateTimer) {
                  needRestart = true;
                }
                userPreferences[key] = changes[key].newValue;
              }
            }
            console.log("Notisky: Updated preferences after storage change", userPreferences);
            if (needRestart && isObserving) {
              stopObservingBadges();
              observeBadges();
            }
          }
        });
        document.addEventListener("visibilitychange", function() {
          if (document.hidden) {
            stopObservingBadges();
          } else {
            observeBadges();
            updateBadges(true);
          }
        });
        window.addEventListener("beforeunload", function() {
          stopObservingBadges();
        });
        window.addEventListener("load", function() {
          initialize();
        });
      } else {
        console.log("Notisky: In build environment, skipping initialization");
      }
      browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Content script received message:", message);
        if (message.action === "checkPage") {
          sendResponse({ success: true, url: window.location.href });
        }
        return true;
      });
      const isAuthCallbackPage = window.location.href.includes("/auth/callback");
      if (isAuthCallbackPage) {
        console.log("Detected auth callback page, processing auth response");
        processAuthCallback();
      }
      function processAuthCallback() {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const code = urlParams.get("code");
          const state = urlParams.get("state");
          const error = urlParams.get("error");
          if (error) {
            console.error("Auth error received:", error);
            browser.runtime.sendMessage({
              action: "authError",
              error
            });
            return;
          }
          if (!code || !state) {
            console.error("Missing required parameters in auth callback");
            return;
          }
          console.log("Auth callback received code and state, sending to background");
          browser.runtime.sendMessage({
            action: "authSuccess",
            code,
            state
          });
          browser.storage.local.set({
            auth_code: code,
            auth_state: state,
            auth_timestamp: Date.now()
          });
          const statusElement = document.getElementById("status");
          if (statusElement) {
            statusElement.textContent = "Authentication successful! You can close this tab.";
            statusElement.className = "success";
          }
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {
              console.log("Could not auto-close tab:", e);
              if (statusElement) {
                statusElement.textContent = "Authentication complete! You can now close this tab manually.";
              }
            }
          }, 3e3);
        } catch (error) {
          console.error("Error processing auth callback:", error);
        }
      }
    }
  });
  content;
  function print$1(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger$1 = {
    debug: (...args) => print$1(console.debug, ...args),
    log: (...args) => print$1(console.log, ...args),
    warn: (...args) => print$1(console.warn, ...args),
    error: (...args) => print$1(console.error, ...args)
  };
  const _WxtLocationChangeEvent = class _WxtLocationChangeEvent extends Event {
    constructor(newUrl, oldUrl) {
      super(_WxtLocationChangeEvent.EVENT_NAME, {});
      this.newUrl = newUrl;
      this.oldUrl = oldUrl;
    }
  };
  __publicField(_WxtLocationChangeEvent, "EVENT_NAME", getUniqueEventName("wxt:locationchange"));
  let WxtLocationChangeEvent = _WxtLocationChangeEvent;
  function getUniqueEventName(eventName) {
    var _a2;
    return `${(_a2 = browser == null ? void 0 : browser.runtime) == null ? void 0 : _a2.id}:${"content"}:${eventName}`;
  }
  function createLocationWatcher(ctx) {
    let interval;
    let oldUrl;
    return {
      /**
       * Ensure the location watcher is actively looking for URL changes. If it's already watching,
       * this is a noop.
       */
      run() {
        if (interval != null) return;
        oldUrl = new URL(location.href);
        interval = ctx.setInterval(() => {
          let newUrl = new URL(location.href);
          if (newUrl.href !== oldUrl.href) {
            window.dispatchEvent(new WxtLocationChangeEvent(newUrl, oldUrl));
            oldUrl = newUrl;
          }
        }, 1e3);
      }
    };
  }
  const _ContentScriptContext = class _ContentScriptContext {
    constructor(contentScriptName, options) {
      __publicField(this, "isTopFrame", window.self === window.top);
      __publicField(this, "abortController");
      __publicField(this, "locationWatcher", createLocationWatcher(this));
      __publicField(this, "receivedMessageIds", /* @__PURE__ */ new Set());
      this.contentScriptName = contentScriptName;
      this.options = options;
      this.abortController = new AbortController();
      if (this.isTopFrame) {
        this.listenForNewerScripts({ ignoreFirstEvent: true });
        this.stopOldScripts();
      } else {
        this.listenForNewerScripts();
      }
    }
    get signal() {
      return this.abortController.signal;
    }
    abort(reason) {
      return this.abortController.abort(reason);
    }
    get isInvalid() {
      if (browser.runtime.id == null) {
        this.notifyInvalidated();
      }
      return this.signal.aborted;
    }
    get isValid() {
      return !this.isInvalid;
    }
    /**
     * Add a listener that is called when the content script's context is invalidated.
     *
     * @returns A function to remove the listener.
     *
     * @example
     * browser.runtime.onMessage.addListener(cb);
     * const removeInvalidatedListener = ctx.onInvalidated(() => {
     *   browser.runtime.onMessage.removeListener(cb);
     * })
     * // ...
     * removeInvalidatedListener();
     */
    onInvalidated(cb) {
      this.signal.addEventListener("abort", cb);
      return () => this.signal.removeEventListener("abort", cb);
    }
    /**
     * Return a promise that never resolves. Useful if you have an async function that shouldn't run
     * after the context is expired.
     *
     * @example
     * const getValueFromStorage = async () => {
     *   if (ctx.isInvalid) return ctx.block();
     *
     *   // ...
     * }
     */
    block() {
      return new Promise(() => {
      });
    }
    /**
     * Wrapper around `window.setInterval` that automatically clears the interval when invalidated.
     */
    setInterval(handler, timeout) {
      const id = setInterval(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearInterval(id));
      return id;
    }
    /**
     * Wrapper around `window.setTimeout` that automatically clears the interval when invalidated.
     */
    setTimeout(handler, timeout) {
      const id = setTimeout(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearTimeout(id));
      return id;
    }
    /**
     * Wrapper around `window.requestAnimationFrame` that automatically cancels the request when
     * invalidated.
     */
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame((...args) => {
        if (this.isValid) callback(...args);
      });
      this.onInvalidated(() => cancelAnimationFrame(id));
      return id;
    }
    /**
     * Wrapper around `window.requestIdleCallback` that automatically cancels the request when
     * invalidated.
     */
    requestIdleCallback(callback, options) {
      const id = requestIdleCallback((...args) => {
        if (!this.signal.aborted) callback(...args);
      }, options);
      this.onInvalidated(() => cancelIdleCallback(id));
      return id;
    }
    addEventListener(target, type, handler, options) {
      var _a2;
      if (type === "wxt:locationchange") {
        if (this.isValid) this.locationWatcher.run();
      }
      (_a2 = target.addEventListener) == null ? void 0 : _a2.call(
        target,
        type.startsWith("wxt:") ? getUniqueEventName(type) : type,
        handler,
        {
          ...options,
          signal: this.signal
        }
      );
    }
    /**
     * @internal
     * Abort the abort controller and execute all `onInvalidated` listeners.
     */
    notifyInvalidated() {
      this.abort("Content script context invalidated");
      logger$1.debug(
        `Content script "${this.contentScriptName}" context invalidated`
      );
    }
    stopOldScripts() {
      window.postMessage(
        {
          type: _ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
          contentScriptName: this.contentScriptName,
          messageId: Math.random().toString(36).slice(2)
        },
        "*"
      );
    }
    verifyScriptStartedEvent(event) {
      var _a2, _b2, _c;
      const isScriptStartedEvent = ((_a2 = event.data) == null ? void 0 : _a2.type) === _ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE;
      const isSameContentScript = ((_b2 = event.data) == null ? void 0 : _b2.contentScriptName) === this.contentScriptName;
      const isNotDuplicate = !this.receivedMessageIds.has((_c = event.data) == null ? void 0 : _c.messageId);
      return isScriptStartedEvent && isSameContentScript && isNotDuplicate;
    }
    listenForNewerScripts(options) {
      let isFirst = true;
      const cb = (event) => {
        if (this.verifyScriptStartedEvent(event)) {
          this.receivedMessageIds.add(event.data.messageId);
          const wasFirst = isFirst;
          isFirst = false;
          if (wasFirst && (options == null ? void 0 : options.ignoreFirstEvent)) return;
          this.notifyInvalidated();
        }
      };
      addEventListener("message", cb);
      this.onInvalidated(() => removeEventListener("message", cb));
    }
  };
  __publicField(_ContentScriptContext, "SCRIPT_STARTED_MESSAGE_TYPE", getUniqueEventName(
    "wxt:content-script-started"
  ));
  let ContentScriptContext = _ContentScriptContext;
  function initPlugins() {
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  const result = (async () => {
    try {
      initPlugins();
      const { main, ...options } = definition;
      const ctx = new ContentScriptContext("content", options);
      return await main(ctx);
    } catch (err) {
      logger.error(
        `The content script "${"content"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
}();
content;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC9icm93c2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9kZWZpbmUtY29udGVudC1zY3JpcHQubWpzIiwiLi4vLi4vLi4vZW50cnlwb2ludHMvY29udGVudC50cyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgX2Jyb3dzZXIgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBfYnJvd3NlcjtcbmV4cG9ydCB7fTtcbiIsImV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDb250ZW50U2NyaXB0KGRlZmluaXRpb24pIHtcbiAgcmV0dXJuIGRlZmluaXRpb247XG59XG4iLCJpbXBvcnQgeyBkZWZpbmVDb250ZW50U2NyaXB0IH0gZnJvbSAnd3h0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdCc7XHJcblxyXG4vLyBDb250ZW50IHNjcmlwdCBmb3IgTm90aXNreSBCcm93c2VyIEV4dGVuc2lvblxyXG4vLyBUaGlzIHNjcmlwdCBydW5zIG9uIEJsdWVza3kgdG8gbW9uaXRvciBub3RpZmljYXRpb24gYW5kIG1lc3NhZ2UgYmFkZ2VzXHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb250ZW50U2NyaXB0KHtcclxuICBtYXRjaGVzOiBbJyo6Ly9ic2t5LmFwcC8qJywgJyo6Ly8qLmJza3kuc29jaWFsLyonXSxcclxuICBtYWluKCkge1xyXG4gICAgY29uc29sZS5sb2coJ05vdGlza3kgY29udGVudCBzY3JpcHQgbG9hZGVkJyk7XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgd2UncmUgaW4gYSByZWFsIGJyb3dzZXIgZW52aXJvbm1lbnQgKHZzLiBidWlsZCBlbnZpcm9ubWVudClcclxuICAgIGNvbnN0IGlzUmVhbEJyb3dzZXIgPSAoKCkgPT4ge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHJldHVybiB0eXBlb2YgYnJvd3NlciAhPT0gJ3VuZGVmaW5lZCcgJiYgXHJcbiAgICAgICAgICAgICAgdHlwZW9mIGJyb3dzZXIucnVudGltZSAhPT0gJ3VuZGVmaW5lZCcgJiZcclxuICAgICAgICAgICAgICB0eXBlb2YgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlID09PSAnZnVuY3Rpb24nICYmXHJcbiAgICAgICAgICAgICAgIWJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZS50b1N0cmluZygpLmluY2x1ZGVzKCdub3QgaW1wbGVtZW50ZWQnKTtcclxuICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBOb3QgaW4gYSByZWFsIGJyb3dzZXIgZW52aXJvbm1lbnQnLCBlKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH0pKCk7XHJcbiAgICBcclxuICAgIGxldCBsYXN0Tm90aWZpY2F0aW9uQ291bnQgPSAwO1xyXG4gICAgbGV0IGxhc3RNZXNzYWdlQ291bnQgPSAwO1xyXG4gICAgbGV0IGlzT2JzZXJ2aW5nID0gZmFsc2U7XHJcbiAgICBsZXQgdXBkYXRlVGltZXI6IG51bWJlciB8IG51bGwgPSBudWxsO1xyXG4gICAgbGV0IG9yaWdpbmFsRmF2aWNvbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlIHRoZSBvcmlnaW5hbCBmYXZpY29uIFVSTFxyXG4gICAgXHJcbiAgICAvLyBVc2VyIHByZWZlcmVuY2VzIHdpdGggZGVmYXVsdHNcclxuICAgIGludGVyZmFjZSBVc2VyUHJlZmVyZW5jZXMge1xyXG4gICAgICB1cGRhdGVTaXRlSWNvbjogYm9vbGVhbjtcclxuICAgICAgdXBkYXRlRXh0ZW5zaW9uSWNvbjogYm9vbGVhbjtcclxuICAgICAgZW5hYmxlTm90aWZpY2F0aW9uczogYm9vbGVhbjtcclxuICAgICAga2VlcFBhZ2VBbGl2ZTogYm9vbGVhbjtcclxuICAgICAgcmVmcmVzaEludGVydmFsOiBudW1iZXI7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCB1c2VyUHJlZmVyZW5jZXM6IFVzZXJQcmVmZXJlbmNlcyA9IHtcclxuICAgICAgdXBkYXRlU2l0ZUljb246IHRydWUsXHJcbiAgICAgIHVwZGF0ZUV4dGVuc2lvbkljb246IHRydWUsXHJcbiAgICAgIGVuYWJsZU5vdGlmaWNhdGlvbnM6IHRydWUsXHJcbiAgICAgIGtlZXBQYWdlQWxpdmU6IHRydWUsXHJcbiAgICAgIHJlZnJlc2hJbnRlcnZhbDogMSAvLyBEZWZhdWx0IHRvIDEgbWludXRlXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICAvLyBWYXJpYWJsZXMgdG8gdHJhY2sgZXh0ZW5zaW9uIGNvbnRleHQgc3RhdGVcclxuICAgIGxldCBleHRlbnNpb25Db250ZXh0VmFsaWQgPSB0cnVlO1xyXG4gICAgbGV0IHJlY29ubmVjdEF0dGVtcHRUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgcmVjb25uZWN0QXR0ZW1wdENvdW50ID0gMDtcclxuICAgIGNvbnN0IE1BWF9SRUNPTk5FQ1RfQVRURU1QVFMgPSAxMDtcclxuICAgIGNvbnN0IFJFQ09OTkVDVF9ERUxBWSA9IDUwMDA7IC8vIDUgc2Vjb25kcyBiZXR3ZWVuIHJlY29ubmVjdCBhdHRlbXB0c1xyXG4gICAgXHJcbiAgICAvLyBTYXZlIHRoZSBvcmlnaW5hbCBmYXZpY29uIHdoZW4gdGhlIHBhZ2UgbG9hZHNcclxuICAgIGZ1bmN0aW9uIHNhdmVPcmlnaW5hbEZhdmljb24oKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEF0dGVtcHRpbmcgdG8gc2F2ZSBvcmlnaW5hbCBmYXZpY29uJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRmlyc3QsIGNoZWNrIGlmIHdlIGFscmVhZHkgaGF2ZSBvbmUgc2F2ZWRcclxuICAgICAgICBpZiAob3JpZ2luYWxGYXZpY29uKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogT3JpZ2luYWwgZmF2aWNvbiBhbHJlYWR5IHNhdmVkOicsIG9yaWdpbmFsRmF2aWNvbik7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIExvb2sgZm9yIGZhdmljb24gbGluayB0YWdzXHJcbiAgICAgICAgY29uc3QgZmF2aWNvbkxpbmtzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbGlua1tyZWw9XCJpY29uXCJdLCBsaW5rW3JlbD1cInNob3J0Y3V0IGljb25cIl0nKTtcclxuICAgICAgICBpZiAoZmF2aWNvbkxpbmtzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIC8vIFVzZSB0aGUgZmlyc3QgZmF2aWNvbiBsaW5rIGZvdW5kXHJcbiAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSBmYXZpY29uTGlua3NbMF0uZ2V0QXR0cmlidXRlKCdocmVmJyk7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogU2F2ZWQgb3JpZ2luYWwgZmF2aWNvbjonLCBvcmlnaW5hbEZhdmljb24pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmF2aWNvbiBVUkwgaXMgdmFsaWRcclxuICAgICAgICAgIGlmICghb3JpZ2luYWxGYXZpY29uKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBJbnZhbGlkIGhyZWYgYXR0cmlidXRlIG9uIGZhdmljb24gbGluaywgdXNpbmcgZGVmYXVsdCcpO1xyXG4gICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LmFwcC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFRyeSB0byBjcmVhdGUgYSBVUkwgb2JqZWN0IHRvIGNoZWNrIGlmIGl0J3MgYSB2YWxpZCBVUkxcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vIFNvbWUgZmF2aWNvbnMgbWlnaHQgYmUgcmVsYXRpdmUgcGF0aHMgb3IgZGF0YSBVUkxzLCBoYW5kbGUgdGhlbSBjYXJlZnVsbHlcclxuICAgICAgICAgICAgbGV0IGZhdmljb25Vcmw6IFVSTDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChvcmlnaW5hbEZhdmljb24uc3RhcnRzV2l0aCgnZGF0YTonKSkge1xyXG4gICAgICAgICAgICAgIC8vIEl0J3MgYSBkYXRhIFVSTCwgd2hpY2ggaXMgZmluZSB0byB1c2UgZGlyZWN0bHlcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogRmF2aWNvbiBpcyBhIGRhdGEgVVJMLCB1c2luZyBhcy1pcycpO1xyXG4gICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChvcmlnaW5hbEZhdmljb24uc3RhcnRzV2l0aCgnaHR0cDovLycpIHx8IG9yaWdpbmFsRmF2aWNvbi5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XHJcbiAgICAgICAgICAgICAgLy8gQWJzb2x1dGUgVVJMXHJcbiAgICAgICAgICAgICAgZmF2aWNvblVybCA9IG5ldyBVUkwob3JpZ2luYWxGYXZpY29uKTtcclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmF2aWNvbiBVUkwgaXMgZnJvbSB0aGUgc2FtZSBvcmlnaW5cclxuICAgICAgICAgICAgICBjb25zdCBjdXJyZW50VXJsID0gbmV3IFVSTCh3aW5kb3cubG9jYXRpb24uaHJlZik7XHJcbiAgICAgICAgICAgICAgaWYgKGZhdmljb25Vcmwub3JpZ2luICE9PSBjdXJyZW50VXJsLm9yaWdpbikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEZhdmljb24gaXMgZnJvbSBkaWZmZXJlbnQgb3JpZ2luLCB1c2luZyBkZWZhdWx0IHRvIGF2b2lkIENPUlMgaXNzdWVzJyk7XHJcbiAgICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LmFwcC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAvLyBSZWxhdGl2ZSBVUkwsIG1ha2UgaXQgYWJzb2x1dGVcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogQ29udmVydGluZyByZWxhdGl2ZSBmYXZpY29uIFVSTCB0byBhYnNvbHV0ZScpO1xyXG4gICAgICAgICAgICAgIGZhdmljb25VcmwgPSBuZXcgVVJMKG9yaWdpbmFsRmF2aWNvbiwgd2luZG93LmxvY2F0aW9uLmhyZWYpO1xyXG4gICAgICAgICAgICAgIG9yaWdpbmFsRmF2aWNvbiA9IGZhdmljb25VcmwuaHJlZjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSBjYXRjaCAodXJsRXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEVycm9yIHBhcnNpbmcgZmF2aWNvbiBVUkwsIHVzaW5nIGRlZmF1bHQnLCB1cmxFcnJvcik7XHJcbiAgICAgICAgICAgIG9yaWdpbmFsRmF2aWNvbiA9ICdodHRwczovL2Jza3kuYXBwL3N0YXRpYy9mYXZpY29uLTMyeDMyLnBuZyc7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIFRyeSB0byBmaW5kIGl0IGZyb20gb3RoZXIgY2x1ZXMgaWYgbm8gZmF2aWNvbiBsaW5rIGVsZW1lbnRzXHJcbiAgICAgICAgICBjb25zdCBhcHBsZVRvdWNoSWNvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2xpbmtbcmVsPVwiYXBwbGUtdG91Y2gtaWNvblwiXScpO1xyXG4gICAgICAgICAgaWYgKGFwcGxlVG91Y2hJY29uICYmIGFwcGxlVG91Y2hJY29uLmdldEF0dHJpYnV0ZSgnaHJlZicpKSB7XHJcbiAgICAgICAgICAgIG9yaWdpbmFsRmF2aWNvbiA9IGFwcGxlVG91Y2hJY29uLmdldEF0dHJpYnV0ZSgnaHJlZicpIHx8ICcnO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogVXNpbmcgYXBwbGUtdG91Y2gtaWNvbiBhcyBmYXZpY29uOicsIG9yaWdpbmFsRmF2aWNvbik7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJZiBubyBmYXZpY29uIGZvdW5kLCBjaGVjayBpZiB3ZSBjYW4gY29uc3RydWN0IHRoZSBkZWZhdWx0IG9uZSBmcm9tIHRoZSBjdXJyZW50IGRvbWFpblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgIGNvbnN0IGRvbWFpbiA9IHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZTtcclxuICAgICAgICAgICAgICBpZiAoZG9tYWluLmluY2x1ZGVzKCdic2t5LmFwcCcpKSB7XHJcbiAgICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LmFwcC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xyXG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZG9tYWluLmluY2x1ZGVzKCdic2t5LnNvY2lhbCcpKSB7XHJcbiAgICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LnNvY2lhbC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBHZW5lcmljIGZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnL2Zhdmljb24uaWNvJztcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFVzaW5nIGNvbnN0cnVjdGVkIGZhdmljb24gcGF0aDonLCBvcmlnaW5hbEZhdmljb24pO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgLy8gVWx0aW1hdGUgZmFsbGJhY2tcclxuICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LmFwcC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBVc2luZyBkZWZhdWx0IEJsdWVza3kgZmF2aWNvbicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ05vdGlza3k6IEVycm9yIHNhdmluZyBvcmlnaW5hbCBmYXZpY29uJywgZXJyb3IpO1xyXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGRlZmF1bHQgQmx1ZXNreSBmYXZpY29uXHJcbiAgICAgICAgb3JpZ2luYWxGYXZpY29uID0gJ2h0dHBzOi8vYnNreS5hcHAvc3RhdGljL2Zhdmljb24tMzJ4MzIucG5nJztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGdW5jdGlvbiB0byBjcmVhdGUgYSBmYXZpY29uIHdpdGggYSBiYWRnZSBjb3VudFxyXG4gICAgZnVuY3Rpb24gY3JlYXRlRmF2aWNvbldpdGhCYWRnZShjb3VudDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBpZiAoY291bnQgPD0gMCkge1xyXG4gICAgICAgICAgLy8gUmV0dXJuIHRoZSBvcmlnaW5hbCBmYXZpY29uIGlmIG5vIG5vdGlmaWNhdGlvbnNcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBSZXR1cm5pbmcgb3JpZ2luYWwgZmF2aWNvbiAobm8gbm90aWZpY2F0aW9ucyknKTtcclxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUob3JpZ2luYWxGYXZpY29uIHx8ICdodHRwczovL2Jza3kuYXBwL3N0YXRpYy9mYXZpY29uLTMyeDMyLnBuZycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRGV0ZXJtaW5lIHRoZSBiYWRnZSBpY29uIHR5cGVcclxuICAgICAgICBsZXQgaWNvblR5cGU6IHN0cmluZztcclxuICAgICAgICBpZiAoY291bnQgPiAzMCkge1xyXG4gICAgICAgICAgaWNvblR5cGUgPSAnMzBwbHVzJztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgaWNvblR5cGUgPSBjb3VudC50b1N0cmluZygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVHJ5IHRvIHVzZSBwcmUtZ2VuZXJhdGVkIGJhZGdlIG5vdGlmaWNhdGlvbiBpY29ucyBmaXJzdFxyXG4gICAgICAgIGlmIChpc1JlYWxCcm93c2VyICYmIGV4dGVuc2lvbkNvbnRleHRWYWxpZCkge1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgLy8gVXNlIHRoZSAzMnB4IHNpemUgaWNvbiBmb3IgZmF2aWNvbiAoYmVzdCBtYXRjaCBmb3IgbW9zdCBmYXZpY29uIHNpemVzKVxyXG4gICAgICAgICAgICBjb25zdCBiYWRnZUljb25VcmwgPSBicm93c2VyLnJ1bnRpbWUuZ2V0VVJMKGAvaWNvbi9ub3RpZmljYXRpb24vJHtpY29uVHlwZX1fMzIucG5nYCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBVc2luZyBleHRlbnNpb24gYmFkZ2UgaWNvbjogJHtiYWRnZUljb25Vcmx9YCk7XHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoYmFkZ2VJY29uVXJsKTtcclxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBFcnJvciBnZXR0aW5nIGJhZGdlIGljb24gVVJMLCBmYWxsaW5nIGJhY2sgdG8gZHluYW1pYyBnZW5lcmF0aW9uJywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBEb24ndCBtYXJrIGNvbnRleHQgYXMgaW52YWxpZCwganVzdCBmYWxsIHRocm91Z2ggdG8gZHluYW1pYyBnZW5lcmF0aW9uXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBOb3QgdXNpbmcgZXh0ZW5zaW9uIHJlc291cmNlcywgZmFsbGluZyBiYWNrIHRvIGR5bmFtaWMgZ2VuZXJhdGlvbicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBEeW5hbWljIGdlbmVyYXRpb24gYXBwcm9hY2ggKGZvciBkZXZlbG9wbWVudCBvciBmYWxsYmFjaylcclxuICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogR2VuZXJhdGluZyBkeW5hbWljIGJhZGdlIGljb24nKTtcclxuICAgICAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICBjYW52YXMud2lkdGggPSAzMjtcclxuICAgICAgICBjYW52YXMuaGVpZ2h0ID0gMzI7XHJcbiAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XHJcblxyXG4gICAgICAgIGlmICghY3R4KSB7XHJcbiAgICAgICAgICBjb25zb2xlLndhcm4oJ05vdGlza3k6IENvdWxkIG5vdCBnZXQgY2FudmFzIGNvbnRleHQsIHJldHVybmluZyBvcmlnaW5hbCBmYXZpY29uJyk7XHJcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG9yaWdpbmFsRmF2aWNvbiB8fCAnaHR0cHM6Ly9ic2t5LmFwcC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIHN0YW5kYWxvbmUgcmVkIG5vdGlmaWNhdGlvbiBiYWRnZVxyXG4gICAgICAgIC8vIENsZWFyIHRoZSBjYW52YXNcclxuICAgICAgICBjdHguY2xlYXJSZWN0KDAsIDAsIDMyLCAzMik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIGJhZGdlIHNpemUgdG8gZmlsbCBtb3N0IG9mIHRoZSBpY29uIHNwYWNlXHJcbiAgICAgICAgY29uc3QgYmFkZ2VTaXplID0gTWF0aC5tYXgoMzIgKiAwLjksIDE0KTsgLy8gOTAlIG9mIGljb24gc2l6ZVxyXG4gICAgICAgIGNvbnN0IGJhZGdlWCA9IDMyIC8gMjsgLy8gQ2VudGVyIGhvcml6b250YWxseVxyXG4gICAgICAgIGNvbnN0IGJhZGdlWSA9IDMyIC8gMjsgLy8gQ2VudGVyIHZlcnRpY2FsbHlcclxuICAgICAgICBcclxuICAgICAgICAvLyBEcmF3IHJlZCBjaXJjbGUgYmFja2dyb3VuZFxyXG4gICAgICAgIGN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICBjdHguYXJjKGJhZGdlWCwgYmFkZ2VZLCBiYWRnZVNpemUvMiwgMCwgTWF0aC5QSSAqIDIpO1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSAnI0ZGNEE0QSc7IC8vIFJlZCBiYWRnZSBjb2xvclxyXG4gICAgICAgIGN0eC5maWxsKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRm9ybWF0IGNvdW50IHRleHRcclxuICAgICAgICBsZXQgY291bnRUZXh0O1xyXG4gICAgICAgIGlmIChjb3VudCA+IDMwKSB7XHJcbiAgICAgICAgICBjb3VudFRleHQgPSAnMzArJztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgY291bnRUZXh0ID0gY291bnQudG9TdHJpbmcoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWRkIHdoaXRlIHRleHRcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJyNGRkZGRkYnO1xyXG4gICAgICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICBjdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU2NhbGUgZm9udCBzaXplIGJhc2VkIG9uIGJhZGdlIHNpemUgYW5kIGNoYXJhY3RlciBjb3VudFxyXG4gICAgICAgIGNvbnN0IGZvbnRTaXplID0gTWF0aC5tYXgoYmFkZ2VTaXplICogMC41LCA3KTsgLy8gNTAlIG9mIGJhZGdlIHNpemVcclxuICAgICAgICBjdHguZm9udCA9IGBib2xkICR7Zm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFkanVzdCBmb250IHNpemUgaWYgdGV4dCBpcyB0b28gbG9uZ1xyXG4gICAgICAgIGlmIChjb3VudFRleHQubGVuZ3RoID4gMSkge1xyXG4gICAgICAgICAgY3R4LmZvbnQgPSBgYm9sZCAke2ZvbnRTaXplICogMC44fXB4IEFyaWFsYDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGNvdW50VGV4dC5sZW5ndGggPiAyKSB7XHJcbiAgICAgICAgICBjdHguZm9udCA9IGBib2xkICR7Zm9udFNpemUgKiAwLjd9cHggQXJpYWxgO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjdHguZmlsbFRleHQoY291bnRUZXh0LCBiYWRnZVgsIGJhZGdlWSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZGF0YVVybCA9IGNhbnZhcy50b0RhdGFVUkwoJ2ltYWdlL3BuZycpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBHZW5lcmF0ZWQgZHluYW1pYyBiYWRnZSBpY29uJyk7XHJcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShkYXRhVXJsKTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBFcnJvciBjcmVhdGluZyBmYXZpY29uJywgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUob3JpZ2luYWxGYXZpY29uIHx8ICdodHRwczovL2Jza3kuYXBwL3N0YXRpYy9mYXZpY29uLTMyeDMyLnBuZycpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZ1bmN0aW9uIHRvIHNhZmVseSBhcHBseSB0aGUgZmF2aWNvblxyXG4gICAgZnVuY3Rpb24gYXBwbHlGYXZpY29uKGZhdmljb25Vcmw6IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPikge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmICghZmF2aWNvblVybCkge1xyXG4gICAgICAgICAgY29uc29sZS53YXJuKCdOb3Rpc2t5OiBObyBmYXZpY29uIFVSTCBwcm92aWRlZCwgc2tpcHBpbmcgdXBkYXRlJyk7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghdXNlclByZWZlcmVuY2VzLnVwZGF0ZVNpdGVJY29uKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogU2l0ZSBpY29uIHVwZGF0ZXMgZGlzYWJsZWQgaW4gcHJlZmVyZW5jZXMsIHNraXBwaW5nIHVwZGF0ZScpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIC8vIEhhbmRsZSBwcm9taXNlcyByZXR1cm5lZCBieSBjcmVhdGVGYXZpY29uV2l0aEJhZGdlXHJcbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKGZhdmljb25VcmwpXHJcbiAgICAgICAgICAudGhlbih1cmwgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXVybCkge1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUud2FybignTm90aXNreTogRW1wdHkgZmF2aWNvbiBVUkwgYWZ0ZXIgcHJvbWlzZSByZXNvbHV0aW9uLCBza2lwcGluZyB1cGRhdGUnKTtcclxuICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBBcHBseWluZyBmYXZpY29uOiAke3VybC5zdWJzdHJpbmcoMCwgNTApfSR7dXJsLmxlbmd0aCA+IDUwID8gJy4uLicgOiAnJ31gKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgLy8gRmlyc3QsIHRyeSB0byB1cGRhdGUgZXhpc3RpbmcgZmF2aWNvbiBsaW5rIGVsZW1lbnRzXHJcbiAgICAgICAgICAgICAgbGV0IGxpbmtFbGVtZW50cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2xpbmtbcmVsPVwiaWNvblwiXSwgbGlua1tyZWw9XCJzaG9ydGN1dCBpY29uXCJdJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgICAgaWYgKGxpbmtFbGVtZW50cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgZXhpc3RpbmcgZmF2aWNvbiBsaW5rc1xyXG4gICAgICAgICAgICAgICAgbGlua0VsZW1lbnRzLmZvckVhY2gobGluayA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIGxpbmsuc2V0QXR0cmlidXRlKCdocmVmJywgdXJsKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYE5vdGlza3k6IFVwZGF0ZWQgJHtsaW5rRWxlbWVudHMubGVuZ3RofSBleGlzdGluZyBmYXZpY29uIGxpbmtzYCk7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBhIG5ldyBmYXZpY29uIGxpbmsgaWYgbm9uZSBleGlzdHNcclxuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7XHJcbiAgICAgICAgICAgICAgICBsaW5rLnJlbCA9ICdpY29uJztcclxuICAgICAgICAgICAgICAgIGxpbmsudHlwZSA9ICdpbWFnZS9wbmcnO1xyXG4gICAgICAgICAgICAgICAgbGluay5ocmVmID0gdXJsO1xyXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChsaW5rKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBDcmVhdGVkIG5ldyBmYXZpY29uIGxpbmsnKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgLy8gVmVyaWZ5IHRoZSBjaGFuZ2Ugd2FzIGFwcGxpZWRcclxuICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRGYXZpY29uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbGlua1tyZWw9XCJpY29uXCJdLCBsaW5rW3JlbD1cInNob3J0Y3V0IGljb25cIl0nKTtcclxuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50RmF2aWNvbikge1xyXG4gICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50SHJlZiA9IGN1cnJlbnRGYXZpY29uLmdldEF0dHJpYnV0ZSgnaHJlZicpO1xyXG4gICAgICAgICAgICAgICAgICBpZiAoY3VycmVudEhyZWYgIT09IHVybCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignTm90aXNreTogRmF2aWNvbiB1cGRhdGUgbWF5IG5vdCBoYXZlIGFwcGxpZWQgY29ycmVjdGx5Jyk7XHJcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEZhdmljb24gdXBkYXRlIHZlcmlmaWVkJyk7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9LCAxMDApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChkb21FcnJvcikge1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ05vdGlza3k6IERPTSBlcnJvciB3aGVuIGFwcGx5aW5nIGZhdmljb24nLCBkb21FcnJvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBFcnJvciByZXNvbHZpbmcgZmF2aWNvbiBVUkwnLCBlcnJvcik7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBDcml0aWNhbCBlcnJvciBhcHBseWluZyBmYXZpY29uJywgZXJyb3IpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZ1bmN0aW9uIHRvIHVwZGF0ZSB0aGUgZXh0ZW5zaW9uIGljb24gKHRvb2xiYXIgaWNvbilcclxuICAgIGZ1bmN0aW9uIHVwZGF0ZUV4dGVuc2lvbkljb24oY291bnQ6IG51bWJlcikge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmICghaXNSZWFsQnJvd3NlciB8fCAhdXNlclByZWZlcmVuY2VzLnVwZGF0ZUV4dGVuc2lvbkljb24pIHJldHVybjtcclxuICAgICAgICBcclxuICAgICAgICBzYWZlbHlNZXNzYWdlQmFja2dyb3VuZCh7XHJcbiAgICAgICAgICBhY3Rpb246ICd1cGRhdGVOb3RpZmljYXRpb25Db3VudCcsXHJcbiAgICAgICAgICBjb3VudDogY291bnRcclxuICAgICAgICB9KS50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBFeHRlbnNpb24gaWNvbiB1cGRhdGUgc3VjY2Vzc2Z1bCcpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChyZXNwb25zZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAvLyBObyBuZWVkIHRvIGxvZzsgc2FmZWx5TWVzc2FnZUJhY2tncm91bmQgYWxyZWFkeSBoYW5kbGVkIHRoZSBlcnJvclxyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IE5vIHN1Y2Nlc3MgcmVzcG9uc2UgZnJvbSBleHRlbnNpb24gaWNvbiB1cGRhdGUnKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAvLyBUaGlzIHNob3VsZG4ndCBoYXBwZW4gZHVlIHRvIHRoZSBwcm9taXNlIGhhbmRsaW5nIGluIHNhZmVseU1lc3NhZ2VCYWNrZ3JvdW5kXHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBVbmV4cGVjdGVkIGVycm9yIGluIGV4dGVuc2lvbiBpY29uIHVwZGF0ZScsIGVycm9yKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRnVuY3Rpb24gdG8gZXh0cmFjdCBiYWRnZSBjb3VudCBmcm9tIGFuIGVsZW1lbnRcclxuICAgIGZ1bmN0aW9uIGdldEJhZGdlQ291bnQoZWxlbWVudDogRWxlbWVudCB8IG51bGwpOiBudW1iZXIge1xyXG4gICAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAwO1xyXG4gICAgXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgdGV4dCA9IGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCAnJztcclxuICAgICAgICBpZiAoIXRleHQpIHJldHVybiAwO1xyXG4gICAgXHJcbiAgICAgICAgLy8gSWYgaXQncyBsaWtlIFwiMzArXCIsIHJldHVybiAzMFxyXG4gICAgICAgIGlmICh0ZXh0LmVuZHNXaXRoKCcrJykpIHtcclxuICAgICAgICAgIHJldHVybiBwYXJzZUludCh0ZXh0LnNsaWNlKDAsIC0xKSwgMTApO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHJldHVybiBwYXJzZUludCh0ZXh0LCAxMCkgfHwgMDtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBFcnJvciBnZXR0aW5nIGJhZGdlIGNvdW50JywgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybiAwO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZ1bmN0aW9uIHRvIGZpbmQgbm90aWZpY2F0aW9uIGJhZGdlIGVsZW1lbnRzXHJcbiAgICBmdW5jdGlvbiBmaW5kTm90aWZpY2F0aW9uQmFkZ2VzKCkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIExvb2sgZm9yIGJhZGdlIGVsZW1lbnRzIHRoYXQgY291bGQgYmUgbm90aWZpY2F0aW9uc1xyXG4gICAgICAgIC8vIFRoZXkgdHlwaWNhbGx5IGhhdmUgYSBzcGVjaWZpYyBhcmlhLWxhYmVsIGFuZCBjbGFzc1xyXG4gICAgICAgIGNvbnN0IGJhZGdlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2RpdlthcmlhLWxhYmVsKj1cInVucmVhZCBpdGVtXCJdJyk7XHJcbiAgICBcclxuICAgICAgICBsZXQgbm90aWZpY2F0aW9uQmFkZ2U6IEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgICAgICBsZXQgbWVzc2FnZUJhZGdlOiBFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBcclxuICAgICAgICAvLyBJZGVudGlmeSB3aGljaCBiYWRnZSBpcyBmb3Igbm90aWZpY2F0aW9ucyBhbmQgd2hpY2ggaXMgZm9yIG1lc3NhZ2VzXHJcbiAgICAgICAgYmFkZ2VzLmZvckVhY2goYmFkZ2UgPT4ge1xyXG4gICAgICAgICAgLy8gQ2hlY2sgcGFyZW50IGxpbmtzIHRvIGRldGVybWluZSBiYWRnZSB0eXBlXHJcbiAgICAgICAgICBjb25zdCBwYXJlbnRMaW5rID0gYmFkZ2UuY2xvc2VzdCgnYScpO1xyXG4gICAgICAgICAgaWYgKCFwYXJlbnRMaW5rKSByZXR1cm47XHJcbiAgICBcclxuICAgICAgICAgIGNvbnN0IGhyZWYgPSBwYXJlbnRMaW5rLmdldEF0dHJpYnV0ZSgnaHJlZicpO1xyXG4gICAgICAgICAgaWYgKGhyZWYgPT09ICcvbm90aWZpY2F0aW9ucycpIHtcclxuICAgICAgICAgICAgbm90aWZpY2F0aW9uQmFkZ2UgPSBiYWRnZTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAoaHJlZiA9PT0gJy9tZXNzYWdlcycpIHtcclxuICAgICAgICAgICAgbWVzc2FnZUJhZGdlID0gYmFkZ2U7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICBcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgbm90aWZpY2F0aW9uQmFkZ2UsXHJcbiAgICAgICAgICBtZXNzYWdlQmFkZ2VcclxuICAgICAgICB9O1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ05vdGlza3k6IEVycm9yIGZpbmRpbmcgbm90aWZpY2F0aW9uIGJhZGdlcycsIGVycm9yKTtcclxuICAgICAgICByZXR1cm4geyBub3RpZmljYXRpb25CYWRnZTogbnVsbCwgbWVzc2FnZUJhZGdlOiBudWxsIH07XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRnVuY3Rpb24gdG8gdXBkYXRlIGJhZGdlIGNvdW50cyBhbmQgaWNvbnMgYmFzZWQgb24gRE9NIGVsZW1lbnRzXHJcbiAgICBmdW5jdGlvbiB1cGRhdGVCYWRnZXMoZm9yY2VVcGRhdGUgPSBmYWxzZSkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmIChpc1JlYWxCcm93c2VyICYmICFleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBTa2lwcGluZyBiYWRnZSB1cGRhdGUgZHVlIHRvIGludmFsaWQgZXh0ZW5zaW9uIGNvbnRleHQnKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgeyBub3RpZmljYXRpb25CYWRnZSwgbWVzc2FnZUJhZGdlIH0gPSBmaW5kTm90aWZpY2F0aW9uQmFkZ2VzKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgbm90aWZpY2F0aW9uQ291bnQgPSBnZXRCYWRnZUNvdW50KG5vdGlmaWNhdGlvbkJhZGdlKTtcclxuICAgICAgICBjb25zdCBtZXNzYWdlQ291bnQgPSBnZXRCYWRnZUNvdW50KG1lc3NhZ2VCYWRnZSk7XHJcbiAgICAgICAgY29uc3QgdG90YWxDb3VudCA9IG5vdGlmaWNhdGlvbkNvdW50ICsgbWVzc2FnZUNvdW50O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBGb3VuZCBub3RpZmljYXRpb24gY291bnQ6ICR7bm90aWZpY2F0aW9uQ291bnR9LCBtZXNzYWdlIGNvdW50OiAke21lc3NhZ2VDb3VudH0sIHRvdGFsOiAke3RvdGFsQ291bnR9YCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gT25seSB1cGRhdGUgaWYgY291bnRzIGhhdmUgY2hhbmdlZCBvciBpZiBmb3JjZVVwZGF0ZSBpcyB0cnVlXHJcbiAgICAgICAgaWYgKGZvcmNlVXBkYXRlIHx8IHRvdGFsQ291bnQgIT09IGxhc3ROb3RpZmljYXRpb25Db3VudCArIGxhc3RNZXNzYWdlQ291bnQpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBVcGRhdGluZyBpY29ucyB3aXRoIGNvdW50ICR7dG90YWxDb3VudH1gKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gVXBkYXRlIGZhdmljb24gd2l0aCBiYWRnZVxyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY3JlYXRlRmF2aWNvbldpdGhCYWRnZSh0b3RhbENvdW50KVxyXG4gICAgICAgICAgICAgIC50aGVuKGljb25VcmwgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGljb25VcmwpIHtcclxuICAgICAgICAgICAgICAgICAgYXBwbHlGYXZpY29uKGljb25VcmwpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignTm90aXNreTogRmFpbGVkIHRvIGNyZWF0ZSBiYWRnZSBpY29uLCBmYXZpY29uIG5vdCB1cGRhdGVkJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignTm90aXNreTogRXJyb3IgaW4gZmF2aWNvbiBjcmVhdGlvbi9hcHBsaWNhdGlvbiBjaGFpbicsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIGlmIChvcmlnaW5hbEZhdmljb24pIHtcclxuICAgICAgICAgICAgICAgICAgYXBwbHlGYXZpY29uKG9yaWdpbmFsRmF2aWNvbik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBDcml0aWNhbCBlcnJvciBpbiBmYXZpY29uIHVwZGF0ZSBwcm9jZXNzJywgZXJyb3IpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBVcGRhdGUgZXh0ZW5zaW9uIGljb25cclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHVwZGF0ZUV4dGVuc2lvbkljb24odG90YWxDb3VudCk7XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBFcnJvciB1cGRhdGluZyBleHRlbnNpb24gaWNvbicsIGVycm9yKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gU3RvcmUgY291bnRzIGluIGV4dGVuc2lvbiBzdG9yYWdlXHJcbiAgICAgICAgICBpZiAoaXNSZWFsQnJvd3Nlcikge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5zZXQoe1xyXG4gICAgICAgICAgICAgICAgbm90aWZpY2F0aW9uQ291bnRzOiB7XHJcbiAgICAgICAgICAgICAgICAgIG5vdGlmaWNhdGlvbjogbm90aWZpY2F0aW9uQ291bnQsXHJcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2VDb3VudCxcclxuICAgICAgICAgICAgICAgICAgdG90YWw6IHRvdGFsQ291bnRcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ05vdGlza3k6IEZhaWxlZCB0byBzYXZlIG5vdGlmaWNhdGlvbiBjb3VudHMgdG8gc3RvcmFnZScsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIGhhbmRsZUludmFsaWRDb250ZXh0KGVycm9yKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ05vdGlza3k6IEVycm9yIGFjY2Vzc2luZyBzdG9yYWdlJywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgIGhhbmRsZUludmFsaWRDb250ZXh0KGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBmb3IgbmV3IG5vdGlmaWNhdGlvbnMgdG8gc2hvdyBhIHN5c3RlbSBub3RpZmljYXRpb25cclxuICAgICAgICBjb25zdCBuZXdOb3RpZmljYXRpb25zID0gbm90aWZpY2F0aW9uQ291bnQgLSBsYXN0Tm90aWZpY2F0aW9uQ291bnQ7XHJcbiAgICAgICAgY29uc3QgbmV3TWVzc2FnZXMgPSBtZXNzYWdlQ291bnQgLSBsYXN0TWVzc2FnZUNvdW50O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChuZXdOb3RpZmljYXRpb25zID4gMCAmJiB1c2VyUHJlZmVyZW5jZXMuZW5hYmxlTm90aWZpY2F0aW9ucykge1xyXG4gICAgICAgICAgc2VuZE5vdGlmaWNhdGlvbihcclxuICAgICAgICAgICAgJ05ldyBCbHVlc2t5IE5vdGlmaWNhdGlvbnMnLFxyXG4gICAgICAgICAgICBgWW91IGhhdmUgJHtuZXdOb3RpZmljYXRpb25zfSBuZXcgbm90aWZpY2F0aW9uJHtuZXdOb3RpZmljYXRpb25zID4gMSA/ICdzJyA6ICcnfWAsXHJcbiAgICAgICAgICAgICdub3RpZmljYXRpb24nXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAobmV3TWVzc2FnZXMgPiAwICYmIHVzZXJQcmVmZXJlbmNlcy5lbmFibGVOb3RpZmljYXRpb25zKSB7XHJcbiAgICAgICAgICBzZW5kTm90aWZpY2F0aW9uKFxyXG4gICAgICAgICAgICAnTmV3IEJsdWVza3kgTWVzc2FnZXMnLFxyXG4gICAgICAgICAgICBgWW91IGhhdmUgJHtuZXdNZXNzYWdlc30gbmV3IG1lc3NhZ2Uke25ld01lc3NhZ2VzID4gMSA/ICdzJyA6ICcnfWAsXHJcbiAgICAgICAgICAgICdtZXNzYWdlJ1xyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVXBkYXRlIHN0b3JlZCBjb3VudHNcclxuICAgICAgICBsYXN0Tm90aWZpY2F0aW9uQ291bnQgPSBub3RpZmljYXRpb25Db3VudDtcclxuICAgICAgICBsYXN0TWVzc2FnZUNvdW50ID0gbWVzc2FnZUNvdW50O1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ05vdGlza3k6IEVycm9yIHVwZGF0aW5nIGJhZGdlcycsIGVycm9yKTtcclxuICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRnVuY3Rpb24gdG8gc3RhcnQgb2JzZXJ2aW5nIGNoYW5nZXMgaW4gbm90aWZpY2F0aW9uIGFuZCBtZXNzYWdlIGJhZGdlc1xyXG4gICAgZnVuY3Rpb24gb2JzZXJ2ZUJhZGdlcygpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBpZiAoaXNPYnNlcnZpbmcgfHwgKGlzUmVhbEJyb3dzZXIgJiYgIWV4dGVuc2lvbkNvbnRleHRWYWxpZCkpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBOb3Qgc3RhcnRpbmcgYmFkZ2Ugb2JzZXJ2YXRpb24gKGFscmVhZHkgb2JzZXJ2aW5nIG9yIGludmFsaWQgY29udGV4dCknKTtcclxuICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaXNPYnNlcnZpbmcgPSB0cnVlO1xyXG4gICAgICAgIHVwZGF0ZVRpbWVyID0gd2luZG93LnNldEludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgIGlmIChpc1JlYWxCcm93c2VyICYmICFleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFNraXBwaW5nIHNjaGVkdWxlZCBiYWRnZSB1cGRhdGUgZHVlIHRvIGludmFsaWQgY29udGV4dCcpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICB1cGRhdGVCYWRnZXMoKTtcclxuICAgICAgICB9LCB1c2VyUHJlZmVyZW5jZXMucmVmcmVzaEludGVydmFsICogNjAgKiAxMDAwKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogU3RhcnRlZCBvYnNlcnZpbmcgYmFkZ2VzJyk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignTm90aXNreTogRXJyb3Igb2JzZXJ2aW5nIGJhZGdlcycsIGVycm9yKTtcclxuICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRnVuY3Rpb24gdG8gc3RvcCBvYnNlcnZpbmcgY2hhbmdlcyBpbiBub3RpZmljYXRpb24gYW5kIG1lc3NhZ2UgYmFkZ2VzXHJcbiAgICBmdW5jdGlvbiBzdG9wT2JzZXJ2aW5nQmFkZ2VzKCkge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmICghaXNPYnNlcnZpbmcpIHJldHVybjtcclxuICAgIFxyXG4gICAgICAgIGlzT2JzZXJ2aW5nID0gZmFsc2U7XHJcbiAgICAgICAgaWYgKHVwZGF0ZVRpbWVyICE9PSBudWxsKSB7XHJcbiAgICAgICAgICBjbGVhckludGVydmFsKHVwZGF0ZVRpbWVyKTtcclxuICAgICAgICAgIHVwZGF0ZVRpbWVyID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFN0b3BwZWQgb2JzZXJ2aW5nIGJhZGdlcycpO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ05vdGlza3k6IEVycm9yIHN0b3BwaW5nIG9ic2VydmF0aW9uJywgZXJyb3IpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZ1bmN0aW9uIHRvIHNlbmQgYSBub3RpZmljYXRpb25cclxuICAgIGZ1bmN0aW9uIHNlbmROb3RpZmljYXRpb24odGl0bGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgPSAnbm90aWZpY2F0aW9uJykge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmICghaXNSZWFsQnJvd3NlciB8fCAhdXNlclByZWZlcmVuY2VzLmVuYWJsZU5vdGlmaWNhdGlvbnMpIHJldHVybjtcclxuICAgICAgICBcclxuICAgICAgICAvLyBVc2UgdGhlIHNhZmVyIG1lc3NhZ2luZyBoZWxwZXJcclxuICAgICAgICBzYWZlbHlNZXNzYWdlQmFja2dyb3VuZCh7XHJcbiAgICAgICAgICBhY3Rpb246ICdzZW5kTm90aWZpY2F0aW9uJyxcclxuICAgICAgICAgIHRpdGxlOiB0aXRsZSxcclxuICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXHJcbiAgICAgICAgICB0eXBlOiB0eXBlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignTm90aXNreTogRXJyb3Igc2VuZGluZyBub3RpZmljYXRpb24nLCBlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRnVuY3Rpb24gdG8gc2FmZWx5IHNlbmQgbWVzc2FnZXMgdG8gdGhlIGJhY2tncm91bmQgc2NyaXB0XHJcbiAgICBmdW5jdGlvbiBzYWZlbHlNZXNzYWdlQmFja2dyb3VuZChtZXNzYWdlOiBhbnksIHJldHJ5Q291bnQgPSAwKTogUHJvbWlzZTxhbnk+IHtcclxuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgaWYgKCFpc1JlYWxCcm93c2VyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBOb3QgaW4gYSByZWFsIGJyb3dzZXIgZW52aXJvbm1lbnQsIHNraXBwaW5nIG1lc3NhZ2UnLCBtZXNzYWdlKTtcclxuICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZiAoIWV4dGVuc2lvbkNvbnRleHRWYWxpZCkge1xyXG4gICAgICAgICAgICAvLyBGb3IgcGluZyBtZXNzYWdlcywgc3RpbGwgdHJ5IGV2ZW4gd2l0aCBpbnZhbGlkIGNvbnRleHRcclxuICAgICAgICAgICAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAncGluZycpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogQXR0ZW1wdGluZyBwaW5nIGRlc3BpdGUgaW52YWxpZCBjb250ZXh0IHN0YXRlJyk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYE5vdGlza3k6IFNraXBwaW5nIG1lc3NhZ2UgZHVlIHRvIGludmFsaWQgZXh0ZW5zaW9uIGNvbnRleHQ6ICR7bWVzc2FnZS5hY3Rpb259YCk7XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcclxuICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICAgIFxyXG4gICAgICAgICAgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKG1lc3NhZ2UpXHJcbiAgICAgICAgICAgIC50aGVuKHJlc29sdmUpXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3I/Lm1lc3NhZ2UgfHwgJ1Vua25vd24gZXJyb3InO1xyXG4gICAgICAgICAgICAgIGNvbnN0IGlzQ29udGV4dEVycm9yID0gXHJcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ0V4dGVuc2lvbiBjb250ZXh0IGludmFsaWRhdGVkJykgfHxcclxuICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnSW52YWxpZCBleHRlbnNpb24gY29udGV4dCcpIHx8XHJcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ0V4dGVuc2lvbiBjb250ZXh0IGlzIGludmFsaWRhdGVkJykgfHxcclxuICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnQ291bGQgbm90IGVzdGFibGlzaCBjb25uZWN0aW9uJykgfHxcclxuICAgICAgICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnUmVjZWl2aW5nIGVuZCBkb2VzIG5vdCBleGlzdCcpIHx8XHJcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ1NlcnZpY2Ugd29ya2VyJykgfHxcclxuICAgICAgICAgICAgICAgICh0eXBlb2YgZXJyb3IuY29kZSA9PT0gJ251bWJlcicgJiYgZXJyb3IuY29kZSA9PT0gMTUpOyAvLyBTb21lIGJyb3dzZXJzIHVzZSBjb2RlIDE1XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICBpZiAoaXNDb250ZXh0RXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZCBmb3IgbWVzc2FnZTogJHttZXNzYWdlLmFjdGlvbn1gLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIEZvciBjcml0aWNhbCBtZXNzYWdlcywgd2UgbWlnaHQgd2FudCB0byByZXRyeSBhZnRlciB3YWtpbmcgdXAgdGhlIHNlcnZpY2Ugd29ya2VyXHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbXBvcnRhbnRBY3Rpb25zID0gWydnZXRQcmVmZXJlbmNlcycsICd1cGRhdGVOb3RpZmljYXRpb25Db3VudCddO1xyXG4gICAgICAgICAgICAgICAgaWYgKGltcG9ydGFudEFjdGlvbnMuaW5jbHVkZXMobWVzc2FnZS5hY3Rpb24pICYmIHJldHJ5Q291bnQgPCAyKSB7XHJcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBXaWxsIHJldHJ5IGltcG9ydGFudCBhY3Rpb24gXCIke21lc3NhZ2UuYWN0aW9ufVwiIGFmdGVyIGEgZGVsYXlgKTtcclxuICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgIC8vIFRyeSB0byB3YWtlIHVwIHNlcnZpY2Ugd29ya2VyIGZpcnN0XHJcbiAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJyb3dzZXIucnVudGltZSAmJiBicm93c2VyLnJ1bnRpbWUuY29ubmVjdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgY29uc3QgcG9ydCA9IGJyb3dzZXIucnVudGltZS5jb25uZWN0KHtuYW1lOiAnbm90aXNreS13YWtlLXVwJ30pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7IHBvcnQuZGlzY29ubmVjdCgpOyB9IGNhdGNoIHt9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBSZXRyeSBhZnRlciBhIGRlbGF5XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBSZXRyeWluZyBcIiR7bWVzc2FnZS5hY3Rpb259XCIgKGF0dGVtcHQgJHtyZXRyeUNvdW50ICsgMX0pYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgc2FmZWx5TWVzc2FnZUJhY2tncm91bmQobWVzc2FnZSwgcmV0cnlDb3VudCArIDEpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbihyZXNvbHZlKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKCgpID0+IHJlc29sdmUobnVsbCkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCA4MDApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfSwgMjAwKTtcclxuICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge31cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgTm90aXNreTogRXJyb3Igc2VuZGluZyBtZXNzYWdlOiAke21lc3NhZ2UuYWN0aW9ufWAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcignTm90aXNreTogRXJyb3IgaW4gc2FmZWx5TWVzc2FnZUJhY2tncm91bmQnLCBlcnJvcik7XHJcbiAgICAgICAgICByZXNvbHZlKG51bGwpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZ1bmN0aW9uIHRvIGNoZWNrIGlmIHRoZSBleHRlbnNpb24gY29udGV4dCBpcyB2YWxpZFxyXG4gICAgZnVuY3Rpb24gY2hlY2tFeHRlbnNpb25Db250ZXh0KCkge1xyXG4gICAgICBpZiAoIWlzUmVhbEJyb3dzZXIpIHJldHVybjtcclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBDaGVja2luZyBleHRlbnNpb24gY29udGV4dCB2YWxpZGl0eScpO1xyXG4gICAgICBcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBwaW5nQmFja2dyb3VuZFNjcmlwdCgpXHJcbiAgICAgICAgICAudGhlbihpc1ZhbGlkID0+IHtcclxuICAgICAgICAgICAgaWYgKGlzVmFsaWQpIHtcclxuICAgICAgICAgICAgICBpZiAoIWV4dGVuc2lvbkNvbnRleHRWYWxpZCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEV4dGVuc2lvbiBjb250ZXh0IGhhcyBiZWVuIHJlc3RvcmVkIHZpYSBwaW5nJyk7XHJcbiAgICAgICAgICAgICAgICBleHRlbnNpb25Db250ZXh0VmFsaWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciByZWNvbm5lY3QgdGltZXJcclxuICAgICAgICAgICAgICAgIGlmIChyZWNvbm5lY3RBdHRlbXB0VGltZXIpIHtcclxuICAgICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChyZWNvbm5lY3RBdHRlbXB0VGltZXIpO1xyXG4gICAgICAgICAgICAgICAgICByZWNvbm5lY3RBdHRlbXB0VGltZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICByZWNvbm5lY3RBdHRlbXB0Q291bnQgPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBSZS1pbml0aWFsaXplIGFmdGVyIGEgc2hvcnQgZGVsYXlcclxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICBpbml0aWFsaXplKCk7XHJcbiAgICAgICAgICAgICAgICB9LCAxMDAwKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBQaW5nIGZhaWxlZCwgdHJ5IHN0b3JhZ2UgYWNjZXNzXHJcbiAgICAgICAgICAgIHRyeVN0b3JhZ2VBY2Nlc3NDaGVjaygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC5jYXRjaCgoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIEVycm9yIHBpbmdpbmcsIHRyeSBzdG9yYWdlIGFjY2Vzc1xyXG4gICAgICAgICAgICB0cnlTdG9yYWdlQWNjZXNzQ2hlY2soKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIC8vIEVycm9yIGluIHRoZSBlbnRpcmUgcGluZyBwcm9jZXNzLCB0cnkgc3RvcmFnZSBhY2Nlc3NcclxuICAgICAgICB0cnlTdG9yYWdlQWNjZXNzQ2hlY2soKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBUcnkgdG8gYWNjZXNzIHN0b3JhZ2UgYXMgYSB3YXkgdG8gY2hlY2sgZXh0ZW5zaW9uIGNvbnRleHQgdmFsaWRpdHlcclxuICAgIGZ1bmN0aW9uIHRyeVN0b3JhZ2VBY2Nlc3NDaGVjaygpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICAvLyBUcnkgdG8gYWNjZXNzIGJyb3dzZXIuc3RvcmFnZSBhcyBhbm90aGVyIHZhbGlkaXR5IGNoZWNrXHJcbiAgICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLmdldCgnY29udGV4dENoZWNrJylcclxuICAgICAgICAgIC50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgaWYgKCFleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogRXh0ZW5zaW9uIGNvbnRleHQgaGFzIGJlZW4gcmVzdG9yZWQgdmlhIHN0b3JhZ2UgYWNjZXNzJyk7XHJcbiAgICAgICAgICAgICAgZXh0ZW5zaW9uQ29udGV4dFZhbGlkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAvLyBDbGVhciByZWNvbm5lY3QgdGltZXJcclxuICAgICAgICAgICAgICBpZiAocmVjb25uZWN0QXR0ZW1wdFRpbWVyKSB7XHJcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHJlY29ubmVjdEF0dGVtcHRUaW1lcik7XHJcbiAgICAgICAgICAgICAgICByZWNvbm5lY3RBdHRlbXB0VGltZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgcmVjb25uZWN0QXR0ZW1wdENvdW50ID0gMDtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgLy8gUmUtaW5pdGlhbGl6ZSBhZnRlciBhIHNob3J0IGRlbGF5XHJcbiAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpbml0aWFsaXplKCk7XHJcbiAgICAgICAgICAgICAgfSwgMTAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gRnVuY3Rpb24gdG8gcGluZyB0aGUgYmFja2dyb3VuZCBzY3JpcHQgdG8gY2hlY2sgaWYgaXQncyBhbGl2ZVxyXG4gICAgZnVuY3Rpb24gcGluZ0JhY2tncm91bmRTY3JpcHQoKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcclxuICAgICAgICBpZiAoIWlzUmVhbEJyb3dzZXIpIHtcclxuICAgICAgICAgIHJlc29sdmUoZmFsc2UpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgLy8gU2V0IGEgdGltZW91dCBmb3IgdGhlIHBpbmdcclxuICAgICAgICAgIGNvbnN0IHBpbmdUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBQaW5nIHRpbWVkIG91dCcpO1xyXG4gICAgICAgICAgICByZXNvbHZlKGZhbHNlKTtcclxuICAgICAgICAgIH0sIDIwMDApO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBDaGVjayBpZiB3ZSdyZSBpbiBNYW5pZmVzdCBWMyBtb2RlIChzZXJ2aWNlIHdvcmtlcilcclxuICAgICAgICAgIGNvbnN0IGlzTVYzID0gXHJcbiAgICAgICAgICAgIHR5cGVvZiBicm93c2VyICE9PSAndW5kZWZpbmVkJyAmJiBcclxuICAgICAgICAgICAgdHlwZW9mIGJyb3dzZXIucnVudGltZSAhPT0gJ3VuZGVmaW5lZCcgJiYgXHJcbiAgICAgICAgICAgIHR5cGVvZiBicm93c2VyLnJ1bnRpbWUuZ2V0TWFuaWZlc3QgPT09ICdmdW5jdGlvbicgJiYgXHJcbiAgICAgICAgICAgIGJyb3dzZXIucnVudGltZS5nZXRNYW5pZmVzdCgpLm1hbmlmZXN0X3ZlcnNpb24gPT09IDM7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBSdW5uaW5nIGluIE1WMyBtb2RlPycsIGlzTVYzKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gSW4gTVYzLCBjaGVjayBpZiBleHRlbnNpb24gSUQgaXMgYXZhaWxhYmxlIGZpcnN0XHJcbiAgICAgICAgICBpZiAoaXNNVjMpIHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICBjb25zdCBleHRlbnNpb25JZCA9IGJyb3dzZXIucnVudGltZS5pZDtcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogRXh0ZW5zaW9uIElEIGF2YWlsYWJsZTonLCBleHRlbnNpb25JZCk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogRXh0ZW5zaW9uIHJ1bnRpbWUgSUQgbm90IGFjY2Vzc2libGUsIHNlcnZpY2Ugd29ya2VyIG1heSBiZSBpbmFjdGl2ZScpO1xyXG4gICAgICAgICAgICAgIGNsZWFyVGltZW91dChwaW5nVGltZW91dCk7XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XHJcbiAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFNlbmQgYSBwaW5nIG1lc3NhZ2UgdG8gYmFja2dyb3VuZFxyXG4gICAgICAgICAgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiAncGluZycgfSlcclxuICAgICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgICAgIGNsZWFyVGltZW91dChwaW5nVGltZW91dCk7XHJcbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLnN1Y2Nlc3MgJiYgcmVzcG9uc2UubWVzc2FnZSA9PT0gJ3BvbmcnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogUGluZyBzdWNjZXNzZnVsJyk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKHRydWUpO1xyXG4gICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogUGluZyByZXR1cm5lZCB1bmV4cGVjdGVkIHJlc3BvbnNlJywgcmVzcG9uc2UpO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgIGNsZWFyVGltZW91dChwaW5nVGltZW91dCk7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFBpbmcgZXJyb3InLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgLy8gSGFuZGxlIHNlcnZpY2Ugd29ya2VyIHRlcm1pbmF0aW9uIGluIE1WM1xyXG4gICAgICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlICYmIChcclxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQ291bGQgbm90IGVzdGFibGlzaCBjb25uZWN0aW9uJykgfHxcclxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnUmVjZWl2aW5nIGVuZCBkb2VzIG5vdCBleGlzdCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ1NlcnZpY2Ugd29ya2VyJykgfHxcclxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnc3RhdHVzIGNvZGU6IDE1JykgfHxcclxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRXh0ZW5zaW9uIGNvbnRleHQgaW52YWxpZGF0ZWQnKVxyXG4gICAgICAgICAgICAgICAgKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFNlcnZpY2Ugd29ya2VyIG1heSBiZSB0ZXJtaW5hdGVkIG9yIG5vdCByZWFkeScpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBBdHRlbXB0IHRvIHdha2UgdXAgdGhlIHNlcnZpY2Ugd29ya2VyIGJ5IGNvbm5lY3RpbmcgYnJpZWZseVxyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgaWYgKGJyb3dzZXIucnVudGltZSAmJiBicm93c2VyLnJ1bnRpbWUuY29ubmVjdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBhbmQgaW1tZWRpYXRlbHkgZGlzY29ubmVjdCBhIHBvcnQgdG8gd2FrZSB1cCBzZXJ2aWNlIHdvcmtlclxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBvcnQgPSBicm93c2VyLnJ1bnRpbWUuY29ubmVjdCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcG9ydC5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBBdHRlbXB0ZWQgdG8gd2FrZSB1cCBzZXJ2aWNlIHdvcmtlcicpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogRXJyb3IgZGlzY29ubmVjdGluZyBwb3J0JywgZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSwgMTAwKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvLyBXYWl0IGEgc2hvcnQgdGltZSBhbmQgdHJ5IHBpbmcgYWdhaW5cclxuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgIGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ3BpbmcnIH0pXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFNlcnZpY2Ugd29ya2VyIHdva2VuIHVwIHN1Y2Nlc3NmdWxseScpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh0cnVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goKCkgPT4gcmVzb2x2ZShmYWxzZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sIDUwMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBGYWlsZWQgdG8gd2FrZSB1cCBzZXJ2aWNlIHdvcmtlcicsIGUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICByZXNvbHZlKGZhbHNlKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBFcnJvciBzZW5kaW5nIHBpbmcnLCBlcnJvcik7XHJcbiAgICAgICAgICByZXNvbHZlKGZhbHNlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBIYW5kbGUgYW4gaW52YWxpZCBleHRlbnNpb24gY29udGV4dFxyXG4gICAgZnVuY3Rpb24gaGFuZGxlSW52YWxpZENvbnRleHQoZXJyb3I6IGFueSkge1xyXG4gICAgICBpZiAoZXh0ZW5zaW9uQ29udGV4dFZhbGlkKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEV4dGVuc2lvbiBjb250ZXh0IGhhcyBiZWNvbWUgaW52YWxpZCcsIGVycm9yKTtcclxuICAgICAgICBleHRlbnNpb25Db250ZXh0VmFsaWQgPSBmYWxzZTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBSZXNldCByZWNvbm5lY3Rpb24gc3RhdGVcclxuICAgICAgICByZWNvbm5lY3RBdHRlbXB0Q291bnQgPSAwO1xyXG4gICAgICAgIGlmIChyZWNvbm5lY3RBdHRlbXB0VGltZXIpIHtcclxuICAgICAgICAgIGNsZWFySW50ZXJ2YWwocmVjb25uZWN0QXR0ZW1wdFRpbWVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RhcnQgdHJ5aW5nIHRvIHJlY29ubmVjdFxyXG4gICAgICAgIHJlY29ubmVjdEF0dGVtcHRUaW1lciA9IHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICByZWNvbm5lY3RBdHRlbXB0Q291bnQrKztcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGBOb3Rpc2t5OiBSZWNvbm5lY3Rpb24gYXR0ZW1wdCAke3JlY29ubmVjdEF0dGVtcHRDb3VudH0gb2YgJHtNQVhfUkVDT05ORUNUX0FUVEVNUFRTfWApO1xyXG4gICAgICAgICAgY2hlY2tFeHRlbnNpb25Db250ZXh0KCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIEFmdGVyIHNldmVyYWwgZmFpbGVkIGF0dGVtcHRzLCByZWxvYWQgdGhlIHBhZ2VcclxuICAgICAgICAgIGlmIChyZWNvbm5lY3RBdHRlbXB0Q291bnQgPj0gTUFYX1JFQ09OTkVDVF9BVFRFTVBUUykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogTXVsdGlwbGUgcmVjb25uZWN0aW9uIGF0dGVtcHRzIGZhaWxlZCwgcmVsb2FkaW5nIHBhZ2UnKTtcclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChyZWNvbm5lY3RBdHRlbXB0VGltZXIpO1xyXG4gICAgICAgICAgICByZWNvbm5lY3RBdHRlbXB0VGltZXIgPSBudWxsO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gT25seSByZWxvYWQgaWYgd2UncmUgb24gYSBCbHVlc2t5IHBhZ2UgdG8gYXZvaWQgaW50ZXJmZXJpbmcgd2l0aCBvdGhlciBzaXRlc1xyXG4gICAgICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLmhvc3RuYW1lLmluY2x1ZGVzKCdic2t5LmFwcCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lLmluY2x1ZGVzKCdic2t5LnNvY2lhbCcpKSB7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFJlbG9hZGluZyBwYWdlIHRvIHJlY292ZXIgZnJvbSBpbnZhbGlkIGNvbnRleHQnKTtcclxuICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgLy8gVHJ5IHRvIHBlcnNpc3QgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHJlbG9hZCBpbiBsb2NhbCBzdG9yYWdlIGZpcnN0XHJcbiAgICAgICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnbm90aXNreVJlbG9hZFRpbWUnLCBEYXRlLm5vdygpLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ25vdGlza3lSZWxvYWRSZWFzb24nLCAnZXh0ZW5zaW9uX2NvbnRleHRfaW52YWxpZCcpO1xyXG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgICAgIC8vIElnbm9yZSBzdG9yYWdlIGVycm9yc1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCBSRUNPTk5FQ1RfREVMQVkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEluaXRpYWxpemUgZXZlcnl0aGluZ1xyXG4gICAgZnVuY3Rpb24gaW5pdGlhbGl6ZSgpIHtcclxuICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEluaXRpYWxpemluZyBjb250ZW50IHNjcmlwdCcpO1xyXG4gICAgICBcclxuICAgICAgLy8gUmVzZXQgY291bnRlcnNcclxuICAgICAgbGFzdE5vdGlmaWNhdGlvbkNvdW50ID0gMDtcclxuICAgICAgbGFzdE1lc3NhZ2VDb3VudCA9IDA7XHJcbiAgICAgIGlzT2JzZXJ2aW5nID0gZmFsc2U7XHJcbiAgICAgIGlmICh1cGRhdGVUaW1lciAhPT0gbnVsbCkge1xyXG4gICAgICAgIGNsZWFySW50ZXJ2YWwodXBkYXRlVGltZXIpO1xyXG4gICAgICAgIHVwZGF0ZVRpbWVyID0gbnVsbDtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgLy8gU2F2ZSB0aGUgb3JpZ2luYWwgZmF2aWNvblxyXG4gICAgICBzYXZlT3JpZ2luYWxGYXZpY29uKCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBTZXQgdXAgZXh0ZW5zaW9uIGNvbnRleHQgY2hlY2tpbmdcclxuICAgICAgaWYgKGlzUmVhbEJyb3dzZXIpIHtcclxuICAgICAgICAvLyBJbml0aWFsIGNvbnRleHQgY2hlY2tcclxuICAgICAgICBjaGVja0V4dGVuc2lvbkNvbnRleHQoKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBQZXJpb2RpYyBjb250ZXh0IGNoZWNrc1xyXG4gICAgICAgIHNldEludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgIGNoZWNrRXh0ZW5zaW9uQ29udGV4dCgpO1xyXG4gICAgICAgIH0sIDYwICogMTAwMCk7IC8vIENoZWNrIGV2ZXJ5IG1pbnV0ZVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENoZWNrIHdoZW4gdGFiIGJlY29tZXMgdmlzaWJsZVxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCAoKSA9PiB7XHJcbiAgICAgICAgICBpZiAoZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAndmlzaWJsZScpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFRhYiBiZWNhbWUgdmlzaWJsZSwgY2hlY2tpbmcgZXh0ZW5zaW9uIGNvbnRleHQnKTtcclxuICAgICAgICAgICAgY2hlY2tFeHRlbnNpb25Db250ZXh0KCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIC8vIExvYWQgcHJlZmVyZW5jZXMgYW5kIHN0YXJ0IG9ic2VydmluZ1xyXG4gICAgICBpZiAoIWlzUmVhbEJyb3dzZXIgfHwgZXh0ZW5zaW9uQ29udGV4dFZhbGlkKSB7XHJcbiAgICAgICAgaWYgKGlzUmVhbEJyb3dzZXIpIHtcclxuICAgICAgICAgIHNhZmVseU1lc3NhZ2VCYWNrZ3JvdW5kKHsgYWN0aW9uOiAnZ2V0UHJlZmVyZW5jZXMnIH0pXHJcbiAgICAgICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UucHJlZmVyZW5jZXMpIHtcclxuICAgICAgICAgICAgICAgIHVzZXJQcmVmZXJlbmNlcyA9IHJlc3BvbnNlLnByZWZlcmVuY2VzO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IExvYWRlZCB1c2VyIHByZWZlcmVuY2VzJywgdXNlclByZWZlcmVuY2VzKTtcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IFVzaW5nIGRlZmF1bHQgcHJlZmVyZW5jZXMgZHVlIHRvIGVycm9yIG9yIGV4dGVuc2lvbiByZWxvYWQnKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgLy8gU3RhcnQgb2JzZXJ2aW5nIGJhZGdlcyBhbmQgZm9yY2UgYW4gaW5pdGlhbCB1cGRhdGVcclxuICAgICAgICAgICAgICBvYnNlcnZlQmFkZ2VzKCk7XHJcbiAgICAgICAgICAgICAgdXBkYXRlQmFkZ2VzKHRydWUpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ05vdGlza3k6IEVycm9yIGxvYWRpbmcgcHJlZmVyZW5jZXMsIHVzaW5nIGRlZmF1bHRzJywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgIG9ic2VydmVCYWRnZXMoKTtcclxuICAgICAgICAgICAgICB1cGRhdGVCYWRnZXModHJ1ZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAvLyBJbiBkZXZlbG9wbWVudCBtb2RlLCBqdXN0IHVzZSBkZWZhdWx0c1xyXG4gICAgICAgICAgb2JzZXJ2ZUJhZGdlcygpO1xyXG4gICAgICAgICAgdXBkYXRlQmFkZ2VzKHRydWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogU2tpcHBpbmcgaW5pdGlhbGl6YXRpb24gZHVlIHRvIGludmFsaWQgZXh0ZW5zaW9uIGNvbnRleHQnKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBMb2FkIHVzZXIgcHJlZmVyZW5jZXMgZnJvbSBzdG9yYWdlXHJcbiAgICBpZiAoaXNSZWFsQnJvd3Nlcikge1xyXG4gICAgICAvLyBMb2FkIHByZWZlcmVuY2VzIGZyb20gc3RvcmFnZSBmaXJzdFxyXG4gICAgICBicm93c2VyLnN0b3JhZ2Uuc3luYy5nZXQoe1xyXG4gICAgICAgIHVwZGF0ZVNpdGVJY29uOiB0cnVlLFxyXG4gICAgICAgIHVwZGF0ZUV4dGVuc2lvbkljb246IHRydWUsXHJcbiAgICAgICAgZW5hYmxlTm90aWZpY2F0aW9uczogdHJ1ZSxcclxuICAgICAgICBrZWVwUGFnZUFsaXZlOiB0cnVlLFxyXG4gICAgICAgIHJlZnJlc2hJbnRlcnZhbDogMVxyXG4gICAgICB9KVxyXG4gICAgICAgIC50aGVuKGl0ZW1zID0+IHtcclxuICAgICAgICAgIHVzZXJQcmVmZXJlbmNlcyA9IGl0ZW1zIGFzIFVzZXJQcmVmZXJlbmNlcztcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBMb2FkZWQgdXNlciBwcmVmZXJlbmNlcycsIHVzZXJQcmVmZXJlbmNlcyk7XHJcbiAgICAgICAgICBpbml0aWFsaXplKCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcignTm90aXNreTogRXJyb3IgbG9hZGluZyBwcmVmZXJlbmNlcycsIGVycm9yKTtcclxuICAgICAgICAgIGluaXRpYWxpemUoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIC8vIExpc3RlbiBmb3IgbWVzc2FnZXMgZnJvbSBiYWNrZ3JvdW5kIHNjcmlwdFxyXG4gICAgICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdjaGVja0ZvclVwZGF0ZXMnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdOb3Rpc2t5OiBSZWNlaXZlZCByZXF1ZXN0IHRvIGNoZWNrIGZvciB1cGRhdGVzJyk7XHJcbiAgICAgICAgICAgIHVwZGF0ZUJhZGdlcyh0cnVlKTtcclxuICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdOb3Rpc2t5OiBFcnJvciBoYW5kbGluZyBtZXNzYWdlIGZyb20gYmFja2dyb3VuZCcsIGVycm9yKTtcclxuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBMaXN0ZW4gZm9yIHByZWZlcmVuY2UgY2hhbmdlc1xyXG4gICAgICBicm93c2VyLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBhcmVhTmFtZSkgPT4ge1xyXG4gICAgICAgIGlmIChhcmVhTmFtZSA9PT0gJ3N5bmMnKSB7XHJcbiAgICAgICAgICBsZXQgbmVlZFJlc3RhcnQgPSBmYWxzZTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2hhbmdlcykge1xyXG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHVzZXJQcmVmZXJlbmNlcywga2V5KSkge1xyXG4gICAgICAgICAgICAgIC8vIElmIHJlZnJlc2ggaW50ZXJ2YWwgY2hhbmdlZCBhbmQgd2UncmUgb2JzZXJ2aW5nLCB3ZSBuZWVkIHRvIHJlc3RhcnQgb2JzZXJ2YXRpb25cclxuICAgICAgICAgICAgICBpZiAoa2V5ID09PSAncmVmcmVzaEludGVydmFsJyAmJiB1cGRhdGVUaW1lcikge1xyXG4gICAgICAgICAgICAgICAgbmVlZFJlc3RhcnQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAodXNlclByZWZlcmVuY2VzIGFzIGFueSlba2V5XSA9IGNoYW5nZXNba2V5XS5uZXdWYWx1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnTm90aXNreTogVXBkYXRlZCBwcmVmZXJlbmNlcyBhZnRlciBzdG9yYWdlIGNoYW5nZScsIHVzZXJQcmVmZXJlbmNlcyk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChuZWVkUmVzdGFydCAmJiBpc09ic2VydmluZykge1xyXG4gICAgICAgICAgICBzdG9wT2JzZXJ2aW5nQmFkZ2VzKCk7XHJcbiAgICAgICAgICAgIG9ic2VydmVCYWRnZXMoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgICAgLy8gU3RhcnQvc3RvcCBvYnNlcnZhdGlvbiB3aGVuIHRhYiB2aXNpYmlsaXR5IGNoYW5nZXNcclxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigndmlzaWJpbGl0eWNoYW5nZScsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5oaWRkZW4pIHtcclxuICAgICAgICAgIHN0b3BPYnNlcnZpbmdCYWRnZXMoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgb2JzZXJ2ZUJhZGdlcygpO1xyXG4gICAgICAgICAgdXBkYXRlQmFkZ2VzKHRydWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBDbGVhbiB1cCB3aGVuIHRhYiBpcyB1bmxvYWRlZFxyXG4gICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmVmb3JldW5sb2FkJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgc3RvcE9ic2VydmluZ0JhZGdlcygpO1xyXG4gICAgICB9KTtcclxuICAgICAgXHJcbiAgICAgIC8vIEluaXRpYWxpemUgd2hlbiBsb2FkZWRcclxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICBpbml0aWFsaXplKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coJ05vdGlza3k6IEluIGJ1aWxkIGVudmlyb25tZW50LCBza2lwcGluZyBpbml0aWFsaXphdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIExpc3RlbiBmb3IgbWVzc2FnZXMgZnJvbSB0aGUgYmFja2dyb3VuZCBzY3JpcHRcclxuICAgIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdDb250ZW50IHNjcmlwdCByZWNlaXZlZCBtZXNzYWdlOicsIG1lc3NhZ2UpO1xyXG4gICAgICBcclxuICAgICAgLy8gSGFuZGxlIGFueSBzcGVjaWZpYyBtZXNzYWdlIHR5cGVzIGhlcmVcclxuICAgICAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAnY2hlY2tQYWdlJykge1xyXG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUsIHVybDogd2luZG93LmxvY2F0aW9uLmhyZWYgfSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgd2UncmUgb24gdGhlIGF1dGggY2FsbGJhY2sgcGFnZVxyXG4gICAgY29uc3QgaXNBdXRoQ2FsbGJhY2tQYWdlID0gd2luZG93LmxvY2F0aW9uLmhyZWYuaW5jbHVkZXMoJy9hdXRoL2NhbGxiYWNrJyk7XHJcblxyXG4gICAgaWYgKGlzQXV0aENhbGxiYWNrUGFnZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnRGV0ZWN0ZWQgYXV0aCBjYWxsYmFjayBwYWdlLCBwcm9jZXNzaW5nIGF1dGggcmVzcG9uc2UnKTtcclxuICAgICAgcHJvY2Vzc0F1dGhDYWxsYmFjaygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUHJvY2VzcyB0aGUgYXV0aGVudGljYXRpb24gY2FsbGJhY2tcclxuICAgICAqL1xyXG4gICAgZnVuY3Rpb24gcHJvY2Vzc0F1dGhDYWxsYmFjaygpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICAvLyBQYXJzZSBVUkwgcGFyYW1ldGVyc1xyXG4gICAgICAgIGNvbnN0IHVybFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XHJcbiAgICAgICAgY29uc3QgY29kZSA9IHVybFBhcmFtcy5nZXQoJ2NvZGUnKTtcclxuICAgICAgICBjb25zdCBzdGF0ZSA9IHVybFBhcmFtcy5nZXQoJ3N0YXRlJyk7XHJcbiAgICAgICAgY29uc3QgZXJyb3IgPSB1cmxQYXJhbXMuZ2V0KCdlcnJvcicpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcignQXV0aCBlcnJvciByZWNlaXZlZDonLCBlcnJvcik7XHJcbiAgICAgICAgICAvLyBTZW5kIGVycm9yIHRvIGJhY2tncm91bmQgc2NyaXB0XHJcbiAgICAgICAgICBicm93c2VyLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICBhY3Rpb246ICdhdXRoRXJyb3InLFxyXG4gICAgICAgICAgICBlcnJvcjogZXJyb3JcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoIWNvZGUgfHwgIXN0YXRlKSB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIHBhcmFtZXRlcnMgaW4gYXV0aCBjYWxsYmFjaycpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zb2xlLmxvZygnQXV0aCBjYWxsYmFjayByZWNlaXZlZCBjb2RlIGFuZCBzdGF0ZSwgc2VuZGluZyB0byBiYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDE6IFNlbmQgbWVzc2FnZSB0byBiYWNrZ3JvdW5kIHNjcmlwdFxyXG4gICAgICAgIGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSh7XHJcbiAgICAgICAgICBhY3Rpb246ICdhdXRoU3VjY2VzcycsXHJcbiAgICAgICAgICBjb2RlOiBjb2RlLFxyXG4gICAgICAgICAgc3RhdGU6IHN0YXRlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTWV0aG9kIDI6IFN0b3JlIGluIGxvY2FsIHN0b3JhZ2UgZm9yIHRoZSBsaXN0ZW5lciBpbiBhdXRoLnRzXHJcbiAgICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLnNldCh7XHJcbiAgICAgICAgICBhdXRoX2NvZGU6IGNvZGUsXHJcbiAgICAgICAgICBhdXRoX3N0YXRlOiBzdGF0ZSxcclxuICAgICAgICAgIGF1dGhfdGltZXN0YW1wOiBEYXRlLm5vdygpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU2hvdyBhIHN1Y2Nlc3MgbWVzc2FnZVxyXG4gICAgICAgIGNvbnN0IHN0YXR1c0VsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RhdHVzJyk7XHJcbiAgICAgICAgaWYgKHN0YXR1c0VsZW1lbnQpIHtcclxuICAgICAgICAgIHN0YXR1c0VsZW1lbnQudGV4dENvbnRlbnQgPSAnQXV0aGVudGljYXRpb24gc3VjY2Vzc2Z1bCEgWW91IGNhbiBjbG9zZSB0aGlzIHRhYi4nO1xyXG4gICAgICAgICAgc3RhdHVzRWxlbWVudC5jbGFzc05hbWUgPSAnc3VjY2Vzcyc7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEF1dG8tY2xvc2UgdGhlIHRhYiBhZnRlciBhIGRlbGF5XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICB3aW5kb3cuY2xvc2UoKTtcclxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0NvdWxkIG5vdCBhdXRvLWNsb3NlIHRhYjonLCBlKTtcclxuICAgICAgICAgICAgLy8gVXBkYXRlIHN0YXR1cyBtZXNzYWdlXHJcbiAgICAgICAgICAgIGlmIChzdGF0dXNFbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgc3RhdHVzRWxlbWVudC50ZXh0Q29udGVudCA9ICdBdXRoZW50aWNhdGlvbiBjb21wbGV0ZSEgWW91IGNhbiBub3cgY2xvc2UgdGhpcyB0YWIgbWFudWFsbHkuJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sIDMwMDApO1xyXG4gICAgICAgIFxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgYXV0aCBjYWxsYmFjazonLCBlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn0pO1xyXG4iLCJmdW5jdGlvbiBwcmludChtZXRob2QsIC4uLmFyZ3MpIHtcbiAgaWYgKGltcG9ydC5tZXRhLmVudi5NT0RFID09PSBcInByb2R1Y3Rpb25cIikgcmV0dXJuO1xuICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gYXJncy5zaGlmdCgpO1xuICAgIG1ldGhvZChgW3d4dF0gJHttZXNzYWdlfWAsIC4uLmFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xuICB9XG59XG5leHBvcnQgY29uc3QgbG9nZ2VyID0ge1xuICBkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuICBsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG4gIHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuICBlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuIiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuZXhwb3J0IGNsYXNzIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG4gIGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG4gICAgc3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG4gICAgdGhpcy5uZXdVcmwgPSBuZXdVcmw7XG4gICAgdGhpcy5vbGRVcmwgPSBvbGRVcmw7XG4gIH1cbiAgc3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG59XG5leHBvcnQgZnVuY3Rpb24gZ2V0VW5pcXVlRXZlbnROYW1lKGV2ZW50TmFtZSkge1xuICByZXR1cm4gYCR7YnJvd3Nlcj8ucnVudGltZT8uaWR9OiR7aW1wb3J0Lm1ldGEuZW52LkVOVFJZUE9JTlR9OiR7ZXZlbnROYW1lfWA7XG59XG4iLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMb2NhdGlvbldhdGNoZXIoY3R4KSB7XG4gIGxldCBpbnRlcnZhbDtcbiAgbGV0IG9sZFVybDtcbiAgcmV0dXJuIHtcbiAgICAvKipcbiAgICAgKiBFbnN1cmUgdGhlIGxvY2F0aW9uIHdhdGNoZXIgaXMgYWN0aXZlbHkgbG9va2luZyBmb3IgVVJMIGNoYW5nZXMuIElmIGl0J3MgYWxyZWFkeSB3YXRjaGluZyxcbiAgICAgKiB0aGlzIGlzIGEgbm9vcC5cbiAgICAgKi9cbiAgICBydW4oKSB7XG4gICAgICBpZiAoaW50ZXJ2YWwgIT0gbnVsbCkgcmV0dXJuO1xuICAgICAgb2xkVXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgIGludGVydmFsID0gY3R4LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgbGV0IG5ld1VybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG4gICAgICAgIGlmIChuZXdVcmwuaHJlZiAhPT0gb2xkVXJsLmhyZWYpIHtcbiAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIG9sZFVybCkpO1xuICAgICAgICAgIG9sZFVybCA9IG5ld1VybDtcbiAgICAgICAgfVxuICAgICAgfSwgMWUzKTtcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tIFwiLi4vdXRpbHMvaW50ZXJuYWwvbG9nZ2VyLm1qc1wiO1xuaW1wb3J0IHtcbiAgZ2V0VW5pcXVlRXZlbnROYW1lXG59IGZyb20gXCIuL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuZXhwb3J0IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcbiAgY29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBpZiAodGhpcy5pc1RvcEZyYW1lKSB7XG4gICAgICB0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cyh7IGlnbm9yZUZpcnN0RXZlbnQ6IHRydWUgfSk7XG4gICAgICB0aGlzLnN0b3BPbGRTY3JpcHRzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG4gICAgfVxuICB9XG4gIHN0YXRpYyBTQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXG4gICAgXCJ3eHQ6Y29udGVudC1zY3JpcHQtc3RhcnRlZFwiXG4gICk7XG4gIGlzVG9wRnJhbWUgPSB3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcDtcbiAgYWJvcnRDb250cm9sbGVyO1xuICBsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG4gIHJlY2VpdmVkTWVzc2FnZUlkcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIGdldCBzaWduYWwoKSB7XG4gICAgcmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcbiAgfVxuICBhYm9ydChyZWFzb24pIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcbiAgfVxuICBnZXQgaXNJbnZhbGlkKCkge1xuICAgIGlmIChicm93c2VyLnJ1bnRpbWUuaWQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcbiAgfVxuICBnZXQgaXNWYWxpZCgpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuICB9XG4gIC8qKlxuICAgKiBBZGQgYSBsaXN0ZW5lciB0aGF0IGlzIGNhbGxlZCB3aGVuIHRoZSBjb250ZW50IHNjcmlwdCdzIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoZSBsaXN0ZW5lci5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG4gICAqIGNvbnN0IHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIgPSBjdHgub25JbnZhbGlkYXRlZCgoKSA9PiB7XG4gICAqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihjYik7XG4gICAqIH0pXG4gICAqIC8vIC4uLlxuICAgKiByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG4gICAqL1xuICBvbkludmFsaWRhdGVkKGNiKSB7XG4gICAgdGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgICByZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgfVxuICAvKipcbiAgICogUmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLiBVc2VmdWwgaWYgeW91IGhhdmUgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBzaG91bGRuJ3QgcnVuXG4gICAqIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IGdldFZhbHVlRnJvbVN0b3JhZ2UgPSBhc3luYyAoKSA9PiB7XG4gICAqICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcbiAgICpcbiAgICogICAvLyAuLi5cbiAgICogfVxuICAgKi9cbiAgYmxvY2soKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHtcbiAgICB9KTtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKi9cbiAgc2V0VGltZW91dChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJUaW1lb3V0KGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RJZGxlQ2FsbGJhY2soY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgICBjb25zdCBpZCA9IHJlcXVlc3RJZGxlQ2FsbGJhY2soKC4uLmFyZ3MpID0+IHtcbiAgICAgIGlmICghdGhpcy5zaWduYWwuYWJvcnRlZCkgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgfSwgb3B0aW9ucyk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbElkbGVDYWxsYmFjayhpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICBhZGRFdmVudExpc3RlbmVyKHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucykge1xuICAgIGlmICh0eXBlID09PSBcInd4dDpsb2NhdGlvbmNoYW5nZVwiKSB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSB0aGlzLmxvY2F0aW9uV2F0Y2hlci5ydW4oKTtcbiAgICB9XG4gICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXI/LihcbiAgICAgIHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLFxuICAgICAgaGFuZGxlcixcbiAgICAgIHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgc2lnbmFsOiB0aGlzLnNpZ25hbFxuICAgICAgfVxuICAgICk7XG4gIH1cbiAgLyoqXG4gICAqIEBpbnRlcm5hbFxuICAgKiBBYm9ydCB0aGUgYWJvcnQgY29udHJvbGxlciBhbmQgZXhlY3V0ZSBhbGwgYG9uSW52YWxpZGF0ZWRgIGxpc3RlbmVycy5cbiAgICovXG4gIG5vdGlmeUludmFsaWRhdGVkKCkge1xuICAgIHRoaXMuYWJvcnQoXCJDb250ZW50IHNjcmlwdCBjb250ZXh0IGludmFsaWRhdGVkXCIpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBDb250ZW50IHNjcmlwdCBcIiR7dGhpcy5jb250ZW50U2NyaXB0TmFtZX1cIiBjb250ZXh0IGludmFsaWRhdGVkYFxuICAgICk7XG4gIH1cbiAgc3RvcE9sZFNjcmlwdHMoKSB7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKFxuICAgICAge1xuICAgICAgICB0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG4gICAgICAgIGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuICAgICAgICBtZXNzYWdlSWQ6IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpXG4gICAgICB9LFxuICAgICAgXCIqXCJcbiAgICApO1xuICB9XG4gIHZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkge1xuICAgIGNvbnN0IGlzU2NyaXB0U3RhcnRlZEV2ZW50ID0gZXZlbnQuZGF0YT8udHlwZSA9PT0gQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFO1xuICAgIGNvbnN0IGlzU2FtZUNvbnRlbnRTY3JpcHQgPSBldmVudC5kYXRhPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcbiAgICBjb25zdCBpc05vdER1cGxpY2F0ZSA9ICF0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5oYXMoZXZlbnQuZGF0YT8ubWVzc2FnZUlkKTtcbiAgICByZXR1cm4gaXNTY3JpcHRTdGFydGVkRXZlbnQgJiYgaXNTYW1lQ29udGVudFNjcmlwdCAmJiBpc05vdER1cGxpY2F0ZTtcbiAgfVxuICBsaXN0ZW5Gb3JOZXdlclNjcmlwdHMob3B0aW9ucykge1xuICAgIGxldCBpc0ZpcnN0ID0gdHJ1ZTtcbiAgICBjb25zdCBjYiA9IChldmVudCkgPT4ge1xuICAgICAgaWYgKHRoaXMudmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSkge1xuICAgICAgICB0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5hZGQoZXZlbnQuZGF0YS5tZXNzYWdlSWQpO1xuICAgICAgICBjb25zdCB3YXNGaXJzdCA9IGlzRmlyc3Q7XG4gICAgICAgIGlzRmlyc3QgPSBmYWxzZTtcbiAgICAgICAgaWYgKHdhc0ZpcnN0ICYmIG9wdGlvbnM/Lmlnbm9yZUZpcnN0RXZlbnQpIHJldHVybjtcbiAgICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgICAgfVxuICAgIH07XG4gICAgYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgY2IpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiByZW1vdmVFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBjYikpO1xuICB9XG59XG4iXSwibmFtZXMiOlsiYnJvd3NlciIsIl9icm93c2VyIiwiZGVmaW5pdGlvbiIsIl9hIiwicHJpbnQiLCJsb2dnZXIiLCJfYiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ08sUUFBTUEsY0FBVSxzQkFBVyxZQUFYLG1CQUFvQixZQUFwQixtQkFBNkIsTUFDaEQsV0FBVyxVQUNYLFdBQVc7QUNGUixRQUFNLFVBQVVDO0FDRGhCLFdBQVMsb0JBQW9CQyxhQUFZO0FBQzlDLFdBQU9BO0FBQUEsRUFDVDtBQ0dBLFFBQUEsYUFBQSxvQkFBQTtBQUFBLElBQW1DLFNBQUEsQ0FBQSxrQkFBQSxxQkFBQTtBQUFBLElBQ2dCLE9BQUE7QUFFL0MsY0FBQSxJQUFBLCtCQUFBO0FBR0EsWUFBQSxpQkFBQSxNQUFBO0FBQ0UsWUFBQTtBQUNFLGlCQUFBLE9BQUEsWUFBQSxlQUFBLE9BQUEsUUFBQSxZQUFBLGVBQUEsT0FBQSxRQUFBLFFBQUEsZ0JBQUEsY0FBQSxDQUFBLFFBQUEsUUFBQSxZQUFBLFNBQUEsRUFBQSxTQUFBLGlCQUFBO0FBQUEsUUFHd0UsU0FBQSxHQUFBO0FBRXhFLGtCQUFBLElBQUEsOENBQUEsQ0FBQTtBQUNBLGlCQUFBO0FBQUEsUUFBTztBQUFBLE1BQ1QsR0FBQTtBQUdGLFVBQUEsd0JB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SUFBQTtBQUFBO0FBQUEsUUFDRSxLQUFLLFdBQVcsTUFBTSxJQUFJLG1CQUFtQixJQUFJLElBQUk7QUFBQSxRQUNyRDtBQUFBLFFBQ0E7QUFBQSxVQUNFLEdBQUc7QUFBQSxVQUNILFFBQVEsS0FBSztBQUFBLFFBQ3JCO0FBQUE7QUFBQSxJQUVBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUtFLG9CQUFvQjtBQUNsQixXQUFLLE1BQU0sb0NBQW9DO0FBQy9DRSxlQUFPO0FBQUEsUUFDTCxtQkFBbUIsS0FBSyxpQkFBaUI7QUFBQSxNQUMxQztBQUFBLElBQ0w7QUFBQSxJQUNFLGlCQUFpQjtBQUNmLGFBQU87QUFBQSxRQUNMO0FBQUEsVUFDRSxNQUFNLHNCQUFxQjtBQUFBLFVBQzNCLG1CQUFtQixLQUFLO0FBQUEsVUFDeEIsV0FBVyxLQUFLLE9BQVEsRUFBQyxTQUFTLEVBQUUsRUFBRSxNQUFNLENBQUM7QUFBQSxRQUM5QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDTDtBQUFBLElBQ0UseUJBQXlCLE9BQU87O0FBQzlCLFlBQU0seUJBQXVCRixNQUFBLE1BQU0sU0FBTixnQkFBQUEsSUFBWSxVQUFTLHNCQUFxQjtBQUN2RSxZQUFNLHdCQUFzQkcsTUFBQSxNQUFNLFNBQU4sZ0JBQUFBLElBQVksdUJBQXNCLEtBQUs7QUFDbkUsWUFBTSxpQkFBaUIsQ0FBQyxLQUFLLG1CQUFtQixLQUFJLFdBQU0sU0FBTixtQkFBWSxTQUFTO0FBQ3pFLGFBQU8sd0JBQXdCLHVCQUF1QjtBQUFBLElBQzFEO0FBQUEsSUFDRSxzQkFBc0IsU0FBUztBQUM3QixVQUFJLFVBQVU7QUFDZCxZQUFNLEtBQUssQ0FBQyxVQUFVO0FBQ3BCLFlBQUksS0FBSyx5QkFBeUIsS0FBSyxHQUFHO0FBQ3hDLGVBQUssbUJBQW1CLElBQUksTUFBTSxLQUFLLFNBQVM7QUFDaEQsZ0JBQU0sV0FBVztBQUNqQixvQkFBVTtBQUNWLGNBQUksYUFBWSxtQ0FBUyxrQkFBa0I7QUFDM0MsZUFBSyxrQkFBbUI7QUFBQSxRQUNoQztBQUFBLE1BQ0s7QUFDRCx1QkFBaUIsV0FBVyxFQUFFO0FBQzlCLFdBQUssY0FBYyxNQUFNLG9CQUFvQixXQUFXLEVBQUUsQ0FBQztBQUFBLElBQy9EO0FBQUEsRUFDQTtBQXJKRSxnQkFaVyx1QkFZSiwrQkFBOEI7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFkSSxNQUFNLHVCQUFOOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7IiwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMSwyLDQsNSw2LDddfQ==
