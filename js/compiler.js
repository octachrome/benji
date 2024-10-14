'use strict';

var Long, Chance, ms, lodash;

var debug = false;

if (typeof dcodeIO !== 'undefined') {
    Long = dcodeIO.Long;
}
else if (typeof importScripts === 'function') {
    self.exports = {};
    importScripts('../lib/long.js')
    importScripts('../lib/chance.js');
    importScripts('../lib/ms.js');
    self.Chance = self.exports.Chance;
    Long = dcodeIO.Long;
}
else {
    Long = require('long');
    Chance = require('chance');
    ms = require('ms');
    lodash = require('lodash');
}

var mul = new Long(0xDEECE66D, 0x5);
var mask = new Long(0xFFFFFFFF, 0xFFFF);

var FRAME_RATE = 12.5;
var DIALOG_SPEED = .8 // animation frames per character of dialog

// 48-bit random number, can be fully represented in a JavaScript number.
function gen(input) {
    var seed = Long.fromNumber(input);
    seed = seed.mul(mul).add(0xB).and(mask);
    return seed.toNumber();
}

function dateSeed(date) {
    date = date || new Date();
    var seed = gen(gen(date.getFullYear()));
    for (var i = 0; i < date.getMonth() * 33 + date.getDate(); i++) {
        seed = gen(seed);
    }
    return seed;
}

function Compiler(date, chance, manifest, subs, includedScripts, vars, offset, ignoreMissing) {
    // 7am in millis
    this.offset = offset || ms('7 hours');
    this.date = date;
    this.chance = chance;
    this.manifest = manifest;
    this.vars = vars || {};
    this.subs = subs || {};
    this.includedScripts = includedScripts || {};
    this.backgrounds = [];
    this.ignoreMissing = ignoreMissing;
    var compiler = this;
    this.utils = lodash.extend({
        now: function () {
            return new Date(compiler.date.getTime() + compiler.offset);
        },
        randomGenerator: function (seed) {
            return makeRandomFns(new Chance(seed));
        }
    }, makeRandomFns(chance));
}

function makeRandomFns(chance) {
    return {
        pick: function (array) {
            return chance.pick(array);
        },
        maybe: function (probability) {
            return chance.bool({likelihood: probability});
        },
        rand: function () {
            return chance.random();
        },
        randint: function (min, max) {
            return chance.integer({min: min, max: max});
        }
    };
}
var useWorker = false;
var worker;

if (useWorker && typeof window === 'object' && window.Worker) {
    worker = new Worker('js/compiler.js');
}

function compileScript(date, manifest, script, includedScripts) {
    var start = new Date().getTime();
    if (worker) {
        return new Promise(function (resolve) {
            worker.onmessage = function (event) {
                console.log('Compile finished in ' + (new Date().getTime() - start) + 'ms');
                if (event.data.type === 'compileResult') {
                    resolve(event.data.events);
                }
            };
            worker.postMessage({
                type: 'compile',
                date: date,
                manifest: manifest,
                script: script,
                includedScripts: includedScripts
            });
        });
    }
    else {
        var events = doCompileScript(date, manifest, script, includedScripts);
        console.log('Compile finished in ' + (new Date().getTime() - start) + 'ms');
        return Promise.resolve(events);
    }
}

function* doCompileScript(date, manifest, script, includedScripts, ignoreMissing) {
    // Find midnight GMT on the date.
    date = new Date(date.toDateString());
    var seed = dateSeed(date);
    var chance = new Chance(seed);

    var compiler = new Compiler(date, chance, manifest, null, includedScripts, null, null, ignoreMissing);
    yield* compiler.compileRoot(script);
}

if (typeof importScripts === 'function') {
    onmessage = function (event) {
        if (event.data.type === 'compile') {
            var events = doCompileScript(
                event.data.date,
                event.data.manifest,
                event.data.script,
                event.data.includedScripts
            );
            postMessage({
                type: 'compileResult',
                events: events,
                id: event.data.id
            });
        }
    };
}

function parseTime(time) {
    var match = time.match(/^([0-9]{1,2}):?([0-9]{2})$/);
    var mins = parseInt(match[1]) * 60 + parseInt(match[2]);
    // Offset is measured from 7am.
    if (mins < 7*60) {
        mins += 24*60;
    }
    return mins * 60 * 1000;
}

Compiler.prototype.addEvent = function(event, frames) {
    var ms = (frames || 0) / FRAME_RATE * 1000;
    event.offset = this.offset;
    event.globalOffset = this.date.getTime() + this.offset;
    event.duration = ms;
    this.offset += ms;
    return event;
}

function defaultSpread(c) {
    if (c === 0) {
        return 1;
    } else {
        var l = Math.log(c / 4);
        return Math.max(1, Math.ceil(l));
    }
}

Compiler.prototype.binom = function(x, spread) {
    if (typeof spread !== 'number') {
        spread = defaultSpread(x);
    }
    for (var i = 0; i < spread * 2; i++) {
        x += this.chance.pick([-0.5, 0.5]);
    }
    return Math.max(0, x);
}

Compiler.prototype.compileRoot = function* (script) {
    var ctx = {};
    var events = this.compile(script, ctx);
    while (true) {
        let thread = this.selectThread(this.offset);
        if (thread === null) {
            let nextEvent = events.next();
            if (!nextEvent.done) {
                yield nextEvent.value;
            }
            else {
                break;
            }
        }
        else {
            let bg = this.backgrounds[thread];
            let nextBgEvent = bg.events.next();
            if (!nextBgEvent.done) {
                nextBgEvent.value.thread = thread;;
                yield nextBgEvent.value;
            }
            else {
                delete this.backgrounds[thread];
            }
        }
    }

    if (ctx.clearDialogAfterNext != null) {
        yield this.addEvent({
            type: 'clear-dialog',
            pos: ctx.clearDialogAfterNext
        });
    }
};

Compiler.prototype.selectThread = function (mainOffset) {
    let offsets = this.backgrounds.map(bg => bg.compiler.offset);
    let offset = this.backgrounds.reduce((acc, bg) => Math.min(bg.compiler.offset, acc), mainOffset);
    let idx = offsets.indexOf(offset);
    if (idx >= 0 && this.backgrounds[idx]) {
        return this.backgrounds[idx].compiler.offset < mainOffset ? idx : null;
    }
    else {
        return null;
    }
};

Compiler.prototype.compile = function* (script, ctx) {
    var count, until, i;
    if (!script) {
        yield this.addEvent({
            type: 'nothing'
        }, 1);
    }
    else if (script.type === 'Seq') {
        var lastCtx = {};
        for (i = 0; i < script.children.length; i++) {
            var childCtx = {};
            yield* this.compile(script.children[i], childCtx);
            if (lastCtx.clearDialogAfterNext != null) {
                yield this.addEvent({
                    type: 'clear-dialog',
                    pos: lastCtx.clearDialogAfterNext
                });
            }
            lastCtx = childCtx;
        }
        if (lastCtx.clearDialogAfterNext != null) {
            // If the last statement in a sequence is dialog, it will be cleared after
            // the parent finishes.
            ctx.clearDialogAfterNext = lastCtx.clearDialogAfterNext;
        }
    }
    else if (script.type === 'Choice') {
        yield* this.compile(this.chance.pick(script.children), ctx);
    }
    else if (script.type === 'Cmd') {
        if (script.cmd === 'set') {
            var varName = script.args[0]
            var value = script.args[1];
            if (varName === 'dialog_anims') {
                this.vars[varName] = value;
            }
            else {
                this.vars[varName] = this.evalExpr(value);
            }
            if (debug) {
                console.log('set', varName, 'to', this.vars[varName]);
            }
        }
        else if (script.cmd === 'play') {
            var anim = script.args[0];
            yield* this.addAnimEvents(anim);
        }
        else if (script.cmd === 'repeat') {
            if (script.args[0]) {
                count = this.binom(script.args[1]);
            }
            else {
                count = script.args[1];
            }
            yield* this.repeatTimes(count, script.child, ctx);
        }
        else if (script.cmd === 'repeat_for') {
            let millis = ms(script.args[1] + ' ' + script.args[2]);
            yield* this.repeatFor(millis, script.child, ctx);
        }
        else if (script.cmd === 'repeat_until') {
            let until = parseTime(script.args[1]);
            let millis = Math.max(until - this.offset, 0);
            if (millis > 0) {
                yield* this.repeatFor(millis, script.child, ctx);
            }
        }
        else if (script.cmd === 'repeat_forever') {
            yield* this.repeatTimes(Infinity, script.child, ctx);
        }
        else if (script.cmd === 'maybe') {
            if (this.chance.bool({likelihood: script.args[0]})) {
                yield* this.compile(script.child, ctx);
            }
            else if (script.else) {
                yield* this.compile(script.else, ctx);
            }
        }
        else if (script.cmd === 'if') {
            if (this.evalExpr(script.args[0])) {
                yield* this.compile(script.child, ctx);
            }
            else if (script.else) {
                yield* this.compile(script.else, ctx);
            }
        }
        else if (script.cmd === 'while') {
            while (this.evalExpr(script.args[0])) {
                yield* this.compile(script.child, ctx);
            }
        }
        else if (script.cmd === 'sub') {
            this.subs[script.args[0]] = script.child;
        }
        else if (script.cmd === 'include') {
            var includedScript = this.includedScripts[script.args[0]];
            if (includedScript) {
                yield* this.compile(includedScript, ctx);
            }
            else {
                console.error('Unknown included script file: ' + script.args[0]);
            }
        }
        else if (script.cmd === 'call') {
            var sub = this.subs[script.args[0]];
            if (sub) {
                yield* this.compile(sub, ctx);
            }
            else {
                console.error('Unknown subroutine: ' + script.args[0]);
            }
        }
        else if (script.cmd === 'background') {
            var thread = script.args[0];
            // Create a zero-length dummy event to let the backgrounds catch up.
            yield this.addEvent({
                type: 'bgswitch',
                thread: thread
            });
            let bgScript = script.child;
            // Background scripts get repeated forever.
            if (bgScript.cmd !== 'repeat_forever') {
                bgScript = {
                    type: 'Cmd',
                    cmd: 'repeat_forever',
                    child: bgScript
                };
            }
            var bgCompiler = new Compiler(this.date, this.chance, this.manifest, this.subs, this.includedScripts, this.vars, this.offset, this.ignoreMissing);
            this.backgrounds[thread] = {
                compiler: bgCompiler,
                events: (function *() {
                    while (true) {
                        yield* bgCompiler.compileRoot(bgScript);
                    }
                })()
            };
        }
        else if (script.cmd === 'nothing') {
            yield this.addEvent({
                type: 'nothing'
            }, 1);
        }
        else if (script.cmd !== 'else') {
            console.error('Unknown command: ' + script.cmd);
        }
    }
    else if (script.type === 'Dialog') {
        var dialog = script.dialog;
        var match;
        while ((match = dialog.match(/\{\{(.*?)\}\}/))) {
            dialog = dialog.replace(match[0], this.evalExpr(match[1]));
        }
        yield this.addEvent({
            type: 'dialog',
            dialog: dialog,
            pos: script.pos
        });
        var dialogAnim = (this.vars.dialog_anims || '').split(' ')[script.pos];
        if (dialogAnim) {
            var frames = (dialog || '').length * DIALOG_SPEED;
            yield* this.addAnimEvents(dialogAnim, frames);
            yield this.addEvent({
                type: 'clear-dialog',
                pos: script.pos
            });
        }
        else {
            ctx.clearDialogAfterNext = script.pos;
        }
    }
    else {
        console.error('Unknown script element: ' + script.type);
    }
};

Compiler.prototype.repeatFor = function* (millis, script, ctx) {
    var simpleCmd = this.getSimpleCommand(script);
    if (simpleCmd) {
        // Optimize to reduce number of events and speed up seeking.
        let totalFrames;
        let animName = simpleCmd.args && simpleCmd.args[0];
        let anim = this.manifest[animName];
        if (!anim) {
            // This branch processes 'nothing' commands too.
            simpleCmd.cmd = 'nothing';
            totalFrames = 1;
        }
        else {
            totalFrames = anim.totalFrames;
        }
        let totalTime = totalFrames * 1000 / FRAME_RATE;
        let count = Math.ceil(millis / totalTime);
        yield* this.addAnimEvents(animName, totalFrames * count);
    }
    else {
        // Cannot optimize complex script, just repeat normally.
        let until = this.offset + millis;
        while (this.offset < until) {
            yield* this.compile(script, ctx);
        }
    }
};

Compiler.prototype.repeatTimes = function* (count, script, ctx) {
    var simpleCmd = this.getSimpleCommand(script);
    if (simpleCmd) {
        // Optimize to reduce number of events and speed up seeking.
        let totalFrames;
        let animName = simpleCmd.args && simpleCmd.args[0];
        let anim = this.manifest[animName];
        if (!anim) {
            // This branch processes 'nothing' commands too.
            simpleCmd.cmd = 'nothing';
            totalFrames = 1;
        }
        else {
            totalFrames = anim.totalFrames;
        }
        if (count === Infinity) {
            // Make sure we generate as close to 50 frames as possible (more is fine, but less is slow).
            let batchSize = Math.floor(800 / totalFrames) * totalFrames;
            if (batchSize === 0) {
                // totalFrames must be >50.
                batchSize = totalFrames;
            }
            while (true) {
                yield* this.addAnimEvents(animName, batchSize);
            }
        }
        else {
            yield* this.addAnimEvents(animName, totalFrames * count);
        }
    }
    else {
        // Cannot optimize complex script, just repeat normally.
        for (let i = 0; i < count; i++) {
            yield* this.compile(script, ctx);
        }
    }
};

Compiler.prototype.getSimpleCommand = function (script) {
    if (script.type === 'Cmd' && (script.cmd === 'nothing' || script.cmd === 'play')) {
        return script;
    }
    else if (script.type === 'Seq' && script.children.length === 1) {
        return this.getSimpleCommand(script.children[0]);
    }
    else {
        return null;
    }
};

Compiler.prototype.evalExpr = function (expr) {
    if (!expr || expr.trim().length === 0) {
        return null;
    }
    else {
        var evaluator = new Function('$utils', '$context', 'with($utils){ with($context){ return ' + expr + '}}');
        return evaluator(this.utils, this.vars);
    }
};

Compiler.prototype.addAnimEvents = function* (animName, frames) {
    var anim = this.manifest[animName];
    if (!anim) {
        if (animName) {
            if (this.ignoreMissing) {
                // This branch processes 'nothing' commands too.
                console.error('Skipped unknown animation ' + animName);
            } else {
                throw new Error('Unknown animation ' + animName);
            }
        }
        yield this.addEvent({
            type: 'nothing',
        }, frames);
        return;
    }
    var rpt = 1;
    if (frames) {
        rpt = Math.ceil(frames / anim.totalFrames);
    }
    yield this.addEvent({
        type: 'play',
        anim: animName
    }, rpt * anim.totalFrames);
}

if (typeof module !== 'undefined') {
    module.exports = doCompileScript;
}
