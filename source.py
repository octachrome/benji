import constants
import os.path
import av
import numpy as np
import json
import threading
import queue
import sys
import textwrap
from PIL import Image, ImageFont, ImageDraw

FONT = ImageFont.truetype(constants.FONTFILE, 30)

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
    def __init__(self, thread=None):
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
        self.event_queue.append(event)

    def get_next_frame_tuple(self):
        assert self.global_offset is not None, 'Source has not been initialized'
        self.update_active_event()
        next_frame_tuple = self.get_blank_tuple()
        if self.active_gen:
            try:
                next_frame_tuple = next(self.active_gen)
            except (StopIteration, av.error.FileNotFoundError):
                self.active_gen = None
                self.active_event = None
        self.global_offset += constants.FRAME_LENGTH_MS
        if len(next_frame_tuple) == 2 and next_frame_tuple[0].format.name != 'rgba':
            print('Unexpected format:', next_frame_tuple[0], 'from', self.active_event)
        return next_frame_tuple

    def get_blank_tuple(self):
        return (BLANK_VIDEO_FRAME, BLANK_AUDIO_FRAME)

    def update_active_event(self):
        next_event = None
        while self.event_queue and self.global_offset >= self.event_queue[0]['globalOffset']:
            next_event = self.event_queue.pop(0)

        if self.active_event and (
            (self.global_offset >= self.active_event['globalOffset'] + self.active_event['duration']) or
            (next_event is not None)):
            self.active_gen.close()
            self.active_event = None
            self.active_gen = None

        if next_event and self.should_process(next_event) and (
            self.global_offset < next_event['globalOffset'] + next_event['duration']):
            self.active_event = next_event
            self.active_gen = self.get_generator(next_event)

    def has_events(self):
        return self.active_event or self.event_queue

    def should_process(self, event):
        return True


class VideoSource(Source):
    def should_process(self, event):
        return event['anim'] != 'nothing'

    def get_generator(self, event):
        anim = MANIFEST[event['anim']]
        return rpt_frame_tuples(anim['pattern'], anim.get('audio'))


class DialogSource(Source):
    def __init__(self):
        super().__init__()
        image = Image.new("RGBA", (constants.VIDEO_WIDTH, constants.DIALOG_HEIGHT), (255, 255, 255))
        self.empty_dialog_frame = self.image_to_frame(image)

    def get_blank_tuple(self):
        return (self.empty_dialog_frame, BLANK_AUDIO_FRAME)

    def image_to_frame(self, image):
        data = np.array(image.getdata(), dtype=constants.VIDEO_DTYPE).reshape(
            constants.DIALOG_HEIGHT, constants.VIDEO_WIDTH, 4)
        return av.video.frame.VideoFrame.from_ndarray(data, format=constants.VIDEO_FORMAT)

    def get_generator(self, event):
        lines = textwrap.wrap(event['dialog'], constants.DIALOG_PER_LINE)
        lineOffset = -len(lines) / 2;
        color = constants.DIALOG_COLORS[event['pos']]

        image = Image.new("RGBA", (constants.VIDEO_WIDTH, constants.DIALOG_HEIGHT), (255, 255, 255))
        draw = ImageDraw.Draw(image)
        draw.fontmode = "L"

        for i, line in enumerate(lines):
            left, top, right, bottom = FONT.getbbox(line)
            text_w = right - left
            text_h = bottom - top
            x = (constants.VIDEO_WIDTH - text_w) / 2
            y = (constants.DIALOG_HEIGHT / 2) + (lineOffset + i) * text_h
            draw.text((x,y), line, color, font=FONT)

        frame = self.image_to_frame(image)
        while True:
            yield (frame, BLANK_AUDIO_FRAME)


class MultiSource:
    def __init__(self, nsources=8):
        self.nsources = nsources
        self.sources = [VideoSource(i) for i in range(nsources)]
        self.dialog_source = DialogSource()
        self.event_queue = queue.Queue()

    def add_event(self, event):
        if event['type'] == 'seek':
            for source in self.sources:
                source.seek(event['globalOffset'])
            self.dialog_source.seek(event['globalOffset'])
        elif event['type'] == 'play':
            # Main thread is always the last one
            thread = event.get('thread', self.nsources - 1)
            if thread < self.nsources:
                source = self.sources[thread]
                source.add_event(event)
        elif event['type'] == 'dialog':
            self.dialog_source.add_event(event)

    def get_next_frame_tuples(self):
        self.poll_events()
        return [source.get_next_frame_tuple() for source in self.sources]

    def get_next_dialog_frame(self):
        return self.dialog_source.get_next_frame_tuple()[0]

    def poll_events(self):
        while True:
            # Block if all sources are waiting for events, to prevent the player from running ahead
            should_block = not any(source.has_events() for source in self.sources)
            try:
                event = self.event_queue.get(should_block)
            except queue.Empty:
                break
            self.add_event(event)

    def start_reader(self, file):
        reader = threading.Thread(target=self.reader_thread, name='EventReader', args=(file,))
        reader.start()

    def reader_thread(self, file):
        while True:
            line = file.readline()
            if line == '':
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
