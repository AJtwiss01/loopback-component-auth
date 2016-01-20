'use strict';

const _ = require('lodash');
const passport = require('passport');

module.exports = function setupCustomAuthType(app, authType, name, options = {}) {
  const link = options.link;
  const AuthStrategy = require(options.module)[options.strategy || 'Strategy'];

  const authTypeModule = require('./types/' + authType);
  const authPath = options.authPath || (link ? '/link/' : '/auth/') + name;
  const callbackPath = options.callbackPath || (link ? '/link/' : '/auth/') + name + '/callback';
  const callbackHTTPMethod = options.callbackHTTPMethod !== 'post' ? 'get' : 'post';

  // remember returnTo position, set by ensureLoggedIn
  function successRedirect(req) {
    if (!!req && req.session && req.session.returnTo) {
      const returnTo = req.session.returnTo;
      /* eslint-disable no-param-reassign */
      delete req.session.returnTo;
      /* eslint-enable no-param-reassign */
      return returnTo;
    }
    return options.successRedirect || (link ? '/link/account' : '/auth/account');
  }

  const failureRedirect = options.failureRedirect || (link ? '/link.html' : '/login.html');
  const scope = options.scope;

  const session = !!options.session;

  const loginCallback = options.loginCallback || function loginCallback(req, done) {
    return function (err, user, identity, token) {
      const authInfo = {
        identity,
      };

      if (err) {
        return done(err, user, authInfo);
      }

      if (token) {
        authInfo.accessToken = token;
      }
      return done(err, user, authInfo);
    };
  };

  const verifyFunction = authTypeModule.makeVerify(options, app.models.UserIdentity, loginCallback);
  passport.use(name,
    new AuthStrategy(
      _.defaults({}, options, {
        authInfo: true,
        passReqToCallback: true,
      }),
      verifyFunction
    ));

  function defaultAuthCallback(req, res, next) {
    // The default callback
    passport.authenticate(name,
      _.defaults({}, options.authOptions, {
        session,
      }),
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
          req.logIn(user, function sessionLoginCallback(loginErr) {
            if (loginErr) {
              return next(loginErr);
            }
            if (info && info.accessToken) {
              if (options.json) {
                return res.json({
                  access_token: info.accessToken.id,
                  userId: user.id,
                });
              }

              res.cookie('access_token', info.accessToken.id, {
                signed: req.signedCookies ? true : false,
                // maxAge is in ms
                maxAge: 1000 * info.accessToken.ttl,
                domain: options.domain ? options.domain : null,
              });
              res.cookie('userId', user.id.toString(), {
                signed: req.signedCookies ? true : false,
                maxAge: 1000 * info.accessToken.ttl,
                domain: options.domain ? options.domain : null,
              });
            }
            return res.redirect(successRedirect(req));
          });
        } else {
          if (info && info.accessToken) {
            if (options.json) {
              return res.json({
                access_token: info.accessToken.id,
                userId: user.id,
              });
            }
            res.cookie('access_token', info.accessToken.id, {
              signed: req.signedCookies ? true : false,
              maxAge: 1000 * info.accessToken.ttl,
            });
            res.cookie('userId', user.id.toString(), {
              signed: req.signedCookies ? true : false,
              maxAge: 1000 * info.accessToken.ttl,
            });
          }
          return res.redirect(successRedirect(req));
        }
      })(req, res, next);
  }

  // setup authpath controller
  if (link) {
    app.get(authPath, passport.authorize(name, _.defaults({}, options.authOptions, {
      scope,
      session,
    })));
  } else {
    const authCallback = options.customCallback || defaultAuthCallback;
    app.post(authPath, authCallback);
  }

  // setup callback path controller
  if (link) {
    app[callbackHTTPMethod](
      callbackPath, passport.authorize(name, _.defaults({}, options.authOptions, {
        session,
        failureRedirect,
        // successReturnToOrRedirect: successRedirect,
        successRedirect: successRedirect(),
      })),
      // passport.authorize doesn't handle redirect
      function (req, res) {
        res.redirect(successRedirect(req));
      },
      function (err, req, res, next) {
        if (options.failureFlash) {
          if (typeof req.flash !== 'function') {
            return next(new TypeError('req.flash is not a function'));
          }
          let flash = options.failureFlash;
          if (typeof flash === 'string') {
            flash = {
              type: 'error',
              message: flash,
            };
          }

          const type = flash.type || 'error';
          const msg = flash.message || err.message;
          if (typeof msg === 'string') {
            req.flash(type, msg);
          }
        }
        res.redirect(failureRedirect);
      });
  } else {
    const customCallback = options.customCallback || defaultAuthCallback;
    // Register the path and the callback.
    app[callbackHTTPMethod](callbackPath, customCallback);
  }
};
