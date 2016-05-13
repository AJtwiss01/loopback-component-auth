'use strict';

const providerRegistry = require('../lib/provider-registry');

function modelCustomizer(Model) {
  Model.once('dataSourceAttached', () => {
    // const connector = Model.getConnector();
    // const connectorSettings = connector.settings;

    /* eslint-disable no-param-reassign */
    Model.find = function find(filter, callback) {
      // @TODO: read user's roles and decide weather to show clientSecret and clientID
      // or even make it more generic: read list of "protected" properties from provider config
      // and remove othose from response list
      return callback(null, providerRegistry.list());
    };

    Model.remoteMethod(
      'find', {
        description: 'List authentication providers',
        notes: '',
        isStatic: true,
        accessType: 'READ',
        accepts: [{
          arg: 'filter',
          type: 'object',
          description: 'Filter defining fields, where, include, order, offset, and limit',
        }],
        returns: {
          root: true,
          type: ['AuthProvider'],
        },
        http: {
          verb: 'get',
          path: '/',
          status: 200,
          errorStatus: 500,
        },
      });
    /* eslint-enable no-param-reassign */
  });
}

module.exports = modelCustomizer;
