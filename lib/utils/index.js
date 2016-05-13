'use strict';

const url = require('url');

const loopback = require('loopback'); // eslint-disable-line import/no-unresolved
const _ = require('lodash');

const logger = require('../logger');

const makeDataSource = require('./datasource');

function isLink(options) {
  return !!options.link;
}

function makeAuthPath(name, isLinkProvider, contextRoot) {
  return `${contextRoot.replace(/\/$/, '')}/${name}/${isLinkProvider ? 'link' : 'login'}`;
}

function makeCallbackPath(name, isLinkProvider, contextRoot) {
  return `${contextRoot.replace(/\/$/, '')}/${name}/${isLinkProvider ? 'link' : 'login'}/callback`;
}

function authHTTPMethod(options) {
  return /^POST$/i.test(options.authHTTPMethod) ? 'POST' : 'GET';
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

function makeSuccessRedirectUrl(providerOptions, isLinkProvider, baseUrl) {
  const successRedirect = providerOptions.successRedirect || (isLinkProvider ?
    '/account/authorize/result' :
    '/account'
  );
  return url.resolve(baseUrl || '/', successRedirect);
}

function makeFailureRedirectUrl(providerOptions, isLinkProvider, baseUrl) {
  const failureRedirect = providerOptions.failureRedirect || (isLinkProvider ?
    '/account/authorize/result' :
    '/account/login'
  );

  return url.resolve(baseUrl || '/', failureRedirect);
}

function appBaseUrl(app, options, callback) {
  /**
   * when useing `loopbackApp.listen()`, subscribes to the `http` server object's `listening`
   * object and compiles `host`, `port` and `url` app properties from the actual tcp socket that the
   * `http` server object is using. Unfortunately, the app is not listening when this component is initialized.
   * With that said, we don't have the tcp socket active yet and can't extract actual information.
   * An alternative could be to force setting `host`, `port` and `scheme` in the global application config.
   * Also, emitting another event on `app` from the `listen` callback to fetch it here and then pick `app.get('url')`
   * could be an option.
   */

  // app.get('host');
  // app.get('port');
  // app.set('url', 'http://' + host + ':' + self.get('port') + '/');

  app.once('started', () => {
    callback(null, app.get('url'));
  });

  return callback(new Error('fetching the application\'s base url is not implemented yet'));
}

function initProviderOptions(name, providerOptions, componentOptions) {
  const providerOpts = _.defaults({}, providerOptions, {
    session: false, // sessions are disabled if not set otherwise in providerOptions
  });

  if (providerOptions.session && !componentOptions.enableSessionSupport) {
    logger.warn(`can not enable session support for auth-provider "${name}".
                  Sessions are disabled globally.
                  Set option "enableSessions" to true if you need session support`);
    providerOpts.session = false;
  }

  providerOpts.authScheme = _.isString(providerOpts.authScheme) ? providerOpts.authScheme.toLowerCase() : null;
  providerOpts.strategy = providerOpts.strategy || 'Strategy';

  const isLinkProvider = isLink(providerOpts);

  // make sure we have a value of 'http' or 'https' lowerCase
  ['authHTTPScheme', 'callbackHTTPScheme'].forEach((optionName) => {
    let val = providerOpts[optionName] || 'https';
    if (!(val && _.isString(val) && /^https?$/i.test(val))) {
      logger.warn(`invalid ${optionName} value '${val}' for provider '${name}'; using fallback value 'https'`);
      val = 'https';
    }
    providerOpts[optionName] = val.toLowerCase();
  });

  // compute http methods for auth / callback controllers
  providerOpts.authHTTPMethod = authHTTPMethod(providerOptions);
  providerOpts.callbackHTTPMethod = callbackHTTPMethod(providerOptions);

  // compute auth / callback path from provider name and resolve from contextRoot
  providerOpts.authPath = makeAuthPath(name, isLinkProvider, componentOptions.contextRoot);
  providerOpts.callbackPath = makeCallbackPath(name, isLinkProvider, componentOptions.contextRoot);

  // compute auth / callback URL from previously resolved paths - this time resolved from a serverBaeUrl
  providerOpts.authURL = url.resolve(componentOptions.serverBaseUrl, providerOpts.authPath);
  providerOpts.callbackURL = url.resolve(componentOptions.serverBaseUrl, providerOpts.callbackPath);

  if (!providerOpts.json) {
    providerOpts.successRedirect = makeSuccessRedirectUrl(providerOpts, isLinkProvider, componentOptions.uiBaseUrl);
    providerOpts.failureRedirect = makeFailureRedirectUrl(providerOpts, isLinkProvider, componentOptions.uiBaseUrl);
  }

  return providerOpts;
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
  initProviderOptions,
  appBaseUrl,
  makeDataSource,
};
