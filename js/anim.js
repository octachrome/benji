var Long = dcodeIO.Long;
var mul = new Long(0xDEECE66D, 0x5);
var mask = new Long(0xFFFFFFFF, 0xFFFF);

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

/*
for (var i = 1; i < 20; i++) {
    console.log(dateSeed(new Date('2015-12-'+i)).toString(16));
}
*/
/*
var seed = 123;
for (var i = 0; i < 20; i++) {
    seed = gen(seed);
    console.log(seed.toString(16));
}
*/

// data:
// ip = initial frame
// op = last frame
// fr = frame rate
// layer:
// ip, op, as above (frames in which layer is visible)
// ind = index, from 1 to #layers
// parent = index of parent layer (for relative pos/movement)
// ks = animation data
// ks:
// a = origin for rotations: [float, float, 0]
// p = position animation: [float, float, 0] or [{anim}, {anim}]
// r = rotation animation: float, or [{anim}, {anim}, {t:24}], or rarely [{path}, {t:24}]
// s = scale: [float, float, float], normally [1, 1, 1]
// o = opacity: 100
// anim:
// t = frame
// s = starting values (angle or pos)
// e = ending values (angle or pos)
// n = name?
// i, o = something that affects acceleration
// ti = ?
// to = ?

/**
 * Reindex the layers of an animation so that it can be combined with another one.
 */
function reindex(adata, base) {
    var offset = base || adata.layers.length;
    for (var l = 0; l < adata.layers.length; l++) {
        var layer = adata.layers[l];
        layer.ind += offset;
        if (typeof layer.parent === 'number') {
            layer.parent += offset;
        }
    }
}

/**
 * Create a reverse copy of an animation.
 */
function reverse(adata) {
    adata = $.extend(true, {}, adata);
    for (var l = 0; l < adata.layers.length; l++) {
        var layer = adata.layers[l];
        if (typeof layer.ks.p[0] === 'object') {
            var ptimes = layer.ks.p.map(function (o) {return adata.op - o.t}).reverse();
            layer.ks.p = layer.ks.p.reverse();
            layer.ks.p.push(layer.ks.p.shift());
            for (var p = 0; p < layer.ks.p.length - 1; p++) {
                var ptmp = layer.ks.p[p].e;
                layer.ks.p[p].e = layer.ks.p[p].s;
                layer.ks.p[p].s = ptmp;
                layer.ks.p[p].t = ptimes[p];
            }
        }
        if (typeof layer.ks.r[0] === 'object') {
            var rtimes = layer.ks.r.map(function (o) {return adata.op - o.t}).reverse();
            layer.ks.r = layer.ks.r.reverse();
            layer.ks.r.push(layer.ks.r.shift());
            for (var r = 0; r < layer.ks.r.length; r++) {
                var rtmp = layer.ks.r[r].e;
                layer.ks.r[r].e = layer.ks.r[r].s;
                layer.ks.r[r].s = rtmp;
                layer.ks.r[r].t = rtimes[r];
            }
        }
    }
    return adata;
}

/**
 * Shift an animation in time.
 */
function shift(adata, offset) {
    adata.ip += offset;
    adata.op += offset;
    for (var l = 0; l < adata.layers.length; l++) {
        var layer = adata.layers[l];
        layer.ip += offset;
        layer.op += offset;
        for (var p = 0; p < layer.ks.p.length; p++) {
            if (typeof layer.ks.p[p] === 'object') {
                layer.ks.p[p].t += offset;
            }
        }
        for (var r = 0; r < layer.ks.r.length; r++) {
            if (typeof layer.ks.r[r] === 'object') {
                layer.ks.r[r].t += offset;
            }
        }
    }
}

function combine(dest, src) {
    if (!dest.layers) {
        $.extend(true, dest, src);
    } else {
        reindex(src, dest.layers.length);
        shift(src, dest.op);
        dest.layers = dest.layers.concat(src.layers);
        dest.op = src.op;
    }
    return [src.ip, src.op];
}

$(function () {
    $.when(
        $.get('anim/sit.json'),
        $.get('anim/sitting.json'),
        $.get('anim/standing.json')
    ).then(function (sitAjax, sittingAjax, standingAjax) {
        var sit = sitAjax[0];
        var stand = reverse(sit);
        var sitting = sittingAjax[0];
        var standing = standingAjax[0];

        var animationData = {};
        var states = {
            SIT: {
                seg: combine(animationData, sit),
                next: ['SITTING']
            },
            STAND: {
                seg: combine(animationData, stand),
                next: ['STANDING']
            },
            SITTING: {
                seg: combine(animationData, sitting),
                next: ['SITTING', 'SITTING', 'STAND']
            },
            STANDING: {
                seg: combine(animationData, standing),
                next: ['STANDING', 'STANDING', 'SIT']
            }
        };

        var stateId = 'STANDING';

        var anim = bodymovin.loadAnimation({
            wrapper: $('#target')[0],
            animType: 'svg',
            autoplay: false,
            loop: false,
            animationData: animationData
        });
        anim.addEventListener('complete', function (e) {
            stateId = states[stateId].next[Math.floor(Math.random() * states[stateId].next.length)]; 
            anim.playSegments(states[stateId].seg, true);
            anim.play();
        });
        anim.playSegments(states[stateId].seg, true);
        anim.play();
    });
});
