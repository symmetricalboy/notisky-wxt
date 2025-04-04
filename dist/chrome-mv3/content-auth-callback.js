var contentAuthCallback=function(){"use strict";console.log("Notisky auth callback content script loaded"),typeof window<"u"&&typeof document<"u"&&document.addEventListener("DOMContentLoaded",()=>{try{const e=new URLSearchParams(window.location.search),o=e.get("code"),c=e.get("state"),n=e.get("error");n?(console.error("Auth error:",n),document.body.innerHTML=`
          <div style="text-align: center; padding: 2rem;">
            <h1>Authentication Error</h1>
            <p>${n}</p>
            <button onclick="window.close()">Close</button>
          </div>
        `):o&&c&&(console.log("Auth code received, processing..."),chrome.runtime.sendMessage({type:"auth-callback",code:o,state:c}).then(r=>{console.log("Auth callback processed:",r),document.body.innerHTML=`
            <div style="text-align: center; padding: 2rem;">
              <h1>Authentication Successful</h1>
              <p>You can now close this window and return to Bluesky.</p>
              <button onclick="window.close()">Close</button>
            </div>
          `}).catch(r=>{console.error("Error processing auth callback:",r),document.body.innerHTML=`
            <div style="text-align: center; padding: 2rem;">
              <h1>Authentication Error</h1>
              <p>An error occurred while processing the authentication.</p>
              <button onclick="window.close()">Close</button>
            </div>
          `}))}catch(e){console.error("Error in auth callback script:",e)}});const i={};function a(){}function t(e,...o){}const s={debug:(...e)=>t(console.debug,...e),log:(...e)=>t(console.log,...e),warn:(...e)=>t(console.warn,...e),error:(...e)=>t(console.error,...e)};return(async()=>{try{return await i.main()}catch(e){throw s.error('The unlisted script "content-auth-callback" crashed on startup!',e),e}})()}();
contentAuthCallback;
