'use strict';

const loopback = require('loopback');
const _ = require('lodash');

function preprendIfNoMatch(str, prependWith, separator) {
  const sep = separator || '/';
  if (!prependWith) {
    return str;
  }
  if (typeof str !== 'string') {
    return str;
  }

  const rex = new RegExp(`^${prependWith}`);
  if (rex.test(str)) {
    return str;
  }
  return [
    prependWith.replace(new RegExp(`${sep}$`), ''), // remove separator from end of prepending string
    str.replace(new RegExp(`^${sep}`), ''), // remove separator from beginning of prepended string
  ].join(sep);
}

function isLink(options) {
  return !!options.link;
}

function makeAuthPath(name, options, isLinkProvider, contextRoot) {
  const authPath = options.authPath || `/${name}/${isLinkProvider ? 'link' : 'login'}`;
  return preprendIfNoMatch(authPath, contextRoot);
}

function authHTTPMethod(options) {
  return /^POST$/i.test(options.authHTTPMethod) ? 'POST' : 'GET';
}

function makeCallbackPath(name, options, isLinkProvider, contextRoot) {
  const callbackPath = options.callbackPath || `/${name}/${isLinkProvider ? 'link' : 'login'}/callback`;
  return preprendIfNoMatch(callbackPath, contextRoot);
}

function callbackHTTPMethod(options) {
  return /^POST$/i.test(options.callbackHTTPMethod) ? 'POST' : 'GET';
}

function linkCookie(name, options) {
  const cookieName = `linkWithProvider_${name}`;
  let path = options.callbackPath;
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

function addBodyParserMiddleware(phase, providerOptions, middleware) {
  const middlewares = Array.isArray(middleware) ? middleware : [middleware];

  if (!(providerOptions[`${phase}BodyParser`] && _.isString(providerOptions[`${phase}BodyParser`]))) {
    /* eslint-disable max-len */
    throw new Error(`"${phase}BodyParser" is a required provider option and must be of type "String" when using "${phase}BodyParser" === "POST"`);
    /* eslint-enable max-len */
  }

  if (!loopback.bodyParser) {
    /* eslint-disable max-len */
    throw new Error('bodyParser is not loaded into `loopback` module. Make sure you installed `body-parser` from npm registry');
    /* eslint-enable max-len */
  }

  if (!loopback.bodyParser[providerOptions[`${phase}BodyParser`]]) {
    throw new Error(`"${providerOptions[`${phase}BodyParser`]}" is not a supported bodyParser`);
  }

  const callbackBodyParser = loopback.bodyParser[providerOptions[`${phase}BodyParser`]];

  middlewares.unshift(callbackBodyParser(_.assign({ extended: true },
    providerOptions[`${phase}BodyParserOptions`] || {})));

  return middlewares;
}

module.exports = {
  isLink,
  linkCookie,
  makeAuthPath,
  authHTTPMethod,
  makeCallbackPath,
  callbackHTTPMethod,
  addBodyParserMiddleware,
};
