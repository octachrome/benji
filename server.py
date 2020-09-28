import os
import sys
import subprocess
import itertools as it
import os.path
import av
import json
import constants
import source
from av.filter import Filter, Graph

import logging
logging.basicConfig()
#logging.getLogger('libav').setLevel(logging.DEBUG)

BIT_RATE = '500k'

if sys.platform == 'darwin':
    FONTFILE = '/Library/Fonts/Arial Unicode.ttf'
elif sys.platform == 'linux':
    FONTFILE = '/usr/share/fonts/truetype/ubuntu-font-family/Ubuntu-R.ttf'
else:
    FONTFILE = 'c\\:/Windows/Fonts/courbd.ttf'


def log_frames(it):
    for frame in it:
        print(frame)
        yield frame

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
    if len(sys.argv) > 1 and sys.argv[1] == '-':
        out_stream = sys.stdout.buffer
    else:
        if os.environ.get('TWITCH_KEY'):
            proc_args = [
                'ffmpeg', '-i', '-',
                '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-g', '25', '-keyint_min', '12', '-preset', 'ultrafast',
                '-b:v', BIT_RATE, '-minrate', BIT_RATE, '-maxrate', BIT_RATE, '-bufsize', BIT_RATE,
                '-acodec', 'aac',
                '-f', 'flv', 'rtmp://live-lhr03.twitch.tv/app/' + os.environ['TWITCH_KEY']
            ]
        else:
            proc_args = ['ffplay', '-autoexit', '-']
        proc = subprocess.Popen(proc_args, stdin=subprocess.PIPE) # , stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        out_stream = NamedWriteable(proc.stdin, 'pipe')

    ms = source.MultiSource(nsources=7)
    ms.start_reader(sys.stdin)

    out_container = av.open(out_stream, mode='w', format='matroska')

    out_vstream = out_container.add_stream('rawvideo', rate=12.5)
    out_vstream.width = 1280
    out_vstream.height = 720
    out_vstream.pix_fmt = 'rgba'

    out_astream = out_container.add_stream('pcm_s16le', rate=44100)

    graph = Graph()

    vouts = []
    vbufs = []
    for i in range(ms.nsources):
        vbuf = graph.add_buffer(width=1280, height=720, format='rgba')
        vbufs.append(vbuf)
        vouts.append(vbuf)
    # Create a binary tree of overlay filters (each one can only take 2 inputs)
    while len(vouts) > 1:
        vnew = []
        while len(vouts) > 1:
            v1, v2 = vouts.pop(0), vouts.pop(0)
            overlay = graph.add('overlay', 'format=rgb')
            v1.link_to(overlay)
            v2.link_to(overlay, input_idx=1)
            vnew.append(overlay)
        vouts = vnew + vouts

    drawtext=graph.add('drawtext', f'fontfile={FONTFILE}:fontcolor=white:fontsize=24:x=10:y=10:text=%{{pts\\:hms}}')
    vouts[0].link_to(drawtext)
    vsink = graph.add('buffersink')
    drawtext.link_to(vsink)

    amix = graph.add('amix', f'inputs={ms.nsources}')
    abufs = []
    for i in range(ms.nsources):
        abuf = graph.add_abuffer(sample_rate=44100, format='fltp', channels=2, layout='stereo')
        abufs.append(abuf)
        abuf.link_to(amix, input_idx=i)

    volume = graph.add('volume', 'volume=10')
    amix.link_to(volume)
    asink = graph.add('abuffersink')
    volume.link_to(asink)

    graph.configure()

    pts = 0

    while True:
        for i, (vframe, aframe) in enumerate(ms.get_frames()):
            if i >= len(vbufs):
                break
            vframe.time_base = constants.TIME_BASE
            vframe.pts = pts
            vbufs[i].push(vframe)
            aframe.time_base = constants.TIME_BASE
            aframe.pts = pts
            abufs[i].push(aframe)

        vframe_out = vsink.pull()
        vframe_out.time_base = constants.TIME_BASE
        vframe_out.pts = pts

        for packet in out_vstream.encode(vframe_out):
            out_container.mux(packet)

        aframe_out = asink.pull()
        aframe_out.time_base = constants.TIME_BASE
        aframe_out.pts = pts

        for packet in out_astream.encode(aframe_out):
            out_container.mux(packet)

        pts += constants.ASAMPLES_PER_VFRAME

    # Flush streams (encode with no args)
    for packet in out_vstream.encode():
        out_container.mux(packet)

    for packet in out_astream.encode():
        out_container.mux(packet)

    out_container.close()
    return


if __name__ == '__main__':
    main()
