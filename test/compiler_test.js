'use strict';

var expect = require('chai').expect;
var doCompileScript = require('../js/compiler');
var PEG = require('pegjs');
var fs = require('fs');
var parser = PEG.buildParser(fs.readFileSync(__dirname + '/../js/benji.pegjs', 'utf8'));

describe('Compiler', function () {
    describe(':while', function () {
        var script = parser.parse(
`:set x 0
:while x < 3
    < x is {{x}}
    :set x x + 1
< done`);
        let events = Array.from(doCompileScript(new Date('2017-01-01'), {}, script, {}));
        expect(events).to.deep.equal([
            {
                "type": "dialog",
                "dialog": "x is 0",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            },
            {
                "type": "clear-dialog",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            },
            {
                "type": "dialog",
                "dialog": "x is 1",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            },
            {
                "type": "clear-dialog",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            },
            {
                "type": "dialog",
                "dialog": "x is 2",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            },
            {
                "type": "clear-dialog",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            },
            {
                "type": "dialog",
                "dialog": "done",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            },
            {
                "type": "clear-dialog",
                "pos": 1,
                "offset": 25200000,
                "globalOffset": 1483254000000,
                "duration": 0
            }
        ]);
    });
});
