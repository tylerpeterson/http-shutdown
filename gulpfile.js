var gulp = require('gulp');
var mocha = require('gulp-mocha');
var mochaConfig = {
    reporter: 'spec'
  };

gulp.task('test', function() {
  return gulp.src(['test/test-*.js'], { read: false })
    .pipe(mocha(mochaConfig));
});

gulp.task('verify', function() {
  return gulp.src(['it/test-*.js'], { read: false })
    .pipe(mocha(mochaConfig));
});