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
const providerRegistry = require('./provider-registry');

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
    'frontendBaseUrl',
    'contextRoot',
    'models',
  ]), {
    appRootDir: path.join(process.cwd(), 'server'),
    enableSessionSupport: false,
    serverBaseUrl: 'http://localhost:3000',
    frontendBaseUrl: spec.serverBaseUrl || 'http://localhost:3000', // if not set via `spec.frontendBaseUrl`, try to get value from `spec.serverBaseUrl` otherwise overwrite with default value
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

  function setupAuthProvider(name, options) {
    // load body parser middlewares for all `options.route`
    // this step is required even for those providers that are passed to `loopback-component-passport`,
    // since some of those might still require bodyParsing (e.g. when using built-in LDAP or local auth)
    Object.keys(options.route).forEach((routeName) => {
      const route = options.route[routeName];
      // abort when method is `HEAD` or `GET`. Those don't support HTTP Request Body
      if (/(HEAD|GET)/i.test(route.method)) {
        return;
      }
      const routeBodyParser = utils.makeBodyParserMiddleware(routeName, route);
      app.middleware('auth:before', route.path, routeBodyParser);
    });

    // setup auth middleware for link providers' subsequent calls.
    // this enables us to read accessToken information from additional sources on requests subsequent to
    // the link initiation (e.g. on OAuth 2.0 callback)
    if (options.provider.link) {
      const routePaths = _.uniq(Object.keys(options.route).map((routeName) => {
        return options.route[routeName].path;
      }));

      const routeMethods = _.uniq(Object.keys(options.route).map((routeName) => {
        return options.route[routeName].method;
      }));

      // @TODO: add token middleware to read accessToken from `state` param
      if (options.provider.useTokenCookieForCallback) {
        const tokenCookie = utils.tokenCookie(name, options.provider.path);

        // load cookie parser middleware to enable signed cookies
        // *Note*: "signedCookieSecret" must be set as app parameter
        app.middlewareFromConfig(loopback.cookieParser, {
          enabled: true,
          phase: 'auth:after',
          params: [app.get('signedCookieSecret'), {}],
          methods: routeMethods,
          paths: routePaths,
        });

        // set cookie with authenticated user's accessToken
        // this is needed in order to have a reference to the authenticated user when in callback handler
        app.middleware('auth:after', options.route.auth.path, (req, res, next) => {
          // abort middleware if the request http method is different from the configured auth http method
          if (req.method !== options.route.auth.method) {
            return next();
          }

          const requestPath = `${req.baseUrl}${req.path}`.replace(/\/$/, '');
          if (!requestPath.endsWith(options.route.auth.path.replace(/\/$/, ''))) {
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
            res.clearCookie(tokenCookie.name, {
              path: tokenCookie.options.path,
            });
            return res.status(401).end('No accessToken found in request object');
          }

          // user is authenticated, set signed cookie with current accessToken.id as value
          // we'll need that token when we handle the callback request
          res.cookie(tokenCookie.name, req.accessToken.id, tokenCookie.options);
          return next();
        });

        // make sure that the previously stored token (in a cookie) is loaded from request
        // before any next provider route handler is initialized
        app.middlewareFromConfig(loopback.token, {
          enabled: true,
          phase: 'auth:after',
          params: {
            model: componentOptions.models.accessTokenModel,
            currentUserLiteral: false,
            searchDefaultTokenKeys: false,
            enableDoublecheck: true,
            overwriteExistingToken: false,
            cookies: [tokenCookie.name],
          },
          methods: routeMethods,
          paths: routePaths,
        });

        // clear cookie on first access
        app.middleware('auth:after', routePaths, (req, res, next) => {
          if (req.signedCookies[tokenCookie.name]) {
            res.clearCookie(tokenCookie.name, {
              path: tokenCookie.options.path,
            });
          }
          next();
        });
      }
    }

    // if authScheme is one of the loopback supported ones, let loopback-component-passport handle the setup
    // when there is no authScheme provided, we also pass on to loopback-component-passport.
    // They will assume OAuth 2.0
    if (!options.provider.authScheme || ['ldap',
        'local',
        'oauth',
        'oauth1',
        'oauth 1.0',
        'openid',
        'openid connect',
        'oauth 2.0',
      ].indexOf(options.provider.authScheme) > -1) {
      // configure provider with `loopback-component-passport`
      return passportConfigurator.configureProvider(name, utils.makeLegacyProviderOptions(options));
    }

    return setupCustomAuthScheme(app,
      appAuthDir,
      componentOptions.models,
      name,
      options
    );
  }

  // Initialize passport
  passportConfigurator.init(componentOptions.enableSessionSupport);

  // Set up related models
  passportConfigurator.setupModels(componentOptions.models);

  const dataSource = utils.initDataSource(app, componentOptions);

  // load component specific models, attach our datasource and attach the model to `app` instance
  const modelsCommonPath = path.join(__dirname, '..', 'models');

  [
    { name: 'authStrategyOptions', public: false, attachToApp: false },
    { name: 'authSchemeOptions', public: false, attachToApp: false },
    { name: 'authProvider', public: true, attachToApp: true },
  ].forEach((modelInfo) => {
    /* eslint-disable global-require */
    const definition = require(path.join(modelsCommonPath, `${modelInfo.name}.json`));
    const customize = require(path.join(modelsCommonPath, `${modelInfo.name}.js`));
    /* eslint-enable global-require */
    const model = loopback.createModel(definition);
    customize(model);

    if (!!modelInfo.attachToApp) { // attach the model to our app
      // that makes it appear in the swagger spec and enables the rest endpoints
      app.model(model, {
        dataSource,
        public: !!modelInfo.public,
      });
    }
  });

  // Configure passport strategies for third party auth providers
  Object.keys(providers)
    .forEach((providerName) => {
      const options = utils.initProviderOptions(providerName, providers[providerName], componentOptions);

      providerRegistry.add(providerName, options);

      // abort registration if the provider is configured to be disabled
      if (!!options.provider.disabled) {
        logger.debug(`ignoring disabled auth provider ${providerName}`);
        return false;
      }

      return setupAuthProvider(providerName, options);
    });

  // enable authentication
  app.enableAuth();
}

module.exports = componentLoader;
