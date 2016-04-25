'use strict';

// core modules
const path = require('path');

// npm modules
const _ = require('lodash');
const loopback = require('loopback');

const logger = require('./logger');
const setupCustomAuthType = require('./authentication');
const oniyiConfig = require('oniyi-config');
const utils = require('./utils');

// Create an instance of PassportConfigurator with the app instance
const PassportConfigurator = require('loopback-component-passport').PassportConfigurator;

module.exports = function componentLoader(app, spec) {
  const appRootDir = spec.appRootDir || path.join(process.cwd(), 'server');
  const appAuthDir = path.join(appRootDir, 'authentication');
  const enableSessionSupport = !!spec.enableSessionSupport;
  const contextRoot = spec.contextRoot || '/auth';

  // create models map. starts with empty map and subsequently loads provided models (if any),
  // followed by the default loopback "User", "UserIdentity" and "UserCredential"
  const models = _.defaults({}, spec.models || {}, {
    userModel: 'User',
    userIdentityModel: 'UserIdentity',
    userCredentialModel: 'UserCredential',
    accessTokenModel: 'AccessToken',
  });

  Object
    .keys(models)
    .forEach((model) => {
      if (_.isString(models[model])) {
        models[model] = app.registry.getModel(models[model]);
      }
    });

  const passportConfigurator = new PassportConfigurator(app);

  // Load the provider configurations
  const providers = oniyiConfig({
    basePath: appAuthDir,
    baseName: 'providers',
  });

  function setupAuthProvider(name, options) {
    const providerOptions = _.defaults({}, options, {
      session: false, // disable sessions as default for each provider
    });
    const authType = providerOptions.authScheme ? providerOptions.authScheme.toLowerCase() : null;

    const link = utils.isLink(providerOptions);

    // abort registration if the provider is configured to be disabled
    if (!!providerOptions.disabled) {
      return false;
    }

    providerOptions.authPath = utils.makeAuthPath(name, providerOptions, link, contextRoot);
    providerOptions.callbackPath = utils.makeCallbackPath(name, providerOptions, link, contextRoot);

    if (!providerOptions.json) {
      providerOptions.successRedirect = utils.makeSuccessRedirectUrl(providerOptions, spec.uiRedirectsBaseUrl);
      providerOptions.failureRedirect = utils.makeFailureRedirectUrl(providerOptions, spec.uiRedirectsBaseUrl);
    }

    if (link) {
      const providerAuthHTTPMethod = utils.authHTTPMethod(providerOptions);
      const providerCallbackHTTPMethod = utils.callbackHTTPMethod(providerOptions);

      const cookie = utils.linkCookie(name, providerOptions);

      // load cookie parser middleware to enable signed cookies
      // *Note*: "signedCookieSecret" must be set as app parameter
      app.middlewareFromConfig(loopback.cookieParser, {
        enabled: true,
        phase: 'auth:after',
        params: [app.get('signedCookieSecret'), {}],
        methods: _.uniq([providerAuthHTTPMethod, providerCallbackHTTPMethod]),
        paths: _.uniq([providerOptions.authPath, providerOptions.callbackPath]),
      });

      // set cookie with authenticated user's accessToken
      // this is needed in order to have a reference to the authenticated user when in callback handler
      app.middleware('auth:after', providerOptions.authPath, (req, res, next) => {
        // abort middleware if the request http method is different from the configured auth http method
        if (req.method !== providerAuthHTTPMethod) {
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
          return res.status(401)
            .end('No accessToken found in request object');
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
          model: models.accessTokenModel,
          currentUserLiteral: false,
          searchDefaultTokenKeys: false,
          enableDoublecheck: true,
          overwriteExistingToken: false,
          cookies: [cookie.name],
        },
        methods: [providerCallbackHTTPMethod],
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

    if (providerOptions.session && !enableSessionSupport) {
      logger.warn(`can not enable session support for auth-provider "${name}".
                  Sessions are disabled globally.
                  Set option "enableSessions" to true if you need session support`);
      providerOptions.session = false;
    }

    // if authScheme is one of the loopback supported ones, let loopback-component-passport handle the setup
    // when there is no authScheme provided, we also pass on to loopback-component-passport.
    // They will assume OAuth 2.0
    if (!authType || ['ldap',
        'local',
        'oauth',
        'oauth1',
        'oauth 1.0',
        'openid',
        'openid connect',
        'oauth 2.0',
      ].indexOf(authType) > -1) {
      return passportConfigurator.configureProvider(name, providerOptions);
    }

    return setupCustomAuthType(app, appAuthDir, models, authType, name, providerOptions);
  }

  // Initialize passport
  passportConfigurator.init(enableSessionSupport);

  // Set up related models
  passportConfigurator.setupModels(models);

  // Configure passport strategies for third party auth providers
  Object.keys(providers)
    .forEach((providerName) => {
      setupAuthProvider(providerName, _.extend({
        provider: providerName,
      }, providers[providerName]));
    });

  // enable authentication
  app.enableAuth();
};
