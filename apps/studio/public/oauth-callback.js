// OAuth callback relay. Runs on the originating deployment origin, at the end of
// a sign-in. It hands the raw provider result (code, state, and any error) back to
// the application so the app can perform the authed exchange itself.
//
// TWO delivery channels, mirroring the two sign-in paths:
//
//   1. POPUP (primary): this page runs in the popup with `window.opener` set. It
//      posts the result to the opener with `targetOrigin` set to this page's OWN
//      origin — never "*" — so the browser delivers it only to an opener on that
//      exact origin. As defense in depth we ALSO validate the opener's origin before
//      dispatch: reading a cross-origin `opener.location` throws, so a
//      non-same-origin opener is refused rather than posted to.
//
//   2. REDIRECT (popup-blocked fallback): this page runs as a full-page navigation
//      in the same tab, so there is NO opener. The app stashed its in-app return
//      path in `sessionStorage` before redirecting (it cannot be recovered from the
//      HMAC-signed `state` here). We forward the result to that SAME-ORIGIN path on
//      the URL, and the app completes the exchange on arrival.
//
// This page makes NO API call itself: the finalizing request to
// /api/connectors/oauth/complete is authed and runs in the application window, which
// holds the session token. The receiver re-checks the message origin/source and
// performs the exchange.
(function () {
  'use strict';

  // Kept in sync with `@tai42/feature-connectors` src/oauth.ts (OAUTH_MESSAGE_TYPE,
  // OAUTH_REDIRECT_STORAGE_KEY, OAUTH_RESUME_PARAMS).
  var MESSAGE_TYPE = 'tai:oauth:callback';
  var REDIRECT_STORAGE_KEY = 'tai:oauth:redirect-return';
  var RESUME_PARAMS = {
    state: 'tai_oauth_state',
    code: 'tai_oauth_code',
    error: 'tai_oauth_error',
  };

  var params = new URLSearchParams(window.location.search);
  var message = {
    type: MESSAGE_TYPE,
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
  };

  function fail(text) {
    var el = document.getElementById('status');
    if (el) el.textContent = text;
  }

  var opener = window.opener;
  if (opener && !opener.closed) {
    // -- Popup channel --------------------------------------------------------
    var openerOrigin = null;
    try {
      // Throws when the opener is cross-origin — caught below and refused.
      openerOrigin = opener.location.origin;
    } catch {
      openerOrigin = null;
    }
    if (openerOrigin === window.location.origin) {
      opener.postMessage(message, window.location.origin);
      window.close();
      return;
    }
    // Opener present but NOT same-origin — refuse to hand it the code.
    fail('Sign-in cannot be completed: this window was opened from an unexpected origin.');
    return;
  }

  // -- Redirect channel (no opener) -------------------------------------------
  // Recover the in-app return path stashed before the full-page redirect and forward
  // the provider's result to it. The stash is trusted only as a SAME-ORIGIN relative
  // path (leading single "/", never a protocol-relative "//" or an absolute URL): an
  // unvalidated target would be an open redirect carrying a live OAuth code.
  var returnPath = null;
  try {
    returnPath = window.sessionStorage.getItem(REDIRECT_STORAGE_KEY);
    window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  } catch {
    returnPath = null;
  }

  // A completable callback carries `state` (the signed, single-use flow token). Without
  // it the app has nothing to exchange, so a stateless callback falls through to the
  // honest instruction below rather than a resume that cannot complete.
  if (
    message.state !== null &&
    returnPath &&
    returnPath.charAt(0) === '/' &&
    returnPath.charAt(1) !== '/'
  ) {
    var target = new URL(returnPath, window.location.origin);
    // Belt and braces: the resolved origin must still be ours.
    if (target.origin === window.location.origin) {
      target.searchParams.set(RESUME_PARAMS.state, message.state);
      if (message.code !== null) target.searchParams.set(RESUME_PARAMS.code, message.code);
      if (message.error !== null) target.searchParams.set(RESUME_PARAMS.error, message.error);
      window.location.replace(target.pathname + target.search + target.hash);
      return;
    }
  }

  // No opener AND no trusted return path (opened directly, or the stash is gone). The
  // exchange never ran, so this is NOT a completed sign-in — say so honestly and point
  // the operator back to the app rather than claiming success.
  fail('Sign-in could not be completed here. Return to the app and start the connection again.');
})();
