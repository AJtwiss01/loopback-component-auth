'use strict';

const _ = require('lodash');
const passport = require('passport');

module.exports = function setupCustomAuthType(app, authType, name, options) {
  const authTypeOptions = options || {};
  const link = authTypeOptions.link;
  const AuthStrategy = require(authTypeOptions.module)[authTypeOptions.strategy || 'Strategy'];

  const authTypeModule = require('./types/' + authType);
  const authPath = authTypeOptions.authPath || (link ? '/link/' : '/auth/') + name;
  const callbackPath = authTypeOptions.callbackPath || (link ? '/link/' : '/auth/') + name + '/callback';
  const callbackHTTPMethod = authTypeOptions.callbackHTTPMethod !== 'post' ? 'get' : 'post';

  // remember returnTo position, set by ensureLoggedIn
  function successRedirect(req) {
    if (!!req && req.session && req.session.returnTo) {
      const returnTo = req.session.returnTo;
      /* eslint-disable no-param-reassign */
      delete req.session.returnTo;
      /* eslint-enable no-param-reassign */
      return returnTo;
    }
    return authTypeOptions.successRedirect || (link ? '/link/account' : '/auth/account');
  }

  const failureRedirect = authTypeOptions.failureRedirect || (link ? '/link.html' : '/login.html');
  const scope = authTypeOptions.scope;

  const session = !!authTypeOptions.session;

  const loginCallback = authTypeOptions.loginCallback || function loginCallback(req, done) {
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

  const verifyFunction = authTypeModule.makeVerify(authTypeOptions, app.models.UserIdentity, loginCallback);
  passport.use(name,
    new AuthStrategy(
      _.defaults({}, authTypeOptions, {
        authInfo: true,
        passReqToCallback: true,
      }),
      verifyFunction
    ));

  function defaultAuthCallback(req, res, next) {
    // The default callback
    passport.authenticate(name,
      _.defaults({}, authTypeOptions.authauthTypeOptions, {
        session,
      }),
      function (err, user, info) {
        if (err) {
          return next(err);
        }
        if (!user) {
          if (authTypeOptions.json) {
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
              if (authTypeOptions.json) {
                return res.json({
                  access_token: info.accessToken.id,
                  userId: user.id,
                });
              }

              res.cookie('access_token', info.accessToken.id, {
                signed: req.signedCookies ? true : false,
                // maxAge is in ms
                maxAge: 1000 * info.accessToken.ttl,
                domain: authTypeOptions.domain ? authTypeOptions.domain : null,
              });
              res.cookie('userId', user.id.toString(), {
                signed: req.signedCookies ? true : false,
                maxAge: 1000 * info.accessToken.ttl,
                domain: authTypeOptions.domain ? authTypeOptions.domain : null,
              });
            }
            return res.redirect(successRedirect(req));
          });
        } else {
          if (info && info.accessToken) {
            if (authTypeOptions.json) {
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
    app.get(authPath, passport.authorize(name, _.defaults({}, authTypeOptions.authauthTypeOptions, {
      scope,
      session,
    })));
  } else {
    const authCallback = authTypeOptions.customCallback || defaultAuthCallback;
    app.post(authPath, authCallback);
  }

  // setup callback path controller
  if (link) {
    app[callbackHTTPMethod](
      callbackPath, passport.authorize(name, _.defaults({}, authTypeOptions.authauthTypeOptions, {
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
        if (authTypeOptions.failureFlash) {
          if (typeof req.flash !== 'function') {
            return next(new TypeError('req.flash is not a function'));
          }
          let flash = authTypeOptions.failureFlash;
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
    const customCallback = authTypeOptions.customCallback || defaultAuthCallback;
    // Register the path and the callback.
    app[callbackHTTPMethod](callbackPath, customCallback);
  }
};
