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

    function playSimpleAnim(anim) {
        var timestamp = new Date(date.getTime() + offset * 60 * 1000);
        events.push({
            timestamp: timestamp,
            time: timestamp.toTimeString().substr(0, 5),
            anim: anim
        });
        offset += 10;
    }

    function playAnim(anim) {
        var i, count;
        if (Array.isArray(anim)) {
            for (i = 0; i < anim.length; i++) {
                playAnim(anim[i]);
            }
        } else if (typeof anim === 'string') {
            playSimpleAnim(anim);
        } else if (typeof anim.repeat_random === 'number') {
            count = chance.normal({mean: anim.repeat_random});
            for (i = 0; i < count; i++) {
                playAnim(anim.anim);
            }
        } else if (typeof anim.likelihood === 'number') {
            if (chance.bool({likelihood: anim.likelihood * 100})) {
                playAnim(anim.anim);
            }
        } else if (anim.parallel) {
            // todo
            playAnim(anim.parallel[0]);
        } else if (anim.choice) {
            var remaining;
            var weights = anim.choice.map(function (a, idx) {
                if (a.likelihood) {
                    var l = a.likelihood;
                    delete a.likelihood;
                    return l;
                } else {
                    remaining = idx;
                    return 0;
                }
            });
            if (typeof remaining === 'number') {
                var weight = 1 - weights.reduce(function (a, b) {
                    return a + b;
                });
                weights[remaining] = weight;
            }
            playAnim(chance.weighted(anim.choice, weights));
        } else if (typeof anim.delay_random === 'number') {
            // todo
        } else if (anim.anim) {
            playAnim(anim.anim);
        } else {
            console.log('Unknown anim type:');
            console.log(anim);
        }
    }
}
