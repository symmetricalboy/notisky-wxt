/**
 * Authentication utility for Notisky using a direct OAuth flow
 * Implementation inspired by atcute's OAuth approach
 */

// Auth configuration
const AUTH_CONFIG = {
  // The URL to the authorization endpoint
  authUrl: 'https://bsky.app/intent/oauth',
  // Base URL for the auth server
  serverBaseUrl: 'https://notisky.symm.app',
  // The redirect URL that will receive the authorization code
  redirectUrl: 'https://notisky.symm.app/auth/callback',
  // Client ID for the application
  clientId: 'https://notisky.symm.app/.well-known/oauth-client-metadata.json'
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
 * Initiates the authorization flow using a direct tab-based approach
 * This avoids using browser.identity which can be problematic in extensions
 */
export async function authenticateUser(): Promise<AuthResponse> {
  try {
    console.log('Starting direct authentication flow');
    
    // Generate state and PKCE values
    const state = generateRandomString(16);
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Store auth state data
    await storeAuthState(state, codeVerifier);
    
    // Set up the message listener before opening the tab
    const authPromise = setupAuthListener(state);
    
    // Build the authorization URL with PKCE challenge
    const authUrl = buildAuthUrl(state, codeChallenge);
    
    // Open the auth URL in a new tab
    await browser.tabs.create({ url: authUrl });
    
    // Wait for the auth result from the listener
    return await authPromise;
  } catch (error: any) {
    console.error('Authentication flow error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown authentication error'
    };
  }
}

/**
 * Set up a message listener for the authentication callback
 */
function setupAuthListener(expectedState: string): Promise<AuthResponse> {
  return new Promise((resolve) => {
    // Store the resolver function so we can call it when auth completes
    storeResolver(resolve);
    
    // Set up storage listener to handle auth completion
    const storageListener = async (changes: any) => {
      if (changes.auth_code && changes.auth_state) {
        const code = changes.auth_code.newValue;
        const state = changes.auth_state.newValue;
        
        // Verify state matches
        if (state !== expectedState) {
          console.error('State mismatch in auth flow');
          resolve({
            success: false,
            error: 'Security verification failed (state mismatch)'
          });
          return;
        }
        
        try {
          // Get stored code verifier
          const { auth_code_verifier } = await browser.storage.local.get('auth_code_verifier');
          
          // Exchange code for token
          const tokenResponse = await exchangeCodeForToken(code, auth_code_verifier);
          
          // Clean up storage
          await browser.storage.local.remove(['auth_code', 'auth_state', 'auth_code_verifier']);
          
          // Resolve with success
          resolve({
            success: true,
            token: tokenResponse.access_token
          });
        } catch (error: any) {
          console.error('Error exchanging code for token:', error);
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Token exchange failed'
          });
        }
      }
    };
    
    // Listen for storage changes
    browser.storage.onChanged.addListener(storageListener);
    
    // Set a timeout to clean up and reject after 5 minutes
    setTimeout(() => {
      browser.storage.onChanged.removeListener(storageListener);
      resolve({
        success: false,
        error: 'Authentication timed out. Please try again.'
      });
    }, 300000); // 5 minute timeout
  });
}

/**
 * Store the resolver function in storage for later use by the callback page
 */
async function storeResolver(resolve: (value: AuthResponse) => void) {
  // Store the resolver in a global variable that can be accessed by the content script
  // @ts-ignore
  window.notiskyAuthResolver = resolve;
}

/**
 * Build the authorization URL for Bluesky OAuth
 */
function buildAuthUrl(state: string, codeChallenge: string): string {
  const url = new URL(AUTH_CONFIG.authUrl);
  
  // Add required OAuth 2.0 parameters
  url.searchParams.append('client_id', AUTH_CONFIG.clientId);
  url.searchParams.append('redirect_uri', AUTH_CONFIG.redirectUrl);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('state', state);
  url.searchParams.append('code_challenge', codeChallenge);
  url.searchParams.append('code_challenge_method', 'S256');
  
  // Add Bluesky-specific scopes
  url.searchParams.append('scope', 'com.atproto.feed:read com.atproto.feed:write com.atproto.notification:read');
  
  console.log('Built auth URL:', url.toString());
  return url.toString();
}

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate PKCE code challenge from verifier
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  // Convert verifier to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  
  // Hash with SHA-256
  const hash = await crypto.subtle.digest('SHA-256', data);
  
  // Convert to base64url
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Store authentication state in local storage
 */
async function storeAuthState(state: string, codeVerifier: string): Promise<void> {
  await browser.storage.local.set({
    auth_state_expected: state,
    auth_code_verifier: codeVerifier,
    auth_flow_started: Date.now()
  });
}

/**
 * Exchange the authorization code for an access token
 */
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<any> {
  const response = await fetch(`${AUTH_CONFIG.serverBaseUrl}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
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