'use strict';

var _ = require('lodash');

exports.makeVerify = function (options, userIdentityModel, loginCallback) {
  return function (req, profile, setCookieHeader, completeRequestURI, done) {
    if (!profile) {
      return done(null);
    }

    setCookieHeader = setCookieHeader || [];
    if (typeof setCookieHeader === 'string') {
      setCookieHeader = [setCookieHeader];
    }
    var optionsForCreation = _.defaults({
      autoLogin: true
    }, options);

    userIdentityModel.login(options.provider, options.authScheme, profile, {}, optionsForCreation, loginCallback(req, done));
  };
};
