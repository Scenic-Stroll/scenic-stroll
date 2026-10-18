// Remotion CLI settings. Footage, music and the logo live in video/assets/ (not public/).
import { Config } from '@remotion/cli/config';

Config.setPublicDir('./assets');
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
