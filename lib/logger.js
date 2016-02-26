'use strict';

const pkg = require('../package.json');
const labeledLogger = require('oniyi-logger')(pkg.name);

module.exports = labeledLogger;
