# FFmpeg worker runtime

The production background worker uses the Debian Bookworm `ffmpeg` package, pinned in `Dockerfile.worker` to `7:5.1.9-0+deb12u1`. The web service does not install or run FFmpeg.

The package is distributed under GPL terms and depends on separate FFmpeg libraries and codecs. Debian's package copyright and source are available from [Debian Sources](https://sources.debian.org/src/ffmpeg/5.1.9-0%2Bdeb12u1/). Rembr invokes the standalone `ffmpeg` process only to decode audio from a temporary video file and write bounded WAV chunks. No media binary is copied to persistent Rembr storage.
