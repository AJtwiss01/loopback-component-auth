'use strict';

const _ = require('lodash');
// Create an instance of PassportConfigurator with the app instance
const PassportConfigurator = require('loopback-component-passport').PassportConfigurator;

const logger = require('./logger');
const setupCustomAuthType = require('../authentication');

module.exports = function enableAuthentication(app) {
  const passportConfigurator = new PassportConfigurator(app);
  let providers = {};

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
    providers = require('../authentication/providers.json');
  } catch (err) {
    logger.error('Please configure your passport strategy in `server/authentication/providers.json`.');
    process.exit(1);
  }

  // Initialize passport
  passportConfigurator.init();

  // Set up related models
  passportConfigurator.setupModels({
    userModel: app.models.User,
    userIdentityModel: app.models.UserIdentity,
    userCredentialModel: app.models.UserCredential,
  });

  // Configure passport strategies for third party auth providers
  Object.keys(providers).forEach(function iterateProviders(providerName) {
    setupAuthProvider(providerName, providers[providerName]);
  });

  // enable authentication
  app.enableAuth();
};
