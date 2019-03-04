const methods = require('methods');
const RabbitApp = require('./RabbitApp');
const { toArray } = require('./utils');

class BaseApp extends RabbitApp {
  constructor(options) {
    super(options);

    this._middlewares = [];
  }

  _next(req, res, idx = -1) {
    if (this._middlewares.length > idx + 1) {
      const { match, fn } = this._middlewares[idx + 1];

      return match(req)
        ? fn(req, res)
        : this._next(req, res, idx + 1);
    }
  }

  _createEndpoint(path, method, ...middlewares) {
    const paths = path && toArray(path);

    middlewares.forEach((middleware) => {
      const idx = this._middlewares.length;

      this._middlewares.push({
        match: (req) => (!paths || paths.includes(req.path)) && (!method || req.method === method),
        fn: (req, res) => middleware(req, res, () => this._next(req, res, idx)),
      });
    });
  }

  use(...middlewares) {
    this._createEndpoint(undefined, undefined, ...middlewares);

    return this;
  }

  all(path, ...middlewares) {
    this._createEndpoint(path, undefined, ...middlewares);

    return this;
  }
}

methods.forEach((method) => {
  BaseApp.prototype[method] = function(path, ...middlewares) {
    this._createEndpoint(path, method, ...middlewares);

    return this;
  };
});

module.exports = BaseApp;
