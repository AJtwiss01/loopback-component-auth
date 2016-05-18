'use strict';

const _ = require('lodash');
const registry = {};

function add(name, options) {
  if (registry[name]) {
    throw new Error(`a provider with name "${name} is already registered"`);
  }
  registry[name] = options;
  // @TODO: validate provider options??
}

function list() {
  return Object.keys(registry).map((providerName) => {
    return _.assign({}, registry[providerName], {
      name: providerName,
    });
  });
}

module.exports = {
  add,
  list,
};
