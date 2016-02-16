'use strict';

// core modules
const fs = require('fs');
const path = require('path');

// 3rd party modules
const _ = require('lodash');

const logger = require('./logger');

// used to sort found files by type; order of file extension defines which extension will be loaded first
const fileExtensions = ['json', 'js'];

module.exports = function configLoader(basePath) {
  const configFileRegExp = /^providers(?:[\.-](.*))?\.(js|json)$/;
  const env = process.env.NODE_ENV ? process.env.NODE_ENV.toLowerCase() : null;
  const providerConfigs = {};
  let basePathStats;
  let configFiles;

  // load file stats for provided basePath
  try {
    basePathStats = fs.statSync(basePath);
  } catch (err) {
    logger.debug(`failed to load stats for path "${basePath}"`);
    throw err;
  }

  // check if provided basePath is actually a directiry
  if (!basePathStats.isDirectory()) {
    logger.error(`basePath "${basePath}" is not a directory`);
    throw new Error(`${basePath} must be a directory`);
  }

  configFiles = fs
    .readdirSync(basePath)
    // filter for files only
    .filter((file) => {
      return fs
        .statSync(path.join(basePath, file))
        .isFile();
    })
    // file name must match pattern /^providers(?:[\.-](.*))?\.(js|json)$/
    // providers([.-]environment)?.(js|json)
    // @TODO: this regexp will allow a filename like providers-.json
    .filter((file) => {
      const match = configFileRegExp.exec(file);
      // filter if pattern not matched
      if (!match) {
        return false;
      }
      // filter if infix does not match current environment or 'local'
      if (match[1] && ['local', env].indexOf(match[1].toLowerCase()) < 0) {
        return false;
      }
      // keep file if all previous rules were positive
      return true;
    })
    // sort rules:
    // json before js
    // plain before environment before local
    .sort((a, b) => {
      const aMatch = configFileRegExp.exec(a);
      const bMatch = configFileRegExp.exec(b);

      const aEnv = aMatch[1] ? aMatch[1].toLowerCase() : null;
      const bEnv = bMatch[1] ? bMatch[1].toLowerCase() : null;

      // both files have the same infix / environment
      // only need to compare extensions
      if (aEnv === bEnv) {
        return fileExtensions.indexOf(aMatch[2]) - fileExtensions.indexOf(bMatch[2]);
      }

      // All environments besides process.env.NODE_ENV and "local" have been filtered before
      // one of "a" and "b" doesn't have an environment infix
      // it it's "a", sort it up; sort it down otherwise
      if (!(aEnv && bEnv)) {
        return aEnv ? 1 : -1;
      }

      // in case "a" has an environment that is not "local", sort it up
      if (aEnv !== 'local') {
        return -1;
      }

      // default is to sort down
      return 1;
    });

  // subsequently load all identified config files in sorted order,
  // extend iteratively
  return configFiles
    .reduce((result, filename) => {
      return _.merge(result, require(path.join(basePath, filename)));
    }, providerConfigs);
};
