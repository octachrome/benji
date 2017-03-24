/**
 * A version of $.ajax which works properly with native promises.
 */
function ajax(options) {
    return Promise.resolve($.get(options));
}

function toDateString(date) {
    return date.toISOString().substr(0, 10);
}

/*
Event flows:
    page loads -> HLS start, tick
    tick -> event list fetched (if out of date) -> timeOffset updated
    user updates date box -> timestamp sent to /play, HLS restart
    user clicks an event -> timestamp sent to /play, HLS restart
    /play responds with time offset -> timeOffset updated
    timeOffset updated -> date box updated (observer suppressed)
*/
function ViewModel() {
    var self = this;
    self.sidebarVisible = ko.observable()
    self.events = ko.observableArray();
    self.ready = ko.observable(false);
    self.date = ko.observable();
    self.timeOffset = ko.observable();

    self.timeOffset.subscribe(function () {
        self.updateDateBox();
    });

    self.date.subscribe(function (dateString) {
        if (!self.ignoreDateChange) {
            // User edited the date box.
            var globalOffset = new Date(dateString + ' 07:00:00').getTime();
            if (!isNaN(globalOffset)) {
                self.seek(globalOffset).then(function () {
                    self.updateEvents();
                });
            }
        }
    });

    self.startHls();
    self.tick();
}

ViewModel.prototype.updateDateBox = function () {
        try {
            this.ignoreDateChange = true;
            this.date(toDateString(this.getPlayerTime()));
        }
        finally {
            this.ignoreDateChange = false;
        }
};

ViewModel.prototype.tick = function () {
    var self = this;
    var playerTime = self.getPlayerTime();
    if (playerTime) {
        var dateString = toDateString(playerTime);
        if (dateString === self.date()) {
            setTimeout(function () {
                self.tick();
            }, 1000);
            return;
        }
    }
    // Either there is no time offset, or the event list is out of date.
    self.updateEvents().then(function () {
        self.updateDateBox();
        self.tick();
    });
};

ViewModel.prototype.getPlayerTime = function () {
    var timeOffset = this.timeOffset();
    return (typeof timeOffset === 'number') ? new Date(new Date().getTime() - timeOffset) : null;
};

ViewModel.prototype.startHls = function () {
    if (Hls.isSupported()) {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
            return setTimeout(this.startHls.bind(this), 200);
        }
        var video = document.getElementById('video');
        var hls = new Hls({
            manifestLoadingTimeout: 60000,
            manifestLoadingMaxRetry: 10,
            debug: true
        });
        hls.loadSource('segments.m3u8');
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            video.play();
        });
        this.hls = hls;
    }
};

ViewModel.prototype.showSidebar = function () {
    this.sidebarVisible(true);
};

ViewModel.prototype.hideSidebar = function () {
    this.sidebarVisible(false);
};

ViewModel.prototype.updateEvents = function () {
    var self = this;
    self.events([]);
    return ajax('/events').then(function (eventsByThread) {
        self.events(eventsByThread.main.map(function (event) {
            return {
                globalOffset: event.globalOffset,
                time: new Date(event.globalOffset).toTimeString().substr(0, 8),
                anim: event.anim
            };
        }));
        self.timeOffset(eventsByThread.timeOffset);
    });
};

ViewModel.prototype.gotoEvent = function (event) {
    this.seek(event.globalOffset);
};

ViewModel.prototype.seek = function (globalOffset) {
    var self = this;
    return ajax({
        type: 'PUT',
        url: '/play/' + globalOffset
    }).then(function (response) {
        self.timeOffset(response.timeOffset);
        self.startHls();
    });
};

ko.bindingHandlers.eventTable = {
    init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
    },
    update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
        var events = ko.unwrap(valueAccessor());
        if (events && typeof events.map === 'function') {
            var html = events.map(function (event, idx) {
                return '<div>' +
                    '<a href="#" data-index="' + idx + '">' +
                    '<span>' + event.time + '</span>' +
                    ' ' +
                    '<span>' + event.anim + '</span>' +
                    '</a>' +
                    '</div>';
            }).join('');
            $(element).html(html);
            $(element).find('a').click(function (e) {
                var idx = $(e.delegateTarget).data('index');
                var event = events[idx];
                viewModel.gotoEvent(event);
            });
        }
        else {
            $(element).html('');
        }
    }
};

$(function () {
    window.viewModel = new ViewModel();
    ko.applyBindings(window.viewModel);
});
