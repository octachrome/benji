import constants
import os.path
import av
import numpy as np

NO_AUDIO_SAMPLES = np.array([[], []], dtype='float32')

def gen_frame_tuples(video_fname, audio_fname):
    video_gen = gen_frames(video_fname, 'video')
    audio_gen = gen_frames(audio_fname, 'audio')
    audio_format = 'fltp'
    audio_layout = 'stereo'
    audio_rate = constants.AUDIO_RATE
    audio_buffer = NO_AUDIO_SAMPLES
    while True:
        try:
            vframe = next(video_gen)
        except StopIteration:
            audio_gen.close()
            break
        audio_samples = audio_buffer
        while audio_samples.shape[1] < constants.ASAMPLES_PER_VFRAME:
            try:
                aframe = next(audio_gen)
            except StopIteration:
                print('No more audio samples')  # Hopefully this doesn't happen
                aframe = None
            if aframe:
                frame_data = aframe.to_ndarray()
                audio_format = aframe.format.name
                audio_layout = aframe.layout.name
                audio_rate = aframe.rate
            else:
                frame_data = np.zeros((2, constants.ASAMPLES_PER_VFRAME - audio_samples.shape[1]), dtype='float32')
            audio_samples = np.hstack((audio_samples, frame_data))

        if audio_samples.shape[1] > constants.ASAMPLES_PER_VFRAME:
            audio_buffer = audio_samples[:, constants.ASAMPLES_PER_VFRAME:]
            audio_samples = audio_samples[:, :constants.ASAMPLES_PER_VFRAME]
        else:
            audio_buffer = NO_AUDIO_SAMPLES
        aframe = av.audio.frame.AudioFrame.from_ndarray(audio_samples, format=audio_format, layout=audio_layout)
        aframe.rate = audio_rate
        try:
            yield (vframe, aframe)
        except GeneratorExit as e:
            # Close the libav streams
            video_gen.close()
            audio_gen.close()
            raise e

def gen_frames(fname, stype):
    if fname is None:
        while True:
            yield None
    else:
        with av.open(fname, mode='r') as container:
            stream = getattr(container.streams, stype)[0]
            for packet in container.demux(stream):
                for frame in packet.decode():
                    yield frame


class Source:
    global_offset = None
    active_gen = None
    event_queue = []

    def seek(self, global_offset):
        self.global_offset = global_offset

    def add_event(self, event):
        assert event['type'] == 'play', 'Only play events can be queued'
        self.event_queue.append(event)

    def get_frames(self):
        assert self.global_offset is not None, 'Source has not been initialized'
        self.drop_past_events()
        if not self.event_queue:
            next_frames = EMPTY_FRAMES
        else:
            next_event = self.event_queue[0]
            if next_event['globalOffset'] > self.global_offset:
                # Next event is still in the future
                next_frames = EMPTY_FRAMES
            else:
                pass

        self.global_offset += constants.FRAME_LENGTH_MS
        return next_frames

DROPBOX = '/home/chris/Dropbox/Benji'
V_DRINK_TEA = os.path.join(DROPBOX, 'PNGSequences/LivingRoom/LivingRoom-Centre-DrinkTea/LivingRoom-Centre-DrinkTea00%01d.png')
A_DRINK_TEA = os.path.join(DROPBOX, 'audio/LivingRoom-Centre-DrinkTea.aac')

gen = gen_frame_tuples(V_DRINK_TEA, A_DRINK_TEA)
x = next(gen)
print(x)

#{"type":"play","offset":34954400,"globalOffset":1599986554400,"duration":6000,"thread":2,"anim":"nothing"}
