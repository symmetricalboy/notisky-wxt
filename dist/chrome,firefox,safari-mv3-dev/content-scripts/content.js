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
      console.log("Freshsky content script loaded");
      const isRealBrowser = (() => {
        try {
          return typeof browser !== "undefined" && typeof browser.runtime !== "undefined" && typeof browser.runtime.sendMessage === "function" && !browser.runtime.sendMessage.toString().includes("not implemented");
        } catch (e) {
          console.log("Freshsky: Not in a real browser environment", e);
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
          console.log("Freshsky: Attempting to save original favicon");
          if (originalFavicon) {
            console.log("Freshsky: Original favicon already saved:", originalFavicon);
            return;
          }
          const faviconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
          if (faviconLinks.length > 0) {
            originalFavicon = faviconLinks[0].getAttribute("href");
            console.log("Freshsky: Saved original favicon:", originalFavicon);
            if (!originalFavicon) {
              console.log("Freshsky: Invalid href attribute on favicon link, using default");
              originalFavicon = "https://bsky.app/static/favicon-32x32.png";
              return;
            }
            try {
              let faviconUrl;
              if (originalFavicon.startsWith("data:")) {
                console.log("Freshsky: Favicon is a data URL, using as-is");
                return;
              } else if (originalFavicon.startsWith("http://") || originalFavicon.startsWith("https://")) {
                faviconUrl = new URL(originalFavicon);
                const currentUrl = new URL(window.location.href);
                if (faviconUrl.origin !== currentUrl.origin) {
                  console.log("Freshsky: Favicon is from different origin, using default to avoid CORS issues");
                  originalFavicon = "https://bsky.app/static/favicon-32x32.png";
                }
              } else {
                console.log("Freshsky: Converting relative favicon URL to absolute");
                faviconUrl = new URL(originalFavicon, window.location.href);
                originalFavicon = faviconUrl.href;
              }
            } catch (urlError) {
              console.log("Freshsky: Error parsing favicon URL, using default", urlError);
              originalFavicon = "https://bsky.app/static/favicon-32x32.png";
            }
          } else {
            const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
            if (appleTouchIcon && appleTouchIcon.getAttribute("href")) {
              originalFavicon = appleTouchIcon.getAttribute("href") || "";
              console.log("Freshsky: Using apple-touch-icon as favicon:", originalFavicon);
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
                console.log("Freshsky: Using constructed favicon path:", originalFavicon);
              } catch (e) {
                originalFavicon = "https://bsky.app/static/favicon-32x32.png";
                console.log("Freshsky: Using default Bluesky favicon");
              }
            }
          }
        } catch (error) {
          console.error("Freshsky: Error saving original favicon", error);
          originalFavicon = "https://bsky.app/static/favicon-32x32.png";
        }
      }
      function createFaviconWithBadge(count) {
        try {
          if (count <= 0) {
            console.log("Freshsky: Returning original favicon (no notifications)");
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
              console.log(`Freshsky: Using extension badge icon: ${badgeIconUrl}`);
              return Promise.resolve(badgeIconUrl);
            } catch (error) {
              console.log("Freshsky: Error getting badge icon URL, falling back to dynamic generation", error);
            }
          } else {
            console.log("Freshsky: Not using extension resources, falling back to dynamic generation");
          }
          console.log("Freshsky: Generating dynamic badge icon");
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            console.warn("Freshsky: Could not get canvas context, returning original favicon");
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
          console.log("Freshsky: Generated dynamic badge icon");
          return Promise.resolve(dataUrl);
        } catch (error) {
          console.error("Freshsky: Error creating favicon", error);
          return Promise.resolve(originalFavicon || "https://bsky.app/static/favicon-32x32.png");
        }
      }
      function applyFavicon(faviconUrl) {
        try {
          if (!faviconUrl) {
            console.warn("Freshsky: No favicon URL provided, skipping update");
            return;
          }
          if (!userPreferences.updateSiteIcon) {
            console.log("Freshsky: Site icon updates disabled in preferences, skipping update");
            return;
          }
          Promise.resolve(faviconUrl).then((url) => {
            if (!url) {
              console.warn("Freshsky: Empty favicon URL after promise resolution, skipping update");
              return;
            }
            console.log(`Freshsky: Applying favicon: ${url.substring(0, 50)}${url.length > 50 ? "..." : ""}`);
            try {
              let linkElements = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
              if (linkElements.length > 0) {
                linkElements.forEach((link) => {
                  link.setAttribute("href", url);
                });
                console.log(`Freshsky: Updated ${linkElements.length} existing favicon links`);
              } else {
                const link = document.createElement("link");
                link.rel = "icon";
                link.type = "image/png";
                link.href = url;
                document.head.appendChild(link);
                console.log("Freshsky: Created new favicon link");
              }
              setTimeout(() => {
                const currentFavicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                if (currentFavicon) {
                  const currentHref = currentFavicon.getAttribute("href");
                  if (currentHref !== url) {
                    console.warn("Freshsky: Favicon update may not have applied correctly");
                  } else {
                    console.log("Freshsky: Favicon update verified");
                  }
                }
              }, 100);
            } catch (domError) {
              console.error("Freshsky: DOM error when applying favicon", domError);
            }
          }).catch((error) => {
            console.error("Freshsky: Error resolving favicon URL", error);
          });
        } catch (error) {
          console.error("Freshsky: Critical error applying favicon", error);
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
              console.log("Freshsky: Extension icon update successful");
            } else if (response === null) {
            } else {
              console.log("Freshsky: No success response from extension icon update");
            }
          }).catch((error) => {
            console.error("Freshsky: Unexpected error in extension icon update", error);
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
          console.error("Freshsky: Error getting badge count", error);
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
          console.error("Freshsky: Error finding notification badges", error);
          return { notificationBadge: null, messageBadge: null };
        }
      }
      function updateBadges(forceUpdate = false) {
        try {
          if (isRealBrowser && !extensionContextValid) {
            console.log("Freshsky: Skipping badge update due to invalid extension context");
            return;
          }
          const { notificationBadge, messageBadge } = findNotificationBadges();
          const notificationCount = getBadgeCount(notificationBadge);
          const messageCount = getBadgeCount(messageBadge);
          const totalCount = notificationCount + messageCount;
          console.log(`Freshsky: Found notification count: ${notificationCount}, message count: ${messageCount}, total: ${totalCount}`);
          if (forceUpdate || totalCount !== lastNotificationCount + lastMessageCount) {
            console.log(`Freshsky: Updating icons with count ${totalCount}`);
            try {
              createFaviconWithBadge(totalCount).then((iconUrl) => {
                if (iconUrl) {
                  applyFavicon(iconUrl);
                } else {
                  console.error("Freshsky: Failed to create badge icon, favicon not updated");
                }
              }).catch((error) => {
                console.error("Freshsky: Error in favicon creation/application chain", error);
                if (originalFavicon) {
                  applyFavicon(originalFavicon);
                }
              });
            } catch (error) {
              console.error("Freshsky: Critical error in favicon update process", error);
            }
            try {
              updateExtensionIcon(totalCount);
            } catch (error) {
              console.error("Freshsky: Error updating extension icon", error);
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
                  console.warn("Freshsky: Failed to save notification counts to storage", error);
                  handleInvalidContext(error);
                });
              } catch (error) {
                console.warn("Freshsky: Error accessing storage", error);
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
          console.error("Freshsky: Error updating badges", error);
          handleInvalidContext(error);
        }
      }
      function observeBadges() {
        try {
          if (isObserving || isRealBrowser && !extensionContextValid) {
            console.log("Freshsky: Not starting badge observation (already observing or invalid context)");
            return;
          }
          isObserving = true;
          updateTimer = window.setInterval(() => {
            if (isRealBrowser && !extensionContextValid) {
              console.log("Freshsky: Skipping scheduled badge update due to invalid context");
              return;
            }
            updateBadges();
          }, userPreferences.refreshInterval * 60 * 1e3);
          console.log("Freshsky: Started observing badges");
        } catch (error) {
          console.error("Freshsky: Error observing badges", error);
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
          console.log("Freshsky: Stopped observing badges");
        } catch (error) {
          console.error("Freshsky: Error stopping observation", error);
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
          console.error("Freshsky: Error sending notification", error);
        }
      }
      function safelyMessageBackground(message, retryCount = 0) {
        return new Promise((resolve, reject) => {
          try {
            if (!isRealBrowser) {
              console.log("Freshsky: Not in a real browser environment, skipping message", message);
              resolve(null);
              return;
            }
            if (!extensionContextValid) {
              if (message.action === "ping") {
                console.log("Freshsky: Attempting ping despite invalid context state");
              } else {
                console.log(`Freshsky: Skipping message due to invalid extension context: ${message.action}`);
                resolve(null);
                return;
              }
            }
            browser.runtime.sendMessage(message).then(resolve).catch((error) => {
              const errorMessage = (error == null ? void 0 : error.message) || "Unknown error";
              const isContextError = errorMessage.includes("Extension context invalidated") || errorMessage.includes("Invalid extension context") || errorMessage.includes("Extension context is invalidated") || errorMessage.includes("Could not establish connection") || errorMessage.includes("Receiving end does not exist") || errorMessage.includes("Service worker") || typeof error.code === "number" && error.code === 15;
              if (isContextError) {
                console.log(`Freshsky: Extension context invalidated for message: ${message.action}`, error);
                handleInvalidContext(error);
                const importantActions = ["getPreferences", "updateNotificationCount"];
                if (importantActions.includes(message.action) && retryCount < 2) {
                  console.log(`Freshsky: Will retry important action "${message.action}" after a delay`);
                  try {
                    if (browser.runtime && browser.runtime.connect) {
                      const port = browser.runtime.connect({ name: "freshsky-wake-up" });
                      setTimeout(() => {
                        try {
                          port.disconnect();
                        } catch {
                        }
                        setTimeout(() => {
                          console.log(`Freshsky: Retrying "${message.action}" (attempt ${retryCount + 1})`);
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
                console.error(`Freshsky: Error sending message: ${message.action}`, error);
                reject(error);
              }
            });
          } catch (error) {
            console.error("Freshsky: Error in safelyMessageBackground", error);
            resolve(null);
          }
        });
      }
      function checkExtensionContext() {
        if (!isRealBrowser) return;
        console.log("Freshsky: Checking extension context validity");
        try {
          pingBackgroundScript().then((isValid) => {
            if (isValid) {
              if (!extensionContextValid) {
                console.log("Freshsky: Extension context has been restored via ping");
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
              console.log("Freshsky: Extension context has been restored via storage access");
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
              console.log("Freshsky: Ping timed out");
              resolve(false);
            }, 2e3);
            const isMV3 = typeof browser !== "undefined" && typeof browser.runtime !== "undefined" && typeof browser.runtime.getManifest === "function" && browser.runtime.getManifest().manifest_version === 3;
            console.log("Freshsky: Running in MV3 mode?", isMV3);
            if (isMV3) {
              try {
                const extensionId = browser.runtime.id;
                console.log("Freshsky: Extension ID available:", extensionId);
              } catch (e) {
                console.log("Freshsky: Extension runtime ID not accessible, service worker may be inactive");
                clearTimeout(pingTimeout);
                resolve(false);
                return;
              }
            }
            browser.runtime.sendMessage({ action: "ping" }).then((response) => {
              clearTimeout(pingTimeout);
              if (response && response.success && response.message === "pong") {
                console.log("Freshsky: Ping successful");
                resolve(true);
              } else {
                console.log("Freshsky: Ping returned unexpected response", response);
                resolve(false);
              }
            }).catch((error) => {
              clearTimeout(pingTimeout);
              console.log("Freshsky: Ping error", error);
              if (error.message && (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist") || error.message.includes("Service worker") || error.message.includes("status code: 15") || error.message.includes("Extension context invalidated"))) {
                console.log("Freshsky: Service worker may be terminated or not ready");
                try {
                  if (browser.runtime && browser.runtime.connect) {
                    const port = browser.runtime.connect();
                    setTimeout(() => {
                      try {
                        port.disconnect();
                        console.log("Freshsky: Attempted to wake up service worker");
                      } catch (e) {
                        console.log("Freshsky: Error disconnecting port", e);
                      }
                    }, 100);
                    setTimeout(() => {
                      browser.runtime.sendMessage({ action: "ping" }).then((response) => {
                        if (response && response.success) {
                          console.log("Freshsky: Service worker woken up successfully");
                          resolve(true);
                        } else {
                          resolve(false);
                        }
                      }).catch(() => resolve(false));
                    }, 500);
                    return;
                  }
                } catch (e) {
                  console.log("Freshsky: Failed to wake up service worker", e);
                }
              }
              resolve(false);
            });
          } catch (error) {
            console.log("Freshsky: Error sending ping", error);
            resolve(false);
          }
        });
      }
      function handleInvalidContext(error) {
        if (extensionContextValid) {
          console.log("Freshsky: Extension context has become invalid", error);
          extensionContextValid = false;
          reconnectAttemptCount = 0;
          if (reconnectAttemptTimer) {
            clearInterval(reconnectAttemptTimer);
          }
          reconnectAttemptTimer = window.setInterval(() => {
            reconnectAttemptCount++;
            console.log(`Freshsky: Reconnection attempt ${reconnectAttemptCount} of ${MAX_RECONNECT_ATTEMPTS}`);
            checkExtensionContext();
            if (reconnectAttemptCount >= MAX_RECONNECT_ATTEMPTS) {
              console.log("Freshsky: Multiple reconnection attempts failed, reloading page");
              clearInterval(reconnectAttemptTimer);
              reconnectAttemptTimer = null;
              if (window.location.hostname.includes("bsky.app") || window.location.hostname.includes("bsky.social")) {
                console.log("Freshsky: Reloading page to recover from invalid context");
                try {
                  localStorage.setItem("freshskyReloadTime", Date.now().toString());
                  localStorage.setItem("freshskyReloadReason", "extension_context_invalid");
                } catch (e) {
                }
                window.location.reload();
              }
            }
          }, RECONNECT_DELAY);
        }
      }
      function initialize() {
        console.log("Freshsky: Initializing content script");
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
              console.log("Freshsky: Tab became visible, checking extension context");
              checkExtensionContext();
            }
          });
        }
        if (!isRealBrowser || extensionContextValid) {
          if (isRealBrowser) {
            safelyMessageBackground({ action: "getPreferences" }).then((response) => {
              if (response && response.preferences) {
                userPreferences = response.preferences;
                console.log("Freshsky: Loaded user preferences", userPreferences);
              } else {
                console.log("Freshsky: Using default preferences due to error or extension reload");
              }
              observeBadges();
              updateBadges(true);
            }).catch((error) => {
              console.error("Freshsky: Error loading preferences, using defaults", error);
              observeBadges();
              updateBadges(true);
            });
          } else {
            observeBadges();
            updateBadges(true);
          }
        } else {
          console.log("Freshsky: Skipping initialization due to invalid extension context");
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
          console.log("Freshsky: Loaded user preferences", userPreferences);
          initialize();
        }).catch((error) => {
          console.error("Freshsky: Error loading preferences", error);
          initialize();
        });
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
          try {
            if (message.action === "checkForUpdates") {
              console.log("Freshsky: Received request to check for updates");
              updateBadges(true);
              sendResponse({ success: true });
            }
            return true;
          } catch (error) {
            console.error("Freshsky: Error handling message from background", error);
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
            console.log("Freshsky: Updated preferences after storage change", userPreferences);
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
        console.log("Freshsky: In build environment, skipping initialization");
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC9icm93c2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9kZWZpbmUtY29udGVudC1zY3JpcHQubWpzIiwiLi4vLi4vLi4vZW50cnlwb2ludHMvY29udGVudC50cyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgX2Jyb3dzZXIgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBfYnJvd3NlcjtcbmV4cG9ydCB7fTtcbiIsImV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDb250ZW50U2NyaXB0KGRlZmluaXRpb24pIHtcbiAgcmV0dXJuIGRlZmluaXRpb247XG59XG4iLCJpbXBvcnQgeyBkZWZpbmVDb250ZW50U2NyaXB0IH0gZnJvbSAnd3h0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdCc7XG5cbi8vIENvbnRlbnQgc2NyaXB0IGZvciBGcmVzaHNreSBCcm93c2VyIEV4dGVuc2lvblxuLy8gVGhpcyBzY3JpcHQgcnVucyBvbiBCbHVlc2t5IHRvIG1vbml0b3Igbm90aWZpY2F0aW9uIGFuZCBtZXNzYWdlIGJhZGdlc1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb250ZW50U2NyaXB0KHtcbiAgbWF0Y2hlczogWycqOi8vYnNreS5hcHAvKicsICcqOi8vKi5ic2t5LnNvY2lhbC8qJ10sXG4gIG1haW4oKSB7XG4gICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5IGNvbnRlbnQgc2NyaXB0IGxvYWRlZCcpO1xuXG4gICAgLy8gQ2hlY2sgaWYgd2UncmUgaW4gYSByZWFsIGJyb3dzZXIgZW52aXJvbm1lbnQgKHZzLiBidWlsZCBlbnZpcm9ubWVudClcbiAgICBjb25zdCBpc1JlYWxCcm93c2VyID0gKCgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgYnJvd3NlciAhPT0gJ3VuZGVmaW5lZCcgJiYgXG4gICAgICAgICAgICAgIHR5cGVvZiBicm93c2VyLnJ1bnRpbWUgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgIHR5cGVvZiBicm93c2VyLnJ1bnRpbWUuc2VuZE1lc3NhZ2UgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgICAgIWJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZS50b1N0cmluZygpLmluY2x1ZGVzKCdub3QgaW1wbGVtZW50ZWQnKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBOb3QgaW4gYSByZWFsIGJyb3dzZXIgZW52aXJvbm1lbnQnLCBlKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0pKCk7XG4gICAgXG4gICAgbGV0IGxhc3ROb3RpZmljYXRpb25Db3VudCA9IDA7XG4gICAgbGV0IGxhc3RNZXNzYWdlQ291bnQgPSAwO1xuICAgIGxldCBpc09ic2VydmluZyA9IGZhbHNlO1xuICAgIGxldCB1cGRhdGVUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IG9yaWdpbmFsRmF2aWNvbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlIHRoZSBvcmlnaW5hbCBmYXZpY29uIFVSTFxuICAgIFxuICAgIC8vIFVzZXIgcHJlZmVyZW5jZXMgd2l0aCBkZWZhdWx0c1xuICAgIGludGVyZmFjZSBVc2VyUHJlZmVyZW5jZXMge1xuICAgICAgdXBkYXRlU2l0ZUljb246IGJvb2xlYW47XG4gICAgICB1cGRhdGVFeHRlbnNpb25JY29uOiBib29sZWFuO1xuICAgICAgZW5hYmxlTm90aWZpY2F0aW9uczogYm9vbGVhbjtcbiAgICAgIGtlZXBQYWdlQWxpdmU6IGJvb2xlYW47XG4gICAgICByZWZyZXNoSW50ZXJ2YWw6IG51bWJlcjtcbiAgICB9XG4gICAgXG4gICAgbGV0IHVzZXJQcmVmZXJlbmNlczogVXNlclByZWZlcmVuY2VzID0ge1xuICAgICAgdXBkYXRlU2l0ZUljb246IHRydWUsXG4gICAgICB1cGRhdGVFeHRlbnNpb25JY29uOiB0cnVlLFxuICAgICAgZW5hYmxlTm90aWZpY2F0aW9uczogdHJ1ZSxcbiAgICAgIGtlZXBQYWdlQWxpdmU6IHRydWUsXG4gICAgICByZWZyZXNoSW50ZXJ2YWw6IDEgLy8gRGVmYXVsdCB0byAxIG1pbnV0ZVxuICAgIH07XG4gICAgXG4gICAgLy8gVmFyaWFibGVzIHRvIHRyYWNrIGV4dGVuc2lvbiBjb250ZXh0IHN0YXRlXG4gICAgbGV0IGV4dGVuc2lvbkNvbnRleHRWYWxpZCA9IHRydWU7XG4gICAgbGV0IHJlY29ubmVjdEF0dGVtcHRUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgbGV0IHJlY29ubmVjdEF0dGVtcHRDb3VudCA9IDA7XG4gICAgY29uc3QgTUFYX1JFQ09OTkVDVF9BVFRFTVBUUyA9IDEwO1xuICAgIGNvbnN0IFJFQ09OTkVDVF9ERUxBWSA9IDUwMDA7IC8vIDUgc2Vjb25kcyBiZXR3ZWVuIHJlY29ubmVjdCBhdHRlbXB0c1xuICAgIFxuICAgIC8vIFNhdmUgdGhlIG9yaWdpbmFsIGZhdmljb24gd2hlbiB0aGUgcGFnZSBsb2Fkc1xuICAgIGZ1bmN0aW9uIHNhdmVPcmlnaW5hbEZhdmljb24oKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IEF0dGVtcHRpbmcgdG8gc2F2ZSBvcmlnaW5hbCBmYXZpY29uJyk7XG4gICAgICAgIFxuICAgICAgICAvLyBGaXJzdCwgY2hlY2sgaWYgd2UgYWxyZWFkeSBoYXZlIG9uZSBzYXZlZFxuICAgICAgICBpZiAob3JpZ2luYWxGYXZpY29uKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBPcmlnaW5hbCBmYXZpY29uIGFscmVhZHkgc2F2ZWQ6Jywgb3JpZ2luYWxGYXZpY29uKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIExvb2sgZm9yIGZhdmljb24gbGluayB0YWdzXG4gICAgICAgIGNvbnN0IGZhdmljb25MaW5rcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2xpbmtbcmVsPVwiaWNvblwiXSwgbGlua1tyZWw9XCJzaG9ydGN1dCBpY29uXCJdJyk7XG4gICAgICAgIGlmIChmYXZpY29uTGlua3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgIC8vIFVzZSB0aGUgZmlyc3QgZmF2aWNvbiBsaW5rIGZvdW5kXG4gICAgICAgICAgb3JpZ2luYWxGYXZpY29uID0gZmF2aWNvbkxpbmtzWzBdLmdldEF0dHJpYnV0ZSgnaHJlZicpO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogU2F2ZWQgb3JpZ2luYWwgZmF2aWNvbjonLCBvcmlnaW5hbEZhdmljb24pO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBmYXZpY29uIFVSTCBpcyB2YWxpZFxuICAgICAgICAgIGlmICghb3JpZ2luYWxGYXZpY29uKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IEludmFsaWQgaHJlZiBhdHRyaWJ1dGUgb24gZmF2aWNvbiBsaW5rLCB1c2luZyBkZWZhdWx0Jyk7XG4gICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LmFwcC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBUcnkgdG8gY3JlYXRlIGEgVVJMIG9iamVjdCB0byBjaGVjayBpZiBpdCdzIGEgdmFsaWQgVVJMXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFNvbWUgZmF2aWNvbnMgbWlnaHQgYmUgcmVsYXRpdmUgcGF0aHMgb3IgZGF0YSBVUkxzLCBoYW5kbGUgdGhlbSBjYXJlZnVsbHlcbiAgICAgICAgICAgIGxldCBmYXZpY29uVXJsOiBVUkw7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChvcmlnaW5hbEZhdmljb24uc3RhcnRzV2l0aCgnZGF0YTonKSkge1xuICAgICAgICAgICAgICAvLyBJdCdzIGEgZGF0YSBVUkwsIHdoaWNoIGlzIGZpbmUgdG8gdXNlIGRpcmVjdGx5XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogRmF2aWNvbiBpcyBhIGRhdGEgVVJMLCB1c2luZyBhcy1pcycpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG9yaWdpbmFsRmF2aWNvbi5zdGFydHNXaXRoKCdodHRwOi8vJykgfHwgb3JpZ2luYWxGYXZpY29uLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgICAgICAgLy8gQWJzb2x1dGUgVVJMXG4gICAgICAgICAgICAgIGZhdmljb25VcmwgPSBuZXcgVVJMKG9yaWdpbmFsRmF2aWNvbik7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmF2aWNvbiBVUkwgaXMgZnJvbSB0aGUgc2FtZSBvcmlnaW5cbiAgICAgICAgICAgICAgY29uc3QgY3VycmVudFVybCA9IG5ldyBVUkwod2luZG93LmxvY2F0aW9uLmhyZWYpO1xuICAgICAgICAgICAgICBpZiAoZmF2aWNvblVybC5vcmlnaW4gIT09IGN1cnJlbnRVcmwub3JpZ2luKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBGYXZpY29uIGlzIGZyb20gZGlmZmVyZW50IG9yaWdpbiwgdXNpbmcgZGVmYXVsdCB0byBhdm9pZCBDT1JTIGlzc3VlcycpO1xuICAgICAgICAgICAgICAgIG9yaWdpbmFsRmF2aWNvbiA9ICdodHRwczovL2Jza3kuYXBwL3N0YXRpYy9mYXZpY29uLTMyeDMyLnBuZyc7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFJlbGF0aXZlIFVSTCwgbWFrZSBpdCBhYnNvbHV0ZVxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IENvbnZlcnRpbmcgcmVsYXRpdmUgZmF2aWNvbiBVUkwgdG8gYWJzb2x1dGUnKTtcbiAgICAgICAgICAgICAgZmF2aWNvblVybCA9IG5ldyBVUkwob3JpZ2luYWxGYXZpY29uLCB3aW5kb3cubG9jYXRpb24uaHJlZik7XG4gICAgICAgICAgICAgIG9yaWdpbmFsRmF2aWNvbiA9IGZhdmljb25VcmwuaHJlZjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoICh1cmxFcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBFcnJvciBwYXJzaW5nIGZhdmljb24gVVJMLCB1c2luZyBkZWZhdWx0JywgdXJsRXJyb3IpO1xuICAgICAgICAgICAgb3JpZ2luYWxGYXZpY29uID0gJ2h0dHBzOi8vYnNreS5hcHAvc3RhdGljL2Zhdmljb24tMzJ4MzIucG5nJztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVHJ5IHRvIGZpbmQgaXQgZnJvbSBvdGhlciBjbHVlcyBpZiBubyBmYXZpY29uIGxpbmsgZWxlbWVudHNcbiAgICAgICAgICBjb25zdCBhcHBsZVRvdWNoSWNvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2xpbmtbcmVsPVwiYXBwbGUtdG91Y2gtaWNvblwiXScpO1xuICAgICAgICAgIGlmIChhcHBsZVRvdWNoSWNvbiAmJiBhcHBsZVRvdWNoSWNvbi5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSkge1xuICAgICAgICAgICAgb3JpZ2luYWxGYXZpY29uID0gYXBwbGVUb3VjaEljb24uZ2V0QXR0cmlidXRlKCdocmVmJykgfHwgJyc7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IFVzaW5nIGFwcGxlLXRvdWNoLWljb24gYXMgZmF2aWNvbjonLCBvcmlnaW5hbEZhdmljb24pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBJZiBubyBmYXZpY29uIGZvdW5kLCBjaGVjayBpZiB3ZSBjYW4gY29uc3RydWN0IHRoZSBkZWZhdWx0IG9uZSBmcm9tIHRoZSBjdXJyZW50IGRvbWFpblxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgZG9tYWluID0gd2luZG93LmxvY2F0aW9uLmhvc3RuYW1lO1xuICAgICAgICAgICAgICBpZiAoZG9tYWluLmluY2x1ZGVzKCdic2t5LmFwcCcpKSB7XG4gICAgICAgICAgICAgICAgb3JpZ2luYWxGYXZpY29uID0gJ2h0dHBzOi8vYnNreS5hcHAvc3RhdGljL2Zhdmljb24tMzJ4MzIucG5nJztcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkb21haW4uaW5jbHVkZXMoJ2Jza3kuc29jaWFsJykpIHtcbiAgICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LnNvY2lhbC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEdlbmVyaWMgZmFsbGJhY2tcbiAgICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnL2Zhdmljb24uaWNvJztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IFVzaW5nIGNvbnN0cnVjdGVkIGZhdmljb24gcGF0aDonLCBvcmlnaW5hbEZhdmljb24pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAvLyBVbHRpbWF0ZSBmYWxsYmFja1xuICAgICAgICAgICAgICBvcmlnaW5hbEZhdmljb24gPSAnaHR0cHM6Ly9ic2t5LmFwcC9zdGF0aWMvZmF2aWNvbi0zMngzMi5wbmcnO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IFVzaW5nIGRlZmF1bHQgQmx1ZXNreSBmYXZpY29uJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3Igc2F2aW5nIG9yaWdpbmFsIGZhdmljb24nLCBlcnJvcik7XG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIGRlZmF1bHQgQmx1ZXNreSBmYXZpY29uXG4gICAgICAgIG9yaWdpbmFsRmF2aWNvbiA9ICdodHRwczovL2Jza3kuYXBwL3N0YXRpYy9mYXZpY29uLTMyeDMyLnBuZyc7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEZ1bmN0aW9uIHRvIGNyZWF0ZSBhIGZhdmljb24gd2l0aCBhIGJhZGdlIGNvdW50XG4gICAgZnVuY3Rpb24gY3JlYXRlRmF2aWNvbldpdGhCYWRnZShjb3VudDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChjb3VudCA8PSAwKSB7XG4gICAgICAgICAgLy8gUmV0dXJuIHRoZSBvcmlnaW5hbCBmYXZpY29uIGlmIG5vIG5vdGlmaWNhdGlvbnNcbiAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IFJldHVybmluZyBvcmlnaW5hbCBmYXZpY29uIChubyBub3RpZmljYXRpb25zKScpO1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUob3JpZ2luYWxGYXZpY29uIHx8ICdodHRwczovL2Jza3kuYXBwL3N0YXRpYy9mYXZpY29uLTMyeDMyLnBuZycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIHRoZSBiYWRnZSBpY29uIHR5cGVcbiAgICAgICAgbGV0IGljb25UeXBlOiBzdHJpbmc7XG4gICAgICAgIGlmIChjb3VudCA+IDMwKSB7XG4gICAgICAgICAgaWNvblR5cGUgPSAnMzBwbHVzJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpY29uVHlwZSA9IGNvdW50LnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUcnkgdG8gdXNlIHByZS1nZW5lcmF0ZWQgYmFkZ2Ugbm90aWZpY2F0aW9uIGljb25zIGZpcnN0XG4gICAgICAgIGlmIChpc1JlYWxCcm93c2VyICYmIGV4dGVuc2lvbkNvbnRleHRWYWxpZCkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBVc2UgdGhlIDMycHggc2l6ZSBpY29uIGZvciBmYXZpY29uIChiZXN0IG1hdGNoIGZvciBtb3N0IGZhdmljb24gc2l6ZXMpXG4gICAgICAgICAgICBjb25zdCBiYWRnZUljb25VcmwgPSBicm93c2VyLnJ1bnRpbWUuZ2V0VVJMKGAvaWNvbi9ub3RpZmljYXRpb24vJHtpY29uVHlwZX1fMzIucG5nYCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgRnJlc2hza3k6IFVzaW5nIGV4dGVuc2lvbiBiYWRnZSBpY29uOiAke2JhZGdlSWNvblVybH1gKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoYmFkZ2VJY29uVXJsKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBFcnJvciBnZXR0aW5nIGJhZGdlIGljb24gVVJMLCBmYWxsaW5nIGJhY2sgdG8gZHluYW1pYyBnZW5lcmF0aW9uJywgZXJyb3IpO1xuICAgICAgICAgICAgLy8gRG9uJ3QgbWFyayBjb250ZXh0IGFzIGludmFsaWQsIGp1c3QgZmFsbCB0aHJvdWdoIHRvIGR5bmFtaWMgZ2VuZXJhdGlvblxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IE5vdCB1c2luZyBleHRlbnNpb24gcmVzb3VyY2VzLCBmYWxsaW5nIGJhY2sgdG8gZHluYW1pYyBnZW5lcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIER5bmFtaWMgZ2VuZXJhdGlvbiBhcHByb2FjaCAoZm9yIGRldmVsb3BtZW50IG9yIGZhbGxiYWNrKVxuICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IEdlbmVyYXRpbmcgZHluYW1pYyBiYWRnZSBpY29uJyk7XG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuICAgICAgICBjYW52YXMud2lkdGggPSAzMjtcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IDMyO1xuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblxuICAgICAgICBpZiAoIWN0eCkge1xuICAgICAgICAgIGNvbnNvbGUud2FybignRnJlc2hza3k6IENvdWxkIG5vdCBnZXQgY2FudmFzIGNvbnRleHQsIHJldHVybmluZyBvcmlnaW5hbCBmYXZpY29uJyk7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShvcmlnaW5hbEZhdmljb24gfHwgJ2h0dHBzOi8vYnNreS5hcHAvc3RhdGljL2Zhdmljb24tMzJ4MzIucG5nJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDcmVhdGUgYSBzdGFuZGFsb25lIHJlZCBub3RpZmljYXRpb24gYmFkZ2VcbiAgICAgICAgLy8gQ2xlYXIgdGhlIGNhbnZhc1xuICAgICAgICBjdHguY2xlYXJSZWN0KDAsIDAsIDMyLCAzMik7XG4gICAgICAgIFxuICAgICAgICAvLyBDYWxjdWxhdGUgYmFkZ2Ugc2l6ZSB0byBmaWxsIG1vc3Qgb2YgdGhlIGljb24gc3BhY2VcbiAgICAgICAgY29uc3QgYmFkZ2VTaXplID0gTWF0aC5tYXgoMzIgKiAwLjksIDE0KTsgLy8gOTAlIG9mIGljb24gc2l6ZVxuICAgICAgICBjb25zdCBiYWRnZVggPSAzMiAvIDI7IC8vIENlbnRlciBob3Jpem9udGFsbHlcbiAgICAgICAgY29uc3QgYmFkZ2VZID0gMzIgLyAyOyAvLyBDZW50ZXIgdmVydGljYWxseVxuICAgICAgICBcbiAgICAgICAgLy8gRHJhdyByZWQgY2lyY2xlIGJhY2tncm91bmRcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHguYXJjKGJhZGdlWCwgYmFkZ2VZLCBiYWRnZVNpemUvMiwgMCwgTWF0aC5QSSAqIDIpO1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gJyNGRjRBNEEnOyAvLyBSZWQgYmFkZ2UgY29sb3JcbiAgICAgICAgY3R4LmZpbGwoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEZvcm1hdCBjb3VudCB0ZXh0XG4gICAgICAgIGxldCBjb3VudFRleHQ7XG4gICAgICAgIGlmIChjb3VudCA+IDMwKSB7XG4gICAgICAgICAgY291bnRUZXh0ID0gJzMwKyc7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY291bnRUZXh0ID0gY291bnQudG9TdHJpbmcoKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQWRkIHdoaXRlIHRleHRcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICcjRkZGRkZGJztcbiAgICAgICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgICAgICBjdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XG4gICAgICAgIFxuICAgICAgICAvLyBTY2FsZSBmb250IHNpemUgYmFzZWQgb24gYmFkZ2Ugc2l6ZSBhbmQgY2hhcmFjdGVyIGNvdW50XG4gICAgICAgIGNvbnN0IGZvbnRTaXplID0gTWF0aC5tYXgoYmFkZ2VTaXplICogMC41LCA3KTsgLy8gNTAlIG9mIGJhZGdlIHNpemVcbiAgICAgICAgY3R4LmZvbnQgPSBgYm9sZCAke2ZvbnRTaXplfXB4IEFyaWFsYDtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkanVzdCBmb250IHNpemUgaWYgdGV4dCBpcyB0b28gbG9uZ1xuICAgICAgICBpZiAoY291bnRUZXh0Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICBjdHguZm9udCA9IGBib2xkICR7Zm9udFNpemUgKiAwLjh9cHggQXJpYWxgO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudFRleHQubGVuZ3RoID4gMikge1xuICAgICAgICAgIGN0eC5mb250ID0gYGJvbGQgJHtmb250U2l6ZSAqIDAuN31weCBBcmlhbGA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGN0eC5maWxsVGV4dChjb3VudFRleHQsIGJhZGdlWCwgYmFkZ2VZKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGRhdGFVcmwgPSBjYW52YXMudG9EYXRhVVJMKCdpbWFnZS9wbmcnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBHZW5lcmF0ZWQgZHluYW1pYyBiYWRnZSBpY29uJyk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoZGF0YVVybCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3IgY3JlYXRpbmcgZmF2aWNvbicsIGVycm9yKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShvcmlnaW5hbEZhdmljb24gfHwgJ2h0dHBzOi8vYnNreS5hcHAvc3RhdGljL2Zhdmljb24tMzJ4MzIucG5nJyk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEZ1bmN0aW9uIHRvIHNhZmVseSBhcHBseSB0aGUgZmF2aWNvblxuICAgIGZ1bmN0aW9uIGFwcGx5RmF2aWNvbihmYXZpY29uVXJsOiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz4pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghZmF2aWNvblVybCkge1xuICAgICAgICAgIGNvbnNvbGUud2FybignRnJlc2hza3k6IE5vIGZhdmljb24gVVJMIHByb3ZpZGVkLCBza2lwcGluZyB1cGRhdGUnKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICghdXNlclByZWZlcmVuY2VzLnVwZGF0ZVNpdGVJY29uKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBTaXRlIGljb24gdXBkYXRlcyBkaXNhYmxlZCBpbiBwcmVmZXJlbmNlcywgc2tpcHBpbmcgdXBkYXRlJyk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgXG4gICAgICAgIC8vIEhhbmRsZSBwcm9taXNlcyByZXR1cm5lZCBieSBjcmVhdGVGYXZpY29uV2l0aEJhZGdlXG4gICAgICAgIFByb21pc2UucmVzb2x2ZShmYXZpY29uVXJsKVxuICAgICAgICAgIC50aGVuKHVybCA9PiB7XG4gICAgICAgICAgICBpZiAoIXVybCkge1xuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZyZXNoc2t5OiBFbXB0eSBmYXZpY29uIFVSTCBhZnRlciBwcm9taXNlIHJlc29sdXRpb24sIHNraXBwaW5nIHVwZGF0ZScpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGcmVzaHNreTogQXBwbHlpbmcgZmF2aWNvbjogJHt1cmwuc3Vic3RyaW5nKDAsIDUwKX0ke3VybC5sZW5ndGggPiA1MCA/ICcuLi4nIDogJyd9YCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIC8vIEZpcnN0LCB0cnkgdG8gdXBkYXRlIGV4aXN0aW5nIGZhdmljb24gbGluayBlbGVtZW50c1xuICAgICAgICAgICAgICBsZXQgbGlua0VsZW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbGlua1tyZWw9XCJpY29uXCJdLCBsaW5rW3JlbD1cInNob3J0Y3V0IGljb25cIl0nKTtcbiAgICAgICAgXG4gICAgICAgICAgICAgIGlmIChsaW5rRWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBleGlzdGluZyBmYXZpY29uIGxpbmtzXG4gICAgICAgICAgICAgICAgbGlua0VsZW1lbnRzLmZvckVhY2gobGluayA9PiB7XG4gICAgICAgICAgICAgICAgICBsaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsIHVybCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEZyZXNoc2t5OiBVcGRhdGVkICR7bGlua0VsZW1lbnRzLmxlbmd0aH0gZXhpc3RpbmcgZmF2aWNvbiBsaW5rc2ApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBhIG5ldyBmYXZpY29uIGxpbmsgaWYgbm9uZSBleGlzdHNcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICAgICAgICAgICAgICAgIGxpbmsucmVsID0gJ2ljb24nO1xuICAgICAgICAgICAgICAgIGxpbmsudHlwZSA9ICdpbWFnZS9wbmcnO1xuICAgICAgICAgICAgICAgIGxpbmsuaHJlZiA9IHVybDtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGxpbmspO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogQ3JlYXRlZCBuZXcgZmF2aWNvbiBsaW5rJyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIFZlcmlmeSB0aGUgY2hhbmdlIHdhcyBhcHBsaWVkXG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRGYXZpY29uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbGlua1tyZWw9XCJpY29uXCJdLCBsaW5rW3JlbD1cInNob3J0Y3V0IGljb25cIl0nKTtcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudEZhdmljb24pIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRIcmVmID0gY3VycmVudEZhdmljb24uZ2V0QXR0cmlidXRlKCdocmVmJyk7XG4gICAgICAgICAgICAgICAgICBpZiAoY3VycmVudEhyZWYgIT09IHVybCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZyZXNoc2t5OiBGYXZpY29uIHVwZGF0ZSBtYXkgbm90IGhhdmUgYXBwbGllZCBjb3JyZWN0bHknKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogRmF2aWNvbiB1cGRhdGUgdmVyaWZpZWQnKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0sIDEwMCk7XG4gICAgICAgICAgICB9IGNhdGNoIChkb21FcnJvcikge1xuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRE9NIGVycm9yIHdoZW4gYXBwbHlpbmcgZmF2aWNvbicsIGRvbUVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3IgcmVzb2x2aW5nIGZhdmljb24gVVJMJywgZXJyb3IpO1xuICAgICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRnJlc2hza3k6IENyaXRpY2FsIGVycm9yIGFwcGx5aW5nIGZhdmljb24nLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEZ1bmN0aW9uIHRvIHVwZGF0ZSB0aGUgZXh0ZW5zaW9uIGljb24gKHRvb2xiYXIgaWNvbilcbiAgICBmdW5jdGlvbiB1cGRhdGVFeHRlbnNpb25JY29uKGNvdW50OiBudW1iZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmICghaXNSZWFsQnJvd3NlciB8fCAhdXNlclByZWZlcmVuY2VzLnVwZGF0ZUV4dGVuc2lvbkljb24pIHJldHVybjtcbiAgICAgICAgXG4gICAgICAgIHNhZmVseU1lc3NhZ2VCYWNrZ3JvdW5kKHtcbiAgICAgICAgICBhY3Rpb246ICd1cGRhdGVOb3RpZmljYXRpb25Db3VudCcsXG4gICAgICAgICAgY291bnQ6IGNvdW50XG4gICAgICAgIH0pLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IEV4dGVuc2lvbiBpY29uIHVwZGF0ZSBzdWNjZXNzZnVsJyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChyZXNwb25zZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgLy8gTm8gbmVlZCB0byBsb2c7IHNhZmVseU1lc3NhZ2VCYWNrZ3JvdW5kIGFscmVhZHkgaGFuZGxlZCB0aGUgZXJyb3JcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBObyBzdWNjZXNzIHJlc3BvbnNlIGZyb20gZXh0ZW5zaW9uIGljb24gdXBkYXRlJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gVGhpcyBzaG91bGRuJ3QgaGFwcGVuIGR1ZSB0byB0aGUgcHJvbWlzZSBoYW5kbGluZyBpbiBzYWZlbHlNZXNzYWdlQmFja2dyb3VuZFxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZyZXNoc2t5OiBVbmV4cGVjdGVkIGVycm9yIGluIGV4dGVuc2lvbiBpY29uIHVwZGF0ZScsIGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEZ1bmN0aW9uIHRvIGV4dHJhY3QgYmFkZ2UgY291bnQgZnJvbSBhbiBlbGVtZW50XG4gICAgZnVuY3Rpb24gZ2V0QmFkZ2VDb3VudChlbGVtZW50OiBFbGVtZW50IHwgbnVsbCk6IG51bWJlciB7XG4gICAgICBpZiAoIWVsZW1lbnQpIHJldHVybiAwO1xuICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdGV4dCA9IGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCAnJztcbiAgICAgICAgaWYgKCF0ZXh0KSByZXR1cm4gMDtcbiAgICBcbiAgICAgICAgLy8gSWYgaXQncyBsaWtlIFwiMzArXCIsIHJldHVybiAzMFxuICAgICAgICBpZiAodGV4dC5lbmRzV2l0aCgnKycpKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlSW50KHRleHQuc2xpY2UoMCwgLTEpLCAxMCk7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgcmV0dXJuIHBhcnNlSW50KHRleHQsIDEwKSB8fCAwO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRnJlc2hza3k6IEVycm9yIGdldHRpbmcgYmFkZ2UgY291bnQnLCBlcnJvcik7XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBGdW5jdGlvbiB0byBmaW5kIG5vdGlmaWNhdGlvbiBiYWRnZSBlbGVtZW50c1xuICAgIGZ1bmN0aW9uIGZpbmROb3RpZmljYXRpb25CYWRnZXMoKSB7XG4gICAgICB0cnkge1xuICAgICAgICAvLyBMb29rIGZvciBiYWRnZSBlbGVtZW50cyB0aGF0IGNvdWxkIGJlIG5vdGlmaWNhdGlvbnNcbiAgICAgICAgLy8gVGhleSB0eXBpY2FsbHkgaGF2ZSBhIHNwZWNpZmljIGFyaWEtbGFiZWwgYW5kIGNsYXNzXG4gICAgICAgIGNvbnN0IGJhZGdlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2RpdlthcmlhLWxhYmVsKj1cInVucmVhZCBpdGVtXCJdJyk7XG4gICAgXG4gICAgICAgIGxldCBub3RpZmljYXRpb25CYWRnZTogRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgbWVzc2FnZUJhZGdlOiBFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gICAgXG4gICAgICAgIC8vIElkZW50aWZ5IHdoaWNoIGJhZGdlIGlzIGZvciBub3RpZmljYXRpb25zIGFuZCB3aGljaCBpcyBmb3IgbWVzc2FnZXNcbiAgICAgICAgYmFkZ2VzLmZvckVhY2goYmFkZ2UgPT4ge1xuICAgICAgICAgIC8vIENoZWNrIHBhcmVudCBsaW5rcyB0byBkZXRlcm1pbmUgYmFkZ2UgdHlwZVxuICAgICAgICAgIGNvbnN0IHBhcmVudExpbmsgPSBiYWRnZS5jbG9zZXN0KCdhJyk7XG4gICAgICAgICAgaWYgKCFwYXJlbnRMaW5rKSByZXR1cm47XG4gICAgXG4gICAgICAgICAgY29uc3QgaHJlZiA9IHBhcmVudExpbmsuZ2V0QXR0cmlidXRlKCdocmVmJyk7XG4gICAgICAgICAgaWYgKGhyZWYgPT09ICcvbm90aWZpY2F0aW9ucycpIHtcbiAgICAgICAgICAgIG5vdGlmaWNhdGlvbkJhZGdlID0gYmFkZ2U7XG4gICAgICAgICAgfSBlbHNlIGlmIChocmVmID09PSAnL21lc3NhZ2VzJykge1xuICAgICAgICAgICAgbWVzc2FnZUJhZGdlID0gYmFkZ2U7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBub3RpZmljYXRpb25CYWRnZSxcbiAgICAgICAgICBtZXNzYWdlQmFkZ2VcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZyZXNoc2t5OiBFcnJvciBmaW5kaW5nIG5vdGlmaWNhdGlvbiBiYWRnZXMnLCBlcnJvcik7XG4gICAgICAgIHJldHVybiB7IG5vdGlmaWNhdGlvbkJhZGdlOiBudWxsLCBtZXNzYWdlQmFkZ2U6IG51bGwgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gRnVuY3Rpb24gdG8gdXBkYXRlIGJhZGdlIGNvdW50cyBhbmQgaWNvbnMgYmFzZWQgb24gRE9NIGVsZW1lbnRzXG4gICAgZnVuY3Rpb24gdXBkYXRlQmFkZ2VzKGZvcmNlVXBkYXRlID0gZmFsc2UpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChpc1JlYWxCcm93c2VyICYmICFleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IFNraXBwaW5nIGJhZGdlIHVwZGF0ZSBkdWUgdG8gaW52YWxpZCBleHRlbnNpb24gY29udGV4dCcpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc3QgeyBub3RpZmljYXRpb25CYWRnZSwgbWVzc2FnZUJhZGdlIH0gPSBmaW5kTm90aWZpY2F0aW9uQmFkZ2VzKCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBub3RpZmljYXRpb25Db3VudCA9IGdldEJhZGdlQ291bnQobm90aWZpY2F0aW9uQmFkZ2UpO1xuICAgICAgICBjb25zdCBtZXNzYWdlQ291bnQgPSBnZXRCYWRnZUNvdW50KG1lc3NhZ2VCYWRnZSk7XG4gICAgICAgIGNvbnN0IHRvdGFsQ291bnQgPSBub3RpZmljYXRpb25Db3VudCArIG1lc3NhZ2VDb3VudDtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKGBGcmVzaHNreTogRm91bmQgbm90aWZpY2F0aW9uIGNvdW50OiAke25vdGlmaWNhdGlvbkNvdW50fSwgbWVzc2FnZSBjb3VudDogJHttZXNzYWdlQ291bnR9LCB0b3RhbDogJHt0b3RhbENvdW50fWApO1xuICAgICAgICBcbiAgICAgICAgLy8gT25seSB1cGRhdGUgaWYgY291bnRzIGhhdmUgY2hhbmdlZCBvciBpZiBmb3JjZVVwZGF0ZSBpcyB0cnVlXG4gICAgICAgIGlmIChmb3JjZVVwZGF0ZSB8fCB0b3RhbENvdW50ICE9PSBsYXN0Tm90aWZpY2F0aW9uQ291bnQgKyBsYXN0TWVzc2FnZUNvdW50KSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYEZyZXNoc2t5OiBVcGRhdGluZyBpY29ucyB3aXRoIGNvdW50ICR7dG90YWxDb3VudH1gKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBVcGRhdGUgZmF2aWNvbiB3aXRoIGJhZGdlXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNyZWF0ZUZhdmljb25XaXRoQmFkZ2UodG90YWxDb3VudClcbiAgICAgICAgICAgICAgLnRoZW4oaWNvblVybCA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGljb25VcmwpIHtcbiAgICAgICAgICAgICAgICAgIGFwcGx5RmF2aWNvbihpY29uVXJsKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRnJlc2hza3k6IEZhaWxlZCB0byBjcmVhdGUgYmFkZ2UgaWNvbiwgZmF2aWNvbiBub3QgdXBkYXRlZCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3IgaW4gZmF2aWNvbiBjcmVhdGlvbi9hcHBsaWNhdGlvbiBjaGFpbicsIGVycm9yKTtcbiAgICAgICAgICAgICAgICBpZiAob3JpZ2luYWxGYXZpY29uKSB7XG4gICAgICAgICAgICAgICAgICBhcHBseUZhdmljb24ob3JpZ2luYWxGYXZpY29uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogQ3JpdGljYWwgZXJyb3IgaW4gZmF2aWNvbiB1cGRhdGUgcHJvY2VzcycsIGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gVXBkYXRlIGV4dGVuc2lvbiBpY29uXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHVwZGF0ZUV4dGVuc2lvbkljb24odG90YWxDb3VudCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZyZXNoc2t5OiBFcnJvciB1cGRhdGluZyBleHRlbnNpb24gaWNvbicsIGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gU3RvcmUgY291bnRzIGluIGV4dGVuc2lvbiBzdG9yYWdlXG4gICAgICAgICAgaWYgKGlzUmVhbEJyb3dzZXIpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGJyb3dzZXIuc3RvcmFnZS5sb2NhbC5zZXQoe1xuICAgICAgICAgICAgICAgIG5vdGlmaWNhdGlvbkNvdW50czoge1xuICAgICAgICAgICAgICAgICAgbm90aWZpY2F0aW9uOiBub3RpZmljYXRpb25Db3VudCxcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2VDb3VudCxcbiAgICAgICAgICAgICAgICAgIHRvdGFsOiB0b3RhbENvdW50XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdGcmVzaHNreTogRmFpbGVkIHRvIHNhdmUgbm90aWZpY2F0aW9uIGNvdW50cyB0byBzdG9yYWdlJywgZXJyb3IpO1xuICAgICAgICAgICAgICAgIGhhbmRsZUludmFsaWRDb250ZXh0KGVycm9yKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ0ZyZXNoc2t5OiBFcnJvciBhY2Nlc3Npbmcgc3RvcmFnZScsIGVycm9yKTtcbiAgICAgICAgICAgICAgaGFuZGxlSW52YWxpZENvbnRleHQoZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gQ2hlY2sgZm9yIG5ldyBub3RpZmljYXRpb25zIHRvIHNob3cgYSBzeXN0ZW0gbm90aWZpY2F0aW9uXG4gICAgICAgIGNvbnN0IG5ld05vdGlmaWNhdGlvbnMgPSBub3RpZmljYXRpb25Db3VudCAtIGxhc3ROb3RpZmljYXRpb25Db3VudDtcbiAgICAgICAgY29uc3QgbmV3TWVzc2FnZXMgPSBtZXNzYWdlQ291bnQgLSBsYXN0TWVzc2FnZUNvdW50O1xuICAgICAgICBcbiAgICAgICAgaWYgKG5ld05vdGlmaWNhdGlvbnMgPiAwICYmIHVzZXJQcmVmZXJlbmNlcy5lbmFibGVOb3RpZmljYXRpb25zKSB7XG4gICAgICAgICAgc2VuZE5vdGlmaWNhdGlvbihcbiAgICAgICAgICAgICdOZXcgQmx1ZXNreSBOb3RpZmljYXRpb25zJyxcbiAgICAgICAgICAgIGBZb3UgaGF2ZSAke25ld05vdGlmaWNhdGlvbnN9IG5ldyBub3RpZmljYXRpb24ke25ld05vdGlmaWNhdGlvbnMgPiAxID8gJ3MnIDogJyd9YCxcbiAgICAgICAgICAgICdub3RpZmljYXRpb24nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKG5ld01lc3NhZ2VzID4gMCAmJiB1c2VyUHJlZmVyZW5jZXMuZW5hYmxlTm90aWZpY2F0aW9ucykge1xuICAgICAgICAgIHNlbmROb3RpZmljYXRpb24oXG4gICAgICAgICAgICAnTmV3IEJsdWVza3kgTWVzc2FnZXMnLFxuICAgICAgICAgICAgYFlvdSBoYXZlICR7bmV3TWVzc2FnZXN9IG5ldyBtZXNzYWdlJHtuZXdNZXNzYWdlcyA+IDEgPyAncycgOiAnJ31gLFxuICAgICAgICAgICAgJ21lc3NhZ2UnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gVXBkYXRlIHN0b3JlZCBjb3VudHNcbiAgICAgICAgbGFzdE5vdGlmaWNhdGlvbkNvdW50ID0gbm90aWZpY2F0aW9uQ291bnQ7XG4gICAgICAgIGxhc3RNZXNzYWdlQ291bnQgPSBtZXNzYWdlQ291bnQ7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3IgdXBkYXRpbmcgYmFkZ2VzJywgZXJyb3IpO1xuICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEZ1bmN0aW9uIHRvIHN0YXJ0IG9ic2VydmluZyBjaGFuZ2VzIGluIG5vdGlmaWNhdGlvbiBhbmQgbWVzc2FnZSBiYWRnZXNcbiAgICBmdW5jdGlvbiBvYnNlcnZlQmFkZ2VzKCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKGlzT2JzZXJ2aW5nIHx8IChpc1JlYWxCcm93c2VyICYmICFleHRlbnNpb25Db250ZXh0VmFsaWQpKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBOb3Qgc3RhcnRpbmcgYmFkZ2Ugb2JzZXJ2YXRpb24gKGFscmVhZHkgb2JzZXJ2aW5nIG9yIGludmFsaWQgY29udGV4dCknKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlzT2JzZXJ2aW5nID0gdHJ1ZTtcbiAgICAgICAgdXBkYXRlVGltZXIgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgIGlmIChpc1JlYWxCcm93c2VyICYmICFleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogU2tpcHBpbmcgc2NoZWR1bGVkIGJhZGdlIHVwZGF0ZSBkdWUgdG8gaW52YWxpZCBjb250ZXh0Jyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHVwZGF0ZUJhZGdlcygpO1xuICAgICAgICB9LCB1c2VyUHJlZmVyZW5jZXMucmVmcmVzaEludGVydmFsICogNjAgKiAxMDAwKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogU3RhcnRlZCBvYnNlcnZpbmcgYmFkZ2VzJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3Igb2JzZXJ2aW5nIGJhZGdlcycsIGVycm9yKTtcbiAgICAgICAgaGFuZGxlSW52YWxpZENvbnRleHQoZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBGdW5jdGlvbiB0byBzdG9wIG9ic2VydmluZyBjaGFuZ2VzIGluIG5vdGlmaWNhdGlvbiBhbmQgbWVzc2FnZSBiYWRnZXNcbiAgICBmdW5jdGlvbiBzdG9wT2JzZXJ2aW5nQmFkZ2VzKCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFpc09ic2VydmluZykgcmV0dXJuO1xuICAgIFxuICAgICAgICBpc09ic2VydmluZyA9IGZhbHNlO1xuICAgICAgICBpZiAodXBkYXRlVGltZXIgIT09IG51bGwpIHtcbiAgICAgICAgICBjbGVhckludGVydmFsKHVwZGF0ZVRpbWVyKTtcbiAgICAgICAgICB1cGRhdGVUaW1lciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBTdG9wcGVkIG9ic2VydmluZyBiYWRnZXMnKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZyZXNoc2t5OiBFcnJvciBzdG9wcGluZyBvYnNlcnZhdGlvbicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gRnVuY3Rpb24gdG8gc2VuZCBhIG5vdGlmaWNhdGlvblxuICAgIGZ1bmN0aW9uIHNlbmROb3RpZmljYXRpb24odGl0bGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcgPSAnbm90aWZpY2F0aW9uJykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKCFpc1JlYWxCcm93c2VyIHx8ICF1c2VyUHJlZmVyZW5jZXMuZW5hYmxlTm90aWZpY2F0aW9ucykgcmV0dXJuO1xuICAgICAgICBcbiAgICAgICAgLy8gVXNlIHRoZSBzYWZlciBtZXNzYWdpbmcgaGVscGVyXG4gICAgICAgIHNhZmVseU1lc3NhZ2VCYWNrZ3JvdW5kKHtcbiAgICAgICAgICBhY3Rpb246ICdzZW5kTm90aWZpY2F0aW9uJyxcbiAgICAgICAgICB0aXRsZTogdGl0bGUsXG4gICAgICAgICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICAgICAgICB0eXBlOiB0eXBlXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRnJlc2hza3k6IEVycm9yIHNlbmRpbmcgbm90aWZpY2F0aW9uJywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBGdW5jdGlvbiB0byBzYWZlbHkgc2VuZCBtZXNzYWdlcyB0byB0aGUgYmFja2dyb3VuZCBzY3JpcHRcbiAgICBmdW5jdGlvbiBzYWZlbHlNZXNzYWdlQmFja2dyb3VuZChtZXNzYWdlOiBhbnksIHJldHJ5Q291bnQgPSAwKTogUHJvbWlzZTxhbnk+IHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgaWYgKCFpc1JlYWxCcm93c2VyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IE5vdCBpbiBhIHJlYWwgYnJvd3NlciBlbnZpcm9ubWVudCwgc2tpcHBpbmcgbWVzc2FnZScsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKCFleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcbiAgICAgICAgICAgIC8vIEZvciBwaW5nIG1lc3NhZ2VzLCBzdGlsbCB0cnkgZXZlbiB3aXRoIGludmFsaWQgY29udGV4dFxuICAgICAgICAgICAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAncGluZycpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBBdHRlbXB0aW5nIHBpbmcgZGVzcGl0ZSBpbnZhbGlkIGNvbnRleHQgc3RhdGUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGcmVzaHNreTogU2tpcHBpbmcgbWVzc2FnZSBkdWUgdG8gaW52YWxpZCBleHRlbnNpb24gY29udGV4dDogJHttZXNzYWdlLmFjdGlvbn1gKTtcbiAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBicm93c2VyLnJ1bnRpbWUuc2VuZE1lc3NhZ2UobWVzc2FnZSlcbiAgICAgICAgICAgIC50aGVuKHJlc29sdmUpXG4gICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvcj8ubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcic7XG4gICAgICAgICAgICAgIGNvbnN0IGlzQ29udGV4dEVycm9yID0gXG4gICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdFeHRlbnNpb24gY29udGV4dCBpbnZhbGlkYXRlZCcpIHx8XG4gICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdJbnZhbGlkIGV4dGVuc2lvbiBjb250ZXh0JykgfHxcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ0V4dGVuc2lvbiBjb250ZXh0IGlzIGludmFsaWRhdGVkJykgfHxcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ0NvdWxkIG5vdCBlc3RhYmxpc2ggY29ubmVjdGlvbicpIHx8XG4gICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdSZWNlaXZpbmcgZW5kIGRvZXMgbm90IGV4aXN0JykgfHxcbiAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ1NlcnZpY2Ugd29ya2VyJykgfHxcbiAgICAgICAgICAgICAgICAodHlwZW9mIGVycm9yLmNvZGUgPT09ICdudW1iZXInICYmIGVycm9yLmNvZGUgPT09IDE1KTsgLy8gU29tZSBicm93c2VycyB1c2UgY29kZSAxNVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAoaXNDb250ZXh0RXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRnJlc2hza3k6IEV4dGVuc2lvbiBjb250ZXh0IGludmFsaWRhdGVkIGZvciBtZXNzYWdlOiAke21lc3NhZ2UuYWN0aW9ufWAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gRm9yIGNyaXRpY2FsIG1lc3NhZ2VzLCB3ZSBtaWdodCB3YW50IHRvIHJldHJ5IGFmdGVyIHdha2luZyB1cCB0aGUgc2VydmljZSB3b3JrZXJcbiAgICAgICAgICAgICAgICBjb25zdCBpbXBvcnRhbnRBY3Rpb25zID0gWydnZXRQcmVmZXJlbmNlcycsICd1cGRhdGVOb3RpZmljYXRpb25Db3VudCddO1xuICAgICAgICAgICAgICAgIGlmIChpbXBvcnRhbnRBY3Rpb25zLmluY2x1ZGVzKG1lc3NhZ2UuYWN0aW9uKSAmJiByZXRyeUNvdW50IDwgMikge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEZyZXNoc2t5OiBXaWxsIHJldHJ5IGltcG9ydGFudCBhY3Rpb24gXCIke21lc3NhZ2UuYWN0aW9ufVwiIGFmdGVyIGEgZGVsYXlgKTtcbiAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgLy8gVHJ5IHRvIHdha2UgdXAgc2VydmljZSB3b3JrZXIgZmlyc3RcbiAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChicm93c2VyLnJ1bnRpbWUgJiYgYnJvd3Nlci5ydW50aW1lLmNvbm5lY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwb3J0ID0gYnJvd3Nlci5ydW50aW1lLmNvbm5lY3Qoe25hbWU6ICdmcmVzaHNreS13YWtlLXVwJ30pO1xuICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHsgcG9ydC5kaXNjb25uZWN0KCk7IH0gY2F0Y2gge31cbiAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmV0cnkgYWZ0ZXIgYSBkZWxheVxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGcmVzaHNreTogUmV0cnlpbmcgXCIke21lc3NhZ2UuYWN0aW9ufVwiIChhdHRlbXB0ICR7cmV0cnlDb3VudCArIDF9KWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICBzYWZlbHlNZXNzYWdlQmFja2dyb3VuZChtZXNzYWdlLCByZXRyeUNvdW50ICsgMSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAudGhlbihyZXNvbHZlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoKSA9PiByZXNvbHZlKG51bGwpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIDgwMCk7XG4gICAgICAgICAgICAgICAgICAgICAgfSwgMjAwKTtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH0gY2F0Y2gge31cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGcmVzaHNreTogRXJyb3Igc2VuZGluZyBtZXNzYWdlOiAke21lc3NhZ2UuYWN0aW9ufWAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3IgaW4gc2FmZWx5TWVzc2FnZUJhY2tncm91bmQnLCBlcnJvcik7XG4gICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIC8vIEZ1bmN0aW9uIHRvIGNoZWNrIGlmIHRoZSBleHRlbnNpb24gY29udGV4dCBpcyB2YWxpZFxuICAgIGZ1bmN0aW9uIGNoZWNrRXh0ZW5zaW9uQ29udGV4dCgpIHtcbiAgICAgIGlmICghaXNSZWFsQnJvd3NlcikgcmV0dXJuO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IENoZWNraW5nIGV4dGVuc2lvbiBjb250ZXh0IHZhbGlkaXR5Jyk7XG4gICAgICBcbiAgICAgIHRyeSB7XG4gICAgICAgIHBpbmdCYWNrZ3JvdW5kU2NyaXB0KClcbiAgICAgICAgICAudGhlbihpc1ZhbGlkID0+IHtcbiAgICAgICAgICAgIGlmIChpc1ZhbGlkKSB7XG4gICAgICAgICAgICAgIGlmICghZXh0ZW5zaW9uQ29udGV4dFZhbGlkKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBFeHRlbnNpb24gY29udGV4dCBoYXMgYmVlbiByZXN0b3JlZCB2aWEgcGluZycpO1xuICAgICAgICAgICAgICAgIGV4dGVuc2lvbkNvbnRleHRWYWxpZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gQ2xlYXIgcmVjb25uZWN0IHRpbWVyXG4gICAgICAgICAgICAgICAgaWYgKHJlY29ubmVjdEF0dGVtcHRUaW1lcikge1xuICAgICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChyZWNvbm5lY3RBdHRlbXB0VGltZXIpO1xuICAgICAgICAgICAgICAgICAgcmVjb25uZWN0QXR0ZW1wdFRpbWVyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgIHJlY29ubmVjdEF0dGVtcHRDb3VudCA9IDA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIFJlLWluaXRpYWxpemUgYWZ0ZXIgYSBzaG9ydCBkZWxheVxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgaW5pdGlhbGl6ZSgpO1xuICAgICAgICAgICAgICAgIH0sIDEwMDApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gUGluZyBmYWlsZWQsIHRyeSBzdG9yYWdlIGFjY2Vzc1xuICAgICAgICAgICAgdHJ5U3RvcmFnZUFjY2Vzc0NoZWNrKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgICAgLy8gRXJyb3IgcGluZ2luZywgdHJ5IHN0b3JhZ2UgYWNjZXNzXG4gICAgICAgICAgICB0cnlTdG9yYWdlQWNjZXNzQ2hlY2soKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIC8vIEVycm9yIGluIHRoZSBlbnRpcmUgcGluZyBwcm9jZXNzLCB0cnkgc3RvcmFnZSBhY2Nlc3NcbiAgICAgICAgdHJ5U3RvcmFnZUFjY2Vzc0NoZWNrKCk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIFRyeSB0byBhY2Nlc3Mgc3RvcmFnZSBhcyBhIHdheSB0byBjaGVjayBleHRlbnNpb24gY29udGV4dCB2YWxpZGl0eVxuICAgIGZ1bmN0aW9uIHRyeVN0b3JhZ2VBY2Nlc3NDaGVjaygpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFRyeSB0byBhY2Nlc3MgYnJvd3Nlci5zdG9yYWdlIGFzIGFub3RoZXIgdmFsaWRpdHkgY2hlY2tcbiAgICAgICAgYnJvd3Nlci5zdG9yYWdlLmxvY2FsLmdldCgnY29udGV4dENoZWNrJylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWV4dGVuc2lvbkNvbnRleHRWYWxpZCkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IEV4dGVuc2lvbiBjb250ZXh0IGhhcyBiZWVuIHJlc3RvcmVkIHZpYSBzdG9yYWdlIGFjY2VzcycpO1xuICAgICAgICAgICAgICBleHRlbnNpb25Db250ZXh0VmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gQ2xlYXIgcmVjb25uZWN0IHRpbWVyXG4gICAgICAgICAgICAgIGlmIChyZWNvbm5lY3RBdHRlbXB0VGltZXIpIHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHJlY29ubmVjdEF0dGVtcHRUaW1lcik7XG4gICAgICAgICAgICAgICAgcmVjb25uZWN0QXR0ZW1wdFRpbWVyID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZWNvbm5lY3RBdHRlbXB0Q291bnQgPSAwO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBSZS1pbml0aWFsaXplIGFmdGVyIGEgc2hvcnQgZGVsYXlcbiAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgaW5pdGlhbGl6ZSgpO1xuICAgICAgICAgICAgICB9LCAxMDAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XG4gICAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBoYW5kbGVJbnZhbGlkQ29udGV4dChlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEZ1bmN0aW9uIHRvIHBpbmcgdGhlIGJhY2tncm91bmQgc2NyaXB0IHRvIGNoZWNrIGlmIGl0J3MgYWxpdmVcbiAgICBmdW5jdGlvbiBwaW5nQmFja2dyb3VuZFNjcmlwdCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgaWYgKCFpc1JlYWxCcm93c2VyKSB7XG4gICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIFNldCBhIHRpbWVvdXQgZm9yIHRoZSBwaW5nXG4gICAgICAgICAgY29uc3QgcGluZ1RpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogUGluZyB0aW1lZCBvdXQnKTtcbiAgICAgICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0sIDIwMDApO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIENoZWNrIGlmIHdlJ3JlIGluIE1hbmlmZXN0IFYzIG1vZGUgKHNlcnZpY2Ugd29ya2VyKVxuICAgICAgICAgIGNvbnN0IGlzTVYzID0gXG4gICAgICAgICAgICB0eXBlb2YgYnJvd3NlciAhPT0gJ3VuZGVmaW5lZCcgJiYgXG4gICAgICAgICAgICB0eXBlb2YgYnJvd3Nlci5ydW50aW1lICE9PSAndW5kZWZpbmVkJyAmJiBcbiAgICAgICAgICAgIHR5cGVvZiBicm93c2VyLnJ1bnRpbWUuZ2V0TWFuaWZlc3QgPT09ICdmdW5jdGlvbicgJiYgXG4gICAgICAgICAgICBicm93c2VyLnJ1bnRpbWUuZ2V0TWFuaWZlc3QoKS5tYW5pZmVzdF92ZXJzaW9uID09PSAzO1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogUnVubmluZyBpbiBNVjMgbW9kZT8nLCBpc01WMyk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gSW4gTVYzLCBjaGVjayBpZiBleHRlbnNpb24gSUQgaXMgYXZhaWxhYmxlIGZpcnN0XG4gICAgICAgICAgaWYgKGlzTVYzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBjb25zdCBleHRlbnNpb25JZCA9IGJyb3dzZXIucnVudGltZS5pZDtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBFeHRlbnNpb24gSUQgYXZhaWxhYmxlOicsIGV4dGVuc2lvbklkKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBFeHRlbnNpb24gcnVudGltZSBJRCBub3QgYWNjZXNzaWJsZSwgc2VydmljZSB3b3JrZXIgbWF5IGJlIGluYWN0aXZlJyk7XG4gICAgICAgICAgICAgIGNsZWFyVGltZW91dChwaW5nVGltZW91dCk7XG4gICAgICAgICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIFNlbmQgYSBwaW5nIG1lc3NhZ2UgdG8gYmFja2dyb3VuZFxuICAgICAgICAgIGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ3BpbmcnIH0pXG4gICAgICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgIGNsZWFyVGltZW91dChwaW5nVGltZW91dCk7XG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzICYmIHJlc3BvbnNlLm1lc3NhZ2UgPT09ICdwb25nJykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogUGluZyBzdWNjZXNzZnVsJyk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IFBpbmcgcmV0dXJuZWQgdW5leHBlY3RlZCByZXNwb25zZScsIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIGNsZWFyVGltZW91dChwaW5nVGltZW91dCk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogUGluZyBlcnJvcicsIGVycm9yKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIC8vIEhhbmRsZSBzZXJ2aWNlIHdvcmtlciB0ZXJtaW5hdGlvbiBpbiBNVjNcbiAgICAgICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UgJiYgKFxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQ291bGQgbm90IGVzdGFibGlzaCBjb25uZWN0aW9uJykgfHxcbiAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ1JlY2VpdmluZyBlbmQgZG9lcyBub3QgZXhpc3QnKSB8fFxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnU2VydmljZSB3b3JrZXInKSB8fFxuICAgICAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnc3RhdHVzIGNvZGU6IDE1JykgfHxcbiAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0V4dGVuc2lvbiBjb250ZXh0IGludmFsaWRhdGVkJylcbiAgICAgICAgICAgICAgICApKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBTZXJ2aWNlIHdvcmtlciBtYXkgYmUgdGVybWluYXRlZCBvciBub3QgcmVhZHknKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBBdHRlbXB0IHRvIHdha2UgdXAgdGhlIHNlcnZpY2Ugd29ya2VyIGJ5IGNvbm5lY3RpbmcgYnJpZWZseVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICBpZiAoYnJvd3Nlci5ydW50aW1lICYmIGJyb3dzZXIucnVudGltZS5jb25uZWN0KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBhbmQgaW1tZWRpYXRlbHkgZGlzY29ubmVjdCBhIHBvcnQgdG8gd2FrZSB1cCBzZXJ2aWNlIHdvcmtlclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwb3J0ID0gYnJvd3Nlci5ydW50aW1lLmNvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvcnQuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBBdHRlbXB0ZWQgdG8gd2FrZSB1cCBzZXJ2aWNlIHdvcmtlcicpO1xuICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogRXJyb3IgZGlzY29ubmVjdGluZyBwb3J0JywgZSk7XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LCAxMDApO1xuICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gV2FpdCBhIHNob3J0IHRpbWUgYW5kIHRyeSBwaW5nIGFnYWluXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgIGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ3BpbmcnIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBTZXJ2aWNlIHdvcmtlciB3b2tlbiB1cCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgLmNhdGNoKCgpID0+IHJlc29sdmUoZmFsc2UpKTtcbiAgICAgICAgICAgICAgICAgICAgfSwgNTAwKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogRmFpbGVkIHRvIHdha2UgdXAgc2VydmljZSB3b3JrZXInLCBlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBFcnJvciBzZW5kaW5nIHBpbmcnLCBlcnJvcik7XG4gICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBIYW5kbGUgYW4gaW52YWxpZCBleHRlbnNpb24gY29udGV4dFxuICAgIGZ1bmN0aW9uIGhhbmRsZUludmFsaWRDb250ZXh0KGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBFeHRlbnNpb24gY29udGV4dCBoYXMgYmVjb21lIGludmFsaWQnLCBlcnJvcik7XG4gICAgICAgIGV4dGVuc2lvbkNvbnRleHRWYWxpZCA9IGZhbHNlO1xuICAgICAgICBcbiAgICAgICAgLy8gUmVzZXQgcmVjb25uZWN0aW9uIHN0YXRlXG4gICAgICAgIHJlY29ubmVjdEF0dGVtcHRDb3VudCA9IDA7XG4gICAgICAgIGlmIChyZWNvbm5lY3RBdHRlbXB0VGltZXIpIHtcbiAgICAgICAgICBjbGVhckludGVydmFsKHJlY29ubmVjdEF0dGVtcHRUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFN0YXJ0IHRyeWluZyB0byByZWNvbm5lY3RcbiAgICAgICAgcmVjb25uZWN0QXR0ZW1wdFRpbWVyID0gd2luZG93LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgICByZWNvbm5lY3RBdHRlbXB0Q291bnQrKztcbiAgICAgICAgICBjb25zb2xlLmxvZyhgRnJlc2hza3k6IFJlY29ubmVjdGlvbiBhdHRlbXB0ICR7cmVjb25uZWN0QXR0ZW1wdENvdW50fSBvZiAke01BWF9SRUNPTk5FQ1RfQVRURU1QVFN9YCk7XG4gICAgICAgICAgY2hlY2tFeHRlbnNpb25Db250ZXh0KCk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQWZ0ZXIgc2V2ZXJhbCBmYWlsZWQgYXR0ZW1wdHMsIHJlbG9hZCB0aGUgcGFnZVxuICAgICAgICAgIGlmIChyZWNvbm5lY3RBdHRlbXB0Q291bnQgPj0gTUFYX1JFQ09OTkVDVF9BVFRFTVBUUykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBNdWx0aXBsZSByZWNvbm5lY3Rpb24gYXR0ZW1wdHMgZmFpbGVkLCByZWxvYWRpbmcgcGFnZScpO1xuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChyZWNvbm5lY3RBdHRlbXB0VGltZXIpO1xuICAgICAgICAgICAgcmVjb25uZWN0QXR0ZW1wdFRpbWVyID0gbnVsbDtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gT25seSByZWxvYWQgaWYgd2UncmUgb24gYSBCbHVlc2t5IHBhZ2UgdG8gYXZvaWQgaW50ZXJmZXJpbmcgd2l0aCBvdGhlciBzaXRlc1xuICAgICAgICAgICAgaWYgKHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZS5pbmNsdWRlcygnYnNreS5hcHAnKSB8fCBcbiAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUuaW5jbHVkZXMoJ2Jza3kuc29jaWFsJykpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBSZWxvYWRpbmcgcGFnZSB0byByZWNvdmVyIGZyb20gaW52YWxpZCBjb250ZXh0Jyk7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gVHJ5IHRvIHBlcnNpc3QgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHJlbG9hZCBpbiBsb2NhbCBzdG9yYWdlIGZpcnN0XG4gICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2ZyZXNoc2t5UmVsb2FkVGltZScsIERhdGUubm93KCkudG9TdHJpbmcoKSk7XG4gICAgICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2ZyZXNoc2t5UmVsb2FkUmVhc29uJywgJ2V4dGVuc2lvbl9jb250ZXh0X2ludmFsaWQnKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIC8vIElnbm9yZSBzdG9yYWdlIGVycm9yc1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0sIFJFQ09OTkVDVF9ERUxBWSk7XG4gICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEluaXRpYWxpemUgZXZlcnl0aGluZ1xuICAgIGZ1bmN0aW9uIGluaXRpYWxpemUoKSB7XG4gICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IEluaXRpYWxpemluZyBjb250ZW50IHNjcmlwdCcpO1xuICAgICAgXG4gICAgICAvLyBSZXNldCBjb3VudGVyc1xuICAgICAgbGFzdE5vdGlmaWNhdGlvbkNvdW50ID0gMDtcbiAgICAgIGxhc3RNZXNzYWdlQ291bnQgPSAwO1xuICAgICAgaXNPYnNlcnZpbmcgPSBmYWxzZTtcbiAgICAgIGlmICh1cGRhdGVUaW1lciAhPT0gbnVsbCkge1xuICAgICAgICBjbGVhckludGVydmFsKHVwZGF0ZVRpbWVyKTtcbiAgICAgICAgdXBkYXRlVGltZXIgPSBudWxsO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBTYXZlIHRoZSBvcmlnaW5hbCBmYXZpY29uXG4gICAgICBzYXZlT3JpZ2luYWxGYXZpY29uKCk7XG4gICAgICBcbiAgICAgIC8vIFNldCB1cCBleHRlbnNpb24gY29udGV4dCBjaGVja2luZ1xuICAgICAgaWYgKGlzUmVhbEJyb3dzZXIpIHtcbiAgICAgICAgLy8gSW5pdGlhbCBjb250ZXh0IGNoZWNrXG4gICAgICAgIGNoZWNrRXh0ZW5zaW9uQ29udGV4dCgpO1xuICAgICAgICBcbiAgICAgICAgLy8gUGVyaW9kaWMgY29udGV4dCBjaGVja3NcbiAgICAgICAgc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgIGNoZWNrRXh0ZW5zaW9uQ29udGV4dCgpO1xuICAgICAgICB9LCA2MCAqIDEwMDApOyAvLyBDaGVjayBldmVyeSBtaW51dGVcbiAgICAgICAgXG4gICAgICAgIC8vIENoZWNrIHdoZW4gdGFiIGJlY29tZXMgdmlzaWJsZVxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd2aXNpYmlsaXR5Y2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgIGlmIChkb2N1bWVudC52aXNpYmlsaXR5U3RhdGUgPT09ICd2aXNpYmxlJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBUYWIgYmVjYW1lIHZpc2libGUsIGNoZWNraW5nIGV4dGVuc2lvbiBjb250ZXh0Jyk7XG4gICAgICAgICAgICBjaGVja0V4dGVuc2lvbkNvbnRleHQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBMb2FkIHByZWZlcmVuY2VzIGFuZCBzdGFydCBvYnNlcnZpbmdcbiAgICAgIGlmICghaXNSZWFsQnJvd3NlciB8fCBleHRlbnNpb25Db250ZXh0VmFsaWQpIHtcbiAgICAgICAgaWYgKGlzUmVhbEJyb3dzZXIpIHtcbiAgICAgICAgICBzYWZlbHlNZXNzYWdlQmFja2dyb3VuZCh7IGFjdGlvbjogJ2dldFByZWZlcmVuY2VzJyB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UucHJlZmVyZW5jZXMpIHtcbiAgICAgICAgICAgICAgICB1c2VyUHJlZmVyZW5jZXMgPSByZXNwb25zZS5wcmVmZXJlbmNlcztcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IExvYWRlZCB1c2VyIHByZWZlcmVuY2VzJywgdXNlclByZWZlcmVuY2VzKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IFVzaW5nIGRlZmF1bHQgcHJlZmVyZW5jZXMgZHVlIHRvIGVycm9yIG9yIGV4dGVuc2lvbiByZWxvYWQnKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgLy8gU3RhcnQgb2JzZXJ2aW5nIGJhZGdlcyBhbmQgZm9yY2UgYW4gaW5pdGlhbCB1cGRhdGVcbiAgICAgICAgICAgICAgb2JzZXJ2ZUJhZGdlcygpO1xuICAgICAgICAgICAgICB1cGRhdGVCYWRnZXModHJ1ZSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRnJlc2hza3k6IEVycm9yIGxvYWRpbmcgcHJlZmVyZW5jZXMsIHVzaW5nIGRlZmF1bHRzJywgZXJyb3IpO1xuICAgICAgICAgICAgICBvYnNlcnZlQmFkZ2VzKCk7XG4gICAgICAgICAgICAgIHVwZGF0ZUJhZGdlcyh0cnVlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEluIGRldmVsb3BtZW50IG1vZGUsIGp1c3QgdXNlIGRlZmF1bHRzXG4gICAgICAgICAgb2JzZXJ2ZUJhZGdlcygpO1xuICAgICAgICAgIHVwZGF0ZUJhZGdlcyh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBTa2lwcGluZyBpbml0aWFsaXphdGlvbiBkdWUgdG8gaW52YWxpZCBleHRlbnNpb24gY29udGV4dCcpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBMb2FkIHVzZXIgcHJlZmVyZW5jZXMgZnJvbSBzdG9yYWdlXG4gICAgaWYgKGlzUmVhbEJyb3dzZXIpIHtcbiAgICAgIC8vIExvYWQgcHJlZmVyZW5jZXMgZnJvbSBzdG9yYWdlIGZpcnN0XG4gICAgICBicm93c2VyLnN0b3JhZ2Uuc3luYy5nZXQoe1xuICAgICAgICB1cGRhdGVTaXRlSWNvbjogdHJ1ZSxcbiAgICAgICAgdXBkYXRlRXh0ZW5zaW9uSWNvbjogdHJ1ZSxcbiAgICAgICAgZW5hYmxlTm90aWZpY2F0aW9uczogdHJ1ZSxcbiAgICAgICAga2VlcFBhZ2VBbGl2ZTogdHJ1ZSxcbiAgICAgICAgcmVmcmVzaEludGVydmFsOiAxXG4gICAgICB9KVxuICAgICAgICAudGhlbihpdGVtcyA9PiB7XG4gICAgICAgICAgdXNlclByZWZlcmVuY2VzID0gaXRlbXMgYXMgVXNlclByZWZlcmVuY2VzO1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogTG9hZGVkIHVzZXIgcHJlZmVyZW5jZXMnLCB1c2VyUHJlZmVyZW5jZXMpO1xuICAgICAgICAgIGluaXRpYWxpemUoKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3IgbG9hZGluZyBwcmVmZXJlbmNlcycsIGVycm9yKTtcbiAgICAgICAgICBpbml0aWFsaXplKCk7XG4gICAgICAgIH0pO1xuICAgICAgXG4gICAgICAvLyBMaXN0ZW4gZm9yIG1lc3NhZ2VzIGZyb20gYmFja2dyb3VuZCBzY3JpcHRcbiAgICAgIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAnY2hlY2tGb3JVcGRhdGVzJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZyZXNoc2t5OiBSZWNlaXZlZCByZXF1ZXN0IHRvIGNoZWNrIGZvciB1cGRhdGVzJyk7XG4gICAgICAgICAgICB1cGRhdGVCYWRnZXModHJ1ZSk7XG4gICAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdGcmVzaHNreTogRXJyb3IgaGFuZGxpbmcgbWVzc2FnZSBmcm9tIGJhY2tncm91bmQnLCBlcnJvcik7XG4gICAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH0pO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgLy8gTGlzdGVuIGZvciBwcmVmZXJlbmNlIGNoYW5nZXNcbiAgICAgIGJyb3dzZXIuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIGFyZWFOYW1lKSA9PiB7XG4gICAgICAgIGlmIChhcmVhTmFtZSA9PT0gJ3N5bmMnKSB7XG4gICAgICAgICAgbGV0IG5lZWRSZXN0YXJ0ID0gZmFsc2U7XG4gICAgICAgICAgXG4gICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2hhbmdlcykge1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh1c2VyUHJlZmVyZW5jZXMsIGtleSkpIHtcbiAgICAgICAgICAgICAgLy8gSWYgcmVmcmVzaCBpbnRlcnZhbCBjaGFuZ2VkIGFuZCB3ZSdyZSBvYnNlcnZpbmcsIHdlIG5lZWQgdG8gcmVzdGFydCBvYnNlcnZhdGlvblxuICAgICAgICAgICAgICBpZiAoa2V5ID09PSAncmVmcmVzaEludGVydmFsJyAmJiB1cGRhdGVUaW1lcikge1xuICAgICAgICAgICAgICAgIG5lZWRSZXN0YXJ0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgKHVzZXJQcmVmZXJlbmNlcyBhcyBhbnkpW2tleV0gPSBjaGFuZ2VzW2tleV0ubmV3VmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGNvbnNvbGUubG9nKCdGcmVzaHNreTogVXBkYXRlZCBwcmVmZXJlbmNlcyBhZnRlciBzdG9yYWdlIGNoYW5nZScsIHVzZXJQcmVmZXJlbmNlcyk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKG5lZWRSZXN0YXJ0ICYmIGlzT2JzZXJ2aW5nKSB7XG4gICAgICAgICAgICBzdG9wT2JzZXJ2aW5nQmFkZ2VzKCk7XG4gICAgICAgICAgICBvYnNlcnZlQmFkZ2VzKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgLy8gU3RhcnQvc3RvcCBvYnNlcnZhdGlvbiB3aGVuIHRhYiB2aXNpYmlsaXR5IGNoYW5nZXNcbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKGRvY3VtZW50LmhpZGRlbikge1xuICAgICAgICAgIHN0b3BPYnNlcnZpbmdCYWRnZXMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBvYnNlcnZlQmFkZ2VzKCk7XG4gICAgICAgICAgdXBkYXRlQmFkZ2VzKHRydWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgLy8gQ2xlYW4gdXAgd2hlbiB0YWIgaXMgdW5sb2FkZWRcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgc3RvcE9ic2VydmluZ0JhZGdlcygpO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIC8vIEluaXRpYWxpemUgd2hlbiBsb2FkZWRcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIGluaXRpYWxpemUoKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZygnRnJlc2hza3k6IEluIGJ1aWxkIGVudmlyb25tZW50LCBza2lwcGluZyBpbml0aWFsaXphdGlvbicpO1xuICAgIH1cbiAgfVxufSk7XG4iLCJmdW5jdGlvbiBwcmludChtZXRob2QsIC4uLmFyZ3MpIHtcbiAgaWYgKGltcG9ydC5tZXRhLmVudi5NT0RFID09PSBcInByb2R1Y3Rpb25cIikgcmV0dXJuO1xuICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gYXJncy5zaGlmdCgpO1xuICAgIG1ldGhvZChgW3d4dF0gJHttZXNzYWdlfWAsIC4uLmFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xuICB9XG59XG5leHBvcnQgY29uc3QgbG9nZ2VyID0ge1xuICBkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuICBsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG4gIHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuICBlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuIiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuZXhwb3J0IGNsYXNzIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG4gIGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG4gICAgc3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG4gICAgdGhpcy5uZXdVcmwgPSBuZXdVcmw7XG4gICAgdGhpcy5vbGRVcmwgPSBvbGRVcmw7XG4gIH1cbiAgc3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG59XG5leHBvcnQgZnVuY3Rpb24gZ2V0VW5pcXVlRXZlbnROYW1lKGV2ZW50TmFtZSkge1xuICByZXR1cm4gYCR7YnJvd3Nlcj8ucnVudGltZT8uaWR9OiR7aW1wb3J0Lm1ldGEuZW52LkVOVFJZUE9JTlR9OiR7ZXZlbnROYW1lfWA7XG59XG4iLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMb2NhdGlvbldhdGNoZXIoY3R4KSB7XG4gIGxldCBpbnRlcnZhbDtcbiAgbGV0IG9sZFVybDtcbiAgcmV0dXJuIHtcbiAgICAvKipcbiAgICAgKiBFbnN1cmUgdGhlIGxvY2F0aW9uIHdhdGNoZXIgaXMgYWN0aXZlbHkgbG9va2luZyBmb3IgVVJMIGNoYW5nZXMuIElmIGl0J3MgYWxyZWFkeSB3YXRjaGluZyxcbiAgICAgKiB0aGlzIGlzIGEgbm9vcC5cbiAgICAgKi9cbiAgICBydW4oKSB7XG4gICAgICBpZiAoaW50ZXJ2YWwgIT0gbnVsbCkgcmV0dXJuO1xuICAgICAgb2xkVXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgIGludGVydmFsID0gY3R4LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgbGV0IG5ld1VybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG4gICAgICAgIGlmIChuZXdVcmwuaHJlZiAhPT0gb2xkVXJsLmhyZWYpIHtcbiAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIG9sZFVybCkpO1xuICAgICAgICAgIG9sZFVybCA9IG5ld1VybDtcbiAgICAgICAgfVxuICAgICAgfSwgMWUzKTtcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tIFwiLi4vdXRpbHMvaW50ZXJuYWwvbG9nZ2VyLm1qc1wiO1xuaW1wb3J0IHtcbiAgZ2V0VW5pcXVlRXZlbnROYW1lXG59IGZyb20gXCIuL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuZXhwb3J0IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcbiAgY29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBpZiAodGhpcy5pc1RvcEZyYW1lKSB7XG4gICAgICB0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cyh7IGlnbm9yZUZpcnN0RXZlbnQ6IHRydWUgfSk7XG4gICAgICB0aGlzLnN0b3BPbGRTY3JpcHRzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG4gICAgfVxuICB9XG4gIHN0YXRpYyBTQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXG4gICAgXCJ3eHQ6Y29udGVudC1zY3JpcHQtc3RhcnRlZFwiXG4gICk7XG4gIGlzVG9wRnJhbWUgPSB3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcDtcbiAgYWJvcnRDb250cm9sbGVyO1xuICBsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG4gIHJlY2VpdmVkTWVzc2FnZUlkcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIGdldCBzaWduYWwoKSB7XG4gICAgcmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcbiAgfVxuICBhYm9ydChyZWFzb24pIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcbiAgfVxuICBnZXQgaXNJbnZhbGlkKCkge1xuICAgIGlmIChicm93c2VyLnJ1bnRpbWUuaWQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcbiAgfVxuICBnZXQgaXNWYWxpZCgpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuICB9XG4gIC8qKlxuICAgKiBBZGQgYSBsaXN0ZW5lciB0aGF0IGlzIGNhbGxlZCB3aGVuIHRoZSBjb250ZW50IHNjcmlwdCdzIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoZSBsaXN0ZW5lci5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG4gICAqIGNvbnN0IHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIgPSBjdHgub25JbnZhbGlkYXRlZCgoKSA9PiB7XG4gICAqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihjYik7XG4gICAqIH0pXG4gICAqIC8vIC4uLlxuICAgKiByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG4gICAqL1xuICBvbkludmFsaWRhdGVkKGNiKSB7XG4gICAgdGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgICByZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgfVxuICAvKipcbiAgICogUmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLiBVc2VmdWwgaWYgeW91IGhhdmUgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBzaG91bGRuJ3QgcnVuXG4gICAqIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IGdldFZhbHVlRnJvbVN0b3JhZ2UgPSBhc3luYyAoKSA9PiB7XG4gICAqICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcbiAgICpcbiAgICogICAvLyAuLi5cbiAgICogfVxuICAgKi9cbiAgYmxvY2soKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHtcbiAgICB9KTtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKi9cbiAgc2V0VGltZW91dChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJUaW1lb3V0KGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICovXG4gIHJlcXVlc3RJZGxlQ2FsbGJhY2soY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgICBjb25zdCBpZCA9IHJlcXVlc3RJZGxlQ2FsbGJhY2soKC4uLmFyZ3MpID0+IHtcbiAgICAgIGlmICghdGhpcy5zaWduYWwuYWJvcnRlZCkgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgfSwgb3B0aW9ucyk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbElkbGVDYWxsYmFjayhpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICBhZGRFdmVudExpc3RlbmVyKHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucykge1xuICAgIGlmICh0eXBlID09PSBcInd4dDpsb2NhdGlvbmNoYW5nZVwiKSB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSB0aGlzLmxvY2F0aW9uV2F0Y2hlci5ydW4oKTtcbiAgICB9XG4gICAgdGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXI/LihcbiAgICAgIHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLFxuICAgICAgaGFuZGxlcixcbiAgICAgIHtcbiAgICAgICAgLi4ub3B0aW9ucyxcbiAgICAgICAgc2lnbmFsOiB0aGlzLnNpZ25hbFxuICAgICAgfVxuICAgICk7XG4gIH1cbiAgLyoqXG4gICAqIEBpbnRlcm5hbFxuICAgKiBBYm9ydCB0aGUgYWJvcnQgY29udHJvbGxlciBhbmQgZXhlY3V0ZSBhbGwgYG9uSW52YWxpZGF0ZWRgIGxpc3RlbmVycy5cbiAgICovXG4gIG5vdGlmeUludmFsaWRhdGVkKCkge1xuICAgIHRoaXMuYWJvcnQoXCJDb250ZW50IHNjcmlwdCBjb250ZXh0IGludmFsaWRhdGVkXCIpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBDb250ZW50IHNjcmlwdCBcIiR7dGhpcy5jb250ZW50U2NyaXB0TmFtZX1cIiBjb250ZXh0IGludmFsaWRhdGVkYFxuICAgICk7XG4gIH1cbiAgc3RvcE9sZFNjcmlwdHMoKSB7XG4gICAgd2luZG93LnBvc3RNZXNzYWdlKFxuICAgICAge1xuICAgICAgICB0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG4gICAgICAgIGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuICAgICAgICBtZXNzYWdlSWQ6IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpXG4gICAgICB9LFxuICAgICAgXCIqXCJcbiAgICApO1xuICB9XG4gIHZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkge1xuICAgIGNvbnN0IGlzU2NyaXB0U3RhcnRlZEV2ZW50ID0gZXZlbnQuZGF0YT8udHlwZSA9PT0gQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFO1xuICAgIGNvbnN0IGlzU2FtZUNvbnRlbnRTY3JpcHQgPSBldmVudC5kYXRhPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcbiAgICBjb25zdCBpc05vdER1cGxpY2F0ZSA9ICF0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5oYXMoZXZlbnQuZGF0YT8ubWVzc2FnZUlkKTtcbiAgICByZXR1cm4gaXNTY3JpcHRTdGFydGVkRXZlbnQgJiYgaXNTYW1lQ29udGVudFNjcmlwdCAmJiBpc05vdER1cGxpY2F0ZTtcbiAgfVxuICBsaXN0ZW5Gb3JOZXdlclNjcmlwdHMob3B0aW9ucykge1xuICAgIGxldCBpc0ZpcnN0ID0gdHJ1ZTtcbiAgICBjb25zdCBjYiA9IChldmVudCkgPT4ge1xuICAgICAgaWYgKHRoaXMudmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSkge1xuICAgICAgICB0aGlzLnJlY2VpdmVkTWVzc2FnZUlkcy5hZGQoZXZlbnQuZGF0YS5tZXNzYWdlSWQpO1xuICAgICAgICBjb25zdCB3YXNGaXJzdCA9IGlzRmlyc3Q7XG4gICAgICAgIGlzRmlyc3QgPSBmYWxzZTtcbiAgICAgICAgaWYgKHdhc0ZpcnN0ICYmIG9wdGlvbnM/Lmlnbm9yZUZpcnN0RXZlbnQpIHJldHVybjtcbiAgICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgICAgfVxuICAgIH07XG4gICAgYWRkRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgY2IpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiByZW1vdmVFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBjYikpO1xuICB9XG59XG4iXSwibmFtZXMiOlsiYnJvd3NlciIsIl9icm93c2VyIiwiZGVmaW5pdGlvbiIsIl9hIiwi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
