var CachingWriter = require('broccoli-caching-writer');
var path = require('path');
var fs = require('fs');
var merge = require('lodash.merge');
var omit = require('lodash.omit');
var uniq = require('lodash.uniq');
var mkdirp = require('mkdirp');

module.exports = ConcatWithMaps;
ConcatWithMaps.prototype = Object.create(CachingWriter.prototype);
ConcatWithMaps.prototype.constructor = ConcatWithMaps;

function ConcatWithMaps(inputNode, options, Strategy) {
  if (!(this instanceof ConcatWithMaps)) {
    return new ConcatWithMaps(inputNode, options, Strategy);
  }

  if (!options || !options.outputFile) {
    throw new Error('the outputFile option is required');
  }

  var allInputFiles = uniq([].concat(options.headerFiles || [], options.inputFiles || [], options.footerFiles || []));

  CachingWriter.call(this, [inputNode], {
    inputFiles: allInputFiles.length === 0 ? undefined : allInputFiles,
    annotation: options.annotation,
    name: (Strategy.name || 'Unknown') + 'Concat'
  });

  if (Strategy === undefined) {
    throw new TypeError('ConcatWithMaps requires a concat Strategy');
  }

  this.Strategy = Strategy;
  this.sourceMapConfig = omit(options.sourceMapConfig || {}, 'enabled');
  this.inputFiles = options.inputFiles;
  this.outputFile = options.outputFile;
  this.allowNone = options.allowNone;
  this.header = options.header;
  this.headerFiles = options.headerFiles;
  this._headerFooterFilesIndex = makeIndex(options.headerFiles, options.footerFiles);
  this.footer = options.footer;
  this.footerFiles = options.footerFiles;
  this.separator = (options.separator != null) ? options.separator : '\n';

  ensureNoMagic('headerFiles', this.headerFiles);
  ensureNoMagic('footerFiles', this.footerFiles);

  this.encoderCache = {};
}

var MAGIC = /[\{\}\*\[\]]/;

function ensureNoMagic(name, list) {
  (list || []).forEach(function(a) {
    if (MAGIC.test(a)) {
      throw new TypeError(name + ' cannot contain a glob,  `' + a + '`');
    }
  });
}

function makeIndex(a, b) {
  var index = Object.create(null);

  ((a || []).concat(b ||[])).forEach(function(a) {
    index[a] = true;
  });

  return index;
}

ConcatWithMaps.prototype.build = function() {
  var separator = this.separator;
  var firstSection = true;
  var outputFile = path.join(this.outputPath, this.outputFile);

  mkdirp.sync(path.dirname(outputFile));

  this.concat = new this.Strategy(merge(this.sourceMapConfig, {
    outputFile: outputFile,
    baseDir: this.inputPaths[0],
    cache: this.encoderCache
  }));

  return this.concat.end(function(concat) {
    function beginSection() {
      if (firstSection) {
        firstSection = false;
      } else {
        concat.addSpace(separator);
      }
    }

    if (this.header) {
      beginSection();
      concat.addSpace(this.header);
    }

    if (this.headerFiles) {
      this.headerFiles.forEach(function(file) {
        beginSection();
        concat.addFile(file);
      });
    }

    this.addFiles(beginSection);

    if (this.footerFiles) {
      this.footerFiles.forEach(function(file) {
        beginSection();
        concat.addFile(file);
      });
    }

    if (this.footer) {
      beginSection();
      concat.addSpace(this.footer + '\n');
    }
  }, this);
};

function isDirectory(fullPath) {
  // files returned from listFiles are directories if they end in /
  // see: https://github.com/joliss/node-walk-sync
  // "Note that directories come before their contents, and have a trailing slash"
  return fullPath.charAt(fullPath.length - 1) === '/';
}

ConcatWithMaps.prototype.addFiles = function(beginSection) {
  var headerFooterFileOverlap = false;
  var posixInputPath = ensurePosix(this.inputPaths[0]);

  var files = uniq(this.listFiles().map(ensurePosix)).filter(function(file){
    var relativePath = file.replace(posixInputPath + '/', '');

    // * remove inputFiles that are already contained within headerFiles and footerFiles
    // * alow duplicates between headerFiles and footerFiles

    if (this._headerFooterFilesIndex[relativePath] === true) {
      headerFooterFileOverlap = true;
      return false;
    }

    return !isDirectory(file);
  }, this);

  // raise IFF:
  //   * headerFiles or footerFiles overlapped with inputFiles
  //   * nothing matched inputFiles
  if (headerFooterFileOverlap === false &&
      files.length === 0 &&
      !this.allowNone) {
    throw new Error('ConcatWithMaps: nothing matched [' + this.inputFiles + ']');
  }

  files.forEach(function(file) {
    beginSection();
    this.concat.addFile(file.replace(posixInputPath + '/', ''));
  }, this);
};

function ensurePosix(filepath) {
  if (path.sep !== '/') {
    return filepath.split(path.sep).join('/');
  }
  return filepath;
}
