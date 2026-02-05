import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io';
import prismaClient from '../../../src/database/clients/prisma';

jest.mock('../../../src/middleware/namespace/auth/index.ts', () => {
  return {
    attachUserOrUnauthorized: async (
      socket: Socket,
      next: (err?: ExtendedError) => void
    ) => {
      // socket.request.headers의 key는 lowercase다
      if (!socket.request.headers.userid) {
        throw new Error('userid must specify');
      }

      const user = await prismaClient.user.findFirst({
        where: {
          id: parseInt(socket.request.headers.userid as string),
        },
        include: {
          pfp: true,
        },
      });

      socket.user = user!;

      next();
    },
  };
});

const probeResult = jest.fn().mockResolvedValue({
  streams: [
    {
      index: 0,
      codec_type: 'data',
      codec_tag_string: '[0][0][0][0]',
      codec_tag: '0x0000',
      missing_streams: '0',
      r_frame_rate: '0/0',
      avg_frame_rate: '0/0',
      time_base: '1/1000',
      start_pts: 0,
      start_time: '0.000000',
      disposition: {},
    },
    {
      index: 1,
      codec_name: 'h264',
      codec_long_name: 'H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10',
      profile: 'High',
      codec_type: 'video',
      codec_tag_string: '[0][0][0][0]',
      codec_tag: '0x0000',
      width: 640,
      height: 360,
      coded_width: 640,
      coded_height: 360,
      closed_captions: 0,
      film_grain: 0,
      has_b_frames: 2,
      sample_aspect_ratio: '1:1',
      display_aspect_ratio: '16:9',
      pix_fmt: 'yuv420p',
      level: 22,
      color_range: 'tv',
      color_space: 'bt470bg',
      chroma_location: 'left',
      field_order: 'progressive',
      refs: 1,
      is_avc: 'true',
      nal_length_size: '4',
      missing_streams: '0',
      r_frame_rate: '205/12',
      avg_frame_rate: '69/4',
      time_base: '1/1000',
      start_pts: 117,
      start_time: '0.117000',
      bits_per_raw_sample: '8',
      extradata_size: 50,
      disposition: {},
    },
    {
      index: 2,
      codec_name: 'aac',
      codec_long_name: 'AAC (Advanced Audio Coding)',
      profile: 'LC',
      codec_type: 'audio',
      codec_tag_string: '[0][0][0][0]',
      codec_tag: '0x0000',
      sample_fmt: 'fltp',
      sample_rate: '48000',
      channels: 1,
      channel_layout: 'mono',
      bits_per_sample: 0,
      initial_padding: 0,
      missing_streams: '0',
      r_frame_rate: '0/0',
      avg_frame_rate: '0/0',
      time_base: '1/1000',
      start_pts: 96,
      start_time: '0.096000',
      extradata_size: 5,
      disposition: {},
    },
  ],
  format: {
    filename:
      'http://media-server:8010/media/record/live/f36417a3-ee20-4299-9ec6-788e257c31e6/1770181683708.flv',
    nb_streams: 3,
    nb_programs: 0,
    format_name: 'flv',
    format_long_name: 'FLV (Flash Video)',
    start_time: '0.000000',
    duration: '11.590000',
    size: '722712',
    bit_rate: '498852',
    probe_score: 100,
  },
});

// Mock ffprobe globally so modules loaded in setup use the mock
jest.mock('../../../src/utils/ffprobe', () => ({
  probe: probeResult,
}));
