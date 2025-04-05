var contentAuthCallback = function() {
  "use strict";
  console.log("Notisky auth callback content script loaded");
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("message", function(event) {
      if (event.origin.includes("notisky.symm.app")) {
        console.log("Received message from auth server page:", event.data);
        if (event.data && event.data.source === "notisky-auth") {
          console.log("Processing auth callback from window.postMessage");
          const { code, state } = event.data;
          if (code && state) {
            chrome.runtime.sendMessage({
              type: "oauth_callback",
              code,
              state
            }).then((response) => {
              console.log("Auth callback processed by background script:", response);
              window.postMessage(
                { source: "notisky-extension", success: true },
                "*"
              );
            }).catch((err) => {
              console.error("Error processing auth callback:", err);
              window.postMessage(
                { source: "notisky-extension", success: false, error: err.message },
                "*"
              );
            });
          }
        }
      }
    });
    document.addEventListener("DOMContentLoaded", () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const state = urlParams.get("state");
        const error = urlParams.get("error");
        if (error) {
          console.error("Auth error:", error);
        } else if (code && state) {
          console.log("Auth code received in URL params, processing...");
          chrome.runtime.sendMessage({
            type: "oauth_callback",
            code,
            state
          }).then((response) => {
            console.log("Auth callback processed by background script:", response);
          }).catch((err) => {
            console.error("Error processing auth callback:", err);
          });
        }
      } catch (err) {
        console.error("Error in auth callback script:", err);
      }
    });
  }
  const definition = {};
  contentAuthCallback;
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
        `The unlisted script "${"content-auth-callback"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
}();
contentAuthCallback;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC1hdXRoLWNhbGxiYWNrLmpzIiwic291cmNlcyI6WyIuLi8uLi9lbnRyeXBvaW50cy9jb250ZW50LWF1dGgtY2FsbGJhY2sudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIEF1dGggY2FsbGJhY2sgaGFuZGxlciBmb3IgdGhlIE5vdGlza3kgZXh0ZW5zaW9uXHJcbiAqIFRoaXMgc2NyaXB0IHJ1bnMgb24gdGhlIGF1dGggY2FsbGJhY2sgcGFnZXNcclxuICovXHJcblxyXG5jb25zb2xlLmxvZygnTm90aXNreSBhdXRoIGNhbGxiYWNrIGNvbnRlbnQgc2NyaXB0IGxvYWRlZCcpO1xyXG5cclxuLy8gU2FmZXR5IGNoZWNrIHRvIG1ha2Ugc3VyZSB3ZSdyZSBpbiBhIGJyb3dzZXIgZW52aXJvbm1lbnRcclxuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAvLyBMaXN0ZW4gZm9yIG1lc3NhZ2VzIHNlbnQgZnJvbSB0aGUgcGFnZSB0byB0aGUgY29udGVudCBzY3JpcHRcclxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uKGV2ZW50KSB7XHJcbiAgICAvLyBPbmx5IGFjY2VwdCBtZXNzYWdlcyBmcm9tIG91ciBhdXRoIHNlcnZlclxyXG4gICAgaWYgKGV2ZW50Lm9yaWdpbi5pbmNsdWRlcygnbm90aXNreS5zeW1tLmFwcCcpKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdSZWNlaXZlZCBtZXNzYWdlIGZyb20gYXV0aCBzZXJ2ZXIgcGFnZTonLCBldmVudC5kYXRhKTtcclxuICAgICAgXHJcbiAgICAgIC8vIENoZWNrIGlmIGl0J3MgYW4gYXV0aCBtZXNzYWdlIGZyb20gb3VyIGF1dGggc2VydmVyXHJcbiAgICAgIGlmIChldmVudC5kYXRhICYmIGV2ZW50LmRhdGEuc291cmNlID09PSAnbm90aXNreS1hdXRoJykge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdQcm9jZXNzaW5nIGF1dGggY2FsbGJhY2sgZnJvbSB3aW5kb3cucG9zdE1lc3NhZ2UnKTtcclxuICAgICAgICBjb25zdCB7IGNvZGUsIHN0YXRlIH0gPSBldmVudC5kYXRhO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjb2RlICYmIHN0YXRlKSB7XHJcbiAgICAgICAgICAvLyBGb3J3YXJkIHRoZSBtZXNzYWdlIHRvIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdFxyXG4gICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgICB0eXBlOiAnb2F1dGhfY2FsbGJhY2snLFxyXG4gICAgICAgICAgICBjb2RlLFxyXG4gICAgICAgICAgICBzdGF0ZVxyXG4gICAgICAgICAgfSkudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdBdXRoIGNhbGxiYWNrIHByb2Nlc3NlZCBieSBiYWNrZ3JvdW5kIHNjcmlwdDonLCByZXNwb25zZSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBTZW5kIGNvbmZpcm1hdGlvbiBiYWNrIHRvIHRoZSBwYWdlXHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZShcclxuICAgICAgICAgICAgICB7IHNvdXJjZTogJ25vdGlza3ktZXh0ZW5zaW9uJywgc3VjY2VzczogdHJ1ZSB9LCBcclxuICAgICAgICAgICAgICAnKidcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgYXV0aCBjYWxsYmFjazonLCBlcnIpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gU2VuZCBlcnJvciBiYWNrIHRvIHRoZSBwYWdlXHJcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZShcclxuICAgICAgICAgICAgICB7IHNvdXJjZTogJ25vdGlza3ktZXh0ZW5zaW9uJywgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnIubWVzc2FnZSB9LCBcclxuICAgICAgICAgICAgICAnKidcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdXJsUGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcclxuICAgICAgY29uc3QgY29kZSA9IHVybFBhcmFtcy5nZXQoJ2NvZGUnKTtcclxuICAgICAgY29uc3Qgc3RhdGUgPSB1cmxQYXJhbXMuZ2V0KCdzdGF0ZScpO1xyXG4gICAgICBjb25zdCBlcnJvciA9IHVybFBhcmFtcy5nZXQoJ2Vycm9yJyk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdBdXRoIGVycm9yOicsIGVycm9yKTtcclxuICAgICAgICAvLyBObyBuZWVkIHRvIG1vZGlmeSB0aGUgcGFnZSAtIHRoZSBhdXRoIHNlcnZlciB3aWxsIGhhbmRsZSB0aGlzIGRpc3BsYXlcclxuICAgICAgfSBlbHNlIGlmIChjb2RlICYmIHN0YXRlKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0F1dGggY29kZSByZWNlaXZlZCBpbiBVUkwgcGFyYW1zLCBwcm9jZXNzaW5nLi4uJyk7XHJcbiAgICAgICAgLy8gU2VuZCB0aGUgYXV0aCBjb2RlIHRvIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdFxyXG4gICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcclxuICAgICAgICAgIHR5cGU6ICdvYXV0aF9jYWxsYmFjaycsXHJcbiAgICAgICAgICBjb2RlLFxyXG4gICAgICAgICAgc3RhdGVcclxuICAgICAgICB9KS50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdBdXRoIGNhbGxiYWNrIHByb2Nlc3NlZCBieSBiYWNrZ3JvdW5kIHNjcmlwdDonLCByZXNwb25zZSk7XHJcbiAgICAgICAgICAvLyBUaGUgcGFnZSB3aWxsIGJlIGhhbmRsZWQgYnkgdGhlIGF1dGggc2VydmVyXHJcbiAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcclxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgYXV0aCBjYWxsYmFjazonLCBlcnIpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gYXV0aCBjYWxsYmFjayBzY3JpcHQ6JywgZXJyKTtcclxuICAgIH1cclxuICB9KTtcclxufVxyXG5cclxuLy8gRXhwb3J0IGEgZHVtbXkgZnVuY3Rpb24gdG8gc2F0aXNmeSBXWFQncyBkZWZhdWx0IGV4cG9ydCByZXF1aXJlbWVudFxyXG5leHBvcnQgZGVmYXVsdCB7fTsgIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBS0EsVUFBUSxJQUFJLDZDQUE2QztBQUd6RCxNQUFJLE9BQU8sV0FBVyxlQUFlLE9BQU8sYUFBYSxhQUFhO0FBRTdELFdBQUEsaUJBQWlCLFdBQVcsU0FBUyxPQUFPO0FBRWpELFVBQUksTUFBTSxPQUFPLFNBQVMsa0JBQWtCLEdBQUc7QUFDckMsZ0JBQUEsSUFBSSwyQ0FBMkMsTUFBTSxJQUFJO0FBR2pFLFlBQUksTUFBTSxRQUFRLE1BQU0sS0FBSyxXQUFXLGdCQUFnQjtBQUN0RCxrQkFBUSxJQUFJLGtEQUFrRDtBQUM5RCxnQkFBTSxFQUFFLE1BQU0sTUFBTSxJQUFJLE1BQU07QUFFOUIsY0FBSSxRQUFRLE9BQU87QUFFakIsbUJBQU8sUUFBUSxZQUFZO0FBQUEsY0FDekIsTUFBTTtBQUFBLGNBQ047QUFBQSxjQUNBO0FBQUEsWUFBQSxDQUNELEVBQUUsS0FBSyxDQUFZLGFBQUE7QUFDVixzQkFBQSxJQUFJLGlEQUFpRCxRQUFRO0FBRzlELHFCQUFBO0FBQUEsZ0JBQ0wsRUFBRSxRQUFRLHFCQUFxQixTQUFTLEtBQUs7QUFBQSxnQkFDN0M7QUFBQSxjQUNGO0FBQUEsWUFBQSxDQUNELEVBQUUsTUFBTSxDQUFPLFFBQUE7QUFDTixzQkFBQSxNQUFNLG1DQUFtQyxHQUFHO0FBRzdDLHFCQUFBO0FBQUEsZ0JBQ0wsRUFBRSxRQUFRLHFCQUFxQixTQUFTLE9BQU8sT0FBTyxJQUFJLFFBQVE7QUFBQSxnQkFDbEU7QUFBQSxjQUNGO0FBQUEsWUFBQSxDQUNEO0FBQUEsVUFBQTtBQUFBLFFBQ0g7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUNEO0FBRVEsYUFBQSxpQkFBaUIsb0JBQW9CLE1BQU07QUFDOUMsVUFBQTtBQUNGLGNBQU0sWUFBWSxJQUFJLGdCQUFnQixPQUFPLFNBQVMsTUFBTTtBQUN0RCxjQUFBLE9BQU8sVUFBVSxJQUFJLE1BQU07QUFDM0IsY0FBQSxRQUFRLFVBQVUsSUFBSSxPQUFPO0FBQzdCLGNBQUEsUUFBUSxVQUFVLElBQUksT0FBTztBQUVuQyxZQUFJLE9BQU87QUFDRCxrQkFBQSxNQUFNLGVBQWUsS0FBSztBQUFBLFFBQUEsV0FFekIsUUFBUSxPQUFPO0FBQ3hCLGtCQUFRLElBQUksaURBQWlEO0FBRTdELGlCQUFPLFFBQVEsWUFBWTtBQUFBLFlBQ3pCLE1BQU07QUFBQSxZQUNOO0FBQUEsWUFDQTtBQUFBLFVBQUEsQ0FDRCxFQUFFLEtBQUssQ0FBWSxhQUFBO0FBQ1Ysb0JBQUEsSUFBSSxpREFBaUQsUUFBUTtBQUFBLFVBQUEsQ0FFdEUsRUFBRSxNQUFNLENBQU8sUUFBQTtBQUNOLG9CQUFBLE1BQU0sbUNBQW1DLEdBQUc7QUFBQSxVQUFBLENBQ3JEO0FBQUEsUUFBQTtBQUFBLGVBRUksS0FBSztBQUNKLGdCQUFBLE1BQU0sa0NBQWtDLEdBQUc7QUFBQSxNQUFBO0FBQUEsSUFDckQsQ0FDRDtBQUFBLEVBQ0g7QUFHQSxRQUFBLGFBQWUsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7In0=
