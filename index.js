/*jslint node: true */
var events = require('events');
var util = require('util');
var debug = require('debug')('http-shutdown');

module.exports = function () {
  var app = new Tracker();
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
  var thisTracker = this;

  this.on('finish', function() {
    debug('tracker finish caught');
    thisTracker.tryShutdown();
  });
}
util.inherits(Tracker, events.EventEmitter);

Tracker.prototype.middleware = function() {
  var tracker = this;
  return function (req, res, next) {
    tracker.watchForResponseToComplete(res);
    tracker.watchForConnectionToClose(req.socket);
    next();
  };
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

Tracker.prototype.tryShutdown = function() {
  debug('checking for shutdown conditions');
  if (this.closed && this.pendingResponses() === 0) {
    debug('auth app is closed and no responses pending. Shutting server down.');
    this.closeAllConnections();
    this.server.unref();
    this.destroyCB();
  }
};

Tracker.prototype.attach = function(server) {
  this.server = server;
  thisTracker = this;

  server.on('connection', function (socket) {
    debug('server has a new connection', socket.remoteAddress, socket.remotePort);
    thisTracker.trackConnection(socket);
  });
  server.on('close', function (event) {
    debug('caught close event', event);
  });  
};

Tracker.prototype.trackConnection = function (socket) {
  this.connections.push(socket);
};

Tracker.prototype.destroy = function (cb) {
  debug('Tracker destroy');
  this.destroyCB = cb;
  if (!this.closed) {
    this.closed = true;
    this.server.close();
    this.tryShutdown();
  }
};
