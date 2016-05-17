[![NPM version][npm-image]][npm-url] [![Dependency Status][daviddm-image]][daviddm-url]
# loopback-component-auth
> Extends loopback-component-passport to support custom auth schemes (i.e. other than the supported 'ldap', 'local', 'oauth', 'oauth1', 'oauth 1.0', 'openid', 'openid connect' and 'oauth 2.0')

## Installation

```sh
$ npm install --save loopback-component-auth
```
(the `--save` option saves it as dependency in your `package.json`).

## Mount component to your Loopback Application
This module's main export is a function that follows the [component contract](https://docs.strongloop.com/display/public/LB/LoopBack+components#LoopBackcomponents-Componentcontract) defined in [loopback](https://docs.strongloop.com/display/LB).
With that said, you can configure this components declaratively in [component-config.json](https://docs.strongloop.com/display/LB/component-config.json) or require this module in a [boot script](https://docs.strongloop.com/display/public/LB/Defining+boot+scripts) and call the exported function with your `app` object as well as `options`.

### Example: configure declaratively

```json
{
  "loopback-component-auth": {
    "serverBaseUrl": "https://secure.my-server.com"
  }
}
```

### Example: configure from boot script

```js
'use strict';

const authComponent = require('loopback-component-auth');
const authOptions = { serverBaseUrl: 'https://secure.my-server.com' };

module.exports = function bootAuthComponent(app) {
  authComponent(app, authOptions);
}
```

### Component Options

| Name | Required | Type | Default | Description |
| ---- | -------- | ---- | ------- | ----------- |
| appRootDir | `false` | `String` | `path.join(process.cwd(), 'server')` | an absolute path referencing your Loopback Application's root directory (typically `<project>/server`) |
| enableSessionSupport | `false` | `Boolean` | `false` | is forwarded to the `init` method of `loopback-component-passport`'s `PassportConfigurator`. Will ultimately require `express-session` to be installed |
| contextRoot | `false` | `String` | `'/auth'` | **http** junction used to prefix all resources provided by this component (includes routes for providers) |
| serverBaseUrl | `false` | `String` | `'http://localhost:3000'` | base url used to `url.resolve()` all computed **absolute** urls to access resources under this component |
| frontendBaseUrl | `false` | `String` | `serverBaseUrl`, `'http://localhost:3000'` | base url used to `url.resolve()` `successRedirect` and `failureRedirect` urls for non-json providers. When only `serverBaseUrl` is provided, that value is used here as well |
| models | `false` | `Object` | `{}` | an object literal bundling information about the models described in this table. All models will default to those provided by [loopback-component-passport](https://docs.strongloop.com/display/public/LB/Third-party+login+using+Passport#Third-partyloginusingPassport-Models), [AccessToken](http://apidocs.strongloop.com/loopback/#accesstoken), [User](http://apidocs.strongloop.com/loopback/#user) |
| models.userModel | `false` | `String`, `Model` | `'User'` | String or Model instance resolving to a model to access user records. When providing a `String`, model instance will be resolved from `app.registry.getModel('userModel')` |
| models.userIdentityModel | `false` | `String`, `Model` | `'UserIdentity'` | String or Model instance resolving to a model to access user-identity records. When providing a `String`, model instance will be resolved from `app.registry.getModel('userIdentityModel')` |
| models.userCredentialModel | `false` | `String`, `Model` | `'UserCredential'` | String or Model instance resolving to a model to access user-credential records. When providing a `String`, model instance will be resolved from `app.registry.getModel('userCredentialModel')` |
| models.accessTokenModel | `false` | `String`, `Model` | `'AccessToken'` | String or Model instance resolving to a model to access access-token records. When providing a `String`, model instance will be resolved from `app.registry.getModel('accessTokenModel')` |

### Configuring Providers

When loading this Loopback Component, it will use [oniyi-config](https://github.com/benkroeger/oniyi-config) with `{ basePath: options.appRootDir + 'authentication', module: 'providers' }`.
With that said, you can configure all your authentication providers in files located e.g. at `'server/authentication'` following the pattern `providers.[environment].(json|js)`.
The `environment` part is optional. Possible values are anything you can set in `process.env.NODE_ENV`. For file name resolution, `process.env.NODE_ENV` will be transformed to lower-case.  
One special environment is `local`. It will always be loaded **last**.  

Sample load order (with `provess.env.NODE_ENV === 'development'`):

1. `'providers.json'`
2. `'providers.js'`
3. `'providers.development.json'`
4. `'providers.development.js'`
5. `'providers.local.json'`
6. `'providers.local.js'`

**Note:** As files with extension `json` will always be loaded before files with extension `js`, you can provide the same file name with different extensions (meaning `js` **will overwrite** `json` files).

Those providers can then be either of the [loopback third-party providers](https://docs.strongloop.com/pages/releaseview.action?pageId=3836277#Third-partylogin(Passport)-Configuringthird-partyproviders)
or a custom type with your own `verify` function according to the [passport documentation](http://passportjs.org/docs)

See `server/authentication` for an example

```js
{
  "w3-connections": {
    "authScheme": "ibm-connections-basic",
    "module": "passport-ibm-connections-basic",
    "json": true,
    "session": false,
    "authHostname": "w3-connections.ibm.com",
    "openSocial": "/common"
  }
}
```

## Noteworthy
sessions (including passport session middleware) are disabled per default.

## Provideroptions

* disabled (boolean) - default: false; when set to `true`, provider will not be registered
* link (boolean)
* module
* strategy (string) - default: "Strategy"; name of the module's exported Property to be used as Passport Strategy
* json
* session

### sheme options

* makeLoginCallback (function) - receives single argument of type `function` (the "done" handler from passport's verify function).
  Must return function that takes (err, user, identity, token) as arguments and finally calls
  done(err, user, authInfo) according to the passport documentation.
  Purpose of the returned function is to serve as callback for `UserIdentityModel.login()`,
  which is documented [here](https://apidocs.strongloop.com/loopback-component-passport/#useridentity-login)

### strategy options

* passReqToCallback
* successRedirect (generated for non-json providers only, uses frontendBaseUrl as base url)
* failureRedirect (generated for non-json providers only, uses frontendBaseUrl as base url)
* domain
* scope
* failureFlash
* authInfo

### route options
routeName: any. one route with name `'auth'` is always created.

* path - - computed to: `${contextRoot}/${providerName}/${routeName}`; path to register authenticate or authorize controller
* method - (String) - Allows values of `'GET'` and `'POST'`, defaults to `'GET'` when provided value doesn't match one of the allowed values case-insensitively; method to register authenticate or authorize controller
* bodyParser (string) - required when `method === 'POST'`, must be one the parsers provided by `body-parser` module
* bodyParserOptions (object) - optional; passed to `bodyParser['bodyParser'](bodyParserOptions)`
* middleware (function)





## License

Apache-2.0 © [Benjamin Kroeger]()


[npm-image]: https://badge.fury.io/js/loopback-component-auth.svg
[npm-url]: https://npmjs.org/package/loopback-component-auth
[travis-image]: https://travis-ci.org/benkroeger/loopback-component-auth.svg?branch=master
[travis-url]: https://travis-ci.org/benkroeger/loopback-component-auth
[daviddm-image]: https://david-dm.org/benkroeger/loopback-component-auth.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/benkroeger/loopback-component-auth
