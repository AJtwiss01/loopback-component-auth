'use strict';

const url = require('url');

const loopback = require('loopback'); // eslint-disable-line import/no-unresolved
const _ = require('lodash');

const logger = require('../logger');

const initDataSource = require('./datasource');

function httpMethod(method) {
  if (!_.isString(method)) {
    return 'GET';
  }
  return /^(GET|POST)$/i.test(method) ? method.toUpperCase() : 'GET';
}

function routePath(contextRoot, providerName, routeName) {
  return `${contextRoot.replace(/\/$/, '')}/${providerName}/${routeName}`.toLowerCase();
}

function tokenCookie(name, path) {
  const cookieName = `provider_${name}_token`;
  const cookie = {
    name: cookieName,
    options: {
      signed: true,
      maxAge: 300000, // 300 seconds / 5 minutes
      httpOnly: true,
      path: path.replace(/\/?/, ''),
    },
  };

  return cookie;
}

function makeBodyParserMiddleware(name, route) {
  if (!(route.bodyParser && _.isString(route.bodyParser))) {
    throw new Error(`"bodyParser" is a required option for route "${name}"
      and must be of type "String" when using "method" other than "HEAD"|"GET"`);
  }

  if (!loopback.bodyParser) {
    /* eslint-disable max-len */
    throw new Error('bodyParser is not loaded into "loopback" module. Make sure you installed "body-parser" from npm registry');
    /* eslint-enable max-len */
  }

  if (!loopback.bodyParser[route.bodyParser]) {
    throw new Error(`"${route.bodyParser}" is not a supported bodyParser`);
  }

  const bodyParserFactory = loopback.bodyParser[route.bodyParser];
  const bodyParserOptions = route.bodyParserOptions || {};

  return bodyParserFactory(bodyParserOptions);
}

function appendQuery(urlString, query) {
  return url.format(
    _.merge(url.parse(urlString), {
      query,
    }));
}

function makeSuccessRedirectUrl(params) {
  const successRedirect = params.successRedirect || (params.link ?
    '/account/authorize/result' :
    '/account'
  );
  return url.resolve(params.baseUrl || '/', successRedirect);
}

function makeFailureRedirectUrl(params) {
  const failureRedirect = params.failureRedirect || (params.link ?
    '/account/authorize/result' :
    '/account/login'
  );

  return url.resolve(params.baseUrl || '/', failureRedirect);
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

function initProviderOptions(name, options, componentOptions) {
  // read all top-level properties from `options` except for those containing specially nested options
  const providerOptions = _.defaults({},
    _.omit(options, ['routeOptions', 'schemeOptions', 'strategyOptions']), {
      strategy: 'Strategy',
      link: false,
      json: false,
      session: false, // sessions are disabled if not set otherwise in providerOptions
      useTokenCookieForCallback: false,
    });

  const routeOptions = _.defaultsDeep({}, options.routeOptions || {}, {
    auth: {}, // make sure we always have an `auth` route
  });

  const schemeOptions = _.defaultsDeep({}, options.schemeOptions || {}, {});
  const strategyOptions = _.defaultsDeep({}, options.strategyOptions || {}, {});

  if (providerOptions.session && !componentOptions.enableSessionSupport) {
    logger.warn(`can not enable session support for auth-provider "${name}".
                  Sessions are disabled globally.
                  Set component option "enableSessions" to true if you need session support`);
    providerOptions.session = false;
  }

  providerOptions.authScheme = _.isString(providerOptions.authScheme) ? providerOptions.authScheme.toLowerCase() : null;

  providerOptions.link = !!providerOptions.link;

  providerOptions.path = `${componentOptions.contextRoot.replace(/\/$/, '')}/${name}`.toLowerCase();

  // compute method and bodyParser for all provided route names
  Object.keys(routeOptions).forEach((routeName) => {
    let route = _.assign({}, routeOptions[routeName]);

    const defaults = {
      method: httpMethod(route.method),
      // compute path from providerName, routeName and resolve from contextRoot
      path: routePath(componentOptions.contextRoot, name, routeName),
    };

    // only set bodyParser default options when method allows request body
    if (!/^(HEAD|GET)$/i.test(defaults.method)) {
      route = _.merge({
        bodyParser: 'json',
        bodyParserOptions: {
          extended: true,
        },
      }, route);
    }
    routeOptions[routeName] = _.defaults(defaults, route);
  });

  // when provider has `callback` route, compute callbackURL from previously resolved path
  // this time resolved from a serverBaeUrl
  if (routeOptions.callback && routeOptions.callback.path) {
    strategyOptions.callbackURL = url.resolve(componentOptions.serverBaseUrl, routeOptions.callback.path);
  }

  // json enabled providers expect to receive results as response body and thus don't need redirect urls
  if (!providerOptions.json) {
    const successRedirect = makeSuccessRedirectUrl({
      successRedirect: strategyOptions.successRedirect,
      link: providerOptions.link,
      baseUrl: componentOptions.frontendBaseUrl,
    });
    const failureRedirect = makeFailureRedirectUrl({
      failureRedirect: strategyOptions.failureRedirect,
      link: providerOptions.link,
      baseUrl: componentOptions.frontendBaseUrl,
    });

    _.assign(strategyOptions, {
      successRedirect,
      failureRedirect,
    });
  }

  return {
    name,
    provider: providerOptions,
    route: routeOptions,
    scheme: schemeOptions,
    strategy: strategyOptions,
  };
}

function makeLegacyProviderOptions(options) {
  // @TODO: compile authPath, callbackPath and all other properties requrired by `loopback-component-passport`
  return _.assign({ provider: options.name },
    options.provider,
    options.strategy,
    options.scheme
  );
}

module.exports = {
  tokenCookie,
  makeBodyParserMiddleware,
  appendQuery,
  makeSuccessRedirectUrl,
  makeFailureRedirectUrl,
  initProviderOptions,
  makeLegacyProviderOptions,
  appBaseUrl,
  initDataSource,
};
