'use strict';

var Long = dcodeIO.Long;
var mul = new Long(0xDEECE66D, 0x5);
var mask = new Long(0xFFFFFFFF, 0xFFFF);

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

function Compiler(chance, script) {
    // 7am in millis
    this.offset = ms('7 hours');
    this.chance = chance;
    this.events = [];
    this.script = script;
    this.vars = {};
}

function compileScript(dateStr, script) {
    var millis = Date.parse(dateStr);
    if (!millis) {
        throw new Error('invalid date');
    }
    var date = new Date(millis);
    var seed = dateSeed(date);
    var chance = new Chance(seed);

    var compiler = new Compiler(chance, script);
    compiler.compile(script.root);
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

Compiler.prototype.addEvent = function(event, length) {
    var time = new Date(new Date('2015-01-01').getTime() + this.offset);
    this.events.push({
        time: time.toTimeString().substr(0, 5),
        event: event
    });
    this.offset += length;
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

Compiler.prototype.compile = function(script) {
  var count, until;
  if (script.type === 'Seq') {
    script.children.forEach(this.compile.bind(this));
  }
  else if (script.type === 'Choice') {
    this.compile(this.chance.pick(script.children));
  }
  else if (script.type === 'Cmd') {
    if (script.cmd === 'set') {
      this.vars[script.args[0]] = script.args[1];
      if (script.args[0] === 'background') {
        var bg = script.args[1];
        this.addEvent({
          type: 'background',
          anim: bg
        }, this.script.getAnimLength(bg));
      }
    }
    else if (script.cmd === 'play') {
      var anim = script.args[0];
      this.addEvent({
        type: 'play',
        anim: anim
      }, this.script.getAnimLength(anim));
    }
    else if (script.cmd === 'repeat') {
      if (script.args[0]) {
        count = this.binom(script.args[1]);
      }
      else {
        count = script.args[1];
      }
      for (var i = 0; i < count; i++) {
          this.compile(script.child);
      }
    }
    else if (script.cmd === 'repeat_for') {
      var millis = ms(script.args[1] + ' ' + script.args[2]);
      until = this.offset + millis;
      while (this.offset < until) {
          this.compile(script.child);
      }
    }
    else if (script.cmd === 'repeat_until') {
      until = parseTime(script.args[1]);
      while (this.offset < until) {
          this.compile(script.child);
      }
    }
    else if (script.cmd === 'maybe') {
      if (this.chance.bool({likelihood: script.args[0]})) {
          this.compile(script.child);
      }
      else if (script.else) {
        this.compile(script.else);
      }
    }
    else {
      console.error('Unknown command: ' + script.cmd);
    }
  }
  else if (script.type === 'Dialog') {
    this.addEvent({
      type: 'dialog',
      dialog: script.dialog,
      pos: script.pos
    }, 0);
    var dialogAnim = (this.vars.dialog_anims || '').split(' ')[script.pos];
    if (dialogAnim) {
      this.addEvent({
        type: 'play',
        anim: dialogAnim
      }, this.script.getAnimLength(dialogAnim));
    }
    else {
      this.addEvent({
        type: 'play',
        anim: 'none'
      }, 2000);
    }
    // Clear the dialog
    this.addEvent({
      type: 'dialog',
      dialog: '',
      pos: script.pos
    }, 0);
  }
  else {
    console.error('Unknown script element: ' + script.type);
  }
};
