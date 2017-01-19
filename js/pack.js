'use strict';

var fs = require('fs-extra');
var pr = require('promise-ring');
var pfs = pr.wrapAll(fs);
var path = require('path');
var _ = require('lodash');

var MAX_FRAMES = 15;
var MANIFEST_FILE = 'anims.json';

function statDir(dir) {
    return pfs.readdir(dir).then(function (files) {
        files.sort();

        return Promise.all(files.map(function (file) {
            var fullPath = path.join(dir, file);

            return pfs.stat(fullPath).then(function (stats) {
                return {
                    path: fullPath,
                    stats: stats
                };
            });
        }));
    });
}

function findAnimations(dir) {
    return statDir(dir).then(function (files) {
        var promises = [];
        var totalFrames = 0;
        var currentSeg = [];
        var segments = [];
        var mtime = 0;

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file.stats.isDirectory()) {
                promises.push(findAnimations(file.path));
            }
            else if (/\.png$/.test(file.path)) {
                if (currentSeg.length >= MAX_FRAMES) {
                    currentSeg = [];
                }
                if (currentSeg.length === 0) {
                    segments.push(currentSeg);
                }
                currentSeg.push(file.path);
                totalFrames++;
                if (file.stats.mtime.getTime() > mtime) {
                    mtime = file.stats.mtime.getTime();
                }
            }
        }

        if (totalFrames > 0) {
            promises.unshift({
                name: path.basename(dir),
                dir: dir,
                totalFrames: totalFrames,
                segments: segments,
                mtime: mtime
            });
        }

        return Promise.all(promises).then(function (results) {
            return _.flatten(results);
        });
    });
}

function findAudio(dir) {
    return statDir(dir).then(function (files) {
        var promises = [];
        var audioFiles = [];

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file.stats.isDirectory()) {
                promises.push(findAudio(file.path));
            }
            else if (/\.aac$/.test(file.path)) {
                promises.unshift({
                    name: path.basename(file.path, '.aac'),
                    audio: file.path
                });
            }
        }

        return Promise.all(promises).then(function (results) {
            return _.flatten(results);
        });
    });
}

function packAnims(anims, out) {
    var spritesheet = pr.wrap(require('spritesheet-js'));
    var chain = Promise.resolve();
    anims.forEach(function (anim) {
        chain = chain.then(function () {
            console.log('Packing ' + anim.name + ' (' + anim.totalFrames + ' frames)');

            var chain2 = Promise.resolve();
            anim.segments.forEach(function (segment, idx) {
                chain2 = chain2.then(function () {
                    var segName = anim.name + '-' + idx;
                    var segPath = path.join(out, segName + '.png');
                    if (fs.existsSync(segPath) && fs.statSync(segPath).mtime.getTime() > anim.mtime) {
                        console.log('  Skipping up-to-date segment ' + segName + ' (' + segment.length + ' frames)');
                    }
                    else {
                        console.log('  Packing segment ' + segName + ' (' + segment.length + ' frames)');
                        return spritesheet(segment, {
                            name: segName,
                            format: 'pixi.js',
                            trim: true,
                            path: out
                        });
                    }
                });
            });
            return chain2;
        });
    });
    return chain.then(function () {
        return anims;
    });
}

function writeManifest(anims, audio, out) {
    var manifest = {};
    var manifestPath = path.join(out, MANIFEST_FILE);
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath));
        console.log('Updating ' + MANIFEST_FILE);
    } catch (ignored) {
        console.log('Creating ' + MANIFEST_FILE);
    }
    var i = 0;
    anims.forEach(function (anim) {
        var pattern = anim.segments[0][0];
        if (anim.totalFrames > 1) {
            var match = pattern.match(/^(.*?)(0+)\.png$/);
            if (match) {
                pattern = match[1] + '%0' + match[2].length + 'd.png';
            }
        }
        manifest[anim.name] = {
            name: anim.name,
            pattern: pattern,
            totalFrames: anim.totalFrames,
            segments: anim.segments.map(function (segment, idx) {
                var segName = anim.name + '-' + idx;
                return {
                    name: segName,
                    frames: segment.length
                };
            })
        };
    });
    audio.forEach(function (data) {
        if (manifest[data.name]) {
            manifest[data.name].audio = data.audio;
        }
    });

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
}

function pack(srcdir, out, pack) {
    return pfs.ensureDir(out).then(function () {
        console.log('Looking for animations...');
        return Promise.all([findAnimations(srcdir), findAudio(srcdir)]);
    }).then(function (results) {
        let anims = results[0];
        let audio = results[1];
        console.log('Found ' + anims.length + ' animations');
        return (pack ? packAnims(anims, out) : Promise.resolve(anims)).then(function () {
            writeManifest(anims, audio, out);
            console.log('Done');
        });
    })
}

module.exports = pack;

if (require.main === module) {
    let argv = require('optimist')
        .default('out', 'anim')
        .default('pack', true)
        .argv;

    let srcdir = argv._.shift();
    if (!srcdir) {
        let home = process.env.HOME || path.join(process.env.HOMEDRIVE, process.env.HOMEPATH);
        srcdir = path.join(home, 'Dropbox', 'Benji Tests');
    }
    return pack(srcdir, argv.out, argv.pack).catch(function (err) {
        console.log(err);
        process.exit(1);
    });
}
