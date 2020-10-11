import sys
from fractions import Fraction

AUDIO_RATE = 44100
AUDIO_FORMAT = 'fltp'
AUDIO_LAYOUT = 'stereo'
AUDIO_DTYPE = 'float32'

VIDEO_RATE = 12.5
VIDEO_WIDTH = 1280
VIDEO_HEIGHT = 720
VIDEO_FORMAT = 'rgba'
VIDEO_DTYPE = 'uint8'

FRAME_LENGTH_MS = int(1000 / VIDEO_RATE)
ASAMPLES_PER_VFRAME = int(AUDIO_RATE / VIDEO_RATE)

DIALOG_PER_LINE = 60
DIALOG_HEIGHT = 80
DIALOG_COLORS = [(0x33, 0x33, 0x99), (0x99, 0x33, 0x33)]

if sys.platform == 'darwin':
    FONTFILE = '/Library/Fonts/Arial Unicode.ttf'
elif sys.platform == 'linux':
    FONTFILE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
else:
    FONTFILE = 'c:/Windows/Fonts/courbd.ttf'
