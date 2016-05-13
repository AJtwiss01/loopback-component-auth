'use strict';

// core modules
// const assert = require('assert');

const _ = require('lodash');
const loopback = require('loopback');
// const DataSource = require('loopback-datasource-juggler').DataSource;

// const logger = require('../logger');

function initializeDataSource(app, componentOptions) {
  // // create a datasource
  // let dataSource;
  // if (_.isString(componentOptions.datasource)) {
  //   dataSource = app.dataSources[componentOptions.datasource];
  //   assert(dataSource instanceof DataSource,
  //     `Loopback Component "Auth" is referencing a dataSource that does not exist: "${componentOptions.dataSource}"`
  //   );

  //   logger.debug('using existing dataSource', componentOptions.datasource);
  // } else {
  //   // @todo should we register this dataSource with `app` instance?

  //   dataSource = loopback.createDataSource('gis-component-mail', _.defaults({
  //     name: 'loopback-component-auth',
  //   }, componentOptions.datasource));

  //   logger.debug('created new dataSource gis-component-mail');
  // }

  const dataSource = loopback.createDataSource('loopback-component-auth', _.defaults({
    name: 'loopback-component-auth',
    connector: 'transient',
  }, componentOptions.datasource || {}));

  return dataSource;
}

module.exports = initializeDataSource;
