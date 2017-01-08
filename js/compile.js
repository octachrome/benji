'use strict';

var FRAME_RATE = 12.5;
var FRAME_MS = 1000 / FRAME_RATE;
var SEGMENT_FRAMES = 50;
var SEGMENT_DURATION = SEGMENT_FRAMES * FRAME_MS;
var DIALOG_PER_LINE = 60;
var DIALOG_COLORS = ['#333399', '#993333'];
var DAY_MS = 24*60*60*1000;
var GENERATE_WINDOW = 10*1000;
var POLL_INTERVAL = 100;

var fs = require('fs');
var child_process = require('child_process');
var Path = require('path');
var PEG = require('pegjs');
var wordwrap = require('wordwrap')(DIALOG_PER_LINE);
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

Script.prototype.generate = function (startTime) {
    var timeOffset = new Date().getTime() - startTime;
    var segmentStream = this.getSegments(startTime);
    var next = segmentStream.next();

    function currentTimestamp() {
        return new Date().getTime() - timeOffset;
    }

    console.log('Seeking...');
    while (!next.done && next.value.startOffset + SEGMENT_DURATION < currentTimestamp()) {
        next = segmentStream.next();
    }

    let workingSet = new Map();

    function tick() {
        // Clean up expired segments.
        for (let kv of workingSet) {
            let seq = kv[0];
            let segment = kv[1];
            if (segment.startOffset + SEGMENT_DURATION < currentTimestamp()) {
                // Segment has ended.
                // todo: delete file
                workingSet.delete(seq);
            }
        }

        // Add new segments.
        while (!next.done) {
            let segment = next.value;
            if (segment.startOffset + SEGMENT_DURATION < currentTimestamp()) {
                // Segment has already ended.
                next = segmentStream.next();
            }
            else if (segment.startOffset < currentTimestamp() + GENERATE_WINDOW) {
                // Segment should be generated.
                let mediaSequence = segment.startOffset / SEGMENT_DURATION;
                console.log('Generating', mediaSequence);
                workingSet.set(mediaSequence, segment);
                next = segmentStream.next();
            }
            else {
                break;
            }
        }

        console.log(Array.from(workingSet.keys()).sort());

        if (!next.done) {
            setTimeout(tick, POLL_INTERVAL);
        }
    }

    setTimeout(tick, POLL_INTERVAL);
};

Script.prototype.ffmpeg = function (mediaSequence, segment) {
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
        let dialogFilters = '';
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
            else if (event.type === 'dialog') {
                dialogFilters += ', ' + this.createDialogFilter(event);
            }
        }
        if (stream > firstStream) {
            let filter = '';
            for (let i = firstStream; i < stream; i++) {
                filter += '[stream' + i + '] ';
            }
            // pad=height=800:color=white, \
            filter += 'concat=n=' + (stream - firstStream) +
                ', pad=height=800:color=white' + dialogFilters + ' [thread' + thread + ']';
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
        '-f', 'segment', '-initial_offset', (mediaSequence * SEGMENT_DURATION / 1000),
        '-segment_time', '100', '-segment_format', 'mpeg_ts',
        '-segment_start_number', mediaSequence,
        '-frames:v', SEGMENT_FRAMES,
        'segment_%010d.ts');
    // console.log('ffmpeg', args.map(arg => '"' + arg + '"').join(' '));
    child_process.execFileSync('ffmpeg', args);
};

Script.prototype.createDialogFilter = function (event) {
    var lines = wordwrap(event.dialog.replace(/\\/, '\\\\').replace(/'/g, "\u2019"))
        .split(/[\r\n]+/);
    var filter = '';
    var lineOffset = -lines.length / 2;
    for (let i = 0; i < lines.length; i++) {
        if (filter) {
            filter += ', ';
        }
        filter += "drawtext=enable='between(n," +
            (event.segmentOffset / FRAME_MS) + "," +
            ((event.segmentOffset + event.duration) / FRAME_MS - 1) + "')" +
            ":x=(main_w-text_w)/2:y=(760+" + (lineOffset + i) + "*text_h)" +
            ":fontsize=30:fontcolor=" + (DIALOG_COLORS[event.pos] || 'black') +
            ":expansion=none:text='" + lines[i] + "'";
    }
    return filter;
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

Script.prototype.getSegments = function* (startTime) {
    let compileTime = startTime;
    let gen = this.getSegmentsForDate(compileTime);
    let next = gen.next();
    // Rewind until we get to the right date.
    while (next.value.startOffset > startTime) {
        compileTime = new Date(compileTime.getTime() - DAY_MS);
        gen = this.getSegmentsForDate(compileTime);
        next = gen.next();
    }
    // Set up the script for the next date too.
    compileTime = new Date(compileTime.getTime() + DAY_MS);
    let tomorrowGen = this.getSegmentsForDate(compileTime);
    let tomorrowNext = tomorrowGen.next();

    while (true) {
        if (next.done || tomorrowNext.value.startOffset <= next.value.startOffset) {
            // Roll over to the next day.
            gen = tomorrowGen;
            next = tomorrowNext;
            compileTime = new Date(compileTime.getTime() + DAY_MS);
            tomorrowGen = this.getSegmentsForDate(compileTime);
            tomorrowNext = tomorrowGen.next();
        }
        yield next.value;
        next = gen.next();
    }
};

Script.prototype.getSegmentsForDate = function* (startTime) {
    yield* this.removeEmptyThreads(
        this.collateEvents(
            doCompileScript(startTime, this.manifest, this.root, this.scripts)));
};

Script.prototype.removeEmptyThreads = function* (segments) {
    for (let segment of segments) {
        for (let kv of segment.eventsByThread) {
            let thread = kv[0], events = kv[1];
            if (events.length === 1 && events[0].type === 'nothing') {
                segment.eventsByThread.delete(thread);
            }
        }
        yield segment;
    }
};

Script.prototype.collateEvents = function* (eventStream) {
    let eventsByThread = new Map();
    let lastDialogEvent = null;
    let startOffset = null;
    for (let event of eventStream) {
        if (startOffset === null) {
            startOffset = event.globalOffset;
        }
        if (event.globalOffset - startOffset >= SEGMENT_DURATION) {
            if (lastDialogEvent) {
                lastDialogEvent.duration = startOffset + SEGMENT_DURATION - lastDialogEvent.globalOffset;
                lastDialogEvent = Object.assign({}, lastDialogEvent);
            }
            yield {
                startOffset: startOffset,
                eventsByThread: eventsByThread
            };
            eventsByThread = new Map(Array.from(eventsByThread.entries()).map(kv => {
                let events = [];
                for (let event of kv[1]) {
                    if (event.globalOffset + event.duration > startOffset + SEGMENT_DURATION) {
                        let newEvent = Object.assign({}, event);
                        let playedDuration = startOffset + SEGMENT_DURATION - event.globalOffset;
                        newEvent.startFrame = (newEvent.startFrame || 0) + playedDuration / FRAME_MS;
                        newEvent.globalOffset += playedDuration;
                        newEvent.duration -= playedDuration;
                        newEvent.segmentOffset = 0;
                        events.push(newEvent);
                    }
                }
                return [kv[0], events];
            }));
            startOffset += SEGMENT_DURATION;
            if (lastDialogEvent) {
                lastDialogEvent.globalOffset = startOffset;
                lastDialogEvent.segmentOffset = 0;
                let mainEvents = eventsByThread.get('main');
                if (!mainEvents) {
                    eventsByThread.set('main', mainEvents = []);
                }
                mainEvents.unshift(lastDialogEvent);
            }
        }
        event.segmentOffset = event.globalOffset - startOffset;
        let thread = typeof event.thread === 'number' ? event.thread : 'main';
        let events = eventsByThread.get(thread);
        if (event.type === 'clear-dialog') {
            if (lastDialogEvent) {
                lastDialogEvent.duration = event.globalOffset - lastDialogEvent.globalOffset;
                lastDialogEvent = null;
            }
            continue;
        }
        if (event.type === 'dialog') {
            lastDialogEvent = event;
        }
        if (!events) {
            eventsByThread.set(thread, events = []);
        }
        let lastEvent = events[events.length - 1];
        if (lastEvent && (lastEvent.type === 'play' || lastEvent.type === 'nothing') &&
            lastEvent.type === event.type && lastEvent.anim === event.anim && lastEvent.startFrame === event.startFrame) {
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

var script = new Script();
script.load('script.benji').then(() => {
    script.generate(new Date());
}).catch(err => {
    console.log(err.stack);
});
