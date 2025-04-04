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

    // Launch the web authentication flow
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

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
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    };
  }
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