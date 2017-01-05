'use strict';

var FRAME_RATE = 12.5;
var FRAME_MS = 1000 / FRAME_RATE;
var SEGMENT_FRAMES = 32;
var SEGMENT_DURATION = SEGMENT_FRAMES * FRAME_MS;

var fs = require('fs');
var child_process = require('child_process');
var Path = require('path');
var PEG = require('pegjs');
var doCompileScript = require('./compiler');

function readFile(path) {
    return new Promise(function (resolve, reject) {
        fs.readFile(path, 'utf8', function (err, data) {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}

function readScript(path) {
    return readFile(Path.join('../benji-data/scripts', path));
}

function Script() {
}

Script.prototype.compile = function (scriptPath) {
    return this.load(scriptPath).then(() => {
        let i = 0;
        let timestamp = 0;
        for (let segment of this.getSegments()) {
            if (segment.startOffset < 8 * 60 * 60 * 1000) {
                continue;
            }
            this.ffmpeg(timestamp, segment);
            timestamp += SEGMENT_DURATION;
            if (++i >= 10) {
                break;
            }
        }
    });
};

Script.prototype.ffmpeg = function (timestamp, segment) {
    let args = ['-y'];
    let filters = '';
    function addFilter(filter) {
        if (filters) {
            filters += '; ';
        }
        filters += filter;
    }
    let stream = 0;
    let threads = [];
    for (let thread of this.sortThreads(segment)) {
        let firstStream = stream;
        let events = segment.eventsByThread.get(thread);
        for (let event of events) {
            if (event.type === 'play') {
                args.push('-r', '12.5');
                if (event.startFrame) {
                    args.push('-start_number', event.startFrame);
                }
                args.push('-i', this.getAnimFilePattern(event.anim));

                let filter = '[' + stream + ':0] ';
                if (event.repeat) {
                     filter += 'loop=loop=' + event.repeat + ' ';
                }
                else {
                    // null is a nop
                    filter += 'null ';
                }
                filter += '[stream' + stream + ']';
                addFilter(filter);
                stream++;
            }
        }
        if (stream > firstStream) {
            let filter = '';
            for (let i = firstStream; i < stream; i++) {
                filter += '[stream' + i + '] ';
            }
            filter += 'concat=n=' + (stream - firstStream) + ' [thread' + thread + ']';
            addFilter(filter);
            threads.push(thread);
        }
    }
    if (threads.length === 1) {
        args.push('-filter_complex', filters, '-map', '[thread' + threads[0] + ']');
    }
    else {
        let overlay = 0;
        addFilter('[thread' + threads[0] + '] [thread' + threads[1] + '] overlay [overlay0]');
        for (let i = 2; i < threads.length; i++) {
            addFilter('[overlay' + overlay + '] [thread' + threads[i] + '] overlay [overlay' + (++overlay) + ']');
        }
        args.push('-filter_complex', filters, '-map', '[overlay' + overlay + ']');
    }
    args.push('-vcodec', 'libx264', '-acodec', 'aac',
        '-f', 'segment', '-initial_offset', (timestamp / 1000),
        '-segment_time', '100', '-segment_format', 'mpeg_ts',
        '-segment_start_number', timestamp,
        '-frames:v', SEGMENT_FRAMES,
        'segment_%d.ts');
    child_process.execFileSync('ffmpeg', args);
};

Script.prototype.getAnimFilePattern = function (animName) {
    var anim = this.manifest[animName];
    if (!anim) {
        throw new Error('Unknown anim ' + animName);
    }
    return anim.pattern;
};

Script.prototype.sortThreads = function (segment) {
    return Array.from(segment.eventsByThread.keys()).sort(function (a, b) {
        if (a === 'main') {
            return 1;
        }
        else if (b === 'main') {
            return -1;
        }
        else {
            return a - b;
        }
    });
};

Script.prototype.getSegments = function* () {
    for (let segment of this.collateEvents()) {
        for (let kv of segment.eventsByThread) {
            let thread = kv[0], events = kv[1];
            if (events.length === 1 && events[0].type === 'nothing') {
                segment.eventsByThread.delete(thread);
            }
        }
        yield segment;
    }
};

Script.prototype.collateEvents = function* () {
    let eventsByThread = new Map();
    let startOffset = null;
    for (let event of doCompileScript(new Date(), this.manifest, this.root, this.scripts)) {
        if (startOffset === null) {
            startOffset = event.offset;
        }
        else if (event.offset - startOffset >= SEGMENT_DURATION) {
            yield {
                startOffset: startOffset,
                eventsByThread: eventsByThread
            };
            eventsByThread = new Map(Array.from(eventsByThread.entries()).map(kv => {
                let events = [];
                for (let event of kv[1]) {
                    if (event.offset + event.duration > startOffset + SEGMENT_DURATION) {
                        let newEvent = Object.assign({}, event);
                        let playedDuration = startOffset + SEGMENT_DURATION - event.offset;
                        newEvent.startFrame = (newEvent.startFrame || 0) + playedDuration / FRAME_MS;
                        newEvent.offset += playedDuration;
                        newEvent.duration -= playedDuration;
                        events.push(newEvent);
                    }
                }
                return [kv[0], events];
            }));
            startOffset = event.offset;
        }
        let thread = typeof event.thread === 'number' ? event.thread : 'main';
        let events = eventsByThread.get(thread);
        if (!events) {
            eventsByThread.set(thread, events = []);
        }
        let lastEvent = events[events.length - 1];
        if (lastEvent && (lastEvent.type === 'play' || lastEvent.type === 'nothing') &&
            lastEvent.type === event.type && lastEvent.anim === event.anim) {
            lastEvent.repeat = (lastEvent.repeat || 1) + 1;
        }
        else {
            events.push(event);
        }
    }
};

Script.prototype.getParser = function () {
    if (this.parser) {
        return Promise.resolve(parser);
    }
    else {
        return readFile('js/benji.pegjs').then(parserSrc => {
            this.parser = PEG.buildParser(parserSrc);
            return this.parser;
        });
    }
};

Script.prototype.load = function (scriptPath) {
    this.playing = false;
    var self = this;

    return readFile('anims.json').then(function (manifestSrc) {
        self.manifest = JSON.parse(manifestSrc);
        self.scripts = {};

        return readScript(scriptPath).then(function (scriptSrc) {
            return self.getParser().then(function (parser) {
                console.log('Parsing main script');
                self.root = parser.parse(scriptSrc);
                console.log('Checking for included scripts');
                return Promise.resolve(self.parseIncludedScripts(self.root, parser)).then(function () {
                    console.log('Parsing complete');
                });
            });
        });
    });
};

Script.prototype.parseIncludedScripts = function (script, parser) {
    var self = this;
    if (script.type === 'Cmd' && script.cmd === 'include') {
        var filename = script.args[0];
        if (!self.scripts[filename]) {
            return readScript(filename).then(function (src) {
                // Double-check because of concurrency.
                if (!self.scripts[filename]) {
                    console.log('Parsing ' + filename);
                    self.scripts[filename] = parser.parse(src);
                    return self.parseIncludedScripts(self.scripts[filename], parser);
                }
            });
        }
    }
    else {
        if (script.child) {
            return this.parseIncludedScripts(script.child, parser);
        }
        else if (script.else) {
            return this.parseIncludedScripts(script.else, parser);
        }
        else if (script.children) {
            var promises = [];
            script.children.forEach(function (child) {
                var promise = self.parseIncludedScripts(child, parser);
                if (promise) {
                    promises.push(promise);
                }
            });
            if (promises.length) {
                return Promise.all(promises);
            }
        }
    }
};

new Script().compile('script.benji').then(events => {
    fs.writeFileSync('events.json', JSON.stringify(events, null, 2));
}).catch(err => {
    console.log(err.stack);
});
