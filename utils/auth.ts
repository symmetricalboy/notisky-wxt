import { browser } from 'wxt/browser';

// Define interfaces for key pair structure (if not already global)
interface DPoPKeyPair {
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}

// Endpoints and Keys (Verify these)
// Use the URL of the hosted metadata file as the client_id
const METADATA_CLIENT_ID_URL = 'https://notisky.symm.app/client-metadata.json'; 
// const BLUESKY_CLIENT_ID = 'YOUR_BLUESKY_CLIENT_ID_HERE'; // <-- REMOVE STATIC PLACEHOLDER
const BLUESKY_AUTHORIZATION_ENDPOINT = 'https://notisky.vercel.app/api/auth/authorize'; // Updated to use our server
const BLUESKY_TOKEN_ENDPOINT = 'https://bsky.app/xrpc/com.atproto.server.oauthGetAccessToken'; // Use correct XRPC endpoint
const DPOP_KEY_STORAGE_KEY = 'notisky_dpop_keypair';
const TOKEN_ENDPOINT_NONCE_KEY = 'notisky_token_endpoint_nonce';

// Generate a random string for state and code_verifier
function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Generate code_challenge from code_verifier using SHA-256
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  // Base64 URL encode the digest
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Base64 URL encoding/decoding helpers
function base64UrlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(value: string): ArrayBuffer {
  value = value.replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) {
    value += '=';
  }
  const base64 = atob(value);
  const buffer = new Uint8Array(base64.length);
  for (let i = 0; i < base64.length; i++) {
    buffer[i] = base64.charCodeAt(i);
  }
  return buffer.buffer;
}

// --- DPoP Functions --- 

/**
 * Generates or loads the persistent DPoP signing key pair for the extension instance.
 * Stores the key pair in local storage.
 */
async function getDPoPKeyPair(): Promise<DPoPKeyPair | null> {
  try {
    const stored = await browser.storage.local.get(DPOP_KEY_STORAGE_KEY);
    if (stored[DPOP_KEY_STORAGE_KEY]) {
      const keyData = stored[DPOP_KEY_STORAGE_KEY];
      // Re-import the CryptoKey objects
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        keyData.privateKey, // Assuming stored as JWK
        { name: 'ECDSA', namedCurve: 'P-256' },
        true, // extractable (needed for storage)
        ['sign']
      );
      // Public key might not need re-import if stored JWK is sufficient
      return { publicKey: keyData.publicKey, privateKey };
    }

    // No key found, generate a new one
    console.log('Generating new DPoP key pair...');
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true, // extractable: required to export and store the private key
      ['sign', 'verify']
    );

    // Export keys in JWK format for storage
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // Remove private key components for the stored public JWK
    delete publicKeyJwk.d;
    delete publicKeyJwk.key_ops;
    publicKeyJwk.key_ops = ['verify']; // Correct key_ops for public key

    // Store the JWK representations
    await browser.storage.local.set({
      [DPOP_KEY_STORAGE_KEY]: {
        publicKey: publicKeyJwk,
        privateKey: privateKeyJwk, // Store private key as JWK
      },
    });

    console.log('Stored new DPoP key pair.');
    return { publicKey: publicKeyJwk, privateKey: keyPair.privateKey };

  } catch (error) {
    console.error('Error getting/generating DPoP key pair:', error);
    return null;
  }
}

/**
 * Generates a DPoP proof JWT.
 * @param htu The HTTP target URI (RFC9449 Section 4.3)
 * @param htm The HTTP method (RFC9449 Section 4.3)
 * @param keyPair The DPoP key pair to sign with.
 * @param nonce Optional server-provided nonce.
 * @returns The signed DPoP proof JWT string.
 */
async function generateDPoPProof(
  htu: string,
  htm: string,
  keyPair: DPoPKeyPair,
  nonce?: string
): Promise<string | null> {
  if (!keyPair) return null;

  try {
    const header = {
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: keyPair.publicKey, // Embed public key JWK
    };

    const payload: { [key: string]: any } = {
      jti: generateRandomString(16), // Unique token identifier
      htm: htm.toUpperCase(),        // HTTP method
      htu: htu,                      // HTTP target URI
      iat: Math.floor(Date.now() / 1000), // Issued at timestamp
    };

    if (nonce) {
      payload.nonce = nonce;
    }

    // Encode header and payload
    const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));

    // Create signing input
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signatureInputBuffer = new TextEncoder().encode(signingInput);

    // Sign the input
    const signatureBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair.privateKey,
      signatureInputBuffer
    );

    const encodedSignature = base64UrlEncode(signatureBuffer);

    return `${signingInput}.${encodedSignature}`;

  } catch (error) {
    console.error('Error generating DPoP proof:', error);
    return null;
  }
}

// --- DPoP Nonce Storage ---
async function getTokenEndpointNonce(): Promise<string | undefined> {
  try {
    const result = await browser.storage.local.get(TOKEN_ENDPOINT_NONCE_KEY);
    return result[TOKEN_ENDPOINT_NONCE_KEY];
  } catch (error) {
    console.error('Error getting token endpoint nonce:', error);
    return undefined;
  }
}

async function storeTokenEndpointNonce(nonce: string): Promise<void> {
  try {
    await browser.storage.local.set({ [TOKEN_ENDPOINT_NONCE_KEY]: nonce });
  } catch (error) {
    console.error('Error storing token endpoint nonce:', error);
  }
}

// --- Authentication Flow Functions --- 

/**
 * Initiates the Bluesky OAuth flow.
 * Stores necessary details (state, verifier, clientId, redirectUri) for the callback handler.
 * @returns A Promise resolving with the redirect URL string on success, 
 *          or rejecting with an error on failure or cancellation.
 */
export async function initiateBlueskyAuth(): Promise<string> {
  if (!browser.identity) {
    console.error('browser.identity API not available.');
    throw new Error('Browser identity API not available.');
  }

  try {
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = browser.identity.getRedirectURL(); 
    const clientId = METADATA_CLIENT_ID_URL; // <-- USE THE METADATA URL

    // Store necessary info for the token exchange step
    await browser.storage.local.set({
      auth_state_expected: state,
      auth_code_verifier: codeVerifier,
      auth_client_id: clientId,      // Store actual clientId used (the URL)
      auth_redirect_uri: redirectUri   // Store redirectUri for validation
    });

    const authUrl = new URL(BLUESKY_AUTHORIZATION_ENDPOINT);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', clientId); // <-- Use metadata URL
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', 'com.atproto.repo.read com.atproto.repo.write com.atproto.notification.read'); // Example scopes, adjust as needed
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    console.log('Initiating auth flow with URL:', authUrl.toString());

    const resultUrl = await browser.identity.launchWebAuthFlow({
      interactive: true,
      url: authUrl.toString(),
    });

    if (!resultUrl) {
        console.log('Auth flow cancelled by user or failed (no result URL).');
        throw new Error('Authentication flow cancelled or failed.');
    }

    console.log('Auth flow window completed, returning result URL.');
    return resultUrl;

  } catch (error: any) {
    console.error('Error during Bluesky authentication flow initiation:', error);
    // Clean up stored values if initiation fails?
    await browser.storage.local.remove(['auth_state_expected', 'auth_code_verifier', 'auth_client_id', 'auth_redirect_uri']);
    throw new Error(error.message || 'Error launching auth flow.');
  }
}

/**
 * Exchanges the authorization code for access and refresh tokens using the correct XRPC endpoint.
 * Includes DPoP proof generation and nonce handling.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,      // Passed from background script - should be the metadata URL now
  codeVerifier: string,
  redirectUri: string,    // Added redirectUri
  retryAttempt = 0
): Promise<{ success: boolean; did?: string; handle?: string; accessJwt?: string; refreshJwt?: string; error?: string }> { // Updated return type for success
  const MAX_DPOP_RETRIES = 1;

  const dpopKeyPair = await getDPoPKeyPair();
  if (!dpopKeyPair) {
    return { success: false, error: 'Failed to get DPoP key pair.' };
  }
  
  const currentNonce = await getTokenEndpointNonce();
  
  // DPoP proof for the XRPC endpoint
  const dpopProof = await generateDPoPProof(
    BLUESKY_TOKEN_ENDPOINT, // Target the XRPC token endpoint URL
    'POST',
    dpopKeyPair,
    currentNonce
  );

  if (!dpopProof) {
    return { success: false, error: 'Failed to generate DPoP proof.' };
  }

  try {
    console.log(`Attempting token exchange via XRPC (Attempt ${retryAttempt + 1})`);
    const response = await fetch(BLUESKY_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', // XRPC uses JSON
        'DPoP': dpopProof,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code', // Check if XRPC uses this Grant Type name
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
    });

    const newNonce = response.headers.get('DPoP-Nonce');
    if (newNonce && newNonce !== currentNonce) {
      console.log('Received new DPoP nonce, storing:', newNonce);
      await storeTokenEndpointNonce(newNonce);
    }

    // Handle DPoP nonce error (HTTP 401 use_dpop_nonce)
    if (response.status === 401 && retryAttempt < MAX_DPOP_RETRIES) {
       console.warn(`Token endpoint returned 401. Assuming DPoP nonce issue, retrying...`);
       if (newNonce) {
         return await exchangeCodeForToken(code, clientId, codeVerifier, redirectUri, retryAttempt + 1);
       } else {
         console.error('Token endpoint returned 401 but no new DPoP-Nonce header.');
         return { success: false, error: 'Authorization failed (status 401) and no new DPoP nonce.' };
       }
    } else if (response.status === 401) {
       console.error(`Token endpoint returned 401 after ${retryAttempt + 1} attempts.`);
       return { success: false, error: 'Authorization failed (status 401).' };
    }

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`Token exchange failed with status ${response.status}:`, responseData);
      const errorMsg = responseData.message || responseData.error || `Failed to exchange token (status ${response.status})`;
      // Handle specific XRPC errors if possible
      if (errorMsg.includes('invalid_grant')) {
          return { success: false, error: 'Invalid authorization code or verifier.' };
      }
      return { success: false, error: errorMsg };
    }

    // Assuming successful XRPC response contains session details
    if (responseData.did && responseData.handle && responseData.accessJwt && responseData.refreshJwt) {
        console.log('Token exchange successful (XRPC):', responseData);
        return {
          success: true,
          did: responseData.did,
          handle: responseData.handle,
          accessJwt: responseData.accessJwt,
          refreshJwt: responseData.refreshJwt,
        };
    } else {
        console.error('Token exchange response missing expected fields:', responseData);
        return { success: false, error: 'Token exchange response missing expected fields.' };
    }
    
  } catch (error) {
    console.error('Network or unexpected error during token exchange:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown network error during token exchange',
    };
  }
}

// TODO:
// - Implement token refresh logic using the refresh token and the specific refresh XRPC endpoint
// - Double-check required Bluesky scopes

// --- TODOs ---
// - Verify if BskyAgent handles DPoP nonces automatically for PDS requests.
// - Implement preference handling.
// - Implement remaining TODOs (UI, content script review, etc.).
// - Thoroughly test the redirect URI flow. 