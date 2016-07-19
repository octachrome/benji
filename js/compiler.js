'use strict';

var Long = dcodeIO.Long;
var mul = new Long(0xDEECE66D, 0x5);
var mask = new Long(0xFFFFFFFF, 0xFFFF);

var FRAME_RATE = 12.5;
var DIALOG_SPEED = 1.2; // animation frames per character of dialog

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

function Compiler(chance, manifest, subs, offset) {
    // 7am in millis
    this.offset = offset || ms('7 hours');
    this.chance = chance;
    this.events = [];
    this.manifest = manifest;
    this.vars = {};
    this.subs = subs || {};
}

function compileScript(dateStr, manifest, script) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        throw new Error('invalid date');
    }
    // Find midnight GMT on that date.
    var date = new Date(d.toDateString());
    var seed = dateSeed(date);
    var chance = new Chance(seed);

    var compiler = new Compiler(chance, manifest);
    compiler.compileRoot(script);
    return compiler.events;
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
    var lastEvent = this.events[this.events.length - 1];
    if (event.type === 'nothing' && lastEvent && lastEvent.event && lastEvent.event.type === 'nothing') {
        lastEvent.duration += ms;
    }
    else {
        this.events.push({
            time: this.offset,
            event: event,
            duration: ms
        });
    }
    this.offset += ms;
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

Compiler.prototype.compileRoot = function(script) {
    var ctx = {};
    this.compile(script, ctx);
    if (ctx.clearDialogAfterNext != null) {
        this.addEvent({
            type: 'clear-dialog',
            pos: ctx.clearDialogAfterNext
        });
    }
};

Compiler.prototype.compile = function(script, ctx) {
    var count, until, i;
    if (script.type === 'Seq') {
        var lastCtx = {};
        for (i = 0; i < script.children.length; i++) {
            var childCtx = {};
            this.compile(script.children[i], childCtx);
            if (lastCtx.clearDialogAfterNext != null) {
                this.addEvent({
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
        this.compile(this.chance.pick(script.children), ctx);
    }
    else if (script.type === 'Cmd') {
        if (script.cmd === 'set') {
            this.vars[script.args[0]] = script.args[1];
        }
        else if (script.cmd === 'play') {
            var anim = script.args[0];
            this.addAnimEvents(anim);
        }
        else if (script.cmd === 'repeat') {
            if (script.args[0]) {
                count = this.binom(script.args[1]);
            }
            else {
                count = script.args[1];
            }
            for (i = 0; i < count; i++) {
                this.compile(script.child, ctx);
            }
        }
        else if (script.cmd === 'repeat_for') {
            var millis = ms(script.args[1] + ' ' + script.args[2]);
            until = this.offset + millis;
            while (this.offset < until) {
                this.compile(script.child, ctx);
            }
        }
        else if (script.cmd === 'repeat_until') {
            until = parseTime(script.args[1]);
            while (this.offset < until) {
                this.compile(script.child, ctx);
            }
        }
        else if (script.cmd === 'maybe') {
            if (this.chance.bool({likelihood: script.args[0]})) {
                this.compile(script.child, ctx);
            }
            else if (script.else) {
                this.compile(script.else, ctx);
            }
        }
        else if (script.cmd === 'sub') {
            this.subs[script.args[0]] = script.child;
        }
        else if (script.cmd === 'call') {
            var sub = this.subs[script.args[0]];
            if (sub) {
                this.compile(sub, ctx);
            }
            else {
                console.error('Unknown subroutine: ' + script.args[0]);
            }
        }
        else if (script.cmd === 'background') {
            var bgEvents;
            if (script.child) {
                var bgCompiler = new Compiler(this.chance, this.manifest, this.subs);
                bgCompiler.compileRoot(script.child);
                bgEvents = bgCompiler.events;
            }
            this.addEvent({
                type: 'background',
                thread: script.args[0],
                events: bgEvents || []
            });
        }
        else if (script.cmd === 'nothing') {
            this.addEvent({
                type: 'nothing'
            }, 1);
        }
        else if (script.cmd !== 'else') {
            console.error('Unknown command: ' + script.cmd);
        }
    }
    else if (script.type === 'Dialog') {
        this.addEvent({
            type: 'dialog',
            dialog: script.dialog,
            pos: script.pos
        });
        var dialogAnim = (this.vars.dialog_anims || '').split(' ')[script.pos];
        if (dialogAnim) {
            var frames = (script.dialog || '').length * DIALOG_SPEED;
            this.addAnimEvents(dialogAnim, frames);
            this.addEvent({
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

Compiler.prototype.addAnimEvents = function (animName, frames) {
    var anim = this.manifest[animName];
    if (!anim) {
        console.error('Skipped unknown animation ' + animName);
        this.addEvent({
            type: 'play',
            anim: 'missing'
        }, 30);
    }
    var rpt = 1;
    if (frames) {
        rpt = Math.ceil(frames / anim.totalFrames);
    }
    for (var i = 0; i < rpt; i++) {
        for (var j = 0; j < anim.segments.length; j++) {
            this.addEvent({
                type: 'play',
                anim: anim.segments[j].name
            }, anim.segments[j].frames);
        }
    }
}
