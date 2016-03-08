# oniyi-loopback-passport-custom-schemes [![NPM version][npm-image]][npm-url] [![Dependency Status][daviddm-image]][daviddm-url]

# DEPRECATED: For the sake of consistent naming, this module has been renamed to [loopback-component-auth](https://github.com/benkroeger/loopback-component-auth)

> Extends loopback-component-passport to support custom auth schemes (i.e. other than the supported 'ldap', 'local', 'oauth', 'oauth1', 'oauth 1.0', 'openid', 'openid connect' and 'oauth 2.0')

## Installation

```sh
$ npm install --save oniyi-loopback-passport-custom-schemes
```

## Usage
This package is still under development and not ready to be used yet. Overall target is to export a
`boot` function that will take you `app` object as well as a path to your `appRootFolder` to
dynamically read a `providers.json` file with all your authentication providers. Those providers can
then be either of the [loopback third-party providers](https://docs.strongloop.com/pages/releaseview.action?pageId=3836277#Third-partylogin(Passport)-Configuringthird-partyproviders)
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
Use option `enableSessionSupport` on the boot function to enable it - then set the 
`session` option accordingly on your providers

will merge `js`and `json` files starting with name  `providers` in `${appRootDir}/authentication`
iteratively. File name schema is **providers.[environment].(json|js)**.  
`environment` is optional. Possible values are anything you can set in `process.env.NODE_ENV`.
For file name resolution, `process.env.NODE_ENV` will be transformed to lower-case.  
One special environment is `local`. It will always be loaded **last**.  
It is okay to provide the same file name with different extensions. `json` will always be loaded before
`js`, meaning `js` **will overwrite** `json`

Sample load order:
1. providers.json
2. providers.js
3. providers.development.json
4. providers.development.js
5. providers.local.json
6. providers.local.js

## options for boot script
- app
- appRootDir (defaults to `process.cwd()`)
- enableSessionSupport
- models

## Provideroptions
- disabled (boolean) - default: false; when set to `true`, provider will not be registered
- link (boolean)
- module
- strategy (string) - default: "Strategy"; name of the module's exported Property to be used as Passport Strategy

- authPath (string) - default: `/${(link ? 'link' : 'auth')}/${name}`; path to register authenticate or authorize controller
- authHTTPMethod (string) - default "get"; possible values: "get", "post"; method to register authenticate or authorize controller
- authMiddleware (function)

- callbackPath
- callbackHTTPMethod
- callbackMiddleware

- successRedirect
- failureRedirect
- makeLoginCallback (function) - receives single argument of type `function` (the "done" handler from passport's verify function).
Must return function that takes (err, user, identity, token) as arguments and finally calls
done(err, user, authInfo) according to the passport documentation.
Purpose of the returned function is to serve as callback for UserIdentityModel.login(),
which is documented [here](https://apidocs.strongloop.com/loopback-component-passport/#useridentity-login)
- passReqToCallback
- domain
- json
- scope
- session
- failureFlash
- authInfo


## License

Apache-2.0 © [Benjamin Kroeger]()


[npm-image]: https://badge.fury.io/js/oniyi-loopback-passport-custom-schemes.svg
[npm-url]: https://npmjs.org/package/oniyi-loopback-passport-custom-schemes
[travis-image]: https://travis-ci.org/benkroeger/oniyi-loopback-passport-custom-schemes.svg?branch=master
[travis-url]: https://travis-ci.org/benkroeger/oniyi-loopback-passport-custom-schemes
[daviddm-image]: https://david-dm.org/benkroeger/oniyi-loopback-passport-custom-schemes.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/benkroeger/oniyi-loopback-passport-custom-schemes
