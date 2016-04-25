'use strict';

// core modules
const path = require('path');

// npm modules
const _ = require('lodash');
const passport = require('passport');

// local modules
const logger = require('../logger');
const utils = require('../utils');

module.exports = function setupCustomAuthType(app, appAuthDir, models, authType, name, options) {
  const providerOptions = options || {};
  const link = utils.isLink(providerOptions);
  const passportModule = require(providerOptions.module);
  const AuthStrategy = passportModule[providerOptions.strategy || 'Strategy'];

  const authTypeModule = require(path.join(appAuthDir, authType));
  const authPath = providerOptions.authPath;
  const authHTTPMethod = utils.authHTTPMethod(providerOptions);
  const callbackPath = providerOptions.callbackPath;
  const callbackHTTPMethod = utils.callbackHTTPMethod(providerOptions);

  // restore "returnTo" url (if any), set by ensureLoggedIn and remove it from the session
  function successRedirect(req) {
    if (req && req.session && req.session.returnTo) {
      const returnTo = req.session.returnTo;
      /* eslint-disable no-param-reassign */
      delete req.session.returnTo;
      /* eslint-enable no-param-reassign */
      return returnTo;
    }

    return providerOptions.successRedirect;
  }

  const failureRedirect = providerOptions.failureRedirect;

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
  const verifyFunction = authTypeModule
    .makeVerifyFunction(providerOptions, models, makeLoginCallback);

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
      // this is a JSON enabled provider => return access_token and userId accordingly
      // finish response
      if (providerOptions.json) {
        res.status(200).json({
          state: 'success',
          provider_name: name,
          userId: user.id,
          access_token: (info && info.accessToken) ? info.accessToken.id : undefined,
        });
      }

      if (info && info.accessToken) {
        // we have a legacy client that needs information to be transmitted as cookies
        res.cookie('access_token', info.accessToken.id, {
          signed: !!req.signedCookies,
          // maxAge is in ms
          maxAge: 1000 * info.accessToken.ttl,
          domain: providerOptions.domain || null,
        });
        res.cookie('userId', user.id.toString(), {
          signed: !!req.signedCookies,
          maxAge: 1000 * info.accessToken.ttl,
          domain: providerOptions.domain || null,
        });
      }

      // finally redirect our client to the success page
      const redirectTo = utils.appendQuery(successRedirect(req), {
        state: 'success',
        provider_name: name,
      });

      return res.redirect(redirectTo);
    }

    // The default callback
    passport.authenticate(name, authenticateOptions, (err, user, info) => {
      if (err) {
        return next(err);
      }

      // handle unsuccessful logins (user is not truthy)
      if (!user) {
        if (providerOptions.json) {
          return res.status(401).json({
            state: 'failure',
            provider_name: name,
            error_code: 401,
            error_message: 'authentication failed',
          });
        }

        const redirectTo = utils.appendQuery(failureRedirect, {
          state: 'failure',
          provider_name: name,
          error_code: 401,
          error_message: 'authentication failed',
        });

        return res.redirect(redirectTo);
      }

      // if there is no session support, handle auth success right away
      if (!session) {
        return handleAuthSuccess(user, info);
      }

      // session is enabled, call req.login() manually to establish the secured session
      return req.logIn(user, (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }
        return handleAuthSuccess(user, info);
      });
    })(req, res, next);
  }

  // setup authPath controller
  if (link) {
    const authorizeOptions = _.defaults({},
      providerOptions, {
        session,
      });

    let authMiddleware = passport.authorize(name, authorizeOptions);

    if (/POST/i.test(authHTTPMethod)) {
      authMiddleware = utils.addBodyParserMiddleware('auth', providerOptions, authMiddleware);
    }

    app[authHTTPMethod.toLowerCase()](authPath, authMiddleware);
    logger.debug(`registered authorize handler for provider "${name}"
      on ${authHTTPMethod} ${authPath}`);
  } else {
    let authMiddleware = providerOptions.authMiddleware || defaultAuthenticateMiddleware;

    if (/POST/i.test(authHTTPMethod)) {
      authMiddleware = utils.addBodyParserMiddleware('auth', providerOptions, authMiddleware);
    }

    app[authHTTPMethod.toLowerCase()](authPath, authMiddleware);
    logger.debug(`registered authenticate handler for provider "${name}"
      on ${authHTTPMethod} ${authPath}`);
  }

  // setup callbackPath controller
  if (link) {
    const authorizeOptions = _.defaults({}, providerOptions, {
      session,
      // failureRedirect,
      // successReturnToOrRedirect: successRedirect,
      // successRedirect: successRedirect(),
    });

    let callbackMiddleware = [
      passport.authorize(name, authorizeOptions),
      // passport.authorize doesn't handle redirect
      (req, res) => {
        // @TODO: create spec of what is returned in json version
        // the resolved account is in req.account now
        if (providerOptions.json) {
          return res
            .status(200)
            .json({
              state: 'success',
              provider_name: name,
              account: req.account,
            });
        }

        const redirectTo = utils.appendQuery(successRedirect(req), {
          state: 'success',
          provider_name: name,
        });

        return res.redirect(redirectTo);
      },
      (err, req, res, next) => {
        logger.error(err);
        if (providerOptions.json) {
          return res.status(err.status || 403).json({
            state: 'failure',
            provider_name: name,
            error_code: err.status || 403,
            error_message: err.message,
          });
        }

        // @TODO: req.flash does not exist since Expressjs 3.x
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

        const redirectTo = utils.appendQuery(failureRedirect, {
          state: 'failure',
          provider_name: name,
          error_code: err.code || 403,
          error_message: err.message,
        });

        return res.redirect(redirectTo);
      },
    ];

    if (/POST/i.test(callbackHTTPMethod)) {
      callbackMiddleware = utils.addBodyParserMiddleware('callback', providerOptions, callbackMiddleware);
    }

    app[callbackHTTPMethod.toLowerCase()](callbackPath, callbackMiddleware);
  } else {
    let callbackMiddleware = providerOptions.callbackMiddleware || defaultAuthenticateMiddleware;

    if (/POST/i.test(callbackHTTPMethod)) {
      callbackMiddleware = utils.addBodyParserMiddleware('callback', providerOptions, callbackMiddleware);
    }

    // Register the path and the callback.
    app[callbackHTTPMethod.toLowerCase()](callbackPath, callbackMiddleware);
  }
};
