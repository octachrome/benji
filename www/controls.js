/**
 * A version of $.get which works properly with native promises.
 */
function xhrGet(options) {
    return Promise.resolve($.get(options));
}

function ViewModel() {
    var self = this;
    self.sidebarVisible = ko.observable()
    self.events = ko.observableArray();
    self.ready = ko.observable(false);
    self.date = ko.observable(toDateTimeString(new Date()));

    xhrGet('/events').then(function (eventsByThread) {
        self.updateEvents(eventsByThread);
    });

    self.date.subscribe(function (dateTime) {
        $.ajax({
            type: 'PUT',
            url: '/play/' + dateTime
        });
        self.startHls();
    });

    self.startHls();
}

function toDateTimeString(date) {
    return date.toISOString().substr(0, 10) + ' ' + date.toLocaleTimeString();
}

ViewModel.prototype.startHls = function () {
    if (Hls.isSupported()) {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
            return setTimeout(this.startHls.bind(this), 200);
        }
        var video = document.getElementById('video');
        var hls = new Hls({
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

ViewModel.prototype.updateEvents = function (eventsByThread) {
    this.events(eventsByThread.main.map(function (event) {
        return {
            globalOffset: event.globalOffset,
            time: new Date(event.globalOffset).toTimeString().substr(0, 8),
            anim: event.anim
        };
    }));
};

ViewModel.prototype.gotoEvent = function (event) {
    this.date(toDateTimeString(new Date(event.globalOffset)));
};

$(function () {
    var viewModel = new ViewModel();
    ko.applyBindings(viewModel);
});
