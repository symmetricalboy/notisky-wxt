/**
 * Auth callback handler for the Notisky extension
 * This script runs on the auth callback pages
 */

console.log('Notisky auth callback content script loaded');

// Safety check to make sure we're in a browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Listen for messages sent from the page to the content script
  window.addEventListener('message', function(event) {
    // Only accept messages from our auth server
    if (event.origin.includes('notisky.symm.app')) {
      console.log('Received message from auth server page:', event.data);
      
      // Check if it's an auth message from our auth server
      if (event.data && event.data.source === 'notisky-auth') {
        console.log('Processing auth callback from window.postMessage');
        const { code, state } = event.data;
        
        if (code && state) {
          // Forward the message to the background script
          chrome.runtime.sendMessage({
            type: 'oauth_callback',
            code,
            state
          }).then(response => {
            console.log('Auth callback processed by background script:', response);
            
            // Send confirmation back to the page
            window.postMessage(
              { source: 'notisky-extension', success: true }, 
              '*'
            );
          }).catch(err => {
            console.error('Error processing auth callback:', err);
            
            // Send error back to the page
            window.postMessage(
              { source: 'notisky-extension', success: false, error: err.message }, 
              '*'
            );
          });
        }
      }
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      
      if (error) {
        console.error('Auth error:', error);
        // No need to modify the page - the auth server will handle this display
      } else if (code && state) {
        console.log('Auth code received in URL params, processing...');
        // Send the auth code to the background script
        chrome.runtime.sendMessage({
          type: 'oauth_callback',
          code,
          state
        }).then(response => {
          console.log('Auth callback processed by background script:', response);
          // The page will be handled by the auth server
        }).catch(err => {
          console.error('Error processing auth callback:', err);
        });
      }
    } catch (err) {
      console.error('Error in auth callback script:', err);
    }
  });
}

// Export a dummy function to satisfy WXT's default export requirement
export default {}; 