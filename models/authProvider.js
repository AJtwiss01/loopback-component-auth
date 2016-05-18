'use strict';

// const logger = require('../lib/logger');
const providerRegistry = require('../lib/provider-registry');

function providerConfigToModel(config) {
  const model = {
    disabled: !!config.provider.disabled,
    name: config.name,
    authPath: config.route.auth.path,
    authMethod: config.route.auth.method,
    link: !!config.provider.link,
    responseType: config.provider.json ? 'json' : 'redirect',
  };

  if (!/(HEAD|GET)/i.test(model.authMethod)) {
    model.authBodyFormat = config.route.auth.bodyParser;
  }

  if (model.responseType === 'redirect') {
    model.successRedirectUrl = config.strategy.successRedirect;
    model.failureRedirectUrl = config.strategy.failureRedirect;
  }

  return model;
}

function modelCustomizer(Model) {
  Model.once('dataSourceAttached', () => {
    // const connector = Model.getConnector();
    // const connectorSettings = connector.settings;

    /* eslint-disable no-param-reassign */
    Model.findLoginProviders = function findLoginProviders(includeDisabled, callback) {
      // @TODO: read user's roles and decide weather to show clientSecret and clientID
      // or even make it more generic: read list of "protected" properties from provider config
      // and remove those from response list

      const result = providerRegistry
        .list()
        // remove all providers where `link` is set to `true`
        .filter((config) => {
          return !config.provider.link;
        })
        // remove `disabled` providers if not requested otherwise
        .filter((config) => {
          if (includeDisabled) {
            return true;
          }
          return !config.provider.disabled;
        })
        .map((config) => {
          return providerConfigToModel(config);
        });

      return callback(null, result);
    };

    Model.findLinkProviders = function findLinkProviders(includeDisabled, callback) {
      // @TODO: read user's roles and decide weather to show clientSecret and clientID
      // or even make it more generic: read list of "protected" properties from provider config
      // and remove those from response list

      const result = providerRegistry
        .list()
        // remove all providers where `link` is set to `true`
        .filter((config) => {
          return config.provider.link;
        })
        // remove `disabled` providers if not requested otherwise
        .filter((config) => {
          if (includeDisabled) {
            return true;
          }
          return !config.provider.disabled;
        })
        .map((config) => {
          return providerConfigToModel(config);
        });

      return callback(null, result);
    };
    /* eslint-enable no-param-reassign */

    Model.remoteMethod(
      'findLoginProviders', {
        description: 'List authentication providers that support login requests',
        notes: '',
        isStatic: true,
        accessType: 'READ',
        accepts: [{
          arg: 'includeDisabled',
          type: 'Boolean',
          default: false,
          http: {
            source: 'query',
          },
        }],
        returns: {
          root: true,
          type: ['AuthProvider'],
        },
        http: {
          verb: 'get',
          path: '/login',
          status: 200,
          errorStatus: 500,
        },
      });

    Model.remoteMethod(
      'findLinkProviders', {
        description: 'List authentication providers that support linking auser accounts',
        notes: '',
        isStatic: true,
        accessType: 'READ',
        accepts: [{
          arg: 'includeDisabled',
          type: 'Boolean',
          default: false,
          http: {
            source: 'query',
          },
        }],
        returns: {
          root: true,
          type: ['AuthProvider'],
        },
        http: {
          verb: 'get',
          path: '/link',
          status: 200,
          errorStatus: 500,
        },
      });
  });
}

module.exports = modelCustomizer;
