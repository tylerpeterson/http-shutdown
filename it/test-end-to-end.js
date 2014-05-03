/*jslint node: true */
var express = require('express');
var http = require('http');
var Q = require('q');
var debug = require('debug')('http-shutdown');
var supertest = require('supertest');
var Browser = require('zombie');
var util = require('util');
var exec = require('child_process').exec;
var expect = require('chai').expect;

describe('http-shutdown', function () {
  it.skip('should allow a port to be reused quickly', function () {
    // TODO launch an app
    // shutdown
    // launch another app on same port within timeout
    // assert success
  });

  it('isn\'t necessary when using supertest', function () {
    var app = express();
    var server;
    var port;

    app.get('/', function (req, res) {
      res.send(200, {value:'test'});
    });

    server = http.createServer(app);
    return Q.ninvoke(server, 'listen').then(function () {
      debug('first server listening');
      port = server.address().port;
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
    var app = express();
    var server;
    var port;

    app.get('/', function (req, res) {
      res.send(200, {value:'test'});
    });

    server = http.createServer(app);
    return Q.ninvoke(server, 'listen').then(function () {
      debug('first server listening');
      port = server.address().port;
      var browser = new Browser();
      return browser.visit(util.format('http://localhost:%d', port)).then(function () {
        debug('successfully hit test app');
        expect(browser.success).to.be.true;
        return Q.ninvoke(server, 'close').then(function () {
          debug('first server stopped listening');
          server = http.createServer(express());
          return Q.ninvoke(server, 'listen', port).then(function () {
            debug('second server listening on same port: %d', port);
          }, function (err) {
            debug('second server couldn\'t start');
            // assert EADDRINUSE error thrown
          });
        });
      });
    });
  });

  it('should work around a real error', function () {
    var app = express();
    var server;
    var port;
    var connectionDfd = Q.defer();

    app.get('/', function (req, res) {
      connectionDfd.resolve();
      res.send(200, {value:'test'});
    });

    server = http.createServer(app);
    return Q.ninvoke(server, 'listen').then(function () {
      debug('first server listening');
      port = server.address().port;

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