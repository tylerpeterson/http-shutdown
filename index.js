var events = require('events');
var util = require('util');
var debug = require('debug')('http-shutdown');
var Q = require('q');
/*jslint node: true */
module.exports = function () {
  var app = new EphemeralAuthApp();
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

function AllResTracker() {
  if (!(this instanceof AllResTracker)) return new AllResTracker();
  events.EventEmitter.call(this);
  this.responses = [];
  this.connections = [];
}
util.inherits(AllResTracker, events.EventEmitter);

AllResTracker.prototype.createMiddleware = function createMiddleware() {
  var allResTracker = this;
  return function (req, res, next) {
    allResTracker.track(req, res, next);
  };
};

AllResTracker.prototype.track = function track(req, res, next) {
  this.watchForResponseToComplete(res);
  this.watchForConnectionToClose(req.socket);
  next();
};

AllResTracker.prototype.watchForResponseToComplete = function watchForResponseToComplete(res) {
  var allResTracker = this,
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
      debug('allResTracker emitting finish');
      allResTracker.emit('finish');
    }
  });
};

AllResTracker.prototype.watchForConnectionToClose = function (socket) {
  var allResTracker = this,
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

AllResTracker.prototype.pendingResponses = function () {
  return this.responses.length;
};

AllResTracker.prototype.closeAllConnections = function () {
  debug('AllResTracker closeAllConnections');
  this.connections.forEach(function (socket) {
    debug('AllResTracker closing a socket...');
    socket.setKeepAlive(false);
    socket.end();
    socket.unref();
  });
  this.connections.splice(0, this.connections.length);
};

function EphemeralAuthApp() {
  var thisAuthApp = this,
      allResTracker = new AllResTracker();

  this.allResTracker = allResTracker;
  this.connections = [];
  allResTracker.on('finish', function() {
    debug('allResTracker finish caught');
    if (thisAuthApp.closed) {
      debug('auth app closed.  Closing all connections');
      thisAuthApp.shutdownNow();
    }
  });
}

EphemeralAuthApp.prototype.shutdownNow = function() {
  this.allResTracker.closeAllConnections();
  this.server.unref();
  this.destroyCB();
};

EphemeralAuthApp.prototype.attach = function(server) {
  this.server = server;
  thisAuthApp = this;

  server.on('connection', function (socket) {
    debug('server has a new connection', socket.remoteAddress, socket.remotePort);
    thisAuthApp.trackConnection(socket);
  });
  server.on('close', function (event) {
    debug('caught close event', event);
  });  
};

EphemeralAuthApp.prototype.middleware = function() {
  return this.allResTracker.createMiddleware();
};

EphemeralAuthApp.prototype.trackConnection = function (socket) {
  this.connections.push(socket);
};

EphemeralAuthApp.prototype.destroy = function (cb) {
  debug('EphemeralAuthApp destroy');
  this.destroyCB = cb;
  if (!this.closed) {
    this.closed = true;
    this.server.close();
    if (this.allResTracker.pendingResponses() === 0) {
      this.shutdownNow();
    }
  }
};
