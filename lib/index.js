'use strict';

// core modules
const path = require('path');

// npm modules
const _ = require('lodash');

const logger = require('./logger');
const setupCustomAuthType = require('./authentication');
const configLoader = require('./config-loader');

// Create an instance of PassportConfigurator with the app instance
const PassportConfigurator = require('loopback-component-passport').PassportConfigurator;

exports.boot = function bootCustomAuthSchemes(spec) {
  const app = spec.app;
  const appRootDir = spec.appRootDir || process.cwd();
  const appAuthDir = path.join(appRootDir, 'authentication');
  const enableSessionSupport = !!spec.enableSessionSupport;

  // create models map. starts with empty map and subsequently loads provided models (if any),
  // followed by the default loopback "User", "UserIdentity" and "UserCredential"
  const models = _.defaults({}, spec.models || {}, {
    userModel: app.models.User,
    userIdentityModel: app.models.UserIdentity,
    userCredentialModel: app.models.UserCredential,
  });

  const passportConfigurator = new PassportConfigurator(app);

  // Load the provider configurations
  const providers = configLoader(appAuthDir);

  function setupAuthProvider(name, options) {
    const providerOptions = _.defaults({}, options, {
      session: false, // disable sessions as default for each provider
    });
    const authType = providerOptions.authScheme ? providerOptions.authScheme.toLowerCase() : null;

    // abort registration if the provider is configured to be disabled
    if (!!providerOptions.disabled) {
      return false;
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
    if (!authType) {
      return passportConfigurator.configureProvider(name, providerOptions);
    }
    if (['ldap',
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

    setupCustomAuthType(app, appAuthDir, models, authType, name, providerOptions);
  }

  // Initialize passport
  passportConfigurator.init(enableSessionSupport);

  // Set up related models
  passportConfigurator.setupModels(models);

  // Configure passport strategies for third party auth providers
  Object.keys(providers).forEach((providerName) => {
    setupAuthProvider(providerName, _.extend({
      provider: providerName,
    }, providers[providerName]));
  });

  // enable authentication
  app.enableAuth();
};
