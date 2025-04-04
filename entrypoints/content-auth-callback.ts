/**
 * Auth callback handler for the Notisky extension
 * This script runs on the auth callback pages
 */

console.log('Notisky auth callback content script loaded');

// Safety check to make sure we're in a browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      
      if (error) {
        console.error('Auth error:', error);
        document.body.innerHTML = `
          <div style="text-align: center; padding: 2rem;">
            <h1>Authentication Error</h1>
            <p>${error}</p>
            <button onclick="window.close()">Close</button>
          </div>
        `;
      } else if (code && state) {
        console.log('Auth code received, processing...');
        // Send the auth code to the background script
        chrome.runtime.sendMessage({
          type: 'auth-callback',
          code,
          state
        }).then(response => {
          console.log('Auth callback processed:', response);
          // Update the UI
          document.body.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
              <h1>Authentication Successful</h1>
              <p>You can now close this window and return to Bluesky.</p>
              <button onclick="window.close()">Close</button>
            </div>
          `;
        }).catch(err => {
          console.error('Error processing auth callback:', err);
          document.body.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
              <h1>Authentication Error</h1>
              <p>An error occurred while processing the authentication.</p>
              <button onclick="window.close()">Close</button>
            </div>
          `;
        });
      }
    } catch (err) {
      console.error('Error in auth callback script:', err);
    }
  });
}

// Export a dummy function to satisfy WXT's default export requirement
export default {}; 