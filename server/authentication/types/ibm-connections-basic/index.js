'use strict';

const _ = require('lodash');

exports.makeVerify = function makeVerify(options, userIdentityModel, makeLoginCallback) {
  return function verify(req, profile, setCookieHeader, completeRequestURI, done) {
    if (!profile) {
      return done(null);
    }

    // let setCookies = (typeof setCookieHeader === 'string') ? [setCookieHeader] : setCookieHeader;

    const optionsForCreation = _.defaults({}, options, {
      autoLogin: true,
      emailOptional: true,
      // createAccessToken: function (user, callback){},
      // profileToUser: function (provider, profile, options){}
    });

    userIdentityModel.login(
      options.provider,
      options.authScheme,
      profile, {},
      optionsForCreation,
      makeLoginCallback(done));
  };
};
