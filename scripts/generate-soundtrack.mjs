import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44_100;
const beats = 32;
const secondsPerBeat = 0.6;
const durationSeconds = beats * secondsPerBeat;
const sampleCount = Math.round(sampleRate * durationSeconds);
const samples = new Float64Array(sampleCount);
const progression = [
  [130.81, 164.81, 196.0],
  [110.0, 130.81, 164.81],
  [146.83, 174.61, 220.0],
  [98.0, 123.47, 146.83],
];

function circularAge(sample, eventSample) {
  return ((sample - eventSample) % sampleCount + sampleCount) % sampleCount / sampleRate;
}

function addPeriodicEvent(atSeconds, lifeSeconds, voice) {
  const eventSample = Math.round(atSeconds * sampleRate) % sampleCount;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const age = circularAge(sample, eventSample);
    if (age < lifeSeconds) samples[sample] += voice(age, sample);
  }
}

for (let beat = 0; beat < beats; beat += 1) {
  const at = beat * secondsPerBeat;
  const bassFrequency = [65.41, 55, 73.42, 49][Math.floor(beat / 8) % 4];
  addPeriodicEvent(at, 0.45, (age) =>
    Math.sin(Math.PI * 2 * bassFrequency * age) * Math.exp(-age * 6) * 0.2,
  );
  if (beat % 4 === 0 || beat % 4 === 2) {
    addPeriodicEvent(at, 0.26, (age) =>
      Math.sin(Math.PI * 2 * (78 - age * 120) * age) * Math.exp(-age * 18) * 0.28,
    );
  }
  if (beat % 4 === 1 || beat % 4 === 3) {
    addPeriodicEvent(at, 0.18, (age, sample) => {
      const noise = Math.sin(sample * 12.9898 + beat * 78.233) * 43758.5453;
      return (noise - Math.floor(noise) - 0.5) * Math.exp(-age * 24) * 0.2;
    });
  }
  for (const offset of [0, secondsPerBeat / 2]) {
    addPeriodicEvent(at + offset, 0.06, (age, sample) => {
      const noise = Math.sin(sample * 93.71 + beat * 41.17) * 24634.6345;
      return (noise - Math.floor(noise) - 0.5) * Math.exp(-age * 55) * 0.08;
    });
  }
}

for (let bar = 0; bar < 8; bar += 1) {
  const chord = progression[bar % progression.length];
  const at = bar * secondsPerBeat * 4;
  addPeriodicEvent(at, secondsPerBeat * 4, (age) => {
    const envelope = Math.min(1, age * 8) * Math.min(1, (secondsPerBeat * 4 - age) * 8);
    return chord.reduce(
      (sum, frequency) => sum + Math.sin(Math.PI * 2 * frequency * age),
      0,
    ) * envelope * 0.025;
  });
}

let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
const scale = peak > 0 ? 0.82 / peak : 1;
const bytesPerSample = 2;
const channels = 1;
const dataSize = sampleCount * bytesPerSample * channels;
const wav = Buffer.alloc(44 + dataSize);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(channels, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
wav.writeUInt16LE(channels * bytesPerSample, 32);
wav.writeUInt16LE(bytesPerSample * 8, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataSize, 40);
for (let index = 0; index < sampleCount; index += 1) {
  wav.writeInt16LE(Math.round(samples[index] * scale * 32_767), 44 + index * 2);
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(projectRoot, "public/audio/retro-classroom-loop.wav");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, wav);
console.log(`Wrote ${output} (${durationSeconds.toFixed(1)}s)`);
