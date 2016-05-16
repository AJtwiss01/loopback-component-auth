'use strict';

// core modules
const path = require('path');

// npm modules
const _ = require('lodash');
const loopback = require('loopback'); // eslint-disable-line import/no-unresolved

const logger = require('./logger');
const setupCustomAuthScheme = require('./authentication');
const oniyiConfig = require('oniyi-config');
const utils = require('./utils');

// load strongloop's module for 3rd party authentication
// used to configure models and initialize `passport` on the loopback application
const PassportConfigurator = require('loopback-component-passport').PassportConfigurator;

function componentLoader(app, spec) {
  // make sure we have a loopback app running in a server environment
  if (!(app && app.loopback && app.loopback.isServer)) {
    throw new Error('`app` argument must be an instance of `loopback` running in a server environment');
  }

  // check for `spec` argument to be of plain object type
  if (!_.isPlainObject(spec)) {
    throw new TypeError('`spec` argument must be a plain object');
  }

  // compile componentOptions
  // 1. pick supported properties from provided `spec`
  // 2. set default values where no other value was provided
  // uses `defaultsDeep` to support subsets of nested componentOptions e.g. `models.userIdentityModel`
  const componentOptions = _.defaultsDeep({}, _.pick(spec, [
    'appRootDir',
    'enableSessionSupport',
    'serverBaseUrl',
    'uiBaseUrl',
    'contextRoot',
    'models',
  ]), {
    appRootDir: path.join(process.cwd(), 'server'),
    enableSessionSupport: false,
    serverBaseUrl: 'http://localhost:3000',
    uiBaseUrl: spec.serverBaseUrl || 'http://localhost:3000', // if not set via `spec.uiBaseUrl`, try to get value from `spec.serverBaseUrl` otherwise overwrite with default value
    contextRoot: '/auth',
    models: {
      // default loopback `User`, `UserIdentity`, `UserCredential` and `AccessToken`
      userModel: 'User',
      userIdentityModel: 'UserIdentity',
      userCredentialModel: 'UserCredential',
      accessTokenModel: 'AccessToken',
    },
  });

  const appAuthDir = path.join(componentOptions.appRootDir, 'authentication');

  // resolve models provided as `String` to their actual instance
  Object
    .keys(componentOptions.models)
    .forEach((model) => {
      if (_.isString(componentOptions.models[model])) {
        // registry.getModel will throw an error when no such model exists
        componentOptions.models[model] = app.registry.getModel(componentOptions.models[model]);
      }
    });

  // Create an instance of PassportConfigurator with the app instance
  const passportConfigurator = new PassportConfigurator(app);

  // Load the provider configurations
  const providers = oniyiConfig({
    basePath: appAuthDir,
    baseName: 'providers',
  });

  function setupAuthProvider(name, providerOptions) {
    const isLinkProvider = utils.isLink(providerOptions);

    if (isLinkProvider) {
      const cookie = utils.linkCookie(name, providerOptions);

      // load cookie parser middleware to enable signed cookies
      // *Note*: "signedCookieSecret" must be set as app parameter
      app.middlewareFromConfig(loopback.cookieParser, {
        enabled: true,
        phase: 'auth:after',
        params: [app.get('signedCookieSecret'), {}],
        methods: _.uniq([providerOptions.authHTTPMethod, providerOptions.callbackHTTPMethod]),
        paths: _.uniq([providerOptions.authPath, providerOptions.callbackPath]),
      });

      // set cookie with authenticated user's accessToken
      // this is needed in order to have a reference to the authenticated user when in callback handler
      app.middleware('auth:after', providerOptions.authPath, (req, res, next) => {
        // abort middleware if the request http method is different from the configured auth http method
        if (req.method !== providerOptions.authHTTPMethod) {
          return next();
        }

        const requestPath = `${req.baseUrl}${req.path}`.replace(/\/$/, '');
        if (!requestPath.endsWith(providerOptions.authPath.replace(/\/$/, ''))) {
          return next();
        }

        // abort middleware if "code" parameter is providede in query
        // --> indicator for callback request from oauth provider
        // --> which happens when authPath === callbackPath
        if (req.query && req.query.code) {
          return next();
        }

        // this is obviously an "authorize / link" request --> being authenticated is a strict requirement now
        if (!req.accessToken) {
          res.clearCookie(cookie.name, {
            path: cookie.options.path,
          });
          return res.status(401).end('No accessToken found in request object');
        }

        // user is authenticated, set signed cookie with current accessToken.id as value
        // we'll need that token when we handle the callback request
        res.cookie(cookie.name, req.accessToken.id, cookie.options);
        return next();
      });

      // make sure that the previously stored token (in a cookie) is loaded from request
      // before callback handler processes authorization
      app.middlewareFromConfig(loopback.token, {
        enabled: true,
        phase: 'auth:after',
        params: {
          model: componentOptions.models.accessTokenModel,
          currentUserLiteral: false,
          searchDefaultTokenKeys: false,
          enableDoublecheck: true,
          overwriteExistingToken: false,
          cookies: [cookie.name],
        },
        methods: [providerOptions.callbackHTTPMethod],
        paths: [providerOptions.callbackPath],
      });

      // clear cookie on first access
      app.middleware('auth:after', providerOptions.callbackPath, (req, res, next) => {
        res.clearCookie(cookie.name, {
          path: cookie.options.path,
        });
        next();
      });
    }

    // if authScheme is one of the loopback supported ones, let loopback-component-passport handle the setup
    // when there is no authScheme provided, we also pass on to loopback-component-passport.
    // They will assume OAuth 2.0
    if (!providerOptions.authScheme || ['ldap',
        'local',
        'oauth',
        'oauth1',
        'oauth 1.0',
        'openid',
        'openid connect',
        'oauth 2.0',
      ].indexOf(providerOptions.authScheme) > -1) {
      return passportConfigurator.configureProvider(name, providerOptions);
    }

    return setupCustomAuthScheme(app, appAuthDir, componentOptions.models, providerOptions.authScheme, name, providerOptions);
  }

  // Initialize passport
  passportConfigurator.init(componentOptions.enableSessionSupport);

  // Set up related models
  passportConfigurator.setupModels(componentOptions.models);

  const dataSource = utils.makeDataSource(app, componentOptions);

  // load component specific models, attach our datasource and attach the model to `app` instance
  const modelsCommonPath = path.join(__dirname, '..', 'models');
  [
    { name: 'authStrategyOptions', public: false },
    { name: 'authSchemeOptions', public: false },
    { name: 'authProvider', public: true },
  ].forEach((modelInfo) => {
    /* eslint-disable global-require */
    const definition = require(path.join(modelsCommonPath, `${modelInfo.name}.json`));
    const customize = require(path.join(modelsCommonPath, `${modelInfo.name}.js`));
    /* eslint-enable global-require */
    const model = loopback.createModel(definition);
    customize(model);

    // attach the model to our app
    // that makes it appear in the swagger spec and enables the rest endpoints
    app.model(model, {
      dataSource,
      public: !!modelInfo.public,
    });
  });

  // Configure passport strategies for third party auth providers
  Object.keys(providers)
    .forEach((providerName) => {
      const providerOptions = utils.initProviderOptions(providerName, providers[providerName], componentOptions);

      // @TODO: write providerOptions to registry;

      // abort registration if the provider is configured to be disabled
      if (!!providerOptions.disabled) {
        logger.debug(`ignoring disabled auth provider ${providerName}`);
        return false;
      }

      return setupAuthProvider(providerName, _.extend({
        provider: providerName,
      }, providerOptions));
    });

  // enable authentication
  app.enableAuth();
}

module.exports = componentLoader;
