'use strict';

var expect = require('chai').expect;
var Server = require('../server');

describe('Server', function () {
    let server;

    beforeEach(function () {
        server = new Server(new Date());
    });

    describe('#splitEvents', function () {
        it('should split an event that overlaps a segment boundary', function () {
            let events = Array.from(server.splitEvents([
                {
                    type: 'play',
                    offset: 0,
                    globalOffset: 0,
                    duration: 4001
                }
            ]));
            expect(events).to.deep.equal([
                {
                    type: 'play',
                    globalOffset: 0,
                    offset: 0,
                    duration: 4000
                },
                {
                    type: 'play',
                    globalOffset: 4000,
                    offset: 4000,
                    duration: 1,
                    startFrame: 50
                }
            ]);
        });

        it('should split an event that overlaps two segment boundaries', function () {
            let events = Array.from(server.splitEvents([
                {
                    type: 'play',
                    offset: 0,
                    globalOffset: 0,
                    duration: 8001
                }
            ]));
            expect(events).to.deep.equal([
                {
                    type: 'play',
                    globalOffset: 0,
                    offset: 0,
                    duration: 4000
                },
                {
                    type: 'play',
                    globalOffset: 4000,
                    offset: 4000,
                    duration: 4000,
                    startFrame: 50
                },
                {
                    type: 'play',
                    globalOffset: 8000,
                    offset: 8000,
                    duration: 1,
                    startFrame: 100
                }
            ]);
        });
    });

    describe('#truncateSegmentEvents', function () {
        it('should truncate overlapping events', function () {
            let segments = Array.from(server.truncateSegmentEvents([
                {
                    eventsByThread: new Map([
                        ['main', [
                            {
                                type: 'play',
                                offset: 0,
                                globalOffset: 0,
                                duration: 100
                            },
                            {
                                type: 'play',
                                offset: 50,
                                globalOffset: 50,
                                duration: 100
                            }
                        ]
                    ]])
                }
            ]));
            expect(segments[0].eventsByThread.get('main')).to.deep.equal([
                {
                    type: 'play',
                    offset: 0,
                    globalOffset: 0,
                    duration: 50
                },
                {
                    type: 'play',
                    offset: 50,
                    globalOffset: 50,
                    duration: 100
                }
            ]);
        });

        it('should discard zero-length anim events', function () {
            let segments = Array.from(server.truncateSegmentEvents([
                {
                    eventsByThread: new Map([
                        ['main', [
                            {
                                type: 'play',
                                anim: 'anim1',
                                offset: 0,
                                globalOffset: 0,
                                duration: 100
                            },
                            {
                                type: 'play',
                                anim: 'anim2',
                                offset: 0,
                                globalOffset: 0,
                                duration: 100
                            }
                        ]
                    ]])
                }
            ]));
            expect(segments[0].eventsByThread.get('main')).to.deep.equal([
                {
                    type: 'play',
                    anim: 'anim2',
                    offset: 0,
                    globalOffset: 0,
                    duration: 100
                }
            ]);
        });

        it('should preserve zero-length dialog events', function () {
            let segments = Array.from(server.eventsToSegments([
                {
                    type: 'dialog',
                    offset: 0,
                    globalOffset: 0,
                    duration: 100
                },
                {
                    type: 'play',
                    offset: 0,
                    globalOffset: 0,
                    duration: 100
                }
            ]));
            expect(segments[0].eventsByThread.get('main')).to.deep.equal([
                {
                    type: 'dialog',
                    offset: 0,
                    segmentOffset: 0,
                    globalOffset: 0,
                    duration: 100
                },
                {
                    type: 'play',
                    offset: 0,
                    segmentOffset: 0,
                    globalOffset: 0,
                    duration: 100
                }
            ]);
        });
    });

    describe('#setDialogDurations', function () {
        it('should set the duration of a dialog event', function () {
            let events = Array.from(server.setDialogDurations([
                {
                    type: 'dialog',
                    pos: 1,
                    dialog: 'howdy',
                    offset: 50,
                    duration: 0,
                    globalOffset: 50,
                    segmentOffset: 50
                },
                {
                    type: 'clear-dialog',
                    globalOffset: 3000,
                    segmentOffset: 3000
                }
            ]));
            expect(events).to.deep.equal([
                {
                    type: 'dialog',
                    pos: 1,
                    dialog: 'howdy',
                    offset: 50,
                    duration: 2950,
                    globalOffset: 50,
                    segmentOffset: 50
                }
            ]);
        });
    });
});
