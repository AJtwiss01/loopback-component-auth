'use strict';

const url = require('url');

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
  const phaseBodyParser = `${phase}BodyParser`;

  if (!(providerOptions[phaseBodyParser] && _.isString(providerOptions[phaseBodyParser]))) {
    throw new Error(`"${phaseBodyParser}" is a required provider option
      and must be of type "String" when using "${phaseBodyParser}" === "POST"`);
  }

  if (!loopback.bodyParser) {
    /* eslint-disable max-len */
    throw new Error('bodyParser is not loaded into "loopback" module. Make sure you installed "body-parser" from npm registry');
    /* eslint-enable max-len */
  }

  if (!loopback.bodyParser[providerOptions[`${phaseBodyParser}`]]) {
    throw new Error(`"${providerOptions[phaseBodyParser]}" is not a supported bodyParser`);
  }

  const callbackBodyParserFactory = loopback.bodyParser[providerOptions[`${phaseBodyParser}`]];
  const callbackBodyParserOptions = _.assign({ extended: true }, providerOptions[`${phaseBodyParser}Options`] || {});

  middlewares.unshift(callbackBodyParserFactory(callbackBodyParserOptions));

  return middlewares;
}

function appendQuery(urlString, query) {
  return url.format(
    _.merge(url.parse(urlString), {
      query,
    }));
}

function makeSuccessRedirectUrl(providerOptions, baseUrl) {
  const successRedirect = providerOptions.successRedirect || (isLink(providerOptions) ?
    '/account/authorize/result' :
    '/account'
  );
  return url.resolve(baseUrl || '/', successRedirect);
}

function makeFailureRedirectUrl(providerOptions, baseUrl) {
  const failureRedirect = providerOptions.failureRedirect || (isLink(providerOptions) ?
    '/account/authorize/result' :
    '/account/login'
  );

  return url.resolve(baseUrl || '/', failureRedirect);
}

module.exports = {
  isLink,
  linkCookie,
  makeAuthPath,
  authHTTPMethod,
  makeCallbackPath,
  callbackHTTPMethod,
  addBodyParserMiddleware,
  appendQuery,
  makeSuccessRedirectUrl,
  makeFailureRedirectUrl,
};
