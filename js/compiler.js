'use strict';

var Long, Chance, ms;

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
}

var mul = new Long(0xDEECE66D, 0x5);
var mask = new Long(0xFFFFFFFF, 0xFFFF);

var FRAME_RATE = 12.5;
var DIALOG_SPEED = .7; // animation frames per character of dialog

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

function Compiler(date, chance, manifest, subs, includedScripts, vars, offset) {
    // 7am in millis
    this.offset = offset || ms('7 hours');
    this.date = date;
    this.chance = chance;
    this.manifest = manifest;
    this.vars = vars || {};
    this.subs = subs || {};
    this.includedScripts = includedScripts || {};
    this.backgrounds = [];
    var compiler = this;
    this.utils = {
        pick: function (array) {
            return compiler.chance.pick(array);
        },
        maybe: function (probability) {
            return compiler.chance.bool({likelihood: probability});
        },
        rand: function () {
            return compiler.chance.random();
        },
        randint: function (min, max) {
            return compiler.chance.integer({min: min, max: max});
        },
        now: function () {
            return new Date(compiler.date.getTime() + compiler.offset);
        }
    }
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

function* doCompileScript(date, manifest, script, includedScripts) {
    // Find midnight GMT on the date.
    date = new Date(date.toDateString());
    var seed = dateSeed(date);
    var chance = new Chance(seed);

    var compiler = new Compiler(date, chance, manifest, null, includedScripts);
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
    var offset = this.offset;
    var nextEvent = events.next();
    while (!nextEvent.done) {
        let thread = this.selectThread(offset);
        if (thread === null) {
            yield nextEvent.value;
            offset = this.offset;
            nextEvent = events.next();
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
            for (i = 0; i < count; i++) {
                yield* this.compile(script.child, ctx);
            }
        }
        else if (script.cmd === 'repeat_for') {
            var millis = ms(script.args[1] + ' ' + script.args[2]);
            until = this.offset + millis;
            while (this.offset < until) {
                yield* this.compile(script.child, ctx);
            }
        }
        else if (script.cmd === 'repeat_until') {
            until = parseTime(script.args[1]);
            while (this.offset < until) {
                yield* this.compile(script.child, ctx);
            }
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
            if (this.isNothing(script.child)) {
                delete this.backgrounds[thread];
            }
            else {
                var bgCompiler = new Compiler(this.date, this.chance, this.manifest, this.subs, this.includedScripts, this.vars, this.offset);
                this.backgrounds[thread] = {
                    compiler: bgCompiler,
                    events: (function* () {
                        while (true) {
                            yield* bgCompiler.compileRoot(script.child);
                        }
                    })()
                };
            }
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

Compiler.prototype.isNothing = function (script) {
    if (script.type === 'Cmd') {
        return script.cmd === 'nothing';
    }
    else if (script.type === 'Seq') {
        return script.children.length === 1 && this.isNothing(script.children[0]);
    }
    else {
        return false;
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
        console.error('Skipped unknown animation ' + animName);
        yield this.addEvent({
            type: 'nothing',
        }, 1);
        return;
    }
    var rpt = 1;
    if (frames) {
        rpt = Math.ceil(frames / anim.totalFrames);
    }
    for (var i = 0; i < rpt; i++) {
        yield this.addEvent({
            type: 'play',
            anim: animName
        }, anim.totalFrames);
    }
}

if (typeof module !== 'undefined') {
    module.exports = doCompileScript;
}
