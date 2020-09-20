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

    ms = source.MultiSource()

    lines = """
{"type":"seek","offset":59042240,"globalOffset":1600615442240}
{"type":"play","anim":"Vignette","offset":59042240,"globalOffset":1600615442240,"duration":64000,"thread":5}
{"type":"play","offset":59042560,"globalOffset":1600615442560,"duration":6000,"thread":1,"anim":"nothing"}
{"type":"play","anim":"LivingRoom-Background","offset":59044240,"globalOffset":1600615444240,"duration":6000,"thread":0}
{"type":"dialog","dialog":"I've only been here in The Kalahari for two days, but it's been hard going.","pos":1,"offset":59047600,"globalOffset":1600615447600,"duration":6240}
{"type":"play","anim":"LivingRoom-Sofa-WatchTV","offset":59047600,"globalOffset":1600615447600,"duration":6240}
{"type":"play","anim":"LivingRoom-Background-Bird4","offset":59048560,"globalOffset":1600615448560,"duration":2320,"thread":1}
{"type":"play","anim":"LivingRoom-Background","offset":59050240,"globalOffset":1600615450240,"duration":6000,"thread":0}
{"type":"play","offset":59050880,"globalOffset":1600615450880,"duration":6000,"thread":1,"anim":"nothing"}
{"type":"dialog","dialog":"I think it's time I drank my own urine...","pos":1,"offset":59053840,"globalOffset":1600615453840,"duration":3120}
{"type":"play","anim":"LivingRoom-Sofa-WatchTV","offset":59053840,"globalOffset":1600615453840,"duration":3120}
{"type":"play","anim":"LivingRoom-Background","offset":59056240,"globalOffset":1600615456240,"duration":6000,"thread":0}
{"type":"play","anim":"LivingRoom-Background-Fly1","offset":59056880,"globalOffset":1600615456880,"duration":7200,"thread":1}
{"type":"play","anim":"LivingRoom-Sofa-WatchTVScratch2","offset":59056960,"globalOffset":1600615456960,"duration":3120}
{"type":"dialog","dialog":"Look! A caravan of traders!","pos":1,"offset":59060080,"globalOffset":1600615460080,"duration":3120}
{"type":"play","anim":"LivingRoom-Sofa-WatchTV","offset":59060080,"globalOffset":1600615460080,"duration":3120}
    """.splitlines()

    seek = None
    for line in lines:
        line = line.strip()
        if line:
            event = json.loads(line)
            ms.add_event(event)

    proc = subprocess.Popen(proc_args, stdin=subprocess.PIPE)
    out_container = av.open(NamedWriteable(proc.stdin, 'pipe'), mode='w', format='matroska')

    out_vstream = out_container.add_stream('rawvideo', rate=12.5)
    out_vstream.width = 1280
    out_vstream.height = 720
    out_vstream.pix_fmt = 'yuv420p'

    out_astream = out_container.add_stream('pcm_s16le', rate=44100)

    graph = Graph()

    vout = None
    vbufs = []
    for i in range(ms.nsources):
        vbuf = graph.add_buffer(width=1280, height=720, format='rgba')
        vbufs.append(vbuf)
        if vout is None:
            vout = vbuf
        else:
            # Overlays can only take 2 inputs, so chain them
            overlay = graph.add('overlay')
            vout.link_to(overlay)
            vbuf.link_to(overlay, input_idx=1)
            vout = overlay

    drawtext=graph.add('drawtext', 'fontfile=/usr/share/fonts/truetype/ubuntu-font-family/Ubuntu-R.ttf:fontcolor=white:fontsize=24:x=10:y=10:text=%{pts\\:hms}')
    vout.link_to(drawtext)
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
