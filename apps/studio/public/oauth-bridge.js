// OAuth bridge relay. Runs on the redirect_uri the provider returns to.
// It recovers the originating deployment origin from the signed `state` and
// forwards the popup, query string intact, to that origin's oauth-callback.html.
//
// SECURITY — anchored allow-list before redirect: the `o` (origin) claim is
// read from `state` WITHOUT verifying the HMAC (the destination re-verifies it
// and the single-use flow_id when finalizing). By then the OAuth `code` has
// already been forwarded, so the routing target MUST be validated against a
// fully-anchored allow-list here — an unvalidated bounce is an open redirect
// carrying a live OAuth code. This SPA-shipped page serves the single-deployment
// topology, where the provider redirects back to THIS origin, so the allow-list
// is the strictest possible: an EXACT match of this page's own origin. (The
// multi-tenant shared-bridge deployment is a separate standalone build whose
// allow-list is an anchored `^<slug>\.<root>$` host pattern — not this file.)
//
// `state` wire format (from the skeleton): base64url(json({f, o})) + "." + hmac.
(function () {
  'use strict';

  function fail(text) {
    var el = document.getElementById('status');
    if (el) el.textContent = text;
  }

  function b64urlToString(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '==='.slice((b64.length + 3) % 4);
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function readOrigin(state) {
    var dot = state.indexOf('.');
    if (dot <= 0) return null;
    var obj;
    try {
      obj = JSON.parse(b64urlToString(state.slice(0, dot)));
    } catch {
      return null;
    }
    return obj && typeof obj.o === 'string' ? obj.o : null;
  }

  var params = new URLSearchParams(window.location.search);
  var state = params.get('state');
  var origin = state ? readOrigin(state) : null;

  // Anchored allow-list: the target must EXACTLY equal this page's own origin.
  // Anything else (a state issued for a different deployment, or a crafted `o`)
  // is refused loudly — never redirected to.
  if (origin !== window.location.origin) {
    fail(
      'This sign-in link is invalid or was issued for a different deployment. Close this window and try again.',
    );
    return;
  }

  window.location.replace(window.location.origin + '/oauth-callback.html' + window.location.search);
})();
