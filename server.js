'use strict';

var FRAME_RATE = 12.5;
var FRAME_MS = 1000 / FRAME_RATE;
var SEGMENT_FRAMES = 50;
var SEGMENT_MS = SEGMENT_FRAMES * FRAME_MS;
var AUDIO_SAMPLE_RATE = 44100;
var DIALOG_PER_LINE = 60;
var DIALOG_COLORS = ['#333399', '#993333'];
var DAY_MS = 24*60*60*1000;
var ACTIVE_SEGMENTS = 5;
var POLL_INTERVAL = 100;
var SEGMENT_FILENAME = 'segment_%010d.ts';
var SEGMENT_DIR = 'video';
var DELETE_DELAY = 5000;
var MAX_WORKERS = 2;
var ENCODE_MS = SEGMENT_MS; // Expected time taken to encode a segment.
var PORT = 8080;
var DEBUG = false;
var VIDEO = true;
var AUDIO = true;

var fs = require('fs-extra');
var child_process = require('child_process');
var Path = require('path');
var pr = require('promise-ring');
var PEG = require('pegjs');
var wordwrap = require('wordwrap')(DIALOG_PER_LINE);
var serveStatic = require('serve-static');
var connect = require('connect');
var sprintf = require('sprintf-js').sprintf;
var doCompileScript = require('./js/compiler');
var pack = require('./js/pack');
var charm = require('charm')();
charm.pipe(process.stdout);

var ffmpegResult = child_process.spawnSync('ffmpeg', ['-version'], {encoding: 'utf8'});
if (ffmpegResult.error) {
    if (ffmpegResult.error.code === 'ENOENT') {
        console.error('Could not find FFmpeg in path');
    }
    else {
        console.error(ffmpegResult.error.message);
    }
    process.exit(1);
}
var ffmpegVersion = ffmpegResult.stdout.match(/ffmpeg version ([^ ]+)/);
if (!ffmpegVersion) {
    console.error('Cound not determine FFmpeg version');
    process.exit(1);
}
else {
    if (!/3\.([2-9]\.|\d{2,}\.)|^[4-9]\.|^\d{2,}\.|^20(1[7-9]|[2-9]\d)/.test(ffmpegVersion[1])) {
        console.error('FFmpeg 3.2 or later is needed, but found', ffmpegVersion[1]);
        process.exit(1);
    }
}

let home = process.env.HOME || Path.join(process.env.HOMEDRIVE, process.env.HOMEPATH);

var argv = require('minimist')(process.argv.slice(2), {
    default: {
        'scripts': 'd:/dropbox/Benji/scripts',
        'media': 'd:/dropbox/Benji'
    },
    alias: {
        's': 'scripts',
        'm': 'media'
    }
});

function readFile(path) {
    return pr.call(fs.readFile, path, 'utf8');
}

function readScript(path) {
    return readFile(Path.join(argv.scripts, path));
}

function Server() {
    this.running = 0;
    this.waiting = [];
}

Server.prototype.startGenerator = function (startTime) {
    var timeOffset = new Date().getTime() - startTime;
    var segmentStream = this.getSegments(startTime);
    var next = segmentStream.next();

    function currentTimestamp() {
        return new Date().getTime() - timeOffset;
    }

    console.log('Seeking...');
    let lastLogged;
    while (!next.done && next.value.startOffset + SEGMENT_MS < currentTimestamp()) {
        let segment = next.value;
        if (!lastLogged || segment.startOffset - lastLogged > 5*60*1000) {
            charm.erase('line').move(-100, 0).write(new Date(segment.startOffset).toString());
            lastLogged = segment.startOffset;
        }
        // console.log('segment', segment.startOffset, segment.eventsByThread);
        next = segmentStream.next();
    }
    console.log('\nGo to http://localhost:' + PORT + ' in your browser');

    this.workingSet = new Map();
    this.allowedWorkers = MAX_WORKERS;
    let wroteLines = 0;

    let tick = () => {
        // Clean up expired segments.
        for (let kv of this.workingSet) {
            let seq = kv[0];
            let segment = kv[1];
            if (segment.startOffset + SEGMENT_MS < currentTimestamp()) {
                // Segment has ended.
                this.workingSet.delete(seq);
                setTimeout(() => {
                    // todo: abort running ffmpeg, and ensure file is eventually deleted
                    fs.unlink(Path.join(__dirname, SEGMENT_DIR, sprintf(SEGMENT_FILENAME, seq)), () => 0);
                }, DELETE_DELAY);
            }
        }

        // Add new segments.
        while (!next.done) {
            let segment = next.value;
            if (segment.startOffset < currentTimestamp() + ENCODE_MS) {
                // Too late for this Segment.
                next = segmentStream.next();
            }
            else if (segment.startOffset < currentTimestamp() + ACTIVE_SEGMENTS * SEGMENT_MS) {
                // Segment should be generated.
                let mediaSequence = segment.startOffset / SEGMENT_MS;
                this.enqueue((done) => this.ffmpeg(segment, done));
                this.workingSet.set(mediaSequence, segment);
                next = segmentStream.next();
            }
            else {
                break;
            }
        }

        if (!DEBUG) {
            charm.up(wroteLines).erase('down');
            wroteLines = 0;
            for (let kv of this.workingSet) {
                charm.write(String(kv[0])).write('\t');
                if (kv[1].status === 'ready') {
                    charm.foreground('green');
                }
                else if (kv[1].status === 'encoding') {
                    charm.foreground('yellow');
                }
                else {
                    charm.foreground('blue');
                }
                charm.write(kv[1].status || 'waiting').write('\n').foreground('white');
                wroteLines++;
            }
        }

        if (!next.done) {
            setTimeout(tick, POLL_INTERVAL);
        }
    };

    console.log('Running...');
    setTimeout(tick, POLL_INTERVAL);
};

Server.prototype.enqueue = function (fn) {
    if (this.running < this.allowedWorkers) {
        this.running++;
        fn(() => {
            this.running--;
            while (this.waiting.length && this.running < this.allowedWorkers) {
                this.enqueue(this.waiting.shift());
            }
        });
    }
    else {
        this.waiting.push(fn);
    }
};

Server.prototype.startServer = function () {
    let app = connect();
    app.use('/segments.m3u8', (req, res, next) => {
        this.writePlaylist(req, res, next);
    });
    app.use('/', serveStatic(Path.join(__dirname, 'www')));
    app.use('/', serveStatic(Path.join(__dirname, SEGMENT_DIR)));
    let server = app.listen(PORT);
    server.on('error', function (err) {
        console.error(err);
        process.exit(1);
    });
};

Server.prototype.writePlaylist = function (req, res, next) {
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
        this.allowedWorkers = MAX_WORKERS;
        setTimeout(() => this.writePlaylist(req, res, next), 50);
    }
    else {
        if (ready.length > 1) {
            this.allowedWorkers = 1;
        }
        else {
            this.allowedWorkers = MAX_WORKERS;
        }
        var playlistText = '#EXTM3U\n' +
            '#EXT-X-VERSION:3\n' +
            '#EXT-X-MEDIA-SEQUENCE:' + ready[0] + '\n' +
            '#EXT-X-ALLOW-CACHE:YES\n' +
            '#EXT-X-TARGETDURATION:' + (SEGMENT_MS / 1000) + '\n' +
            ready.map((seq) =>
                '#EXTINF:' + (SEGMENT_MS / 1000) + ',\n' +
                sprintf(SEGMENT_FILENAME, seq)).join('\n');
        res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl'
        });
        res.end(playlistText);
    }
};

Server.prototype.ffmpeg = function (segment, done) {
    let mediaSequence = segment.startOffset / SEGMENT_MS;
    let args = ['-y'];
    let filters = '';
    function addFilter(filter) {
        if (filters) {
            filters += '; ';
        }
        filters += filter;
    }
    let outputStream = 0;
    let inputStream = 0;
    let threads = [];
    for (let thread of this.sortThreads(segment)) {
        let firstOutputStream = outputStream;
        let events = segment.eventsByThread.get(thread);
        let dialogFilters = '';
        for (let event of events) {
            if (event.type === 'play') {
                let anim = this.getAnimation(event.anim);
                let thisStream = outputStream++;
                let startFrame = (event.startFrame || 0) % anim.totalFrames;
                let playFrames = event.duration / FRAME_MS;
                let endFrame = startFrame + playFrames;
                let loops = Math.ceil(endFrame / anim.totalFrames);

                if (VIDEO) {
                    args.push('-r', '12.5');
                    args.push('-i', anim.pattern);

                    let filter = '[' + (inputStream++) + ':0] ';
                    if (loops > 1) {
                        filter += 'loop=' + (loops - 1) + ':' + anim.totalFrames + ', ';
                    }
                    filter += 'trim=start_frame=' + startFrame +
                        ':end_frame=' + endFrame + ', setpts=N/(FRAME_RATE*TB) [vstream' + thisStream + ']';
                    addFilter(filter);
                }

                if (AUDIO) {
                    let filter = '';
                    if (anim.audio) {
                        args.push('-i', anim.audio);
                        filter = '[' + (inputStream++) + ':0] ';
                        if (loops > 1) {
                            filter += 'aloop=' + (loops - 1) + ':' + (anim.totalFrames * FRAME_MS / 1000 * AUDIO_SAMPLE_RATE) + ', ';
                        }
                    }
                    else {
                        filter = 'anullsrc, ';
                    }
                    filter += 'atrim=start=' + (startFrame * FRAME_MS / 1000) +
                        ':end=' + (endFrame * FRAME_MS / 1000) + ', asetpts=N/SR/TB [astream' + thisStream + ']';
                    addFilter(filter);
                }
            }
            else if (event.type === 'dialog') {
                dialogFilters += ', ' + this.createDialogFilter(event);
            }
        }
        if (outputStream > firstOutputStream) {
            let filter = '';
            for (let i = firstOutputStream; i < outputStream; i++) {
                if (VIDEO) {
                    filter += '[vstream' + i + '] ';
                }
                if (AUDIO) {
                    filter += '[astream' + i + '] ';
                }
            }
            filter += 'concat=v=' + (VIDEO ? 1 : 0) + ':a=' + (AUDIO ? 1 : 0) +':n=' + (outputStream - firstOutputStream) + ' ';
            if (VIDEO) {
                filter += '[vthread' + thread + '] ';
                addFilter('[vthread' + thread + '] pad=height=800:color=white' + dialogFilters + ' [thread' + thread + ']');
            }
            if (AUDIO) {
                filter += '[athread' + thread + '] ';
            }
            addFilter(filter);
            threads.push(thread);
        }
    }
    let videoMap, audioMap;
    if (VIDEO) {
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
    }
    if (AUDIO) {
        if (threads.length === 1) {
            audioMap = '[athread' + threads[0] + ']';
        }
        else {
            let filter = '';
            for (let i = 0; i < threads.length; i++) {
                filter += '[athread' + threads[i] + '] ';
            }
            filter += 'amerge=inputs=' + threads.length + ', pan=stereo|c0=c0';
            // Left channel mix:
            for (let i = 1; i < threads.length; i++) {
                filter += '+c' + (i * 2);
            }
            // Right channel mix:
            filter +='|c1=c1'
            for (let i = 1; i < threads.length; i++) {
                filter += '+c' + (i * 2 + 1);
            }
            filter += ', volume=5 [audiomix]'
            addFilter(filter);
            audioMap = '[audiomix]';
        }
    }
    args.push('-filter_complex', filters);
    if (VIDEO) {
        args.push('-map', videoMap);
    }
    if (AUDIO) {
        args.push('-map', audioMap);
    }
    args.push('-vcodec', 'libx264', '-acodec', 'aac',
        '-f', 'segment', '-initial_offset', (mediaSequence * SEGMENT_MS / 1000),
        '-segment_time', '100', '-segment_format', 'mpeg_ts',
        '-segment_start_number', mediaSequence,
        '-t', (SEGMENT_MS) / 1000, // more accurate than -frames:v
        Path.join(__dirname, SEGMENT_DIR, SEGMENT_FILENAME));

    segment.status = 'encoding';

    if (DEBUG) {
        console.log('segment', mediaSequence, segment.startOffset, segment.eventsByThread);
        console.log('ffmpeg', args.map(arg => '"' + arg + '"').join(' '));
        setTimeout(done, 0);
        return;
    }

    child_process.execFile('ffmpeg', args, (err, stdout, stderr) => {
        if (err) {
            console.error(err);
        }
        segment.status = 'ready';
        done && done();
    });
};

Server.prototype.createDialogFilter = function (event) {
    var lines = wordwrap(event.dialog.replace(/\\/, '\\\\').replace(/'/g, "\u2019")).replace(/:/, '\\:')
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
            ":x=(main_w-text_w)/2:y=(760+" + (lineOffset + i) + "*text_h)";
        if (process.platform === 'win32') {
            filter += ":fontfile='c\\:/Windows/Fonts/arial.ttf'";
        }
        filter += ":fontsize=30:fontcolor=" + (DIALOG_COLORS[event.pos] || 'black') +
            ":expansion=none:text='" + lines[i] + "'";
    }
    return filter;
};

Server.prototype.getAnimation = function (animName) {
    if (animName === 'nothing') {
        return {
            pattern: 'Blank.png',
            totalFrames: 1
        };
    }
    var anim = this.manifest[animName];
    if (!anim) {
        throw new Error('Unknown anim ' + animName);
    }
    return anim;
};

Server.prototype.sortThreads = function (segment) {
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

Server.prototype.getSegments = function* (startTime) {
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

Server.prototype.getSegmentsForDate = function* (startTime) {
    yield* this.simplifySegments(
        this.eventsToSegments(
            this.splitEvents(
                this.transformNothings(
                    this.setDialogDurations(
                        doCompileScript(startTime, this.manifest, this.root, this.scripts))))));
};

Server.prototype.simplifySegments = function* (segments) {
    for (let segment of segments) {
        for (let kv of segment.eventsByThread) {
            let thread = kv[0], events = kv[1];
            // Combine duplicate events.
            for (let i = 1; i < events.length; i++) {
                let event = events[i];
                let prevEvent = events[i - 1];
                if (prevEvent.type === 'play' && event.type === 'play' && prevEvent.anim === event.anim) {
                    // This is exclusive.
                    prevEvent.duration += event.duration;
                    events.splice(i, 1);
                    i--;
                }
            }
            // Remove empty threads.
            if (events.length === 0 || (events.length === 1 &&
                events[0].type === 'play' && events[0].anim === 'nothing')) {
                segment.eventsByThread.delete(thread);
            }
        }
        yield segment;
    }
};

Server.prototype.setDialogDurations = function* (eventStream) {
    // First event in the queue is always a dialog event.
    let eventQueue = [];
    function* emitQueue() {
        for (let event of eventQueue) {
            yield event;
        }
        eventQueue = [];
    }
    for (let event of eventStream) {
        if (event.type === 'clear-dialog' || event.type === 'dialog') {
            if (eventQueue.length) {
                eventQueue[0].duration = event.globalOffset - eventQueue[0].globalOffset;
                yield* emitQueue();
            }
        }
        if (event.type === 'clear-dialog') {
            continue;
        }
        if (event.type === 'dialog' || eventQueue.length > 0) {
            eventQueue.push(event);
            continue;
        }
        else {
            yield event;
        }
    }
    // Estimate the duration of the final dialog using the duration of the final event.
    if (eventQueue.length) {
        let finalEvent = eventQueue[eventQueue.length - 1];
        eventQueue[0].duration = finalEvent.globalOffset + finalEvent.duration - eventQueue[0].globalOffset;
        yield* emitQueue();
    }
};

// Split events which cross a segment boundary into two.
Server.prototype.splitEvents = function* (eventStream) {
    let eventQueue = [];
    let nextSegmentStart;
    function* nextSegment() {
        nextSegmentStart += SEGMENT_MS;
        let eq = eventQueue.slice();
        eventQueue = [];
        for (let event of eq) {
            yield* processEvent(event);
        }
    }
    function* processEvent(event) {
        while (event.globalOffset > nextSegmentStart) {
            yield* nextSegment();
        }
        if (event.globalOffset + event.duration > nextSegmentStart) {
            let newEvent = Object.assign({}, event);
            let overrun = event.globalOffset + event.duration - nextSegmentStart;
            let playedDuration = nextSegmentStart - event.globalOffset;
            event.duration = playedDuration;
            newEvent.duration = overrun;
            newEvent.offset += playedDuration;
            newEvent.globalOffset += playedDuration;
            newEvent.startFrame = (event.startFrame || 0) + (playedDuration / FRAME_MS);
            eventQueue.push(newEvent);
        }
        yield event;
    }
    for (let event of eventStream) {
        if (!nextSegmentStart) {
            let mediaSeq = Math.floor(event.globalOffset / SEGMENT_MS);
            nextSegmentStart = (mediaSeq + 1) * SEGMENT_MS;
        }
        if (event.globalOffset >= nextSegmentStart) {
            yield* nextSegment();
        }
        yield* processEvent(event);
    }
    while (eventQueue.length) {
        yield* nextSegment();
    }
};

Server.prototype.transformNothings = function* (eventStream) {
    for (let event of eventStream) {
        if (event.type === 'nothing') {
            event.type = 'play';
            event.anim = 'nothing';
        }
        yield event;
    }
};

Server.prototype.eventsToSegments = function* (eventStream) {
    let eventsByThread = new Map();
    let startOffset = null;
    for (let event of eventStream) {
        if (startOffset === null) {
            let mediaSeq = Math.floor(event.globalOffset / SEGMENT_MS);
            startOffset = mediaSeq * SEGMENT_MS;
        }
        if (event.globalOffset - startOffset >= SEGMENT_MS) {
            yield {
                startOffset: startOffset,
                eventsByThread: eventsByThread
            };
            eventsByThread = new Map();
            startOffset += SEGMENT_MS;
        }
        event.segmentOffset = event.globalOffset - startOffset;
        let thread = typeof event.thread === 'number' ? event.thread : 'main';
        let events = eventsByThread.get(thread);
        if (!events) {
            eventsByThread.set(thread, events = []);
        }
        // Check for overlapping events and truncate if needed.
        let prevEvent = events[events.length - 1];
        if (prevEvent && prevEvent.type === 'play' &&
            (prevEvent.globalOffset + prevEvent.duration > event.globalOffset)) {
            prevEvent.duration = event.segmentOffset - prevEvent.segmentOffset;
            if (prevEvent.duration === 0) {
                events.pop();
            }
        }
        if (event.type !== 'bgswitch') {
            events.push(event);
        }
    }
    yield {
        startOffset: startOffset,
        eventsByThread: eventsByThread
    };
};

Server.prototype.getParser = function () {
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

Server.prototype.load = function (scriptPath) {
    this.playing = false;
    var self = this;

    return pack(argv.media, __dirname).then(() => readFile('anims.json')).then(function (manifestSrc) {
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

Server.prototype.parseIncludedScripts = function (script, parser) {
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

if (require.main === module) {
    var dateString = process.argv.slice(2).join(' ').trim();
    var timestamp = dateString ? new Date(dateString) : new Date();
    var server = new Server();
    pr.call(fs.emptyDir, Path.join(__dirname, SEGMENT_DIR)).then(() => {
        return server.load('script.benji');
    }).then(() => {
        server.startServer();
        server.startGenerator(timestamp);
    }).catch(err => {
        console.log(err.stack);
        process.exit(1);
    });
}

module.exports = Server;
