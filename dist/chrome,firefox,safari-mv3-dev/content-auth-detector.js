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
        console.log("Sending auth data to extension background script");
        browser.runtime.sendMessage(messageData).then((response) => {
          console.log("Background script response:", response);
          const event = new CustomEvent("notisky-auth-detected", {
            detail: { success: true }
          });
          document.dispatchEvent(event);
          const statusElement = document.getElementById("auth-status");
          if (statusElement) {
            statusElement.textContent = "Authentication data received by extension";
            statusElement.className = "success";
          }
        }).catch((error) => {
          console.error("Error sending message to background script:", error);
          const event = new CustomEvent("notisky-auth-detected", {
            detail: { success: false, error }
          });
          document.dispatchEvent(event);
        });
      } else {
        console.error("Browser runtime API not available for sending messages");
        throw new Error("Browser runtime API not available");
      }
    } catch (error) {
      console.error("Error processing auth data:", error);
    }
  }
  document.addEventListener("notisky-auth-available", (event) => {
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
      const code = authElement.getAttribute("data-code");
      const state = authElement.getAttribute("data-state");
      if (code && state) {
        processAuthData(code, state);
        return true;
      }
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
        return window.location.href.includes("auth-success.html");
      }
      return !!document.getElementById("notisky-auth-page") || !!document.getElementById("notisky-auth-data");
    } catch (error) {
      console.warn("Error checking page type:", error);
      return false;
    }
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
        const statusElement = document.getElementById("auth-status");
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC1hdXRoLWRldGVjdG9yLmpzIiwic291cmNlcyI6WyIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vZW50cnlwb2ludHMvY29udGVudC1hdXRoLWRldGVjdG9yLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgX2Jyb3dzZXIgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBfYnJvd3NlcjtcbmV4cG9ydCB7fTtcbiIsIi8qKlxyXG4gKiBBdXRoIGRldGVjdG9yIGNvbnRlbnQgc2NyaXB0IGZvciB0aGUgTm90aXNreSBleHRlbnNpb25cclxuICogVGhpcyBzY3JpcHQgcnVucyBvbiB0aGUgYXV0aC1zdWNjZXNzLmh0bWwgcGFnZSB0byBkZXRlY3QgYW5kIGV4dHJhY3QgYXV0aGVudGljYXRpb24gZGF0YVxyXG4gKi9cclxuXHJcbmltcG9ydCB7IGJyb3dzZXIgfSBmcm9tICd3eHQvYnJvd3Nlcic7XHJcblxyXG5jb25zb2xlLmxvZygnTm90aXNreSBhdXRoIGRldGVjdG9yIGNvbnRlbnQgc2NyaXB0IGxvYWRlZCcpO1xyXG5cclxuLy8gRnVuY3Rpb24gdG8gcHJvY2VzcyBhdXRoIGRhdGEgYWZ0ZXIgaXQncyBmb3VuZFxyXG5mdW5jdGlvbiBwcm9jZXNzQXV0aERhdGEoY29kZTogc3RyaW5nLCBzdGF0ZTogc3RyaW5nKSB7XHJcbiAgLy8gTG9nIHRoZSBkYXRhIHdlIGZvdW5kXHJcbiAgY29uc29sZS5sb2coJ0F1dGggZGF0YSBkZXRlY3RlZDonLCB7IGNvZGUsIHN0YXRlIH0pO1xyXG5cclxuICB0cnkge1xyXG4gICAgLy8gU3RvcmUgdGhlIGRhdGEgaW4gbG9jYWxTdG9yYWdlIGFzIGEgYmFja3VwXHJcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnbm90aXNreV9hdXRoX2NvZGUnLCBjb2RlKTtcclxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdub3Rpc2t5X2F1dGhfc3RhdGUnLCBzdGF0ZSk7XHJcbiAgICBcclxuICAgIC8vIEZvcm1hdCBkYXRhIHNwZWNpZmljYWxseSBmb3IgdGhlIGJhY2tncm91bmQgc2NyaXB0XHJcbiAgICBjb25zdCBtZXNzYWdlRGF0YSA9IHtcclxuICAgICAgdHlwZTogJ29hdXRoX2NhbGxiYWNrJyxcclxuICAgICAgY29kZSxcclxuICAgICAgc3RhdGVcclxuICAgIH07XHJcbiAgICBcclxuICAgIC8vIFNlbmQgbWVzc2FnZSB0byBiYWNrZ3JvdW5kIHNjcmlwdFxyXG4gICAgaWYgKHR5cGVvZiBicm93c2VyICE9PSAndW5kZWZpbmVkJyAmJiBicm93c2VyLnJ1bnRpbWUgJiYgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdTZW5kaW5nIGF1dGggZGF0YSB0byBleHRlbnNpb24gYmFja2dyb3VuZCBzY3JpcHQnKTtcclxuICAgICAgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKG1lc3NhZ2VEYXRhKVxyXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdCYWNrZ3JvdW5kIHNjcmlwdCByZXNwb25zZTonLCByZXNwb25zZSk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIE5vdGlmeSB0aGUgcGFnZSB0aGF0IHdlIHN1Y2Nlc3NmdWxseSBleHRyYWN0ZWQgdGhlIGRhdGFcclxuICAgICAgICAgIGNvbnN0IGV2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KCdub3Rpc2t5LWF1dGgtZGV0ZWN0ZWQnLCB7XHJcbiAgICAgICAgICAgIGRldGFpbDogeyBzdWNjZXNzOiB0cnVlIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChldmVudCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIFVwZGF0ZSBVSSBlbGVtZW50cyBpZiB0aGV5IGV4aXN0XHJcbiAgICAgICAgICBjb25zdCBzdGF0dXNFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F1dGgtc3RhdHVzJyk7XHJcbiAgICAgICAgICBpZiAoc3RhdHVzRWxlbWVudCkge1xyXG4gICAgICAgICAgICBzdGF0dXNFbGVtZW50LnRleHRDb250ZW50ID0gJ0F1dGhlbnRpY2F0aW9uIGRhdGEgcmVjZWl2ZWQgYnkgZXh0ZW5zaW9uJztcclxuICAgICAgICAgICAgc3RhdHVzRWxlbWVudC5jbGFzc05hbWUgPSAnc3VjY2Vzcyc7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc2VuZGluZyBtZXNzYWdlIHRvIGJhY2tncm91bmQgc2NyaXB0OicsIGVycm9yKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gTm90aWZ5IHRoZSBwYWdlIGFib3V0IHRoZSBlcnJvclxyXG4gICAgICAgICAgY29uc3QgZXZlbnQgPSBuZXcgQ3VzdG9tRXZlbnQoJ25vdGlza3ktYXV0aC1kZXRlY3RlZCcsIHtcclxuICAgICAgICAgICAgZGV0YWlsOiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvciB9XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGRvY3VtZW50LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5lcnJvcignQnJvd3NlciBydW50aW1lIEFQSSBub3QgYXZhaWxhYmxlIGZvciBzZW5kaW5nIG1lc3NhZ2VzJyk7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignQnJvd3NlciBydW50aW1lIEFQSSBub3QgYXZhaWxhYmxlJyk7XHJcbiAgICB9XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgYXV0aCBkYXRhOicsIGVycm9yKTtcclxuICB9XHJcbn1cclxuXHJcbi8vIENoZWNrIDE6IExpc3RlbiBmb3IgY3VzdG9tIGV2ZW50XHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ25vdGlza3ktYXV0aC1hdmFpbGFibGUnLCAoZXZlbnQ6IGFueSkgPT4ge1xyXG4gIGNvbnNvbGUubG9nKCdEZXRlY3RlZCBub3Rpc2t5LWF1dGgtYXZhaWxhYmxlIGV2ZW50Jyk7XHJcbiAgY29uc3QgZGV0YWlsID0gZXZlbnQuZGV0YWlsIHx8IHt9O1xyXG4gIFxyXG4gIGlmIChkZXRhaWwuY29kZSAmJiBkZXRhaWwuc3RhdGUpIHtcclxuICAgIHByb2Nlc3NBdXRoRGF0YShkZXRhaWwuY29kZSwgZGV0YWlsLnN0YXRlKTtcclxuICB9IGVsc2Uge1xyXG4gICAgY29uc29sZS53YXJuKCdFdmVudCBkYXRhIG1pc3NpbmcgcmVxdWlyZWQgZmllbGRzOicsIGRldGFpbCk7XHJcbiAgfVxyXG59KTtcclxuXHJcbi8vIENoZWNrIDI6IENoZWNrIGZvciBkYXRhIGF0dHJpYnV0ZXMgaW4gRE9NXHJcbmZ1bmN0aW9uIGNoZWNrRG9tRm9yQXV0aERhdGEoKSB7XHJcbiAgY29uc29sZS5sb2coJ0NoZWNraW5nIERPTSBmb3IgYXV0aCBkYXRhIGF0dHJpYnV0ZXMnKTtcclxuICBcclxuICBjb25zdCBhdXRoRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdub3Rpc2t5LWF1dGgtZGF0YScpO1xyXG4gIGlmIChhdXRoRWxlbWVudCkge1xyXG4gICAgY29uc3QgY29kZSA9IGF1dGhFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1jb2RlJyk7XHJcbiAgICBjb25zdCBzdGF0ZSA9IGF1dGhFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1zdGF0ZScpO1xyXG4gICAgXHJcbiAgICBpZiAoY29kZSAmJiBzdGF0ZSkge1xyXG4gICAgICBwcm9jZXNzQXV0aERhdGEoY29kZSwgc3RhdGUpO1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICB9XHJcbiAgXHJcbiAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vLyBDaGVjayAzOiBDaGVjayBsb2NhbFN0b3JhZ2VcclxuZnVuY3Rpb24gY2hlY2tMb2NhbFN0b3JhZ2VGb3JBdXRoRGF0YSgpIHtcclxuICBjb25zb2xlLmxvZygnQ2hlY2tpbmcgbG9jYWxTdG9yYWdlIGZvciBhdXRoIGRhdGEnKTtcclxuICBcclxuICBjb25zdCBjb2RlID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ25vdGlza3lfYXV0aF9jb2RlJyk7XHJcbiAgY29uc3Qgc3RhdGUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnbm90aXNreV9hdXRoX3N0YXRlJyk7XHJcbiAgXHJcbiAgaWYgKGNvZGUgJiYgc3RhdGUpIHtcclxuICAgIHByb2Nlc3NBdXRoRGF0YShjb2RlLCBzdGF0ZSk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbiAgXHJcbiAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY2hlY2sgaWYgd2UncmUgb24gYW4gYXV0aC1zdWNjZXNzIHBhZ2VcclxuZnVuY3Rpb24gaXNBdXRoU3VjY2Vzc1BhZ2UoKSB7XHJcbiAgdHJ5IHtcclxuICAgIC8vIENoZWNrIFVSTCBwYXR0ZXJuIGlmIHdpbmRvdy5sb2NhdGlvbiBpcyBhdmFpbGFibGVcclxuICAgIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cubG9jYXRpb24gJiYgd2luZG93LmxvY2F0aW9uLmhyZWYpIHtcclxuICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5ocmVmLmluY2x1ZGVzKCdhdXRoLXN1Y2Nlc3MuaHRtbCcpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGYWxsYmFjazogY2hlY2sgZm9yIHNwZWNpZmljIGVsZW1lbnQgdGhhdCBzaG91bGQgb25seSBiZSBvbiBvdXIgYXV0aCBzdWNjZXNzIHBhZ2VcclxuICAgIHJldHVybiAhIWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdub3Rpc2t5LWF1dGgtcGFnZScpIHx8IFxyXG4gICAgICAgICAgICEhZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25vdGlza3ktYXV0aC1kYXRhJyk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUud2FybignRXJyb3IgY2hlY2tpbmcgcGFnZSB0eXBlOicsIGVycm9yKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcbn1cclxuXHJcbi8vIFJ1biBjaGVja3Mgd2hlbiBET00gaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgY29uc29sZS5sb2coJ0RPTSBmdWxseSBsb2FkZWQsIHJ1bm5pbmcgYXV0aCBkYXRhIGNoZWNrcycpO1xyXG4gIFxyXG4gIC8vIE9ubHkgcnVuIG9uIGF1dGgtc3VjY2Vzcy5odG1sIHBhZ2VzXHJcbiAgaWYgKCFpc0F1dGhTdWNjZXNzUGFnZSgpKSB7XHJcbiAgICBjb25zb2xlLmxvZygnTm90IG9uIGF1dGgtc3VjY2VzcyBwYWdlLCBza2lwcGluZyBhdXRoIGRldGVjdGlvbicpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBcclxuICAvLyBUcnkgRE9NIGNoZWNrIGZpcnN0XHJcbiAgaWYgKGNoZWNrRG9tRm9yQXV0aERhdGEoKSkge1xyXG4gICAgY29uc29sZS5sb2coJ0F1dGggZGF0YSBmb3VuZCBpbiBET00gZWxlbWVudHMnKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgXHJcbiAgLy8gVGhlbiB0cnkgbG9jYWxTdG9yYWdlXHJcbiAgaWYgKGNoZWNrTG9jYWxTdG9yYWdlRm9yQXV0aERhdGEoKSkge1xyXG4gICAgY29uc29sZS5sb2coJ0F1dGggZGF0YSBmb3VuZCBpbiBsb2NhbFN0b3JhZ2UnKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgXHJcbiAgY29uc29sZS5sb2coJ05vIGF1dGggZGF0YSBmb3VuZCBvbiBpbml0aWFsIGNoZWNrLCBzZXR0aW5nIHVwIGludGVydmFsJyk7XHJcbiAgXHJcbiAgLy8gSWYgaW5pdGlhbCBjaGVja3MgZmFpbCwgc2V0IHVwIGEgcGVyaW9kaWMgY2hlY2tcclxuICAvLyBUaGlzIGhlbHBzIGluIGNhc2UgdGhlIHBhZ2UgbG9hZHMgYXV0aCBkYXRhIGR5bmFtaWNhbGx5XHJcbiAgbGV0IGNoZWNrQ291bnQgPSAwO1xyXG4gIGNvbnN0IG1heENoZWNrcyA9IDEwO1xyXG4gIGNvbnN0IGNoZWNrSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICBjaGVja0NvdW50Kys7XHJcbiAgICBjb25zb2xlLmxvZyhgUnVubmluZyBwZXJpb2RpYyBjaGVjayAke2NoZWNrQ291bnR9LyR7bWF4Q2hlY2tzfWApO1xyXG4gICAgXHJcbiAgICBpZiAoY2hlY2tEb21Gb3JBdXRoRGF0YSgpIHx8IGNoZWNrTG9jYWxTdG9yYWdlRm9yQXV0aERhdGEoKSkge1xyXG4gICAgICBjb25zb2xlLmxvZygnQXV0aCBkYXRhIGZvdW5kIGR1cmluZyBwZXJpb2RpYyBjaGVjaycpO1xyXG4gICAgICBjbGVhckludGVydmFsKGNoZWNrSW50ZXJ2YWwpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlmIChjaGVja0NvdW50ID49IG1heENoZWNrcykge1xyXG4gICAgICBjb25zb2xlLndhcm4oJ01heCBjaGVja3MgcmVhY2hlZCwgZ2l2aW5nIHVwIG9uIGZpbmRpbmcgYXV0aCBkYXRhJyk7XHJcbiAgICAgIGNsZWFySW50ZXJ2YWwoY2hlY2tJbnRlcnZhbCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBVcGRhdGUgVUkgZWxlbWVudHMgaWYgdGhleSBleGlzdCB0byBzaG93IGVycm9yXHJcbiAgICAgIGNvbnN0IHN0YXR1c0VsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXV0aC1zdGF0dXMnKTtcclxuICAgICAgaWYgKHN0YXR1c0VsZW1lbnQpIHtcclxuICAgICAgICBzdGF0dXNFbGVtZW50LnRleHRDb250ZW50ID0gJ0NvdWxkIG5vdCBmaW5kIGF1dGhlbnRpY2F0aW9uIGRhdGEnO1xyXG4gICAgICAgIHN0YXR1c0VsZW1lbnQuY2xhc3NOYW1lID0gJ2Vycm9yJztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0sIDUwMCk7XHJcbn0pO1xyXG5cclxuLy8gRXhwb3J0IGEgZHVtbXkgZnVuY3Rpb24gdG8gc2F0aXNmeSBXWFQncyBkZWZhdWx0IGV4cG9ydCByZXF1aXJlbWVudFxyXG5leHBvcnQgZGVmYXVsdCB7fTsgIl0sIm5hbWVzIjpbImJyb3dzZXIiLCJfYnJvd3NlciJdLCJtYXBwaW5ncyI6Ijs7O0FBQ08sUUFBTUEsY0FBVSxzQkFBVyxZQUFYLG1CQUFvQixZQUFwQixtQkFBNkIsTUFDaEQsV0FBVyxVQUNYLFdBQVc7QUNGUixRQUFNLFVBQVVDO0FDTXZCLFVBQVEsSUFBSSw2Q0FBNkM7QUFHekQsV0FBUyxnQkFBZ0IsTUFBYyxPQUFlO0FBRXBELFlBQVEsSUFBSSx1QkFBdUIsRUFBRSxNQUFNLE9BQU87QUFFOUMsUUFBQTtBQUVXLG1CQUFBLFFBQVEscUJBQXFCLElBQUk7QUFDakMsbUJBQUEsUUFBUSxzQkFBc0IsS0FBSztBQUdoRCxZQUFNLGNBQWM7QUFBQSxRQUNsQixNQUFNO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBR0EsVUFBSSxPQUFPLFlBQVksZUFBZSxRQUFRLFdBQVcsUUFBUSxRQUFRLGFBQWE7QUFDcEYsZ0JBQVEsSUFBSSxrREFBa0Q7QUFDOUQsZ0JBQVEsUUFBUSxZ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
