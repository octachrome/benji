var expect = require('chai').expect;
var Script = require('../js/compile');

describe('Script', function () {
    let script;

    beforeEach(function () {
        script = new Script();
    });

    describe('#eventsToSegments', function () {
        it('should truncate overlapping events', function () {
            let segments = Array.from(script.eventsToSegments([
                {
                    type: 'anim',
                    offset: 0,
                    globalOffset: 0,
                    duration: 100
                },
                {
                    type: 'anim',
                    offset: 50,
                    globalOffset: 50,
                    duration: 100
                }
            ]));
            expect(segments[0].eventsByThread.get('main')).to.deep.equal([
                {
                    type: 'anim',
                    offset: 0,
                    globalOffset: 0,
                    duration: 50,
                    segmentOffset: 0
                },
                {
                    type: 'anim',
                    offset: 50,
                    globalOffset: 50,
                    duration: 100,
                    segmentOffset: 50
                }
            ]);
        });
    })
});
