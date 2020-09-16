import os
import sys
import subprocess
import itertools as it
import os.path
import av
import constants
from av.filter import Filter, Graph

import logging
logging.basicConfig()
#logging.getLogger('libav').setLevel(logging.DEBUG)

# [([v], [a]), ([v], [a])] = source.get_frames()

# thread 1 - read from stdin, parse json, send events to source objects
# thread 2 - poll source objects for next frame, join them up

BIT_RATE = '500k'

DROPBOX = '/home/chris/Dropbox/Benji'
V_BACKGROUND = os.path.join(DROPBOX, 'PNGSequences/Backgrounds/LivingRoom/LivingRoom-Background/LivingRoom-Background.png')
V_DRINK_TEA = os.path.join(DROPBOX, 'PNGSequences/LivingRoom/LivingRoom-Centre-DrinkTea/LivingRoom-Centre-DrinkTea00%01d.png')
A_DRINK_TEA = os.path.join(DROPBOX, 'audio/LivingRoom-Centre-DrinkTea.aac')
A_POGO1 = os.path.join(DROPBOX, 'audio/LivingRoom-Pogo1.aac')

def iter_frames(source, stype):
    for container in source:
        stream = getattr(container.streams, stype)[0]
        for packet in container.demux(stream):
            for frame in packet.decode():
                yield frame

def open_container(fname):
    with av.open(fname, mode='r') as container:
        yield container

def repeat_fn(fn, *args):
    while True:
        for i in fn(*args):
            yield i

class NamedWriteable:
    def __init__(self, wrapped, name):
        self.name = name
        self.wrapped = wrapped

    def write(self, *args, **kwargs):
        self.wrapped.write(*args, **kwargs)


def main():
    if os.environ.get('TWITCH_KEY'):
        proc_args = [
            'ffmpeg', '-i', '-',
            '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-g', '25', '-keyint_min', '12', '-preset', 'ultrafast',
            '-b:v', BIT_RATE, '-minrate', BIT_RATE, '-maxrate', BIT_RATE, '-bufsize', BIT_RATE, '-threads', '1',
            '-acodec', 'aac',
            '-f', 'flv', 'rtmp://live-lhr03.twitch.tv/app/' + os.environ['TWITCH_KEY']
        ]
    else:
        proc_args = ['ffplay', '-autoexit', '-']

    vin0 = iter_frames(open_container(V_BACKGROUND), 'video')
    vin1 = iter_frames(repeat_fn(open_container, V_DRINK_TEA), 'video')
    ain0 = iter_frames(repeat_fn(open_container, A_DRINK_TEA), 'audio')
    ain1 = iter_frames(repeat_fn(open_container, A_POGO1), 'audio')

    proc = subprocess.Popen(proc_args, stdin=subprocess.PIPE)
    out_container = av.open(NamedWriteable(proc.stdin, 'pipe'), mode='w', format='matroska')

    out_vstream = out_container.add_stream('rawvideo', rate=12.5)
    out_vstream.width = 1280
    out_vstream.height = 720
    out_vstream.pix_fmt = 'yuv420p'

    out_astream = out_container.add_stream('pcm_s16le', rate=44100)

    graph = Graph()

    vbuf0 = graph.add_buffer(width=1280, height=720, format='rgba')
    vbuf1 = graph.add_buffer(width=1280, height=720, format='rgba')
    overlay = graph.add('overlay')
    vbuf0.link_to(overlay)
    vbuf1.link_to(overlay, input_idx=1)
    drawtext=graph.add('drawtext', 'fontfile=/usr/share/fonts/truetype/ubuntu-font-family/Ubuntu-R.ttf:fontcolor=white:fontsize=24:x=10:y=10:text=%{pts\\:hms}')
    overlay.link_to(drawtext)
    vsink = graph.add('buffersink')
    drawtext.link_to(vsink)

    abuf0 = graph.add_abuffer(sample_rate=44100, format='fltp', channels=2, layout='stereo')
    abuf1 = graph.add_abuffer(sample_rate=44100, format='fltp', channels=2, layout='stereo')
    amix = graph.add('amix', 'inputs=2')
    abuf0.link_to(amix)
    abuf1.link_to(amix, input_idx=1)
    volume = graph.add('volume', 'volume=10')
    amix.link_to(volume)
    asink = graph.add('abuffersink')
    volume.link_to(asink)

    graph.configure()

    audio_iter = it.zip_longest(ain0, ain1)

    video_pts = 0
    audio_pts = 0

    for vframe0, vframe1 in it.zip_longest(vin0, vin1):
        vbuf0.push(vframe0)
        vbuf1.push(vframe1)
        vframe_out = vsink.pull()

        vframe_out.time_base = constants.TIME_BASE
        vframe_out.pts = video_pts
        video_pts += constants.ASAMPLES_PER_VFRAME

        for packet in out_vstream.encode(vframe_out):
            out_container.mux(packet)

        while audio_pts < video_pts:
            try:
                aframe0, aframe1 = next(audio_iter)
            except StopIter:
                break
            abuf0.push(aframe0)
            abuf1.push(aframe1)
            aframe_out = asink.pull()

            aframe_out.time_base = constants.TIME_BASE
            aframe_out.pts = audio_pts
            audio_pts += aframe_out.samples

            for packet in out_astream.encode(aframe_out):
                out_container.mux(packet)

    # Flush streams (encode with no args)
    for packet in out_vstream.encode():
        out_container.mux(packet)

    for packet in out_astream.encode():
        out_container.mux(packet)

    out_container.close()
    return


if __name__ == '__main__':
    main()
