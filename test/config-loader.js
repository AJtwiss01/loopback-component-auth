'use strict';

const path = require('path');
const configLoader = require('../lib/config-loader');

// process.env.NODE_ENV = 'development';
const providerConfigs = configLoader(path.join(__dirname, 'provider-configs'));

console.log(providerConfigs);
