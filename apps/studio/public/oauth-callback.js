// OAuth callback relay. Runs on the originating deployment origin, in the
// sign-in popup. It posts the raw provider result (code, state, and any error)
// to the application window that opened it, then closes.
//
// SECURITY: the message is posted with `targetOrigin` set to this page's
// OWN origin — never "*" — so the browser delivers it only to an opener on that
// exact origin. As defense in depth we ALSO validate the opener's origin before
// dispatch: reading a cross-origin `opener.location` throws, so a non-same-origin
// opener is refused rather than posted to. The receiver re-checks `event.origin`
// and `event.source` and performs the authed exchange itself.
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var message = {
    type: 'tai:oauth:callback',
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

  // No opener to deliver to (page opened directly or the app window is gone).
  // Surface it plainly rather than failing silently.
  fail('Sign-in complete. You can close this window and return to the app.');
})();
