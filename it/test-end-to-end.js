/*jslint node: true, expr:true*/
var express = require('express');
var http = require('http');
var Q = require('q');
var debug = require('debug')('http-shutdown');
var supertest = require('supertest');
var Browser = require('zombie');
var util = require('util');
var exec = require('child_process').exec;
var expect = require('chai').expect;
var shutdown = require('../index');

describe('http-shutdown', function () {
  var app;
  var server;
  var port;
  var connectionDfd;

  beforeEach(function () {
    connectionDfd = Q.defer();
    app = express();
    app.get('/', function (req, res) {
      connectionDfd.resolve();
      res.send(200, {value:'test'});
    });
    server = http.createServer(app);
  });

  function startServer() {
    return Q.ninvoke(server, 'listen').then(function () {
      debug('first server listening');
      port = server.address().port;
    });
  }

  it('isn\'t necessary when using supertest', function () {
    return startServer().then(function () {
      return Q.ninvoke(supertest(app).get('/').expect(200), 'end').then(function (res) {
        debug('successfully hit test app');
        return Q.ninvoke(server, 'close').then(function () {
          debug('first server stopped listening');
          server = http.createServer(express());
          return Q.ninvoke(server, 'listen', port).then(function () {
            debug('second server listening on same port: %d', port);
          });
        });
      });
    });
  });

  it("isn't necessary when using zombiejs", function () {
    return startServer().then(function () {
      var browser = new Browser();
      return browser.visit(util.format('http://localhost:%d', port)).then(function () {
        debug('successfully hit test app');
        expect(browser.success).to.be.true;
        return Q.ninvoke(server, 'close').then(function () {
          debug('first server stopped listening');
          server = http.createServer(express());
          return Q.ninvoke(server, 'listen', port).then(function () {
            debug('second server listening on same port: %d', port);
          });
        });
      });
    });
  });

  it("would help when clients don't close their connections", function () {
    return startServer().then(function () {
      debug('server started on %d', port);
      var req = http.get(util.format('http://localhost:%d/', port), function (res) {});
      return connectionDfd.promise;
    }).then(function () {
      debug('made connection');
      return Q.ninvoke(server, 'close').timeout(100, 'Expected Timeout');
    }).then (function () {
      throw new Error('Server shutdown too quickly.');
    }, function (err) {
      debug('stopping the server gave err %s', err);
      if (!err || !err.message || err.message !== 'Expected Timeout') {
        throw err;
      }
    });
  });

  it.skip("should allow a port to be reused quickly even when clients don't close their connections", function() {
    var kill = shutdown(server);
    return startServer().then(function () {
      debug('server started on %d', port);
      var req = http.get(util.format('http://localhost:%d/', port), function (res) {});
      return connectionDfd.promise;
    }).then(function () {
      debug('made connection');
      return Q.nfcall(kill);
    }).then (function () {
      debug('first server stopped listening');
      server = http.createServer(express());
      return Q.ninvoke(server, 'listen', port).then(function () {
        debug('second server listening on same port: %d', port);
      });
    });    
  });

  it('would help for servers with real browsers as clients', function () {
    return startServer().then(function () {
      var processDfd = Q.defer();
      var browserProcess = exec('open ' + util.format('http://localhost:%d', port), function (error, stdout, stderr) {
        if (error !== null) {
          return processDfd.reject(error);
        }
        return processDfd.resolve(browserProcess, stdout, stderr);
      });

      return processDfd.promise.then(function (child, stdout, stderr) {
        debug('successfully launched browser process');
        return connectionDfd.promise.then(function () {
          debug('successfully hit test app');
          return Q.ninvoke(server, 'close').timeout(100, 'Expected Timeout').then(function () {
            debug('first server stopped listening');
            server = http.createServer(express());
            return Q.ninvoke(server, 'listen', port).then(function () {
              debug('second server listening on same port: %d', port);
              throw new Error ("Second server started successfully and we expected it to timeout");
            });
          }, function (err) {
            debug('stopping the server gave err %s', err);
            if (!err || !err.message || err.message !== 'Expected Timeout') {
              // We expect the server-shutdown to timeout.
              throw err;
            }
          });
        });
      });
    });
  });
});