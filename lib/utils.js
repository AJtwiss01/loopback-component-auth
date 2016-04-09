'use strict';

const loopback = require('loopback');
const _ = require('lodash');

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
  return /^POST$/i.test(options.callbackHTTPMethod) ? 'POST' : 'GET';
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
  link,
  linkCookie,
  authPath,
  authHTTPMethod,
  callbackPath,
  callbackHTTPMethod,
  addBodyParserMiddleware,
};
