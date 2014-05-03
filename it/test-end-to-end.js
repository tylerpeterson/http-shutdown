/*jslint node: true */

describe('http-shutdown', function () {
  it('should allow a port to be reused quickly', function () {
    // TODO launch an app
    // shutdown
    // launch another app on same port within timeout
    // assert success
  });

  it('should work around a real error', function () {
    // TODO launch app
    // close server
    // attempt to start new server on same port
    // assert EADDRINUSE error thrown
  });
});