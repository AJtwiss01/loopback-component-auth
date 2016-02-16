'use strict';

// core modules
const path = require('path');

// npm modules
const _ = require('lodash');
const passport = require('passport');

module.exports = function setupCustomAuthType(app, appAuthDir, models, authType, name, options) {
  const providerOptions = options || {};
  const link = !!providerOptions.link;
  const passportModule = require(providerOptions.module);
  const AuthStrategy = passportModule[providerOptions.strategy || 'Strategy'];

  const authTypeModule = require(path.join(appAuthDir, authType));
  const authPath = providerOptions.authPath || `/${(link ? 'link' : 'auth')}/${name}`;
  const authHTTPMethod = providerOptions.authHTTPMethod !== 'post' ? 'get' : 'post';
  const callbackPath = providerOptions.callbackPath || `/${(link ? 'link' : 'auth')}/${name}/callback`;
  const callbackHTTPMethod = providerOptions.callbackHTTPMethod !== 'post' ? 'get' : 'post';

  // restore "returnTo" url (if any), set by ensureLoggedIn and remove it from the session
  function successRedirect(req) {
    if (req && req.session && req.session.returnTo) {
      const returnTo = req.session.returnTo;
      /* eslint-disable no-param-reassign */
      delete req.session.returnTo;
      /* eslint-enable no-param-reassign */
      return returnTo;
    }
    return providerOptions.successRedirect || `/${(link ? 'link' : 'auth')}/account`;
  }

  const failureRedirect = providerOptions.failureRedirect || (link ? '/link.html' : '/login.html');

  const session = !!providerOptions.session;

  const makeLoginCallback = providerOptions.makeLoginCallback || function makeLoginCallback(done) {
    return (err, user, identity, token) => {
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

  // call authType specific method to generate a verify function for passport
  const verifyFunction = authTypeModule.makeVerify(providerOptions, models.userIdentityModel, makeLoginCallback);

  // register this provider in passport
  passport.use(name,
    new AuthStrategy(
      _.defaults({}, providerOptions, {
        authInfo: true,
        passReqToCallback: true,
      }),
      verifyFunction
    ));

  // provides default handling of OAuth 2.0 flow
  function defaultAuthenticateMiddleware(req, res, next) {
    const authenticateOptions = _.defaults({}, providerOptions, {
      session,
    });

    // unified handling of a successful auth attempt (regardless of enabled / disabled sessions)
    function handleAuthSuccess(user, info) {
      if (info && info.accessToken) {
        // this is a JSON enabled provider => return access_token and userId accordingly
        // finish response
        if (providerOptions.json) {
          return res.json({
            access_token: info.accessToken.id,
            userId: user.id,
          });
        }

        // we have a legacy client that needs information to be transmitted as cookies
        res.cookie('access_token', info.accessToken.id, {
          signed: req.signedCookies ? true : false,
          // maxAge is in ms
          maxAge: 1000 * info.accessToken.ttl,
          domain: providerOptions.domain ? providerOptions.domain : null,
        });
        res.cookie('userId', user.id.toString(), {
          signed: req.signedCookies ? true : false,
          maxAge: 1000 * info.accessToken.ttl,
          domain: providerOptions.domain ? providerOptions.domain : null,
        });
      }

      // finally redirect our client to the success page
      return res.redirect(successRedirect(req));
    }

    // The default callback
    passport.authenticate(name, authenticateOptions, (err, user, info) => {
      if (err) {
        return next(err);
      }

      // handle unsuccessful logins (user is not truthy)
      if (!user) {
        if (providerOptions.json) {
          return res.status(401).json('authentication failed');
        }
        return res.redirect(failureRedirect);
      }

      // if there is no session support, handle auth success right away
      if (!session) {
        return handleAuthSuccess(user, info);
      }

      // session is enabled, call req.login() manually to establish the secured session
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }
        handleAuthSuccess(user, info);
      });
    })(req, res, next);
  }

  // setup authPath controller
  if (link) {
    const authorizeOptions = _.defaults({},
      providerOptions, {
        session,
      });

    app[authHTTPMethod](authPath, passport.authorize(name, authorizeOptions));
  } else {
    const authMiddleware = providerOptions.authMiddleware || defaultAuthenticateMiddleware;
    app[authHTTPMethod](authPath, authMiddleware);
  }

  // setup callbackPath controller
  if (link) {
    const authorizeOptions = _.defaults({}, providerOptions, {
      session,
      failureRedirect,
      // successReturnToOrRedirect: successRedirect,
      successRedirect: successRedirect(),
    });

    app[callbackHTTPMethod](callbackPath, passport.authorize(name, authorizeOptions),
      // passport.authorize doesn't handle redirect
      (req, res) => {
        // @TODO: need JSON version of this
        // the resolved account is in req.account now
        res.redirect(successRedirect(req));
      },
      (err, req, res, next) => {
        // @TODO: req.flash does not exist since Expressjs 3.x; need a json version
        if (providerOptions.failureFlash) {
          if (typeof req.flash !== 'function') {
            return next(new TypeError('req.flash is not a function'));
          }
          let flash = providerOptions.failureFlash;
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
    const callbackMiddleware = providerOptions.callbackMiddleware || defaultAuthenticateMiddleware;
    // Register the path and the callback.
    app[callbackHTTPMethod](callbackPath, callbackMiddleware);
  }
};
