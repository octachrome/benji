import constants
import os.path
import av
import numpy as np
import json
import threading
import queue

# Pushing None into a filter buffer suspends it: it will repeat its last contents forever.
# A filter buffer can start off suspended, having never seen any frames.
# You cannot suspend all filter buffers: at least one buffer must have frames, otherwise EOF occurs.
# Once suspended, it seems a filter buffer cannot be sent frames in the future.
# So:
#   Sources should never return None: they should repeat their data.
#   Empty sources should return a blank frame.
#   Video sources without audio should fill in blank audio frames.
# Frames can be re-used.

with open('anims.json') as f:
    MANIFEST = json.load(f)

BLANK_VIDEO_FRAME = av.video.frame.VideoFrame.from_ndarray(
    np.zeros((constants.VIDEO_HEIGHT, constants.VIDEO_WIDTH, 4), dtype=constants.VIDEO_DTYPE),
    format=constants.VIDEO_FORMAT)

BLANK_AUDIO_FRAME = av.audio.frame.AudioFrame.from_ndarray(
    np.zeros((2, constants.ASAMPLES_PER_VFRAME), dtype=constants.AUDIO_DTYPE),
    format=constants.AUDIO_FORMAT,
    layout=constants.AUDIO_LAYOUT)
BLANK_AUDIO_FRAME.rate = constants.AUDIO_RATE

NO_AUDIO_SAMPLES = np.array([[], []], dtype=constants.AUDIO_DTYPE)

def gen_frame_tuples(video_fname, audio_fname):
    video_gen = gen_frames(video_fname, 'video')
    audio_gen = gen_frames(audio_fname, 'audio')
    audio_format = constants.AUDIO_FORMAT
    audio_layout = constants.AUDIO_LAYOUT
    audio_rate = constants.AUDIO_RATE
    audio_buffer = NO_AUDIO_SAMPLES
    for vframe in video_gen:
        audio_samples = audio_buffer
        while audio_samples.shape[1] < constants.ASAMPLES_PER_VFRAME:
            try:
                aframe = next(audio_gen)    # May return None
            except StopIteration:
                # Audio file is shorter than video file
                aframe = None
            if aframe:
                frame_data = aframe.to_ndarray()
            else:
                frame_data = np.zeros((2, constants.ASAMPLES_PER_VFRAME - audio_samples.shape[1]), dtype=constants.AUDIO_DTYPE)
            audio_samples = np.hstack((audio_samples, frame_data))

        if audio_samples.shape[1] > constants.ASAMPLES_PER_VFRAME:
            audio_buffer = audio_samples[:, constants.ASAMPLES_PER_VFRAME:]
            audio_samples = audio_samples[:, :constants.ASAMPLES_PER_VFRAME]
        else:
            audio_buffer = NO_AUDIO_SAMPLES
        aframe = av.audio.frame.AudioFrame.from_ndarray(audio_samples,
            format=constants.AUDIO_FORMAT, layout=constants.AUDIO_LAYOUT)
        aframe.rate = audio_rate
        yield (vframe, aframe)

def gen_frames(fname, stype):
    if fname is None:
        while True:
            yield None
    else:
        with av.open(fname, mode='r') as container:
            stream = getattr(container.streams, stype)[0]
            stream.thread_type = 'AUTO'
            for packet in container.demux(stream):
                for frame in packet.decode():
                    yield frame

def rpt_frame_tuples(video_fname, audio_fname):
    while True:
        for tup in gen_frame_tuples(video_fname, audio_fname):
            yield tup

class Source:
    def __init__(self, thread):
        self.thread = thread
        self.global_offset = None
        self.event_queue = []
        self.active_event = None
        self.active_gen = None

    def seek(self, global_offset):
        self.global_offset = global_offset
        if self.active_event:
            self.active_gen.close()
            self.active_event = None
            self.active_gen = None
        self.event_queue = []

    def add_event(self, event):
        assert event['type'] == 'play', 'Only play events can be queued'
        self.event_queue.append(event)

    def get_frames(self):
        assert self.global_offset is not None, 'Source has not been initialized'
        self.update_active_event()
        next_frames = (BLANK_VIDEO_FRAME, BLANK_AUDIO_FRAME)
        if self.active_gen:
            try:
                next_frames = next(self.active_gen)
            except (StopIteration, av.error.FileNotFoundError):
                self.active_gen = None
                self.active_event = None
        self.global_offset += constants.FRAME_LENGTH_MS
        return next_frames

    def update_active_event(self):
        if self.active_event and (
            self.global_offset >= self.active_event['globalOffset'] + self.active_event['duration']):
            self.active_gen.close()
            self.active_event = None
            self.active_gen = None

        next_event = None
        while self.event_queue and self.global_offset >= self.event_queue[0]['globalOffset']:
            next_event = self.event_queue.pop(0)

        if next_event and next_event['anim'] != 'nothing' and (
            self.global_offset < next_event['globalOffset'] + next_event['duration']):
            anim = MANIFEST[next_event['anim']]
            self.active_event = next_event
            self.active_gen = rpt_frame_tuples(anim['pattern'], anim.get('audio'))

    def has_events(self):
        return self.active_event or self.event_queue


EOF = 'EOF'


class MultiSource:
    def __init__(self, nsources=8):
        self.nsources = nsources
        self.sources = [Source(i) for i in range(nsources)]
        self.event_queue = queue.Queue()

    def add_event(self, event):
        if event['type'] == 'seek':
            for source in self.sources:
                source.seek(event['globalOffset'])
        elif event['type'] == 'play':
            # Main thread is always the last one
            thread = event.get('thread', self.nsources - 1)
            if thread < self.nsources:
                source = self.sources[thread]
                source.add_event(event)

    def get_frames(self):
        self.poll_events()
        return [source.get_frames() for source in self.sources]

    def poll_events(self):
        while True:
            # Block if all sources are waiting for events, to prevent the player from running ahead
            should_block = not any(source.has_events() for source in self.sources)
            try:
                event = self.event_queue.get(should_block)
            except queue.Empty:
                break
            # elif event == EOF:
            #     raise Exception('End of event stream')
            self.add_event(event)

    def start_reader(self, file):
        reader = threading.Thread(target=self.reader_thread, name='EventReader', args=(file,))
        reader.start()

    def reader_thread(self, file):
        while True:
            line = file.readline()
            if line == '':
                # self.event_queue.put(EOF)
                break
            event = None
            line = line.strip()
            if line[0] == '{':
                try:
                    event = json.loads(line)
                except Exception as e:
                    pass
            if event:
                self.event_queue.put(event)
            else:
                print(line)
