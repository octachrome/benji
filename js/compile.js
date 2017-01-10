'use strict';

var FRAME_RATE = 12.5;
var FRAME_MS = 1000 / FRAME_RATE;
var SEGMENT_FRAMES = 50;
var SEGMENT_DURATION = SEGMENT_FRAMES * FRAME_MS;
var DIALOG_PER_LINE = 60;
var DIALOG_COLORS = ['#333399', '#993333'];
var DAY_MS = 24*60*60*1000;
var ACTIVE_SEGMENTS = 5;
var POLL_INTERVAL = 100;
var SEGMENT_FILENAME = 'segment_%010d.ts';
var DELETE_DELAY = 5000;
var WORKERS = 1;

var fs = require('fs');
var child_process = require('child_process');
var Path = require('path');
var PEG = require('pegjs');
var wordwrap = require('wordwrap')(DIALOG_PER_LINE);
var serveStatic = require('serve-static');
var connect = require('connect');
var sprintf = require('sprintf-js').sprintf;
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
    this.running = 0;
    this.waiting = [];
}

Script.prototype.startGenerator = function (startTime) {
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

    this.workingSet = new Map();

    let tick = () => {
        // Clean up expired segments.
        for (let kv of this.workingSet) {
            let seq = kv[0];
            let segment = kv[1];
            if (segment.startOffset + SEGMENT_DURATION < currentTimestamp()) {
                // Segment has ended.
                this.workingSet.delete(seq);
                setTimeout(() => {
                    // todo: abort running ffmpeg, and ensure file is eventually deleted
                    fs.unlink(sprintf(SEGMENT_FILENAME, seq), () => 0);
                }, DELETE_DELAY);
            }
        }

        // Add new segments.
        while (!next.done) {
            let segment = next.value;
            if (segment.startOffset + SEGMENT_DURATION < currentTimestamp()) {
                // Segment has already ended.
                next = segmentStream.next();
            }
            else if (segment.startOffset < currentTimestamp() + ACTIVE_SEGMENTS * SEGMENT_DURATION) {
                // Segment should be generated.
                let mediaSequence = segment.startOffset / SEGMENT_DURATION;
                this.enqueue((done) => this.ffmpeg(segment, done));
                this.workingSet.set(mediaSequence, segment);
                next = segmentStream.next();
            }
            else {
                break;
            }
        }

        if (!next.done) {
            setTimeout(tick, POLL_INTERVAL);
        }
    };

    console.log('Running...');
    setTimeout(tick, POLL_INTERVAL);
};

Script.prototype.enqueue = function (fn) {
    if (this.running < WORKERS) {
        fn(() => {
            while (this.waiting.length && this.running.length < WORKERS) {
                this.enqueue(this.waiting.shift());
            }
        });
    }
    else {
        this.waiting.push(fn);
    }
};

Script.prototype.startServer = function () {
    let app = connect();
    app.use('/segments.m3u8', (req, res, next) => {
        this.writePlaylist(req, res, next);
    });
    app.use('/', serveStatic(Path.join(__dirname, '..')));
    let server = app.listen(8080);
    server.on('error', function (err) {
        console.error(err);
    });
};

Script.prototype.writePlaylist = function (req, res, next) {
    var sequenceNumbers = this.workingSet ? Array.from(this.workingSet.keys()).sort() : [];
    let ready = [];
    for (let i = 0; i < sequenceNumbers.length; i++) {
        let seq = sequenceNumbers[i];
        let segment = this.workingSet.get(seq);
        if (segment.status !== 'ready') {
            break;
        }
        if (i === 0 || seq === sequenceNumbers[i - 1] + 1) {
            ready.push(seq);
        }
    }
    if (!ready.length) {
        setTimeout(() => this.writePlaylist(req, res, next), 50);
    }
    else {
        var playlistText = '#EXTM3U\n' +
            '#EXT-X-VERSION:3\n' +
            '#EXT-X-MEDIA-SEQUENCE:' + ready[0] + '\n' +
            '#EXT-X-ALLOW-CACHE:YES\n' +
            '#EXT-X-TARGETDURATION:' + (SEGMENT_DURATION / 1000) + '\n' +
            ready.map((seq) =>
                '#EXTINF:' + (SEGMENT_DURATION / 1000) + ',\n' +
                sprintf(SEGMENT_FILENAME, seq) + '\n');
        res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl'
        });
        res.end(playlistText);
    }
};

Script.prototype.ffmpeg = function (segment, done) {
    let mediaSequence = segment.startOffset / SEGMENT_DURATION;
    let args = ['-y'];
    let filters = '';
    function addFilter(filter) {
        if (filters) {
            filters += '; ';
        }
        filters += filter;
    }
    let videoStream = 0;
    let audioStream = 0;
    let inputStream = 0;
    let threads = [];
    for (let thread of this.sortThreads(segment)) {
        let firstVideoStream = videoStream;
        let events = segment.eventsByThread.get(thread);
        let dialogFilters = '';
        for (let event of events) {
            if (event.type === 'play') {
                args.push('-r', '12.5');
                if (event.startFrame) {
                    args.push('-start_number', event.startFrame);
                }
                args.push('-i', this.getAnimFilePattern(event.anim));

                let filter = '[' + (inputStream++) + ':0] ';
                if (event.repeat) {
                     filter += 'loop=loop=' + event.repeat + ' ';
                }
                else {
                    // null is a nop
                    filter += 'null ';
                }
                filter += '[vstream' + (videoStream++) + ']';
                addFilter(filter);

                let audio = this.getAudioPath(event.anim);
                if (audio) {
                    if (event.startFrame) {
                        args.push('-ss', event.startFrame * FRAME_MS / 1000);
                    }
                    args.push('-i', audio);
                    let filter = '[' + (inputStream++) + ':0] ';
                    let localOffset = event.globalOffset - segment.startOffset;
                    if (localOffset > 0) {
                        filter += 'adelay=' + localOffset + '|' + localOffset;
                    }
                    else {
                        filter += 'anull';
                    }
                    filter += ' [astream' + (audioStream++) + ']';
                    addFilter(filter);
                }
            }
            else if (event.type === 'dialog') {
                dialogFilters += ', ' + this.createDialogFilter(event);
            }
        }
        if (videoStream > firstVideoStream) {
            let filter = '';
            for (let i = firstVideoStream; i < videoStream; i++) {
                filter += '[vstream' + i + '] ';
            }
            // pad=height=800:color=white, \
            filter += 'concat=n=' + (videoStream - firstVideoStream) +
                ', pad=height=800:color=white' + dialogFilters + ' [thread' + thread + ']';
            addFilter(filter);
            threads.push(thread);
        }
    }
    let videoMap;
    if (threads.length === 1) {
        videoMap = '[thread' + threads[0] + ']';
    }
    else {
        let overlay = 0;
        addFilter('[thread' + threads[0] + '] [thread' + threads[1] + '] overlay [overlay0]');
        for (let i = 2; i < threads.length; i++) {
            addFilter('[overlay' + overlay + '] [thread' + threads[i] + '] overlay [overlay' + (++overlay) + ']');
        }
        videoMap = '[overlay' + overlay + ']';
    }
    if (audioStream > 0) {
        let filter = '';
        for (let i = 0; i < audioStream; i++) {
            filter += '[astream' + i + '] ';
        }
        filter += 'amix=inputs=' + audioStream + ' [audiomix]';
        addFilter(filter);
    }
    args.push('-filter_complex', filters, '-map', videoMap);
    if (audioStream > 0) {
        args.push('-map', '[audiomix]');
    }
    args.push('-vcodec', 'libx264', '-acodec', 'aac',
        '-f', 'segment', '-initial_offset', (mediaSequence * SEGMENT_DURATION / 1000),
        '-segment_time', '100', '-segment_format', 'mpeg_ts',
        '-segment_start_number', mediaSequence,
        // '-frames:v', SEGMENT_FRAMES,
        '-t', (SEGMENT_DURATION / 1000),
        SEGMENT_FILENAME);

    segment.status = 'preparing';
    // console.log('ffmpeg', args.map(arg => '"' + arg + '"').join(' '));
    child_process.execFile('ffmpeg', args, (err, stdout, stderr) => {
        if (err) {
            console.error(err);
        }
        done && done();
        segment.status = 'ready';
    });
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

Script.prototype.getAudioPath = function (animName) {
    var anim = this.manifest[animName];
    if (!anim) {
        throw new Error('Unknown anim ' + animName);
    }
    return anim.audio;
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
    script.startServer();
    script.startGenerator(new Date('2016-01-01 07:00:01'));
}).catch(err => {
    console.log(err.stack);
});
