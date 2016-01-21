# oniyi-loopback-passport-custom-schemes [![NPM version][npm-image]][npm-url] [![Dependency Status][daviddm-image]][daviddm-url]
> Extends loopback-component-passport to support custom auth schemes (i.e. other than the supported &#34;ldap&#34;, &#34;local&#34;, &#34;oauth&#34;, &#34;oauth1&#34;, &#34;oauth 1.0&#34;, &#34;openid&#34;, &#34;openid connect&#34; and &#34;oauth 2.0&#34;)

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
    "provider": "w3-connections",
    "authScheme": "ibm-connections-basic",
    "module": "passport-ibm-connections-basic",
    "json": true,
    "session": false,
    "authHostname": "w3-connections.ibm.com",
    "openSocial": "/common"
  }
}
```

## License

Apache-2.0 © [Benjamin Kroeger]()


[npm-image]: https://badge.fury.io/js/oniyi-loopback-passport-custom-schemes.svg
[npm-url]: https://npmjs.org/package/oniyi-loopback-passport-custom-schemes
[travis-image]: https://travis-ci.org/benkroeger/oniyi-loopback-passport-custom-schemes.svg?branch=master
[travis-url]: https://travis-ci.org/benkroeger/oniyi-loopback-passport-custom-schemes
[daviddm-image]: https://david-dm.org/benkroeger/oniyi-loopback-passport-custom-schemes.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/benkroeger/oniyi-loopback-passport-custom-schemes
