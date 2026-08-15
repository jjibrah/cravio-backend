import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AppError } from '../shared/errors.js';

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 500)}`)),
    );
  });

export function createVideoProcessor({ ffprobePath = 'ffprobe', ffmpegPath = 'ffmpeg' } = {}) {
  return {
    async withWorkspace(work) {
      const directory = await mkdtemp(path.join(tmpdir(), 'cravio-media-'));
      try {
        return await work(directory);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async inspect(filePath) {
      try {
        const output = await run(ffprobePath, [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          filePath,
        ]);
        const value = JSON.parse(output);
        const video = value.streams?.find((stream) => stream.codec_type === 'video');
        const durationSeconds = Number(value.format?.duration ?? video?.duration);
        const format = String(value.format?.format_name || '');
        if (
          !video ||
          !Number.isFinite(durationSeconds) ||
          durationSeconds <= 0 ||
          !video.width ||
          !video.height ||
          !/(mp4|mov|webm|matroska)/.test(format)
        )
          throw new Error('Unsupported or incomplete video metadata');
        return {
          durationSeconds,
          width: Number(video.width),
          height: Number(video.height),
          format,
        };
      } catch {
        throw new AppError(422, 'INVALID_VIDEO', 'Uploaded object is not a valid supported video');
      }
    },
    async thumbnail(videoPath, outputPath, durationSeconds) {
      const timestamp = Math.max(0, Math.min(1.5, durationSeconds / 2));
      try {
        await run(ffmpegPath, [
          '-v',
          'error',
          '-ss',
          String(timestamp),
          '-i',
          videoPath,
          '-frames:v',
          '1',
          '-vf',
          "scale='min(720,iw)':-2",
          '-q:v',
          '4',
          '-y',
          outputPath,
        ]);
        return outputPath;
      } catch {
        throw new AppError(
          500,
          'THUMBNAIL_GENERATION_FAILED',
          'Could not generate video thumbnail',
        );
      }
    },
  };
}
