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

function SceneBuilder(chance) {
    // 7am
    this.offset = 7 * 60;
    this.chance = chance;
    this.events = [];
}

function buildScene(dateStr, json) {
    var millis = Date.parse(dateStr);
    if (!millis) {
        throw new Error('invalid date');
    }
    var date = new Date(millis);
    var seed = dateSeed(date);
    var chance = new Chance(seed);

    var scenes = JSON.parse(json);

    var sceneBuilder = new SceneBuilder(chance);

    sceneBuilder.playAnim(scenes);
    return sceneBuilder.events;
}

function parseTime(time) {
    var match = time.match(/^([0-9]{1,2}):?([0-9]{2})$/);
    var mins = parseInt(match[1]) * 60 + parseInt(match[2]);
    // Offset is measured from 7am.
    if (mins < 7*60) {
        mins += 24*60;
    }
    return mins;
}

SceneBuilder.prototype.playSimpleAnim = function(anim, dialog) {
    var time = new Date(new Date('2015-01-01').getTime() + this.offset * 60 * 1000);
    this.events.push({
        time: time.toTimeString().substr(0, 5),
        anim: anim,
        dialog: dialog
    });
    this.offset += 10;
}

function defaultSpread(c) {
    if (c === 0) {
        return 1;
    } else {
        var l = Math.log(c / 4);
        return Math.max(1, Math.ceil(l));
    }
}

SceneBuilder.prototype.binom = function(x, spread) {
    if (typeof spread !== 'number') {
        spread = defaultSpread(x);
    }
    for (var i = 0; i < spread * 2; i++) {
        x += this.chance.pick([-0.5, 0.5]);
    }
    return Math.max(0, x);
}

SceneBuilder.prototype.playAnim = function(anim, dialog) {
    var i, count;
    if (Array.isArray(anim)) {
        for (i = 0; i < anim.length; i++) {
            this.playAnim(anim[i]);
        }
    } else if (typeof anim === 'string') {
        this.playSimpleAnim(anim, dialog);
    } else if (typeof anim.repeat_random === 'number') {
        count = this.binom(anim.repeat_random, anim.spread);
        for (i = 0; i < count; i++) {
            this.playAnim(anim.anim, anim.dialog);
        }
    } else if (typeof anim.repeat_until === 'string') {
        var until = parseTime(anim.repeat_until);
        while (this.offset <= until) {
            this.playAnim(anim.anim, anim.dialog);
        }
    } else if (typeof anim.likelihood === 'number') {
        if (this.chance.bool({likelihood: anim.likelihood * 100})) {
            this.playAnim(anim.anim, anim.dialog);
        }
    } else if (anim.parallel) {
        // todo
        playAnim(anim.parallel[0]);
    } else if (anim.choice) {
        var remaining = [];
        var weights = anim.choice.map(function (a, idx) {
            if (a.weight) {
                return a.weight * 100;
            } else {
                remaining.push(idx);
                return 0;
            }
        });
        var weight = 100 - weights.reduce(function (a, b) {
            return a + b;
        });
        remaining.forEach(function (r) {
            weights[r] = weight;
        });
        this.playAnim(this.chance.weighted(anim.choice, weights), anim.dialog);
    } else if (anim.background === true) {
        // todo
    } else if (typeof anim.delay_random === 'number') {
        // todo
    } else if (anim.anim) {
        this.playAnim(anim.anim, anim.dialog);
    } else {
        console.log('Unknown anim type:');
        console.log(anim);
    }
}
