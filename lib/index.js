'use strict';

// core modules
const path = require('path');
const assert = require('assert');

// npm modules
const _ = require('lodash');

const logger = require(path(__dirname, 'logger'));
const setupCustomAuthType = require(path.join(__dirname, 'authentication'));

// Create an instance of PassportConfigurator with the app instance
const PassportConfigurator = require('loopback-component-passport').PassportConfigurator;

exports.boot = function bootCustomAuthSchemes(spec) {
  const app = spec.app;
  const appRootDir = spec.appRootDir || process.cwd();

  assert(typeof app === 'object', 'spec.app must be a loopback app');

  const models = _.defaults({}, spec.models || {}, {
    userModel: app.models.User,
    userIdentityModel: app.models.UserIdentity,
    userCredentialModel: app.models.UserCredential,
  });

  const passportConfigurator = new PassportConfigurator(app);
  let providers;

  function setupAuthProvider(name, options) {
    const providerOptions = _.defaults({}, options, {
      session: false,
    });
    const authType = providerOptions.authScheme ? providerOptions.authScheme.toLowerCase : null;

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

    setupCustomAuthType(app, authType, name, providerOptions);
  }

  // Load the provider configurations
  try {
    providers = require(path.join(appRootDir, 'server', 'authentication', 'providers.json'));
  } catch (err) {
    logger.error(`Please configure your passport strategies in
      '${path.join(appRootDir, 'server', 'authentication', 'providers.json')}'.`);
    process.exit(1);
  }

  // Initialize passport
  passportConfigurator.init();

  // Set up related models
  passportConfigurator.setupModels(models);

  // Configure passport strategies for third party auth providers
  Object.keys(providers).forEach(function iterateProviders(providerName) {
    setupAuthProvider(providerName, providers[providerName]);
  });

  // enable authentication
  app.enableAuth();
};
