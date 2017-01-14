var expect = require('chai').expect;
var Script = require('../js/compile');

describe('Script', function () {
    let script;

    beforeEach(function () {
        script = new Script();
    });

    describe('#splitEvents', function () {
        it('should split an event that overlaps a segment boundary', function () {
            let events = Array.from(script.splitEvents([
                {
                    type: 'anim',
                    offset: 0,
                    globalOffset: 0,
                    duration: 4001
                }
            ]));
            expect(events).to.deep.equal([
                {
                    type: 'anim',
                    globalOffset: 0,
                    offset: 0,
                    duration: 4000
                },
                {
                    type: 'anim',
                    globalOffset: 4000,
                    offset: 4000,
                    duration: 1,
                    startFrame: 51
                }
            ]);
        });

        it('should split an event that overlaps two segment boundaries', function () {
            let events = Array.from(script.splitEvents([
                {
                    type: 'anim',
                    offset: 0,
                    globalOffset: 0,
                    duration: 8001
                }
            ]));
            expect(events).to.deep.equal([
                {
                    type: 'anim',
                    globalOffset: 0,
                    offset: 0,
                    duration: 4000
                },
                {
                    type: 'anim',
                    globalOffset: 4000,
                    offset: 4000,
                    duration: 4000,
                    startFrame: 51
                },
                {
                    type: 'anim',
                    globalOffset: 8000,
                    offset: 8000,
                    duration: 1,
                    startFrame: 101
                }
            ]);
        });
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
