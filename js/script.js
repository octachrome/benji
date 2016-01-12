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

function buildScene(dateStr, json) {
    var millis = Date.parse(dateStr);
    if (!millis) {
        throw new Error('invalid date');
    }
    var date = new Date(millis);
    var seed = dateSeed(date);
    var chance = new Chance(seed);

    var events = [];
    var offset = 7 * 60; // 7am

    var scenes = JSON.parse(json);
    playAnim(scenes);

    return events;

    function playSimpleAnim(anim, dialog) {
        var timestamp = new Date(date.getTime() + offset * 60 * 1000);
        events.push({
            timestamp: timestamp,
            time: timestamp.toTimeString().substr(0, 5),
            anim: anim,
            dialog: dialog
        });
        offset += 10;
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

    // todo: background events
    // todo: audio
    function playAnim(anim, dialog) {
        var i, count;
        if (Array.isArray(anim)) {
            for (i = 0; i < anim.length; i++) {
                playAnim(anim[i]);
            }
        } else if (typeof anim === 'string') {
            playSimpleAnim(anim, dialog);
        } else if (typeof anim.repeat_random === 'number') {
            count = chance.normal({mean: anim.repeat_random});
            for (i = 0; i < count; i++) {
                playAnim(anim.anim, anim.dialog);
            }
        } else if (typeof anim.repeat_until === 'string') {
            var until = parseTime(anim.repeat_until);
            while (offset <= until) {
                playAnim(anim.anim, anim.dialog);
            }
        } else if (typeof anim.likelihood === 'number') {
            if (chance.bool({likelihood: anim.likelihood * 100})) {
                playAnim(anim.anim, anim.dialog);
            }
        } else if (anim.parallel) {
            // todo
            playAnim(anim.parallel[0]);
        } else if (anim.choice) {
            var remaining = [];
            var weights = anim.choice.map(function (a, idx) {
                if (a.weight) {
                    return a.weight;
                } else {
                    remaining.push(idx);
                    return 0;
                }
            });
            var weight = 1 - weights.reduce(function (a, b) {
                return a + b;
            });
            remaining.forEach(function (r) {
                weights[r] = weight;
            });
            playAnim(chance.weighted(anim.choice, weights), anim.dialog);
        } else if (typeof anim.delay_random === 'number') {
            // todo
        } else if (anim.anim) {
            playAnim(anim.anim, anim.dialog);
        } else {
            console.log('Unknown anim type:');
            console.log(anim);
        }
    }
}
