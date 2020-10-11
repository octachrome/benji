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
logging.getLogger('libav').setLevel(logging.ERROR)

BIT_RATE = '500k'

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
            escaped_fontfile = constants.FONTFILE.replace(':', '\\:')
            proc_args = [
                'ffplay', '-autoexit', '-',
                # '-vf', f'drawtext=fontfile={escaped_fontfile}:fontcolor=white:fontsize=24:x=10:y=40:timecode=00\\\\:00\\\\:00\\\\:00:rate={constants.VIDEO_RATE}',
            ]
        proc = subprocess.Popen(proc_args, stdin=subprocess.PIPE) # , stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        out_stream = NamedWriteable(proc.stdin, 'pipe')

    ms = source.MultiSource(nsources=7)
    ms.start_reader(sys.stdin)

    out_container = av.open(out_stream, mode='w', format='avi')

    out_vstream = out_container.add_stream('rawvideo', rate=constants.VIDEO_RATE)
    out_vstream.width = constants.VIDEO_WIDTH
    out_vstream.height = constants.VIDEO_HEIGHT
    out_vstream.pix_fmt = 'rgba'

    out_astream = out_container.add_stream('pcm_s16le', rate=constants.AUDIO_RATE, layout=constants.AUDIO_LAYOUT)

    graph = Graph()

    vouts = []
    vbufs = []
    for i in range(ms.nsources):
        vbuf = graph.add_buffer(width=constants.VIDEO_WIDTH, height=constants.VIDEO_HEIGHT, format='rgba')
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

    vbuf_dlg = graph.add_buffer(width=constants.VIDEO_WIDTH, height=constants.DIALOG_HEIGHT, format='rgba')

    vstack = graph.add('vstack')
    vouts[0].link_to(vstack)
    vbuf_dlg.link_to(vstack, input_idx=1)

    escaped_fontfile = constants.FONTFILE.replace(':', '\\:')
    drawtext = graph.add('drawtext', f'fontfile={escaped_fontfile}:' +
        f'fontcolor=white:fontsize=24:x=10:y=10:timecode=00\\:00\\:00\\:00:rate={constants.VIDEO_RATE}')
    vstack.link_to(drawtext)

    vsink = graph.add('buffersink')
    drawtext.link_to(vsink)

    amix = graph.add('amix', f'inputs={ms.nsources}')
    abufs = []
    for i in range(ms.nsources):
        abuf = graph.add_abuffer(
            sample_rate=constants.AUDIO_RATE,
            format=constants.AUDIO_FORMAT,
            channels=2,
            layout=constants.AUDIO_LAYOUT)
        abufs.append(abuf)
        abuf.link_to(amix, input_idx=i)

    volume = graph.add('volume', 'volume=10')
    amix.link_to(volume)
    asink = graph.add('abuffersink')
    volume.link_to(asink)

    graph.configure()

    pts = 0

    while True:
        for i, (vframe, aframe) in enumerate(ms.get_next_frame_tuples()):
            if i >= len(vbufs):
                break
            vframe.pts = None
            vbufs[i].push(vframe)
            aframe.pts = None
            abufs[i].push(aframe)

        dlg_frame = ms.get_next_dialog_frame()
        dlg_frame.pts = None
        vbuf_dlg.push(dlg_frame)

        vframe_out = vsink.pull()
        vframe_out.pts = None

        for packet in out_vstream.encode(vframe_out):
            out_container.mux(packet)

        aframe_out = asink.pull()
        aframe_out.pts = None

        for packet in out_astream.encode(aframe_out):
            out_container.mux(packet)

        pts += 1

    # Flush streams (encode with no args)
    for packet in out_vstream.encode():
        out_container.mux(packet)

    for packet in out_astream.encode():
        out_container.mux(packet)

    out_container.close()
    return


if __name__ == '__main__':
    main()
