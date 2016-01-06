'use strict';

// Create an instance of PassportConfigurator with the app instance
var PassportConfigurator = require('loopback-component-passport').PassportConfigurator;

var setupCustomAuthType = require('../authentication');

module.exports = function enableAuthentication(app) {
  var passportConfigurator = new PassportConfigurator(app);

  function setupAuthProvider(name, options) {
    options.session = options.session !== false;

    var authType = options.authScheme ? options.authScheme.toLowerCase : null;

    // if authScheme is one of the loopback supported ones, let loopback-component-passport handle the setup
    // when there is no authScheme provided, we also pass on to loopback-component-passport.
    // They will assume OAuth 2.0
    if (!authType) {
      return passportConfigurator.configureProvider(name, options);
    }
    if (['ldap', 'local', 'oauth', 'oauth1', 'oauth 1.0', 'openid', 'openid connect', 'oauth 2.0'].indexOf(authType) > -1) {
      return passportConfigurator.configureProvider(name, options);
    }

    setupCustomAuthType(app, authType, name, options);
  }

  // Load the provider configurations
  var providers = {};
  try {
    providers = require('../authentication/providers.json');
  } catch (err) {
    console.error('Please configure your passport strategy in `server/authentication/providers.json`.');
    process.exit(1);
  }

  // Initialize passport
  passportConfigurator.init();

  // Set up related models
  passportConfigurator.setupModels({
    userModel: app.models.User,
    userIdentityModel: app.models.UserIdentity,
    userCredentialModel: app.models.UserCredential
  });

  // Configure passport strategies for third party auth providers
  for (var providerName in providers) {
    setupAuthProvider(providerName, providers[providerName]);
  }

  // enable authentication
  app.enableAuth();
};
