/*jslint node: true */
var events = require('events');
var util = require('util');
var debug = require('debug')('http-shutdown');

module.exports = function () {
  var app = new App();
  return {
    middleware: function () {
      return app.middleware();
    },

    attach: function (server) {
      return app.attach(server);
    },

    destroy: function (cb) {
      return app.destroy(cb);
    }
  };
};

function Tracker() {
  events.EventEmitter.call(this);
  this.responses = [];
  this.connections = [];
}
util.inherits(Tracker, events.EventEmitter);

Tracker.prototype.createMiddleware = function createMiddleware() {
  var tracker = this;
  return function (req, res, next) {
    tracker.track(req, res, next);
  };
};

Tracker.prototype.track = function track(req, res, next) {
  this.watchForResponseToComplete(res);
  this.watchForConnectionToClose(req.socket);
  next();
};

Tracker.prototype.watchForResponseToComplete = function watchForResponseToComplete(res) {
  var tracker = this,
      responses = this.responses;

  if (responses.indexOf(res) !== -1) {
    return;
  }

  responses.push(res);

  res.on('finish', function () {
    var index = responses.indexOf(res);

    debug('A response completed');
    if (index !== -1) {
      responses.splice(index, 1);
    }

    if (responses.length === 0) {
      debug('tracker emitting finish');
      tracker.emit('finish');
    }
  });
};

Tracker.prototype.watchForConnectionToClose = function (socket) {
  var tracker = this,
      connections = this.connections;

  if (connections.indexOf(socket) !== -1) {
    return;
  }

  connections.push(socket);

  socket.on('close', function () {
    var index = connections.indexOf(socket);

    debug('A connection closed');

    if (index !== -1) {
      connections.splice(index, 1);
    }
  });
};

Tracker.prototype.pendingResponses = function () {
  return this.responses.length;
};

Tracker.prototype.closeAllConnections = function () {
  debug('Tracker closeAllConnections');
  this.connections.forEach(function (socket) {
    debug('Tracker closing a socket...');
    socket.setKeepAlive(false);
    socket.end();
    socket.unref();
  });
  this.connections.splice(0, this.connections.length);
};

function App() {
  var thisApp = this;

  this.tracker = new Tracker();
  this.connections = [];
  this.tracker.on('finish', function() {
    debug('tracker finish caught');
    thisApp.tryShutdown();
  });
}

App.prototype.tryShutdown = function() {
  debug('checking for shutdown conditions');
  if (this.closed && this.tracker.pendingResponses() === 0) {
    debug('auth app is closed and no responses pending. Shutting server down.');
    this.tracker.closeAllConnections();
    this.server.unref();
    this.destroyCB();
  }
};

App.prototype.attach = function(server) {
  this.server = server;
  thisApp = this;

  server.on('connection', function (socket) {
    debug('server has a new connection', socket.remoteAddress, socket.remotePort);
    thisApp.trackConnection(socket);
  });
  server.on('close', function (event) {
    debug('caught close event', event);
  });  
};

App.prototype.middleware = function() {
  return this.tracker.createMiddleware();
};

App.prototype.trackConnection = function (socket) {
  this.connections.push(socket);
};

App.prototype.destroy = function (cb) {
  debug('App destroy');
  this.destroyCB = cb;
  if (!this.closed) {
    this.closed = true;
    this.server.close();
    this.tryShutdown();
  }
};
