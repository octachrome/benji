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
var url = require('url');
var child_process = require('child_process');
var Path = require('path');
var pr = require('promise-ring');
var PEG = require('pegjs');
var wordwrap = require('wordwrap')(DIALOG_PER_LINE);
var serveStatic = require('serve-static');
var connect = require('connect');
var cacheControl = require('connect-cache-control');
var sprintf = require('sprintf-js').sprintf;
var doCompileScript = require('./js/compiler');
var pack = require('./js/pack');
var speech = require('./speech');
var charm = require('charm')();
charm.pipe(process.stdout);
var eventCache = require('lru-cache')({
    max: 10
});

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

var dropboxDir;
if (process.env.USER === 'chris') {
    dropboxDir = '/home/chris/Dropbox/Benji';
}
else if (process.env.COMPUTERNAME === 'CULKS') {
    dropboxDir = 'd:/dropbox/Benji';
}
else {
    dropboxDir = 'e:/dropbox/Benji';
}

var argv = require('minimist')(process.argv.slice(2), {
    default: {
        'dropbox': dropboxDir
    },
    alias: {
        'd': 'dropbox'
    }
});

function readFile(path) {
    return pr.call(fs.readFile, path, 'utf8');
}

function readScript(path) {
    return readFile(Path.join(argv.dropbox, 'scripts', path));
}

function Server(startTime) {
    this.running = 0;
    this.waiting = [];
    this.timeOffset = new Date().getTime() - startTime.getTime();
}

Server.prototype.startSegmentGenerator = function () {
    let timeOffset = this.timeOffset;

    let currentTimestamp = () => {
        return new Date().getTime() - timeOffset;
    }

    var segmentStream = this.getSegments(new Date(currentTimestamp()));
    var next = segmentStream.next();

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
                this.enqueue(done => this.render(segment, done));
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
                charm.write(new Date(kv[1].startOffset) + '  ' + kv[0] + '  ');
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

        if (timeOffset !== this.timeOffset) {
            // A seek has occurred - restart the generator.
            setTimeout(() => {
                this.startSegmentGenerator();
            }, POLL_INTERVAL);
        }
        else if (!next.done) {
            setTimeout(tick, POLL_INTERVAL);
        }
    };

    console.log('Running...');
    setTimeout(tick, POLL_INTERVAL);
};

Server.prototype.startEventGenerator = function () {
    let timeOffset = this.timeOffset;

    let currentTimestamp = () => {
        return new Date().getTime() - timeOffset;
    }

    var eventStream = this.getEvents(new Date(currentTimestamp()));
    let next = eventStream.next();

    // There is a bug where we can't seek to a point in the past (relative to the true clock time)
    console.log('Seeking...');
    let lastLogged;
    while (!next.done && next.value.globalOffset + SEGMENT_MS < Date.now()) {
        next = eventStream.next();
    }

    let tick = () => {
        while (!next.done) {
            let event = next.value;
            if (event.globalOffset < currentTimestamp() + ENCODE_MS) {
                // Too late for this event.
                next = eventStream.next();
            }
            else if (event.globalOffset < currentTimestamp() + ACTIVE_SEGMENTS * SEGMENT_MS) {
                // Event should be emitted.
                console.log(JSON.stringify(event));
                next = eventStream.next();
            }
            else {
                break;
            }
        }

        if (timeOffset !== this.timeOffset) {
            // A seek has occurred - restart the generator.
            setTimeout(() => {
                this.startEventGenerator();
            }, POLL_INTERVAL);
        }
        else if (!next.done) {
            setTimeout(tick, POLL_INTERVAL);
        }
    };

    console.log('Running...');
    setTimeout(tick, POLL_INTERVAL);
}

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
    app.use('/segments.m3u8', cacheControl);
    app.use('/segments.m3u8', (req, res, next) => {
        this.writePlaylist(req, res, next);
    });
    app.use('/events', cacheControl);
    app.use('/events', (req, res, next) => {
        this.writeEvents(req, res, next);
    });
    app.use('/play', cacheControl);
    app.use('/play', (req, res, next) => {
        this.seekTo(req, res, next);
    });
    app.use('/', serveStatic(Path.join(__dirname, 'www')));
    app.use('/', serveStatic(Path.join(__dirname, SEGMENT_DIR)));
    let server = app.listen(PORT);
    console.log('Go to http://localhost:' + PORT + ' in your browser');
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

Server.prototype.writeEvents = function (req, res, next) {
    let cachedEvents = this.getCachedEvents(new Date().getTime() - this.timeOffset);
    cachedEvents.getEventList().then((events) => {
        events.timeOffset = this.timeOffset;
        res.writeHead(200, {
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify(events, null, 2));
    });
};

Server.prototype.seekTo = function (req, res, next) {
    try {
        let offsetParam = decodeURI(url.parse(req.url).pathname.substr('/'.length));
        let globalOffset = parseInt(offsetParam);
        if (globalOffset && !isNaN(globalOffset)) {
            this.timeOffset = new Date().getTime() - globalOffset;
        }
        else {
            throw new Error('Failed to parse offset: ' + offsetParam);
        }
        res.writeHead(200, {
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({timeOffset: this.timeOffset}, null, 2));
    }
    catch (e) {
        res.writeHead(500);
        res.end(e.message);
    }
};

Server.prototype.render = function (segment, done) {
    this.getDialogAudioPaths(segment).then(dialogAudioPaths => {
        this.ffmpeg(segment, dialogAudioPaths, done);
    });
};

Server.prototype.getDialogAudioPaths = function (segment) {
    const promises = [];
    const paths = {};
    for (let events of segment.eventsByThread.values()) {
        for (let event of events) {
            if (event.type === 'dialog') {
                const voice = event.pos == 1 ? 'voices/cmu_us_slt.flitevox' : 'voices/cmu_us_aew.flitevox';
                promises.push(speech.getSpeechFile(event.dialog, voice).then(path => {
                    paths[event.dialog + ':' + event.pos] = path;
                }));
            }
        }
    }
    return Promise.all(promises).then(() => paths);
};

Server.prototype.ffmpeg = function (segment, dialogAudioPaths, done) {
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
    const athreads = [];
    const vthreads = [];
    for (let thread of this.sortThreads(segment)) {
        const events = segment.eventsByThread.get(thread);

        if (AUDIO) {
            const dialogStreams = [];
            const dialogEvents = events.filter(event => event.type === 'dialog');
            let d = 0;
            for (let i = 0; i < dialogEvents.length; i++) {
                const event = dialogEvents[i];
                const lastEvent = i > 0 ? dialogEvents[i-1] : null;
                const lastFinish = lastEvent ? lastEvent.segmentOffset + lastEvent.duration : 0;
                if (event.segmentOffset > lastFinish) {
                    // Insert silence
                    const silenceLength = event.segmentOffset - lastFinish;
                    const thisStream = outputStream++;
                    addFilter('anullsrc, atrim=start=0:end=' + (silenceLength / 1000) + ', asetpts=N/SR/TB [dstream' + thisStream + ']');
                    dialogStreams.push('dstream' + thisStream);
                }
                const startFrame = event.startFrame || 0;
                const playFrames = event.duration / FRAME_MS;
                const endFrame = startFrame + playFrames;
                const audioPath = dialogAudioPaths[event.dialog + ':' + event.pos];
                const thisStream = outputStream++;
                args.push('-i', audioPath);
                const filter = '[' + (inputStream++) + ':0] ' +
                    // The audio file may be shorter than the dialog duration - pad it
                    'apad=whole_len=' + (event.duration * AUDIO_SAMPLE_RATE / 1000) + ', ' +
                    // The dialog may be truncated - trim the audio
                    'atrim=start=' + (startFrame * FRAME_MS / 1000) + ':end=' + (endFrame * FRAME_MS / 1000) + ', ' +
                    // Reset sample numbers to start at zero
                    'asetpts=N/SR/TB [dstream' + thisStream + ']';
                dialogStreams.push('dstream' + thisStream);
                addFilter(filter);
            }
            if (dialogStreams.length) {
                let filter = '';
                for (let dialogStream of dialogStreams) {
                    filter += '[' + dialogStream + '] ';
                }
                filter += 'concat=v=0:a=1:n=' + dialogStreams.length + ' ';
                filter += '[dthread' + thread + '] ';
                athreads.push('dthread' + thread);
                addFilter(filter);
            }
        }

        const firstOutputStream = outputStream;
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
                filter += '[tmp' + thread + '] ';
                addFilter('[tmp' + thread + '] pad=height=800:color=white' + dialogFilters + ' [vthread' + thread + ']');
                vthreads.push('vthread' + thread);
            }
            if (AUDIO) {
                filter += '[athread' + thread + '] ';
                athreads.push('athread' + thread);
            }
            addFilter(filter);
        }
    }
    let videoMap, audioMap;
    if (VIDEO) {
        if (vthreads.length === 1) {
            videoMap = '[' + vthreads[0] + ']';
        }
        else {
            let overlay = 0;
            addFilter('[' + vthreads[0] + '] [' + vthreads[1] + '] overlay=eof_action=pass [overlay0]');
            for (let i = 2; i < vthreads.length; i++) {
                addFilter('[overlay' + overlay + '] [' + vthreads[i] + '] overlay=eof_action=pass [overlay' + (++overlay) + ']');
            }
            videoMap = '[overlay' + overlay + ']';
        }
    }
    if (AUDIO) {
        if (athreads.length === 1) {
            audioMap = '[' + athreads[0] + ']';
        }
        else {
            let filter = '';
            for (let i = 0; i < athreads.length; i++) {
                filter += '[' + athreads[i] + '] ';
            }
            filter += 'amerge=inputs=' + athreads.length + ', pan=stereo|c0=c0';
            // Left channel mix:
            for (let i = 1; i < athreads.length; i++) {
                filter += '+c' + (i * 2);
            }
            // Right channel mix:
            filter +='|c1=c1'
            for (let i = 1; i < athreads.length; i++) {
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
            filter += ":fontfile='c\\:/Windows/Fonts/courbd.ttf'";
        }
        else {
            filter += ":fontfile='/usr/share/fonts/truetype/ubuntu-font-family/Ubuntu-R.ttf'";
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
        this.truncateSegmentEvents(
            this.eventsToSegments(
                this.splitEvents(
                    this.setDialogDurations(
                        this.getCachedEvents(startTime).getGenerator())))));
};

Server.prototype.getEvents = function* (startTime) {
    let compileTime = startTime;
    let gen = this.getEventsForDate(compileTime);
    let next = gen.next();
    // Rewind until we get to the right date.
    while (next.value.globalOffset > startTime) {
        compileTime = new Date(compileTime.getTime() - DAY_MS);
        gen = this.getEventsForDate(compileTime);
        next = gen.next();
    }
    // Set up the script for the next date too.
    compileTime = new Date(compileTime.getTime() + DAY_MS);
    let tomorrowGen = this.getEventsForDate(compileTime);
    let tomorrowNext = tomorrowGen.next();

    while (true) {
        if (next.done || tomorrowNext.value.globalOffset <= next.value.globalOffset) {
            // Roll over to the next day.
            gen = tomorrowGen;
            next = tomorrowNext;
            compileTime = new Date(compileTime.getTime() + DAY_MS);
            tomorrowGen = this.getEventsForDate(compileTime);
            tomorrowNext = tomorrowGen.next();
        }
        yield next.value;
        next = gen.next();
    }
};

Server.prototype.getEventsForDate = function* (startTime) {
    yield* this.setDialogDurations(this.getCachedEvents(startTime).getGenerator());
};

Server.prototype.getCachedEvents = function (startTime) {
    let date = new Date(startTime);
    let cacheKey = date.toDateString();
    let cachedEvents = eventCache.get(cacheKey);
    if (!cachedEvents) {
        cachedEvents = new CachedEvents(date, this);
        eventCache.set(cacheKey, cachedEvents);
    }
    return cachedEvents;
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
            if (!events.some(isAnimEvent)) {
                segment.eventsByThread.delete(thread);
            }
        }
        yield segment;
    }
};

function isAnimEvent(event) {
    return event.type === 'play' && event.anim !== 'nothing';
}

Server.prototype.truncateSegmentEvents = function* (segments) {
    for (let segment of segments) {
        for (let kv of segment.eventsByThread) {
            let events = kv[1];
            // Truncate overlapping events.
            for (let i = 0; i < events.length - 1; i++) {
                let event = events[i];
                let nextEvent = events[i + 1];
                if (event.type === 'play') {
                    if (event.globalOffset + event.duration > nextEvent.globalOffset) {
                        event.duration = nextEvent.globalOffset - event.globalOffset;
                    }
                    if (event.duration <= 0) {
                        events.splice(i, 1);
                        i--;
                    }
                }
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
    // This ensures that future splits of events do not keep playing after they have been truncated.
    // This pass is not perfect and will let some overlapping events through, so there is a second pass after segmentation.
    function truncateQueuedEvents(event) {
        for (var i = 0; i < eventQueue.length; i++) {
            var queuedEvent = eventQueue[i];
            if (queuedEvent.type === 'play' && event.thread === queuedEvent.thread) {
                if (queuedEvent.globalOffset + queuedEvent.duration > event.globalOffset) {
                    queuedEvent.duration = event.globalOffset - queuedEvent.globalOffset;
                }
                if (queuedEvent.duration <= 0) {
                    eventQueue.splice(i, 1);
                    i--;
                }
            }
        }
    }
    function* processEvent(event) {
        truncateQueuedEvents(event);
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

function eventToString(event) {
    var thread;
    if (typeof event.thread === 'number') {
        thread = event.thread;
    }
    else {
        thread = '*';
    }
    var date = new Date(event.globalOffset);
    var ms = date.getMilliseconds();
    if (ms < 10) ms = '00' + ms;
    else if (ms < 100) ms = '0' + ms;
    return date.toLocaleTimeString() + ' ' + ms + ' ' +  thread + ' ' +
        event.type + ' ' + event.anim + ' ' + event.duration / 1000
}

Server.prototype.eventsToSegments = function* (eventStream) {
    let eventsByThread = new Map();
    let startOffset = null;
    for (let event of eventStream) {
        if (DEBUG) {
            console.log(eventToString(event));
        }
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
        var lastEvent = events[events.length - 1];
        var lastFinish = lastEvent ? lastEvent.segmentOffset + lastEvent.duration : 0;
        if (event.segmentOffset > lastFinish) {
            // Pad the gap before this event with a blank animation.
            events.push({
                type: 'play',
                anim: 'nothing',
                globalOffset: startOffset + lastFinish,
                segmentOffset: lastFinish,
                duration: event.segmentOffset - lastFinish
            });
        }
        events.push(event);
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
    var self = this;

    return pack(argv.dropbox, __dirname).then(() => readFile('anims.json')).then(function (manifestSrc) {
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

function CachedEvents(startTime, server) {
    this.startTime = startTime;
    this.server = server;
    this.events = [];
    this.done = false;
    this.generator = this.transformNothings(doCompileScript(this.startTime, this.server.manifest, this.server.root, this.server.scripts));
};

CachedEvents.prototype.getGenerator = function* () {
    let idx = 0;
    while (true) {
        while (idx >= this.events.length) {
            let next = this.generator.next();
            if (next.done) {
                this.done = true;
                return;
            }
            else {
                this.events.push(next.value);
            }
        }
        yield Object.assign({}, this.events[idx++]);
    }
};

CachedEvents.prototype.getEventList = function () {
    return new Promise((resolve) => {
        let eventsByThread = {};
        let generator = this.getGenerator();

        let poll = () => {
            let next;
            for (let i = 0; i < 1000; i++) {
                next = generator.next();
                if (next.done) {
                    break;
                }
                else {
                    let event = next.value;
                    if (event.type !== 'play') {
                        continue;
                    }
                    let thread = typeof event.thread === 'number' ? event.thread : 'main';
                    let events = eventsByThread[thread];
                    if (!events) {
                        events = [];
                        eventsByThread[thread] = events;
                    }
                    let prevEvent = events[events.length - 1];
                    if (!prevEvent || prevEvent.anim !== event.anim) {
                        events.push(event);
                    }
                }
            }
            if (next.done) {
                resolve(eventsByThread);
            }
            else {
                setTimeout(poll, 5);
            }
        };

        poll();
    });
};

CachedEvents.prototype.transformNothings = function* (eventStream) {
    for (let event of eventStream) {
        if (event.type === 'nothing') {
            event.type = 'play';
            event.anim = 'nothing';
        }
        yield event;
    }
};

if (require.main === module) {
    const dateString = argv._.join(' ').trim();
    let timestamp;
    if (dateString) {
        timestamp = new Date(dateString);
        if (isNaN(timestamp.getTime())) {
            console.error('Failed to parse timestamp: ' + dateString);
            process.exit(1);
        }
    }
    else {
        timestamp = new Date();
    }
    const server = new Server(timestamp);
    server.startServer();
    pr.call(fs.emptyDir, Path.join(__dirname, SEGMENT_DIR)).then(() => {
        return server.load('script.benji');
    }).then(() => {
        // server.startSegmentGenerator();
        server.startEventGenerator();
    }).catch(err => {
        console.log(err.stack);
        process.exit(1);
    });
}

module.exports = Server;
