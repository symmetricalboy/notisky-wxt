var contentAuthDetector = function() {
  "use strict";
  var _a, _b;
  const browser$1 = ((_b = (_a = globalThis.browser) == null ? void 0 : _a.runtime) == null ? void 0 : _b.id) ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  console.log("Notisky auth detector content script loaded");
  function processAuthData(code, state) {
    console.log("Auth data detected:", { code, state });
    try {
      localStorage.setItem("notisky_auth_code", code);
      localStorage.setItem("notisky_auth_state", state);
      const messageData = {
        type: "oauth_callback",
        code,
        state
      };
      if (typeof browser !== "undefined" && browser.runtime && browser.runtime.sendMessage) {
        console.log("Sending auth data to extension background script via browser API");
        browser.runtime.sendMessage(messageData).then((response) => {
          console.log("Background script response:", response);
          notifySuccess();
        }).catch((error) => {
          console.error("Error sending message via browser API:", error);
          if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
            sendViaChrome(messageData);
          } else {
            throw error;
          }
        });
      } else if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        sendViaChrome(messageData);
      } else {
        console.error("Neither browser nor chrome runtime API available for sending messages");
        throw new Error("Extension messaging API not available");
      }
    } catch (error) {
      console.error("Error processing auth data:", error);
    }
  }
  function sendViaChrome(messageData) {
    console.log("Sending auth data to extension background script via Chrome API");
    chrome.runtime.sendMessage(messageData, (response) => {
      console.log("Background script response (Chrome API):", response);
      notifySuccess();
    });
  }
  function notifySuccess() {
    const event = new CustomEvent("notisky-auth-detected", {
      detail: { success: true }
    });
    document.dispatchEvent(event);
    window.dispatchEvent(event);
    const statusElement = document.getElementById("detection-status");
    if (statusElement) {
      statusElement.textContent = "Authentication data received by extension!";
      statusElement.style.color = "#4caf50";
    }
    const detectionComplete = document.getElementById("detection-complete");
    if (detectionComplete) {
      detectionComplete.style.display = "block";
    }
  }
  window.addEventListener("notisky-auth-available", (event) => {
    console.log("Detected notisky-auth-available event");
    const detail = event.detail || {};
    if (detail.code && detail.state) {
      processAuthData(detail.code, detail.state);
    } else {
      console.warn("Event data missing required fields:", detail);
    }
  });
  function checkDomForAuthData() {
    console.log("Checking DOM for auth data attributes");
    const authElement = document.getElementById("notisky-auth-data");
    if (authElement) {
      const code2 = authElement.getAttribute("data-code");
      const state2 = authElement.getAttribute("data-state");
      if (code2 && state2) {
        processAuthData(code2, state2);
        return true;
      }
    }
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    if (code && state) {
      console.log("Found auth data in URL parameters");
      processAuthData(code, state);
      return true;
    }
    return false;
  }
  function checkLocalStorageForAuthData() {
    console.log("Checking localStorage for auth data");
    const code = localStorage.getItem("notisky_auth_code");
    const state = localStorage.getItem("notisky_auth_state");
    if (code && state) {
      processAuthData(code, state);
      return true;
    }
    return false;
  }
  function isAuthSuccessPage() {
    try {
      if (typeof window !== "undefined" && window.location && window.location.href) {
        return window.location.href.includes("auth-success.html") || window.location.href.includes("auth/extension-callback") || window.location.href.includes("oauth=success");
      }
      return !!document.getElementById("notisky-auth-page") || !!document.getElementById("notisky-auth-data");
    } catch (error) {
      console.warn("Error checking page type:", error);
      return false;
    }
  }
  console.log("Running initial auth check immediately");
  if (isAuthSuccessPage()) {
    checkDomForAuthData() || checkLocalStorageForAuthData();
  }
  document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded, running auth data checks");
    if (!isAuthSuccessPage()) {
      console.log("Not on auth-success page, skipping auth detection");
      return;
    }
    if (checkDomForAuthData()) {
      console.log("Auth data found in DOM elements");
      return;
    }
    if (checkLocalStorageForAuthData()) {
      console.log("Auth data found in localStorage");
      return;
    }
    console.log("No auth data found on initial check, setting up interval");
    let checkCount = 0;
    const maxChecks = 10;
    const checkInterval = setInterval(() => {
      checkCount++;
      console.log(`Running periodic check ${checkCount}/${maxChecks}`);
      if (checkDomForAuthData() || checkLocalStorageForAuthData()) {
        console.log("Auth data found during periodic check");
        clearInterval(checkInterval);
        return;
      }
      if (checkCount >= maxChecks) {
        console.warn("Max checks reached, giving up on finding auth data");
        clearInterval(checkInterval);
        const statusElement = document.getElementById("detection-status");
        if (statusElement) {
          statusElement.textContent = "Could not find authentication data";
          statusElement.className = "error";
        }
      }
    }, 500);
  });
  const definition = {};
  contentAuthDetector;
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
      return await definition.main();
    } catch (err) {
      logger.error(
        `The unlisted script "${"content-auth-detector"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
}();
contentAuthDetector;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC1hdXRoLWRldGVjdG9yLmpzIiwic291cmNlcyI6WyIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vZW50cnlwb2ludHMvY29udGVudC1hdXRoLWRldGVjdG9yLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgX2Jyb3dzZXIgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBfYnJvd3NlcjtcbmV4cG9ydCB7fTtcbiIsIi8qKlxyXG4gKiBBdXRoIGRldGVjdG9yIGNvbnRlbnQgc2NyaXB0IGZvciB0aGUgTm90aXNreSBleHRlbnNpb25cclxuICogVGhpcyBzY3JpcHQgcnVucyBvbiB0aGUgYXV0aC1zdWNjZXNzLmh0bWwgcGFnZSB0byBkZXRlY3QgYW5kIGV4dHJhY3QgYXV0aGVudGljYXRpb24gZGF0YVxyXG4gKi9cclxuXHJcbmltcG9ydCB7IGJyb3dzZXIgfSBmcm9tICd3eHQvYnJvd3Nlcic7XHJcblxyXG5jb25zb2xlLmxvZygnTm90aXNreSBhdXRoIGRldGVjdG9yIGNvbnRlbnQgc2NyaXB0IGxvYWRlZCcpO1xyXG5cclxuLy8gRnVuY3Rpb24gdG8gcHJvY2VzcyBhdXRoIGRhdGEgYWZ0ZXIgaXQncyBmb3VuZFxyXG5mdW5jdGlvbiBwcm9jZXNzQXV0aERhdGEoY29kZTogc3RyaW5nLCBzdGF0ZTogc3RyaW5nKSB7XHJcbiAgLy8gTG9nIHRoZSBkYXRhIHdlIGZvdW5kXHJcbiAgY29uc29sZS5sb2coJ0F1dGggZGF0YSBkZXRlY3RlZDonLCB7IGNvZGUsIHN0YXRlIH0pO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gU3RvcmUgdGhlIGRhdGEgaW4gbG9jYWxTdG9yYWdlIGFzIGEgYmFja3VwXHJcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnbm90aXNreV9hdXRoX2NvZGUnLCBjb2RlKTtcclxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdub3Rpc2t5X2F1dGhfc3RhdGUnLCBzdGF0ZSk7XHJcbiAgICBcclxuICAgIC8vIEZvcm1hdCBkYXRhIHNwZWNpZmljYWxseSBmb3IgdGhlIGJhY2tncm91bmQgc2NyaXB0XHJcbiAgICBjb25zdCBtZXNzYWdlRGF0YSA9IHtcclxuICAgICAgdHlwZTogJ29hdXRoX2NhbGxiYWNrJyxcclxuICAgICAgY29kZSxcclxuICAgICAgc3RhdGVcclxuICAgIH07XHJcbiAgICBcclxuICAgIC8vIFRyeSB3aXRoIGJvdGggYnJvd3NlciBhbmQgY2hyb21lIEFQSXMgdG8gZW5zdXJlIGNvbXBhdGliaWxpdHlcclxuICAgIGlmICh0eXBlb2YgYnJvd3NlciAhPT0gJ3VuZGVmaW5lZCcgJiYgYnJvd3Nlci5ydW50aW1lICYmIGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnU2VuZGluZyBhdXRoIGRhdGEgdG8gZXh0ZW5zaW9uIGJhY2tncm91bmQgc2NyaXB0IHZpYSBicm93c2VyIEFQSScpO1xyXG4gICAgICBicm93c2VyLnJ1bnRpbWUuc2VuZE1lc3NhZ2UobWVzc2FnZURhdGEpXHJcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgY29uc29sZS5sb2coJ0JhY2tncm91bmQgc2NyaXB0IHJlc3BvbnNlOicsIHJlc3BvbnNlKTtcclxuICAgICAgICAgIG5vdGlmeVN1Y2Nlc3MoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzZW5kaW5nIG1lc3NhZ2UgdmlhIGJyb3dzZXIgQVBJOicsIGVycm9yKTtcclxuICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGNocm9tZSBBUElcclxuICAgICAgICAgIGlmICh0eXBlb2YgY2hyb21lICE9PSAndW5kZWZpbmVkJyAmJiBjaHJvbWUucnVudGltZSAmJiBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSkge1xyXG4gICAgICAgICAgICBzZW5kVmlhQ2hyb21lKG1lc3NhZ2VEYXRhKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgY2hyb21lICE9PSAndW5kZWZpbmVkJyAmJiBjaHJvbWUucnVudGltZSAmJiBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSkge1xyXG4gICAgICBzZW5kVmlhQ2hyb21lKG1lc3NhZ2VEYXRhKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ05laXRoZXIgYnJvd3NlciBub3IgY2hyb21lIHJ1bnRpbWUgQVBJIGF2YWlsYWJsZSBmb3Igc2VuZGluZyBtZXNzYWdlcycpO1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0V4dGVuc2lvbiBtZXNzYWdpbmcgQVBJIG5vdCBhdmFpbGFibGUnKTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgcHJvY2Vzc2luZyBhdXRoIGRhdGE6JywgZXJyb3IpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2VuZFZpYUNocm9tZShtZXNzYWdlRGF0YSkge1xyXG4gIGNvbnNvbGUubG9nKCdTZW5kaW5nIGF1dGggZGF0YSB0byBleHRlbnNpb24gYmFja2dyb3VuZCBzY3JpcHQgdmlhIENocm9tZSBBUEknKTtcclxuICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShtZXNzYWdlRGF0YSwgcmVzcG9uc2UgPT4ge1xyXG4gICAgY29uc29sZS5sb2coJ0JhY2tncm91bmQgc2NyaXB0IHJlc3BvbnNlIChDaHJvbWUgQVBJKTonLCByZXNwb25zZSk7XHJcbiAgICBub3RpZnlTdWNjZXNzKCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5vdGlmeVN1Y2Nlc3MoKSB7XHJcbiAgLy8gTm90aWZ5IHRoZSBwYWdlIHRoYXQgd2Ugc3VjY2Vzc2Z1bGx5IGV4dHJhY3RlZCB0aGUgZGF0YVxyXG4gIGNvbnN0IGV2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KCdub3Rpc2t5LWF1dGgtZGV0ZWN0ZWQnLCB7XHJcbiAgICBkZXRhaWw6IHsgc3VjY2VzczogdHJ1ZSB9XHJcbiAgfSk7XHJcbiAgZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChldmVudCk7XHJcbiAgd2luZG93LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xyXG4gIFxyXG4gIC8vIFVwZGF0ZSBVSSBlbGVtZW50cyBpZiB0aGV5IGV4aXN0XHJcbiAgY29uc3Qgc3RhdHVzRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZXRlY3Rpb24tc3RhdHVzJyk7XHJcbiAgaWYgKHN0YXR1c0VsZW1lbnQpIHtcclxuICAgIHN0YXR1c0VsZW1lbnQudGV4dENvbnRlbnQgPSAnQXV0aGVudGljYXRpb24gZGF0YSByZWNlaXZlZCBieSBleHRlbnNpb24hJztcclxuICAgIHN0YXR1c0VsZW1lbnQuc3R5bGUuY29sb3IgPSAnIzRjYWY1MCc7XHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IGRldGVjdGlvbkNvbXBsZXRlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RldGVjdGlvbi1jb21wbGV0ZScpO1xyXG4gIGlmIChkZXRlY3Rpb25Db21wbGV0ZSkge1xyXG4gICAgZGV0ZWN0aW9uQ29tcGxldGUuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBDaGVjayAxOiBMaXN0ZW4gZm9yIGN1c3RvbSBldmVudFxyXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbm90aXNreS1hdXRoLWF2YWlsYWJsZScsIChldmVudDogYW55KSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ0RldGVjdGVkIG5vdGlza3ktYXV0aC1hdmFpbGFibGUgZXZlbnQnKTtcclxuICBjb25zdCBkZXRhaWwgPSBldmVudC5kZXRhaWwgfHwge307XHJcbiAgXHJcbiAgaWYgKGRldGFpbC5jb2RlICYmIGRldGFpbC5zdGF0ZSkge1xyXG4gICAgcHJvY2Vzc0F1dGhEYXRhKGRldGFpbC5jb2RlLCBkZXRhaWwuc3RhdGUpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBjb25zb2xlLndhcm4oJ0V2ZW50IGRhdGEgbWlzc2luZyByZXF1aXJlZCBmaWVsZHM6JywgZGV0YWlsKTtcclxuICB9XHJcbn0pO1xyXG5cclxuLy8gQ2hlY2sgMjogQ2hlY2sgZm9yIGRhdGEgYXR0cmlidXRlcyBpbiBET01cclxuZnVuY3Rpb24gY2hlY2tEb21Gb3JBdXRoRGF0YSgpIHtcclxuICBjb25zb2xlLmxvZygnQ2hlY2tpbmcgRE9NIGZvciBhdXRoIGRhdGEgYXR0cmlidXRlcycpO1xyXG4gIFxyXG4gIGNvbnN0IGF1dGhFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25vdGlza3ktYXV0aC1kYXRhJyk7XHJcbiAgaWYgKGF1dGhFbGVtZW50KSB7XHJcbiAgICBjb25zdCBjb2RlID0gYXV0aEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWNvZGUnKTtcclxuICAgIGNvbnN0IHN0YXRlID0gYXV0aEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLXN0YXRlJyk7XHJcbiAgICBcclxuICAgIGlmIChjb2RlICYmIHN0YXRlKSB7XHJcbiAgICAgIHByb2Nlc3NBdXRoRGF0YShjb2RlLCBzdGF0ZSk7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gIH1cclxuICBcclxuICAvLyBDaGVjayBVUkwgcGFyYW1ldGVycyBkaXJlY3RseVxyXG4gIGNvbnN0IHVybFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XHJcbiAgY29uc3QgY29kZSA9IHVybFBhcmFtcy5nZXQoJ2NvZGUnKTtcclxuICBjb25zdCBzdGF0ZSA9IHVybFBhcmFtcy5nZXQoJ3N0YXRlJyk7XHJcbiAgXHJcbiAgaWYgKGNvZGUgJiYgc3RhdGUpIHtcclxuICAgIGNvbnNvbGUubG9nKCdGb3VuZCBhdXRoIGRhdGEgaW4gVVJMIHBhcmFtZXRlcnMnKTtcclxuICAgIHByb2Nlc3NBdXRoRGF0YShjb2RlLCBzdGF0ZSk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbiAgXHJcbiAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vLyBDaGVjayAzOiBDaGVjayBsb2NhbFN0b3JhZ2VcclxuZnVuY3Rpb24gY2hlY2tMb2NhbFN0b3JhZ2VGb3JBdXRoRGF0YSgpIHtcclxuICBjb25zb2xlLmxvZygnQ2hlY2tpbmcgbG9jYWxTdG9yYWdlIGZvciBhdXRoIGRhdGEnKTtcclxuICBcclxuICBjb25zdCBjb2RlID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ25vdGlza3lfYXV0aF9jb2RlJyk7XHJcbiAgY29uc3Qgc3RhdGUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnbm90aXNreV9hdXRoX3N0YXRlJyk7XHJcbiAgXHJcbiAgaWYgKGNvZGUgJiYgc3RhdGUpIHtcclxuICAgIHByb2Nlc3NBdXRoRGF0YShjb2RlLCBzdGF0ZSk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbiAgXHJcbiAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY2hlY2sgaWYgd2UncmUgb24gYW4gYXV0aC1zdWNjZXNzIHBhZ2VcclxuZnVuY3Rpb24gaXNBdXRoU3VjY2Vzc1BhZ2UoKSB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIENoZWNrIFVSTCBwYXR0ZXJuIGlmIHdpbmRvdy5sb2NhdGlvbiBpcyBhdmFpbGFibGVcclxuICAgIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cubG9jYXRpb24gJiYgd2luZG93LmxvY2F0aW9uLmhyZWYpIHtcclxuICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5ocmVmLmluY2x1ZGVzKCdhdXRoLXN1Y2Nlc3MuaHRtbCcpIHx8IFxyXG4gICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhyZWYuaW5jbHVkZXMoJ2F1dGgvZXh0ZW5zaW9uLWNhbGxiYWNrJykgfHxcclxuICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmLmluY2x1ZGVzKCdvYXV0aD1zdWNjZXNzJyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEZhbGxiYWNrOiBjaGVjayBmb3Igc3BlY2lmaWMgZWxlbWVudCB0aGF0IHNob3VsZCBvbmx5IGJlIG9uIG91ciBhdXRoIHN1Y2Nlc3MgcGFnZVxyXG4gICAgcmV0dXJuICEhZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25vdGlza3ktYXV0aC1wYWdlJykgfHwgXHJcbiAgICAgICAgICAgISFkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbm90aXNreS1hdXRoLWRhdGEnKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS53YXJuKCdFcnJvciBjaGVja2luZyBwYWdlIHR5cGU6JywgZXJyb3IpO1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxufVxyXG5cclxuLy8gUnVuIGNoZWNrcyByaWdodCBhd2F5LCBkb24ndCB3YWl0IGZvciBET01Db250ZW50TG9hZGVkXHJcbmNvbnNvbGUubG9nKCdSdW5uaW5nIGluaXRpYWwgYXV0aCBjaGVjayBpbW1lZGlhdGVseScpO1xyXG5pZiAoaXNBdXRoU3VjY2Vzc1BhZ2UoKSkge1xyXG4gIGNoZWNrRG9tRm9yQXV0aERhdGEoKSB8fCBjaGVja0xvY2FsU3RvcmFnZUZvckF1dGhEYXRhKCk7XHJcbn1cclxuXHJcbi8vIEFsc28gcnVuIGNoZWNrcyB3aGVuIERPTSBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICBjb25zb2xlLmxvZygnRE9NIGZ1bGx5IGxvYWRlZCwgcnVubmluZyBhdXRoIGRhdGEgY2hlY2tzJyk7XHJcbiAgXHJcbiAgLy8gT25seSBydW4gb24gYXV0aC1zdWNjZXNzLmh0bWwgcGFnZXNcclxuICBpZiAoIWlzQXV0aFN1Y2Nlc3NQYWdlKCkpIHtcclxuICAgIGNvbnNvbGUubG9nKCdOb3Qgb24gYXV0aC1zdWNjZXNzIHBhZ2UsIHNraXBwaW5nIGF1dGggZGV0ZWN0aW9uJyk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG4gIFxyXG4gIC8vIFRyeSBET00gY2hlY2sgZmlyc3RcclxuICBpZiAoY2hlY2tEb21Gb3JBdXRoRGF0YSgpKSB7XHJcbiAgICBjb25zb2xlLmxvZygnQXV0aCBkYXRhIGZvdW5kIGluIERPTSBlbGVtZW50cycpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBcclxuICAvLyBUaGVuIHRyeSBsb2NhbFN0b3JhZ2VcclxuICBpZiAoY2hlY2tMb2NhbFN0b3JhZ2VGb3JBdXRoRGF0YSgpKSB7XHJcbiAgICBjb25zb2xlLmxvZygnQXV0aCBkYXRhIGZvdW5kIGluIGxvY2FsU3RvcmFnZScpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBcclxuICBjb25zb2xlLmxvZygnTm8gYXV0aCBkYXRhIGZvdW5kIG9uIGluaXRpYWwgY2hlY2ssIHNldHRpbmcgdXAgaW50ZXJ2YWwnKTtcclxuICBcclxuICAvLyBJZiBpbml0aWFsIGNoZWNrcyBmYWlsLCBzZXQgdXAgYSBwZXJpb2RpYyBjaGVja1xyXG4gIC8vIFRoaXMgaGVscHMgaW4gY2FzZSB0aGUgcGFnZSBsb2FkcyBhdXRoIGRhdGEgZHluYW1pY2FsbHlcclxuICBsZXQgY2hlY2tDb3VudCA9IDA7XHJcbiAgY29uc3QgbWF4Q2hlY2tzID0gMTA7XHJcbiAgY29uc3QgY2hlY2tJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcclxuICAgIGNoZWNrQ291bnQrKztcclxuICAgIGNvbnNvbGUubG9nKGBSdW5uaW5nIHBlcmlvZGljIGNoZWNrICR7Y2hlY2tDb3VudH0vJHttYXhDaGVja3N9YCk7XHJcbiAgICBcclxuICAgIGlmIChjaGVja0RvbUZvckF1dGhEYXRhKCkgfHwgY2hlY2tMb2NhbFN0b3JhZ2VGb3JBdXRoRGF0YSgpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdBdXRoIGRhdGEgZm91bmQgZHVyaW5nIHBlcmlvZGljIGNoZWNrJyk7XHJcbiAgICAgIGNsZWFySW50ZXJ2YWwoY2hlY2tJbnRlcnZhbCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKGNoZWNrQ291bnQgPj0gbWF4Q2hlY2tzKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybignTWF4IGNoZWNrcyByZWFjaGVkLCBnaXZpbmcgdXAgb24gZmluZGluZyBhdXRoIGRhdGEnKTtcclxuICAgICAgY2xlYXJJbnRlcnZhbChjaGVja0ludGVydmFsKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFVwZGF0ZSBVSSBlbGVtZW50cyBpZiB0aGV5IGV4aXN0IHRvIHNob3cgZXJyb3JcclxuICAgICAgY29uc3Qgc3RhdHVzRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZXRlY3Rpb24tc3RhdHVzJyk7XHJcbiAgICAgIGlmIChzdGF0dXNFbGVtZW50KSB7XHJcbiAgICAgICAgc3RhdHVzRWxlbWVudC50ZXh0Q29udGVudCA9ICdDb3VsZCBub3QgZmluZCBhdXRoZW50aWNhdGlvbiBkYXRhJztcclxuICAgICAgICBzdGF0dXNFbGVtZW50LmNsYXNzTmFtZSA9ICdlcnJvcic7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9LCA1MDApO1xyXG59KTtcclxuXHJcbi8vIEV4cG9ydCBhIGR1bW15IGZ1bmN0aW9uIHRvIHNhdGlzZnkgV1hUJ3MgZGVmYXVsdCBleHBvcnQgcmVxdWlyZW1lbnRcclxuZXhwb3J0IGRlZmF1bHQge307ICJdLCJuYW1lcyI6WyJicm93c2VyIiwiX2Jyb3dzZXIiLCJjb2RlIiwic3RhdGUiXSwibWFwcGluZ3MiOiI7OztBQUNPLFFBQU1BLGNBQVUsc0JBQVcsWUFBWCxtQkFBb0IsWUFBcEIsbUJBQTZCLE1BQ2hELFdBQVcsVUFDWCxXQUFXO0FDRlIsUUFBTSxVQUFVQztBQ012QixVQUFRLElBQUksNkNBQTZDO0FBR3pELFdBQVMsZ0JBQWdCLE1BQWMsT0FBZTtBQUVwRCxZQUFRLElBQUksdUJBQXVCLEVBQUUsTUFBTSxPQUFPO0FBRTlDLFFBQUE7QUFFVyxtQkFBQSxRQUFRLHFCQUFxQixJQUFJO0FBQ2pDLG1CQUFBLFFBQVEsc0JBQXNCLEtBQUs7QUFHaEQsWUFBTSxjQUFjO0FBQUEsUUFDbEIsTUFBTTtBQUFBLFFBQ047QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUdBLFVBQUksT0FBTyxZQUFZLGVBQWUsUUFBUSxXQUFXLFFBQVEsUUFBUSxhQUFhO0FBQ3BGLGdCQUFRLElBQUksa0VBQWtFO0FBQzlFLGdCQUFRLFFBQVEsWUFBWSxXQUFXLEVBQ3BDLEtBQUssQ0FBWSxhQUFBO0FBQ1Isa0JBQUEsSUFBSSwrQkFBK0IsUUFBUTtBQUNyQyx3QkFBQTtBQUFBLFFBQUEsQ0FDZixFQUNBLE1BQU0sQ0FBUyxVQUFBO0FBQ04sa0JBQUEsTUFBTSwwQ0FBMEMsS0FBSztBQUU3RCxjQUFJLE9BQU8sV0FBVyxlQUFlLE9BQU8sV0FBVyxPQUFPLFFBQVEsYUFBYTtBQUNqRiwwQkFBYyxXQUFXO0FBQUEsVUFBQSxPQUNwQjtBQUNDLGtCQUFBO0FBQUEsVUFBQTtBQUFBLFFBQ1IsQ0FDRDtBQUFBLE1BQUEsV0FDTSxPQUFPLFdBQVcsZUFBZSxPQUFPLFdBQVcsT0FBTyxRQUFRLGFBQWE7QUFDeEYsc0JBQWMsV0FBVztBQUFBLE1BQUEsT0FDcEI7QUFDTCxnQkFBUSxNQUFNLHVFQUF1RTtBQUMvRSxjQUFBLElBQUksTUFBTSx1Q0FBdUM7QUFB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
