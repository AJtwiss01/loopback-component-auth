'use strict';

function link(options) {
  return !!options.link;
}

function authPath(name, isLinkProvider, options) {
  return options.authPath || `/${(isLinkProvider ? 'link' : 'auth')}/${name}`;
}

function authHTTPMethod(options) {
  return /^POST$/i.test(options.authHTTPMethod) ? 'POST' : 'GET';
}

function callbackPath(name, isLinkProvider, options) {
  return options.callbackPath || `/${(isLinkProvider ? 'link' : 'auth')}/${name}/callback`;
}

function callbackHTTPMethod(options) {
  return /^POST$/i.test(options.authHTTPMethod) ? 'POST' : 'GET';
}

function linkCookie(name, options) {
  const cookieName = `linkWithProvider_${name}`;
  let path = callbackPath(name, true, options);
  if (/callback\/?$/i.test(path)) {
    path = path.replace(/callback\/?$/i, '');
  }
  const cookie = {
    name: cookieName,
    options: {
      signed: true,
      maxAge: 300000, // 300 seconds / 5 minutes
      httpOnly: true,
      path,
    },
  };

  return cookie;
}

module.exports = {
  link,
  linkCookie,
  authPath,
  authHTTPMethod,
  callbackPath,
  callbackHTTPMethod,
};
