/**
 * Authentication utility for Notisky using browser.identity API
 * Cross-browser compatible solution that works in Chrome, Firefox, and Safari
 */

// Auth configuration
const AUTH_CONFIG = {
  // The URL to the authorization endpoint
  authUrl: 'https://notisky.symm.app/auth',
  // The redirect URL that will receive the authorization code
  // This should match what's configured on your server
  redirectUrl: 'https://notisky.symm.app/auth/callback'
};

/**
 * Interface for authentication responses
 */
export interface AuthResponse {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Initiates the browser authentication flow using identity API
 * Works across browsers thanks to WXT's unified API
 */
export async function authenticateUser(): Promise<AuthResponse> {
  try {
    // Check if identity API is available
    if (!browser.identity) {
      throw new Error('Identity API not available in this browser');
    }

    // Generate a random state parameter to prevent CSRF
    const state = Math.random().toString(36).substring(2, 15);

    // Store state in local storage to verify during callback
    await browser.storage.local.set({ 'auth_state': state });

    // Construct the full auth URL with necessary parameters
    const authUrl = new URL(AUTH_CONFIG.authUrl);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', AUTH_CONFIG.redirectUrl);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('client_id', 'notisky-extension');

    console.log('Starting auth flow with URL:', authUrl.toString());

    try {
      // Launch the web authentication flow
      const responseUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
      });

      console.log('Received auth response URL:', responseUrl);

      // Parse response URL to extract the authorization code and state
      const response = new URL(responseUrl);
      const code = response.searchParams.get('code');
      const returnedState = response.searchParams.get('state');

      // Verify the state parameter to prevent CSRF attacks
      const { auth_state } = await browser.storage.local.get('auth_state');
      if (returnedState !== auth_state) {
        throw new Error('State mismatch, possible CSRF attack');
      }

      // Clear the stored state
      await browser.storage.local.remove('auth_state');

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange the code for an access token
      const tokenResponse = await exchangeCodeForToken(code);
      
      return {
        success: true,
        token: tokenResponse.access_token
      };
    } catch (authFlowError) {
      console.error('Auth flow error:', authFlowError);
      
      // Try an alternative approach if the standard flow fails
      // Open the auth URL in a new tab
      if (authFlowError.message.includes('Authorization page could not be loaded')) {
        console.log('Trying alternative authentication method...');
        return await alternativeAuthFlow(authUrl.toString(), state);
      }
      
      throw authFlowError;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    };
  }
}

/**
 * Alternative authentication flow when launchWebAuthFlow fails
 * Opens the auth page in a new tab and listens for a message from the auth page
 */
async function alternativeAuthFlow(authUrl: string, state: string): Promise<AuthResponse> {
  return new Promise((resolve) => {
    // Set up a message listener to receive the auth code
    const messageListener = async (message: any) => {
      // Only process messages from our auth server
      if (message.source !== 'notisky-auth' || !message.code) {
        return;
      }
      
      console.log('Received auth message:', message);
      
      // Clean up the listener
      browser.runtime.onMessage.removeListener(messageListener);
      
      try {
        // Verify state
        if (message.state !== state) {
          throw new Error('State mismatch, possible CSRF attack');
        }
        
        // Exchange the code for a token
        const tokenResponse = await exchangeCodeForToken(message.code);
        
        resolve({
          success: true,
          token: tokenResponse.access_token
        });
      } catch (error) {
        console.error('Error in alternative auth flow:', error);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Error in alternative auth flow'
        });
      }
    };
    
    // Register the message listener
    browser.runtime.onMessage.addListener(messageListener);
    
    // Open the auth URL in a new tab
    browser.tabs.create({ url: authUrl });
    
    // Set a timeout to clean up if no response is received
    setTimeout(() => {
      browser.runtime.onMessage.removeListener(messageListener);
      resolve({
        success: false,
        error: 'Authentication timed out. Please try again.'
      });
    }, 120000); // 2 minute timeout
  });
}

/**
 * Exchange the authorization code for an access token
 */
async function exchangeCodeForToken(code: string): Promise<any> {
  const response = await fetch('https://notisky.symm.app/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      redirect_uri: AUTH_CONFIG.redirectUrl,
      client_id: 'notisky-extension',
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to exchange code for token');
  }

  return response.json();
}

/**
 * Check if the user is currently authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const { auth_token } = await browser.storage.local.get('auth_token');
    return !!auth_token;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

/**
 * Store the auth token securely
 */
export async function storeAuthToken(token: string): Promise<void> {
  await browser.storage.local.set({ 'auth_token': token });
}

/**
 * Get the stored auth token
 */
export async function getAuthToken(): Promise<string | null> {
  const { auth_token } = await browser.storage.local.get('auth_token');
  return auth_token || null;
}

/**
 * Clear the auth token (logout)
 */
export async function logout(): Promise<void> {
  await browser.storage.local.remove('auth_token');
} 