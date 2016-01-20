'use strict';

const _ = require('lodash');

exports.makeVerify = function makeVerify(options, userIdentityModel, loginCallback) {
  return function verify(req, profile, setCookieHeader, completeRequestURI, done) {
    if (!profile) {
      return done(null);
    }

    // let setCookies = (typeof setCookieHeader === 'string') ? [setCookieHeader] : setCookieHeader;

    const optionsForCreation = _.defaults({}, options, {
      autoLogin: true,
    });

    userIdentityModel.login(
      options.provider,
      options.authScheme,
      profile, {},
      optionsForCreation,
      loginCallback(req, done));
  };
};
