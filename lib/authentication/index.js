/* eslint global-require: 0 */
'use strict';

// core modules
const path = require('path');

// npm modules
const _ = require('lodash');
const passport = require('passport');

// local modules
const logger = require('../logger');
const utils = require('../utils');

module.exports = function setupCustomAuthScheme(app, appAuthDir, models, name, options) {
  const passportModule = require(options.provider.module);
  const AuthStrategy = passportModule[options.provider.strategy];

  const authSchemeModule = require(path.join(appAuthDir, options.provider.authScheme));

  // restore "returnTo" url (if any), set by ensureLoggedIn and remove it from the session
  function successRedirect(req) {
    if (req && req.session && req.session.returnTo) {
      const returnTo = req.session.returnTo;
      /* eslint-disable no-param-reassign */
      delete req.session.returnTo;
      /* eslint-enable no-param-reassign */
      return returnTo;
    }

    return options.strategy.successRedirect;
  }

  const failureRedirect = options.strategy.failureRedirect;

  const makeLoginCallback = options.provider.makeLoginCallback || function makeLoginCallback(done) {
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

  // call authScheme specific method to generate a verify function for passport
  const verifyFunction = authSchemeModule.makeVerifyFunction(options, models, makeLoginCallback);

  // register this provider in passport
  passport.use(name,
    new AuthStrategy(
      _.defaults({}, options.strategy, {
        authInfo: true,
        passReqToCallback: true,
      }),
      verifyFunction
    ));

  const passportAuthOptions = _.defaults({}, options.provider, options.strategy);

  // provide default handling of OAuth 2.0 flow
  function defaultAuthenticateMiddleware(req, res, next) {
    // unified handling of a successful auth attempt (regardless of enabled / disabled sessions)
    function handleAuthSuccess(user, info) {
      // this is a JSON enabled provider => return access_token and userId accordingly
      // finish response
      if (options.provider.json) {
        return res.status(200).json({
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
          domain: _.isString(options.provider.domain) ? options.provider.domain : null,
        });
        res.cookie('userId', user.id.toString(), {
          signed: !!req.signedCookies,
          maxAge: 1000 * info.accessToken.ttl,
          domain: _.isString(options.provider.domain) ? options.provider.domain : null,
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
    passport.authenticate(name, passportAuthOptions, (err, user, info) => {
      if (err) {
        return next(err);
      }

      // handle unsuccessful logins (user object was not resolved truthy)
      if (!user) {
        if (options.provider.json) {
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
      if (!options.provider.session) {
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

  const defaultMiddleware = {
    auth: defaultAuthenticateMiddleware,
    callback: defaultAuthenticateMiddleware,
  };

  const defaultLinkMiddleware = {
    auth: passport.authorize(name, passportAuthOptions),
    callback: [
      (req, res, next) => {
        passport.authorize(name, passportAuthOptions, (authorizeError, user, infoOrChallange, status) => {
          if (authorizeError) {
            return next(authorizeError);
          }
          if (user) {
            req.account = user; // eslint-disable-line no-param-reassign
            return next();
          }
          let errorMessage = infoOrChallange;
          if (!_.isString(errorMessage)) {
            try {
              errorMessage = JSON.stringify(errorMessage);
            } catch (stringifyError) {
              logger.error('can not stringify errorMessage object', stringifyError);
            }
          }
          const authorizeFailedError = new Error(errorMessage);
          authorizeFailedError.status = status || 403;
          return next(authorizeFailedError);
        })(req, res, next);
      },
      // passport.authorize doesn't handle json providers, thus we need to ship our own success handler
      (req, res) => {
        // @TODO: create spec of what is returned in json version
        // the resolved account is in req.account now
        if (options.provider.json) {
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
        if (options.provider.json) {
          return res.status(err.status || 403).json({
            state: 'failure',
            provider_name: name,
            error_code: err.status || 403,
            error_message: err.message,
          });
        }

        // @TODO: req.flash does not exist since Expressjs 3.x
        if (options.strategy.failureFlash) {
          if (typeof req.flash !== 'function') {
            return next(new TypeError('req.flash is not a function'));
          }
          let flash = options.strategy.failureFlash;
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
    ],
  };

  // register handlers for each route configured in provider
  Object.keys(options.route).forEach((routeName) => {
    const route = options.route[routeName];

    const middlewareCatalog = options.provider.link ? defaultLinkMiddleware : defaultMiddleware;
    const middleware = route.middleware || middlewareCatalog[routeName];

    // check for valid middleware
    if (!(typeof middleware === 'function' || Array.isArray(middleware))) {
      throw new TypeError(`can not resolve "${routeName}" middleware for provider ${name}`);
    }

    app[route.method.toLowerCase()](route.path, middleware);
    logger.info(`registered handler for "${routeName}" route with path ${route.path}`);
  });
};
