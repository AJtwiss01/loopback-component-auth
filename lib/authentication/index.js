'use strict';

var _ = require('lodash');
var passport = require('passport');

module.exports = function setupCustomAuthType(app, authType, name, options) {
  var self = this;
  options = options || {};
  var link = options.link;
  var AuthStrategy = require(options.module)[options.strategy || 'Strategy'];

  var authTypeModule = require('./types/' + authType);
  var authPath = options.authPath || (link ? '/link/' : '/auth/') + name;
  var callbackPath = options.callbackPath || (link ? '/link/' : '/auth/') + name + '/callback';
  var callbackHTTPMethod = options.callbackHTTPMethod !== 'post' ? 'get' : 'post';

  // remember returnTo position, set by ensureLoggedIn
  var successRedirect = function (req) {
    if (!!req && req.session && req.session.returnTo) {
      var returnTo = req.session.returnTo;
      delete req.session.returnTo;
      return returnTo;
    }
    return options.successRedirect || (link ? '/link/account' : '/auth/account');
  };

  var failureRedirect = options.failureRedirect || (link ? '/link.html' : '/login.html');
  var scope = options.scope;

  var session = !!options.session;

  var loginCallback = options.loginCallback || function (req, done) {
    return function (err, user, identity, token) {
      var authInfo = {
        identity: identity
      };
      if (token) {
        authInfo.accessToken = token;
      }
      done(err, user, authInfo);
    };
  };

  var verifyFunction = authTypeModule.makeVerify(options, app.models.UserIdentity, loginCallback);
  passport.use(name,
    new AuthStrategy(
      _.defaults({
        authInfo: true,
        passReqToCallback: true
      }, options),
      verifyFunction
    ));

  var defaultAuthCallback = function (req, res, next) {
    // The default callback
    passport.authenticate(name,
      _.defaults({
        session: session
      },
      options.authOptions),
      function (err, user, info) {
        if (err) {
          return next(err);
        }
        if (!user) {
          if (options.json) {
            return res.status(401).json('authentication error');
          }
          return res.redirect(failureRedirect);
        }
        if (session) {
          req.logIn(user, function (err) {
            if (err) {
              return next(err);
            }
            if (info && info.accessToken) {
              if (options.json) {
                return res.json({
                  access_token: info.accessToken.id,
                  userId: user.id
                });
              } else {
                res.cookie('access_token', info.accessToken.id, {
                  signed: req.signedCookies ? true : false,
                  // maxAge is in ms
                  maxAge: 1000 * info.accessToken.ttl,
                  domain: options.domain ? options.domain : null
                });
                res.cookie('userId', user.id.toString(), {
                  signed: req.signedCookies ? true : false,
                  maxAge: 1000 * info.accessToken.ttl,
                  domain: options.domain ? options.domain : null
                });
              }
            }
            return res.redirect(successRedirect(req));
          });
        } else {
          if (info && info.accessToken) {
            if (options.json) {
              return res.json({
                access_token: info.accessToken.id,
                userId: user.id
              });
            } else {
              res.cookie('access_token', info.accessToken.id, {
                signed: req.signedCookies ? true : false,
                maxAge: 1000 * info.accessToken.ttl
              });
              res.cookie('userId', user.id.toString(), {
                signed: req.signedCookies ? true : false,
                maxAge: 1000 * info.accessToken.ttl
              });
            }
          }
          return res.redirect(successRedirect(req));
        }
      })(req, res, next);
  };

  // setup authpath controller
  if (link) {
    self.app.get(authPath, passport.authorize(name, _.defaults({
      scope: scope,
      session: session
    }, options.authOptions)));
  } else {
    var authCallback = options.customCallback || defaultAuthCallback;
    app.post(authPath, authCallback);
  }

  // setup callback path controller
  if (link) {
    self.app[callbackHTTPMethod](
      callbackPath, passport.authorize(name, _.defaults({
        session: session,
        // successReturnToOrRedirect: successRedirect,
        successRedirect: successRedirect(),
        failureRedirect: failureRedirect
      }, options.authOptions)),
      // passport.authorize doesn't handle redirect
      function (req, res) {
        res.redirect(successRedirect(req));
      },
      function (err, req, res, next) {
        if (options.failureFlash) {
          if (typeof req.flash !== 'function') {
            next(new TypeError('req.flash is not a function'));
          }
          var flash = options.failureFlash;
          if (typeof flash === 'string') {
            flash = {
              type: 'error',
              message: flash
            };
          }

          var type = flash.type || 'error';
          var msg = flash.message || err.message;
          if (typeof msg === 'string') {
            req.flash(type, msg);
          }
        }
        res.redirect(failureRedirect);
      });
  } else {
    var customCallback = options.customCallback || defaultAuthCallback;
    // Register the path and the callback.
    app[callbackHTTPMethod](callbackPath, customCallback);
  }
};
